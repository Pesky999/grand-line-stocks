/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260721030000_complete_legendary_investor_progression.sql",
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function functionBody(signature: string, nextMarker: string) {
  return between(migration, signature, nextMarker);
}

const achievementCodes = [
  "first_trade",
  "first_profit",
  "first_event",
  "hundred_trades",
  "hundred_k_profit",
  "streak_30",
  "millionaire",
  "top_100",
  "top_10",
  "largest_holder",
  "yonko_investor",
  "pirate_king",
  "market_prophet",
  "diamond_hands",
];

test("legendary progression migration is transactional and scoped", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /^BEGIN;\s/i);
  assert.match(migration, /COMMIT;\s+NOTIFY pgrst, 'reload schema';\s*$/i);
  assert.doesNotMatch(migration, /\bCASCADE\b/i);
  assert.doesNotMatch(migration, /\bEXECUTE\s+format\b|\bEXECUTE\s+v_|\bEXECUTE\s+'\s*/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.achievements/i);
});

test("check_achievements counts new grants for exactly the existing achievement catalog", () => {
  const checker = functionBody(
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
    "CREATE OR REPLACE FUNCTION public.refresh_user_progression(_user_id uuid)",
  );

  assert.match(checker, /RETURNS integer/i);
  assert.match(checker, /v_count integer := 0/i);
  for (const code of achievementCodes) {
    assert.match(checker, new RegExp(`public\\.grant_achievement\\(_user_id, '${code}'\\)`));
  }
  assert.equal((checker.match(/v_count := v_count \+ 1;/g) ?? []).length, achievementCodes.length);
  assert.doesNotMatch(checker, /PERFORM grant_achievement/);
});

test("achievement conditions use current MVP rules", () => {
  const checker = functionBody(
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
    "CREATE OR REPLACE FUNCTION public.refresh_user_progression(_user_id uuid)",
  );

  assert.match(checker, /s\.total_trades >= 1[\s\S]*'first_trade'/);
  assert.match(checker, /s\.realized_pnl > 0[\s\S]*'first_profit'/);
  assert.match(checker, /s\.total_trades >= 100[\s\S]*'hundred_trades'/);
  assert.match(checker, /s\.realized_pnl >= 100000[\s\S]*'hundred_k_profit'/);
  assert.match(checker, /s\.login_streak >= 30[\s\S]*'streak_30'/);
  assert.match(checker, /s\.current_net_worth >= 1000000[\s\S]*'millionaire'/);
  assert.match(checker, /v_rank <= 100[\s\S]*'top_100'/);
  assert.match(checker, /v_rank <= 10[\s\S]*'top_10'/);
  assert.match(checker, /s\.reputation_score >= 850[\s\S]*'yonko_investor'/);
  assert.match(checker, /s\.reputation_score >= 950[\s\S]*'pirate_king'/);
  assert.match(checker, /v_closed >= 50[\s\S]*v_win_rate >= 70[\s\S]*'market_prophet'/);
});

test("First Market Event uses publication after account creation and no 90-day shortcut", () => {
  const checker = functionBody(
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
    "CREATE OR REPLACE FUNCTION public.refresh_user_progression(_user_id uuid)",
  );

  assert.match(checker, /event\.status = 'published'::public\.event_status/);
  assert.match(checker, /event\.published_at IS NOT NULL/);
  assert.match(checker, /event\.published_at >= v_profile_created_at/);
  assert.match(checker, /event\.published_at <= pg_catalog\.now\(\)/);
  assert.doesNotMatch(checker, /interval '90 days'|90 days/i);
});

test("Diamond Hands uses current open holding age rather than historical buy transactions", () => {
  const checker = functionBody(
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
    "CREATE OR REPLACE FUNCTION public.refresh_user_progression(_user_id uuid)",
  );

  assert.match(checker, /FROM public\.user_holdings AS h/);
  assert.match(checker, /h\.shares > 0/);
  assert.match(checker, /h\.created_at <= pg_catalog\.now\(\) - interval '60 days'/);
  assert.doesNotMatch(checker, /MIN\(t\.created_at\)|JOIN public\.transactions/i);
});

test("daily activity records same-day, consecutive, and missed-day UTC streak rules", () => {
  const activity = functionBody(
    "CREATE OR REPLACE FUNCTION public.record_user_daily_activity(_user_id uuid)",
    "CREATE OR REPLACE FUNCTION public.record_my_daily_activity()",
  );

  assert.match(activity, /v_today date := \(pg_catalog\.now\(\) AT TIME ZONE 'UTC'\)::date/);
  assert.match(activity, /FOR UPDATE/);
  assert.match(activity, /IF v_last_active = v_today THEN[\s\S]*RETURN COALESCE\(v_streak, 1\)/);
  assert.match(
    activity,
    /ELSIF v_last_active = v_today - 1 THEN[\s\S]*v_streak := COALESCE\(v_streak, 0\) \+ 1/,
  );
  assert.match(activity, /ELSE\s+v_streak := 1;/);
  assert.match(activity, /PERFORM public\.recalc_user_stats\(_user_id\)/);
});

test("browser activity wrapper accepts no user id and relies on auth.uid", () => {
  const wrapper = functionBody(
    "CREATE OR REPLACE FUNCTION public.record_my_daily_activity()",
    "CREATE OR REPLACE FUNCTION public.after_transaction()",
  );

  assert.match(wrapper, /CREATE OR REPLACE FUNCTION public\.record_my_daily_activity\(\)/);
  assert.match(wrapper, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(wrapper, /IF v_user_id IS NULL THEN/);
  assert.match(wrapper, /public\.record_user_daily_activity\(v_user_id\)/);
  assert.match(wrapper, /public\.refresh_user_progression\(v_user_id\)/);
});

test("progression refresh performs bounded recalc-check loops with final recalc and legacy check", () => {
  const refresh = functionBody(
    "CREATE OR REPLACE FUNCTION public.refresh_user_progression(_user_id uuid)",
    "CREATE OR REPLACE FUNCTION public.record_user_daily_activity(_user_id uuid)",
  );

  assert.match(refresh, /LOOP/);
  assert.match(refresh, /v_iterations := v_iterations \+ 1/);
  assert.match(refresh, /FROM public\.recalc_user_stats\(_user_id\)/);
  assert.match(refresh, /v_new := public\.check_achievements\(_user_id\)/);
  assert.match(refresh, /EXIT WHEN COALESCE\(v_new, 0\) = 0 OR v_iterations >= 4/);
  assert.match(refresh, /PERFORM public\.check_legacy_for_user\(_user_id\)/);
  assert.match(refresh, /'newAchievements', v_total_new/);
  assert.match(refresh, /'reputationScore', COALESCE\(v_stats\.reputation_score, 0\)/);
});

test("transaction trigger records activity and delegates progression refresh", () => {
  const trigger = functionBody(
    "CREATE OR REPLACE FUNCTION public.after_transaction()",
    "CREATE OR REPLACE FUNCTION public.refresh_all_user_progression()",
  );

  assert.match(trigger, /PERFORM public\.record_user_daily_activity\(NEW\.user_id\)/);
  assert.match(trigger, /PERFORM public\.refresh_user_progression\(NEW\.user_id\)/);
  assert.doesNotMatch(trigger, /check_achievements|check_legacy_for_user|recalc_user_stats/);
});

test("daily progression runs after leaderboard refresh and does not advance streaks", () => {
  const allUsers = functionBody(
    "CREATE OR REPLACE FUNCTION public.refresh_all_user_progression()",
    "REVOKE EXECUTE ON FUNCTION public.grant_achievement",
  );
  const cron = between(
    migration,
    "DO $legendary_progression_cron$",
    "SELECT public.refresh_all_user_progression()",
  );

  assert.match(allUsers, /FROM public\.user_wallets/);
  assert.match(allUsers, /v_progression := public\.refresh_user_progression\(v_user\.user_id\)/);
  assert.doesNotMatch(allUsers, /record_user_daily_activity|last_active_date|login_streak/);
  assert.match(cron, /extname = 'pg_cron'/);
  assert.match(cron, /cron\.unschedule\('legendary-progression-daily-refresh'\)/);
  assert.match(cron, /'20 0 \* \* \*'/);
});

test("internal progression functions are service-role only and self activity is authenticated", () => {
  for (const signature of [
    "grant_achievement\\(uuid, text\\)",
    "check_achievements\\(uuid\\)",
    "check_legacy_for_user\\(uuid\\)",
    "after_transaction\\(\\)",
    "refresh_user_progression\\(uuid\\)",
    "record_user_daily_activity\\(uuid\\)",
    "refresh_all_user_progression\\(\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${signature} FROM PUBLIC, anon, authenticated;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature} TO service_role;`),
    );
  }

  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.record_my_daily_activity\(\) FROM PUBLIC, anon;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.record_my_daily_activity\(\) TO authenticated, service_role;/,
  );
});

test("replaced security definer functions use the fixed search path", () => {
  for (const signature of [
    "public.grant_achievement",
    "public.check_achievements",
    "public.refresh_user_progression",
    "public.record_user_daily_activity",
    "public.record_my_daily_activity",
    "public.after_transaction",
    "public.refresh_all_user_progression",
  ]) {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
    assert.notEqual(start, -1, `${signature} should exist`);
    const block = migration.slice(start, migration.indexOf("AS $$", start));
    assert.match(block, /SECURITY DEFINER/);
    assert.match(block, /SET search_path = pg_catalog, public, pg_temp/);
  }
});

test("migration does not mutate unrelated money, pricing, game, or trading systems", () => {
  assert.doesNotMatch(
    migration,
    /\b(?:UPDATE|INSERT INTO|DELETE FROM|ALTER TABLE)\s+public\.(?:user_wallets|wallet_ledger_entries|transactions|price_history|character_price_history|daily_crew|grand_line_guess|trivia|market_rumors|market_events)/i,
  );
  assert.doesNotMatch(
    migration,
    /UPDATE\s+public\.user_holdings|DELETE FROM\s+public\.user_holdings/i,
  );
  assert.doesNotMatch(migration, /reward_paid|balance_after|current_price|execute_trade/i);
});

test("one-time backfill is count-only and does not fabricate daily visits", () => {
  const backfillIndex = migration.lastIndexOf(
    "SELECT public.refresh_all_user_progression() AS legendary_progression_backfill;",
  );
  assert.notEqual(backfillIndex, -1, "count-only progression backfill should run once");
  assert.doesNotMatch(
    migration.slice(backfillIndex),
    /record_user_daily_activity|record_my_daily_activity/,
  );
});
