/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260717230000_exact_trade_accounting.sql",
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const walletFunctionsSource = readFileSync(
  join(process.cwd(), "src/lib/api/wallet.functions.ts"),
  "utf8",
);
const typesSource = readFileSync(join(process.cwd(), "src/integrations/supabase/types.ts"), "utf8");

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function assertOrder(source: string, before: string, after: string, message: string) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.notEqual(beforeIndex, -1, `${before} should exist`);
  assert.notEqual(afterIndex, -1, `${after} should exist`);
  assert.ok(beforeIndex < afterIndex, message);
}

function backfillBlock() {
  return between(
    migration,
    "DO $exact_trade_accounting_backfill$",
    "$exact_trade_accounting_backfill$;",
  );
}

function executeTradeFunction() {
  return between(
    migration,
    "CREATE OR REPLACE FUNCTION public.execute_trade(",
    "CREATE OR REPLACE FUNCTION public.execute_trade_authenticated(",
  );
}

function recalcUserStatsFunction() {
  return between(
    migration,
    "CREATE OR REPLACE FUNCTION public.recalc_user_stats(_user_id uuid)",
    "DO $$\nDECLARE\n  v_user RECORD;",
  );
}

function finalDerivedRefreshBlock() {
  return between(migration, "DO $$\nDECLARE\n  v_user RECORD;", "END $$;");
}

function refreshLeaderboardsFunction() {
  return between(
    readFileSync(
      join(process.cwd(), "supabase/migrations/20260708020000_start_wallet_25000.sql"),
      "utf8",
    ),
    "CREATE OR REPLACE FUNCTION public.refresh_leaderboards()",
    "COMMIT;",
  );
}

test("exact trade accounting migration is transactional and scoped", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /^BEGIN;\s/i);
  assert.match(migration, /COMMIT;\s+NOTIFY pgrst, 'reload schema';\s*$/i);
  assert.doesNotMatch(
    migration,
    /\b(?:ALTER|UPDATE|INSERT INTO|DELETE FROM|DROP)\s+(?:TABLE\s+)?public\.(?:daily_crew|grand_line_guess|wallet_ledger_entries|market_events|price_history)/i,
  );
  assert.doesNotMatch(migration, /\bALTER TABLE public\.user_wallets\b/i);
});

test("migration adds holding and transaction accounting columns", () => {
  assert.match(
    migration,
    /ALTER TABLE public\.user_holdings\s+ADD COLUMN IF NOT EXISTS total_cost_basis numeric;/i,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.transactions\s+ADD COLUMN IF NOT EXISTS cost_basis numeric,[\s\S]*ADD COLUMN IF NOT EXISTS realized_pnl numeric,[\s\S]*ADD COLUMN IF NOT EXISTS holding_shares_before numeric,[\s\S]*ADD COLUMN IF NOT EXISTS holding_avg_cost_after numeric;/i,
  );
  assert.doesNotMatch(migration, /ALTER COLUMN total_cost_basis SET DEFAULT 0;/i);
  assert.match(migration, /ALTER COLUMN total_cost_basis SET NOT NULL;/i);
  assert.match(migration, /ALTER COLUMN total_cost_basis DROP DEFAULT;/i);
  assert.match(
    migration,
    /ALTER TABLE public\.transactions\s+ALTER COLUMN holding_shares_before SET NOT NULL,[\s\S]*ALTER COLUMN holding_avg_cost_after SET NOT NULL;/i,
  );
});

test("historical replay is deterministic and uses weighted-average accounting", () => {
  const replay = backfillBlock();

  assert.match(
    replay,
    /ORDER BY t\.user_id ASC, t\.character_id ASC, t\.created_at ASC, t\.id ASC/i,
  );
  assert.match(replay, /v_after_basis := round\(v_before_basis \+ v_tx\.total, 2\);/i);
  assert.match(
    replay,
    /v_sold_basis := round\(v_before_basis \* v_tx\.shares \/ v_before_shares, 2\);/i,
  );
  assert.match(replay, /IF v_before_basis <= 0 THEN/i);
  assert.match(
    replay,
    /IF v_sold_basis >= v_before_basis THEN\s+v_sold_basis := v_before_basis - 0\.01;/i,
  );
  assert.match(
    replay,
    /IF v_after_shares = 0 THEN\s+v_sold_basis := v_before_basis;\s+v_after_basis := 0;/i,
  );
  assert.match(replay, /v_realized := round\(v_tx\.total - v_sold_basis, 2\);/i);
});

test("historical reconciliation aborts instead of silently rewriting incompatible state", () => {
  const replay = backfillBlock();

  assert.match(replay, /v_negative_state_count/);
  assert.match(replay, /v_open_missing_count/);
  assert.match(replay, /v_current_missing_count/);
  assert.match(replay, /v_share_mismatch_count/);
  assert.match(replay, /v_basis_mismatch_count/);
  assert.match(replay, /RAISE EXCEPTION\s+'Exact trade accounting reconciliation failed:/i);
  assert.match(replay, /USING ERRCODE = 'P0001'/i);
});

test("backfill does not alter historical money movement or share quantities", () => {
  const replay = backfillBlock();

  assert.doesNotMatch(replay, /UPDATE\s+public\.user_wallets\b/i);
  assert.doesNotMatch(replay, /UPDATE\s+public\.user_holdings[\s\S]*SET[\s\S]*shares\s*=/i);
  assert.doesNotMatch(replay, /UPDATE\s+public\.user_holdings[\s\S]*SET[\s\S]*avg_cost\s*=/i);
  assert.doesNotMatch(replay, /SET\s+side\s*=/i);
  assert.doesNotMatch(replay, /SET\s+price\s*=/i);
  assert.doesNotMatch(replay, /SET\s+total\s*=/i);
  assert.doesNotMatch(replay, /SET\s+balance_after\s*=/i);
  assert.doesNotMatch(replay, /SET\s+created_at\s*=/i);
  assert.doesNotMatch(replay, /SET\s+request_id\s*=/i);
  assert.match(
    replay,
    /UPDATE public\.user_holdings h\s+SET total_cost_basis = r\.total_cost_basis/i,
  );
});

test("accounting constraints are named and validated", () => {
  for (const constraint of [
    "user_holdings_total_cost_basis_cents_chk",
    "transactions_accounting_snapshot_required_chk",
    "transactions_accounting_shares_valid_chk",
    "transactions_accounting_basis_cents_chk",
    "transactions_accounting_side_fields_chk",
    "transactions_realized_pnl_matches_cost_basis_chk",
  ]) {
    assert.match(migration, new RegExp(`ADD CONSTRAINT ${constraint}`, "i"));
    assert.match(migration, new RegExp(`VALIDATE CONSTRAINT ${constraint}`, "i"));
  }

  assert.match(migration, /side = 'sell' AND cost_basis IS NOT NULL AND realized_pnl IS NOT NULL/i);
  assert.match(
    migration,
    /CHECK \(total_cost_basis > 0 AND total_cost_basis = round\(total_cost_basis, 2\)\)/i,
  );
  assert.match(migration, /holding_shares_after = 0 OR holding_cost_basis_after > 0/i);
  assert.match(migration, /realized_pnl = round\(total - cost_basis, 2\)/i);
});

test("trade RPC signatures, grants, idempotency, and limits are preserved", () => {
  const tradeFunction = executeTradeFunction();

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.execute_trade\(\s*_user_id uuid,\s*_slug text,\s*_side text,\s*_shares numeric,\s*_request_id uuid\s*\)/i,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.execute_trade_authenticated\(\s*_slug text,\s*_side text,\s*_shares numeric,\s*_request_id uuid\s*\)/i,
  );
  assert.match(
    tradeFunction,
    /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public, pg_temp/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.execute_trade\(uuid, text, text, numeric, uuid\)\s+FROM PUBLIC, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.execute_trade\(uuid, text, text, numeric, uuid\)\s+TO service_role;/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.execute_trade_authenticated\(text, text, numeric, uuid\)\s+TO authenticated, service_role;/i,
  );
  assert.match(tradeFunction, /v_total := round\(v_price \* _shares, 2\);/i);
  assert.match(tradeFunction, /IF v_total < 1 THEN/i);
  assert.match(tradeFunction, /v_recent_minute_count >= 30 OR v_today_count >= 500/i);
  assert.match(
    tradeFunction,
    /v_utc_day_start := date_trunc\('day', now\(\) AT TIME ZONE 'UTC'\) AT TIME ZONE 'UTC';/i,
  );
  assert.match(tradeFunction, /FOR UPDATE;/i);
  assert.match(tradeFunction, /RETURN v_existing_tx;/i);
  assertOrder(
    tradeFunction,
    "SELECT *\n    INTO v_existing_tx",
    "SELECT shares, avg_cost, total_cost_basis",
    "idempotent retries must return before holding accounting mutation",
  );
  assertOrder(
    tradeFunction,
    "SELECT *\n    INTO v_existing_tx",
    "SELECT COUNT(*)\n    INTO v_recent_minute_count",
    "idempotent retries must return before rate-limit accounting",
  );
  assertOrder(
    tradeFunction,
    "SELECT *\n    INTO v_existing_tx",
    "UPDATE public.user_wallets",
    "idempotent retries must return before wallet mutation",
  );
  assertOrder(
    tradeFunction,
    "SELECT *\n    INTO v_existing_tx",
    "INSERT INTO public.transactions",
    "idempotent retries must return before transaction insertion and trigger execution",
  );
});

test("new trades insert authoritative accounting snapshots", () => {
  const tradeFunction = executeTradeFunction();

  assert.match(tradeFunction, /v_new_basis := round\(v_held_basis \+ v_total, 2\);/i);
  assert.match(
    tradeFunction,
    /v_sold_basis := round\(v_held_basis \* _shares \/ v_held_shares, 2\);/i,
  );
  assert.match(tradeFunction, /IF v_held_basis <= 0 THEN/i);
  assert.match(
    tradeFunction,
    /IF v_sold_basis >= v_held_basis THEN\s+v_sold_basis := v_held_basis - 0\.01;/i,
  );
  assert.match(tradeFunction, /v_realized := round\(v_total - v_sold_basis, 2\);/i);
  assert.match(tradeFunction, /v_sold_basis := v_held_basis;/i);
  assert.match(
    tradeFunction,
    /INSERT INTO public\.transactions \([\s\S]*request_id,[\s\S]*cost_basis,[\s\S]*realized_pnl,[\s\S]*holding_shares_before,[\s\S]*holding_avg_cost_after[\s\S]*\)/i,
  );
});

test("user stats use stored realized P/L instead of historical buy-price approximation", () => {
  const recalc = recalcUserStatsFunction();

  assert.match(recalc, /SUM\(realized_pnl\)/i);
  assert.match(recalc, /COUNT\(\*\) FILTER \(WHERE realized_pnl > 0\)/i);
  assert.match(recalc, /COUNT\(\*\) FILTER \(WHERE realized_pnl < 0\)/i);
  assert.match(recalc, /ORDER BY t\.realized_pnl DESC NULLS LAST, t\.created_at ASC, t\.id ASC/i);
  assert.match(recalc, /ORDER BY t\.realized_pnl ASC NULLS LAST, t\.created_at ASC, t\.id ASC/i);
  assert.doesNotMatch(recalc, /avg_buy|buy_price|historical_buy|SUM\(t\.total\) FILTER/i);
});

test("transaction trigger and derived systems are preserved", () => {
  assert.doesNotMatch(migration, /DROP TRIGGER[\s\S]*after_transaction/i);
  assert.doesNotMatch(migration, /DROP FUNCTION[\s\S]*after_transaction/i);
  assert.match(migration, /public\.recalc_user_stats\(v_user\.user_id\);/);
  assert.match(migration, /public\.refresh_leaderboards\(\);/);
  assert.match(migration, /public\.check_achievements\(v_user\.user_id\);/);
});

test("historical exact stats refresh leaderboards before idempotent achievement checks", () => {
  const derivedRefresh = finalDerivedRefreshBlock();
  const firstStats = derivedRefresh.indexOf("PERFORM public.recalc_user_stats(v_user.user_id);");
  const refresh = derivedRefresh.indexOf("PERFORM public.refresh_leaderboards();");
  const achievements = derivedRefresh.indexOf("PERFORM public.check_achievements(v_user.user_id);");
  const secondStats = derivedRefresh.indexOf(
    "PERFORM public.recalc_user_stats(v_user.user_id);",
    firstStats + 1,
  );

  assert.notEqual(firstStats, -1, "exact stats should be recalculated before leaderboard refresh");
  assert.notEqual(refresh, -1, "leaderboard cache should refresh before rank-dependent checks");
  assert.notEqual(achievements, -1, "existing achievement checks should run");
  assert.notEqual(secondStats, -1, "stats should recalculate after achievement grants");
  assert.ok(firstStats < refresh, "exact stats must be available before leaderboard refresh");
  assert.ok(refresh < achievements, "achievement checks should see current leaderboard cache");
  assert.ok(
    achievements < secondStats,
    "stats should include reputation rewards from newly granted achievements",
  );
  assert.equal(
    (derivedRefresh.match(/PERFORM public\.refresh_leaderboards\(\);/g) ?? []).length,
    1,
  );
});

test("broad leaderboard refresh does not rewrite wallets or holdings", () => {
  const refresh = refreshLeaderboardsFunction();

  assert.match(refresh, /INSERT INTO public\.net_worth_snapshots/i);
  assert.match(refresh, /DELETE FROM public\.leaderboard_cache WHERE board_key='most_profitable'/i);
  assert.match(refresh, /DELETE FROM public\.leaderboard_cache WHERE board_key='most_accurate'/i);
  assert.match(refresh, /v_starting_balance numeric := 25000/i);
  assert.doesNotMatch(refresh, /UPDATE\s+public\.user_wallets\b/i);
  assert.doesNotMatch(refresh, /INSERT INTO\s+public\.user_wallets\b/i);
  assert.doesNotMatch(refresh, /UPDATE\s+public\.user_holdings\b/i);
  assert.doesNotMatch(refresh, /DELETE FROM\s+public\.user_holdings\b/i);
});

test("wallet API returns database accounting fields without recalculating authoritative P/L", () => {
  assert.match(walletFunctionsSource, /\.select\("realized_pnl,wins,losses,total_sells"\)/);
  assert.match(walletFunctionsSource, /realizedPnl: Number\(stats\?\.realized_pnl \?\? 0\)/);
  assert.match(walletFunctionsSource, /totalCostBasis: Number\(h\.total_cost_basis\)/);
  assert.match(walletFunctionsSource, /costBasis: Number\(tx\.cost_basis\)/);
  assert.match(walletFunctionsSource, /realizedPnl: Number\(tx\.realized_pnl\)/);
  assert.match(
    walletFunctionsSource,
    /holdingCostBasisAfter: Number\(tx\.holding_cost_basis_after\)/,
  );
  assert.match(
    walletFunctionsSource,
    /cost_basis: z\.coerce\.number\(\)\.nullable\(\),\s+realized_pnl: z\.coerce\.number\(\)\.nullable\(\),/i,
  );

  const sellFunction = between(
    walletFunctionsSource,
    "export const sellShares",
    "export const listMyTransactions",
  );
  assert.doesNotMatch(sellFunction, /avgCost|currentPrice|shares \*|totalCostBasis/);
});

test("transaction history query and pagination remain unchanged except selected fields", () => {
  const listFunction = between(
    walletFunctionsSource,
    "export const listMyTransactions",
    "export const listMyWalletLedgerEntries",
  );

  assert.match(
    listFunction,
    /select\(\s+"id,side,shares,price,total,balance_after,cost_basis,realized_pnl,holding_shares_before,holding_shares_after,holding_cost_basis_before,holding_cost_basis_after,holding_avg_cost_before,holding_avg_cost_after,created_at,characters\(name,slug\)"/,
  );
  assert.match(listFunction, /\.eq\("user_id", context\.userId\)/);
  assert.match(listFunction, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(listFunction, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(listFunction, /\.limit\(data\.pageSize \+ 1\)/);
  assert.match(listFunction, /query = query\.or\(getTradeHistoryCursorFilter\(data\.cursor\)\)/);
});

test("Supabase types reflect exact accounting fields and unchanged RPC arguments", () => {
  const userHoldings = between(typesSource, "user_holdings: {", "Relationships: [");
  const userHoldingsInsert = between(userHoldings, "Insert: {", "Update: {");

  assert.match(typesSource, /user_holdings: \{[\s\S]*total_cost_basis: number/);
  assert.match(userHoldingsInsert, /total_cost_basis: number/);
  assert.doesNotMatch(userHoldingsInsert, /total_cost_basis\?: number/);
  assert.match(typesSource, /transactions: \{[\s\S]*cost_basis: number \| null/);
  assert.match(typesSource, /transactions: \{[\s\S]*realized_pnl: number \| null/);
  assert.match(typesSource, /transactions: \{[\s\S]*holding_cost_basis_after: number/);
  assert.match(typesSource, /execute_trade: \{[\s\S]*_request_id: string[\s\S]*_shares: number/);
  assert.match(
    typesSource,
    /execute_trade_authenticated: \{[\s\S]*Args: \{ _request_id: string; _shares: number; _side: string; _slug: string \}/,
  );
  assert.match(typesSource, /execute_trade_authenticated: \{[\s\S]*realized_pnl: number \| null/);
});

test("existing one-Berry minimum trade rule can leave sub-Berry residual positions", () => {
  const tradeFunction = executeTradeFunction();
  const price = 50;
  const soldShares = 0.02;
  const residualShares = 0.01;

  assert.equal(Math.round(price * soldShares * 100) / 100, 1);
  assert.equal(Math.round(price * residualShares * 100) / 100, 0.5);
  assert.match(tradeFunction, /IF v_total < 1 THEN/);
  assert.match(tradeFunction, /RAISE EXCEPTION 'Trade value must be at least 1 Berry'/);
});
