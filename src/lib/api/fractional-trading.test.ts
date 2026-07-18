/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260717120000_fractional_share_trading.sql",
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const walletFunctionsSource = readFileSync(
  join(process.cwd(), "src/lib/api/wallet.functions.ts"),
  "utf8",
);
const typesSource = readFileSync(join(process.cwd(), "src/integrations/supabase/types.ts"), "utf8");

function withoutComments(sql: string) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

function assertOrder(source: string, before: string, after: string, message: string) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.notEqual(beforeIndex, -1, `${before} should exist`);
  assert.notEqual(afterIndex, -1, `${after} should exist`);
  assert.ok(beforeIndex < afterIndex, message);
}

test("fractional trading migration is transactional and additive to existing data", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /^BEGIN;\s/i);
  assert.match(migration, /COMMIT;\s+NOTIFY pgrst, 'reload schema';\s*$/i);
  assert.match(
    migration,
    /ALTER TABLE public\.transactions\s+ADD COLUMN IF NOT EXISTS request_id uuid;/i,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_request_id_unique_idx\s+ON public\.transactions \(user_id, request_id\)\s+WHERE request_id IS NOT NULL;/i,
  );

  const executable = withoutComments(migration);
  assert.doesNotMatch(executable, /UPDATE\s+public\.transactions\b/i);
  assert.doesNotMatch(executable, /UPDATE\s+public\.characters\b/i);
  assert.doesNotMatch(executable, /UPDATE\s+public\.price_history\b/i);
  assert.doesNotMatch(executable, /\bdaily_crew|grand_line_guess|friendship|message|notification/i);
});

test("fractional trading migration replaces old trade signatures without leaving request-free overloads", () => {
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.execute_trade_authenticated\(text, text, integer\);/i,
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.execute_trade_authenticated\(text, text, numeric\);/i,
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.execute_trade\(uuid, text, text, numeric\);/i,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.execute_trade\(\s*_user_id uuid,\s*_slug text,\s*_side text,\s*_shares numeric,\s*_request_id uuid\s*\)/i,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.execute_trade_authenticated\(\s*_slug text,\s*_side text,\s*_shares numeric,\s*_request_id uuid\s*\)/i,
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
});

test("fractional trading migration enforces quantity constraints in transactions and holdings", () => {
  assert.match(
    migration,
    /CONSTRAINT transactions_shares_minimum_chk[\s\S]*CHECK \(shares >= 0\.01\) NOT VALID/i,
  );
  assert.match(
    migration,
    /CONSTRAINT transactions_shares_maximum_chk[\s\S]*CHECK \(shares <= 10000\) NOT VALID/i,
  );
  assert.match(
    migration,
    /CONSTRAINT transactions_shares_two_decimal_chk[\s\S]*CHECK \(shares = round\(shares, 2\)\) NOT VALID/i,
  );
  assert.match(
    migration,
    /CONSTRAINT user_holdings_shares_positive_chk[\s\S]*CHECK \(shares > 0\) NOT VALID/i,
  );
  assert.match(
    migration,
    /CONSTRAINT user_holdings_shares_two_decimal_chk[\s\S]*CHECK \(shares = round\(shares, 2\)\) NOT VALID/i,
  );
  assert.doesNotMatch(migration, /user_holdings[\s\S]*shares <= 10000/i);
});

test("fractional trading RPC computes rounded monetary totals and uses them for money movement", () => {
  assert.match(migration, /v_total := round\(v_price \* _shares, 2\);/i);
  assert.match(migration, /IF v_total < 1 THEN[\s\S]*Trade value must be at least 1 Berry/i);
  assert.match(migration, /IF v_balance < v_total THEN[\s\S]*Insufficient Berries/i);
  assert.match(migration, /v_new_balance := v_balance - v_total;/i);
  assert.match(migration, /v_new_balance := v_balance \+ v_total;/i);
  assert.match(
    migration,
    /INSERT INTO public\.transactions\s+\(user_id, character_id, side, shares, price, total, balance_after, request_id\)[\s\S]*v_total/i,
  );
});

test("fractional trading idempotency occurs after wallet serialization and before rate limits", () => {
  assert.match(
    migration,
    /FROM public\.user_wallets[\s\S]*WHERE user_id = _user_id[\s\S]*FOR UPDATE;/i,
  );
  assert.match(migration, /WHERE user_id = _user_id\s+AND request_id = _request_id/i);
  assert.match(
    migration,
    /IF v_existing_tx\.character_id = v_char_id[\s\S]*v_existing_tx\.side = v_side[\s\S]*v_existing_tx\.shares = _shares THEN[\s\S]*RETURN v_existing_tx;/i,
  );
  assert.match(migration, /Trade request ID was already used for a different trade/i);
  assertOrder(
    migration,
    "FROM public.user_wallets",
    "SELECT *\n    INTO v_existing_tx",
    "wallet lock should occur before idempotency lookup",
  );
  assertOrder(
    migration,
    "SELECT *\n    INTO v_existing_tx",
    "SELECT COUNT(*)\n    INTO v_recent_minute_count",
    "idempotent retry should occur before rate-limit counting",
  );
});

test("fractional trading migration enforces rolling-minute and UTC-day trade limits", () => {
  assert.match(migration, /created_at >= now\(\) - interval '1 minute'/i);
  assert.match(migration, /v_utc_day_start timestamptz;/i);
  assert.match(
    migration,
    /v_utc_day_start := date_trunc\('day', now\(\) AT TIME ZONE 'UTC'\) AT TIME ZONE 'UTC';/i,
  );
  assert.doesNotMatch(migration, /CURRENT_DATE|now\(\)::date/i);
  assert.match(migration, /v_recent_minute_count >= 30 OR v_today_count >= 500/i);
  assert.match(migration, /Trade limit reached\. Try again later\./i);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_request_id_unique_idx/i,
    "request-id index is added",
  );
  assert.doesNotMatch(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_transactions_user_created/i,
    "existing user/created_at indexes are not duplicated",
  );
});

test("wallet API accepts fractional trades with strict request IDs and no direct writes", () => {
  assert.match(
    walletFunctionsSource,
    /import \{ isValidShareQuantity \} from "@\/lib\/trading\/fractional-shares";/,
  );
  assert.match(
    walletFunctionsSource,
    /const tradeInputSchema = z[\s\S]*\.object\(\{[\s\S]*requestId: z\.string\(\)\.uuid\(\)/,
  );
  assert.match(
    walletFunctionsSource,
    /\.number\(\)[\s\S]*\.finite\(\)[\s\S]*\.min\(0\.01\)[\s\S]*\.max\(10_000\)[\s\S]*\.refine\(isValidShareQuantity/,
  );
  assert.match(walletFunctionsSource, /const tradeInputSchema = z[\s\S]*\.strict\(\);/);
  assert.doesNotMatch(walletFunctionsSource, /z\.number\(\)\.int\(\)\.positive/);
  assert.match(walletFunctionsSource, /_request_id: requestId/);
  assert.match(walletFunctionsSource, /buyShares[\s\S]*\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(walletFunctionsSource, /sellShares[\s\S]*\.middleware\(\[requireSupabaseAuth\]\)/);

  const tradeHelper = walletFunctionsSource.slice(
    walletFunctionsSource.indexOf("async function executeTrade"),
    walletFunctionsSource.indexOf("export const buyShares"),
  );
  assert.match(tradeHelper, /\.rpc\("execute_trade_authenticated"/);
  assert.doesNotMatch(
    tradeHelper,
    /\.from\("user_wallets"\)|\.from\("user_holdings"\)|\.from\("transactions"\)/,
  );
});

test("Supabase types include request_id and the numeric request-ID trade signatures", () => {
  assert.match(typesSource, /transactions: \{[\s\S]*request_id: string \| null/);
  assert.match(typesSource, /execute_trade: \{[\s\S]*_request_id: string[\s\S]*_shares: number/);
  assert.match(
    typesSource,
    /execute_trade_authenticated: \{[\s\S]*Args: \{ _request_id: string; _shares: number; _side: string; _slug: string \}/,
  );
  assert.match(typesSource, /execute_trade_authenticated: \{[\s\S]*request_id: string \| null/);
});
