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
const expansionMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260723010000_add_achievement_expansion_30.sql",
);
const expansionMigration = existsSync(expansionMigrationPath)
  ? readFileSync(expansionMigrationPath, "utf8")
  : "";

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

const expansionAchievementCodes = [
  "deckhand_dealer",
  "balanced_ledger",
  "million_berry_mover",
  "big_score",
  "treasure_haul",
  "storm_trader",
  "first_crew",
  "crew_builder",
  "grand_fleet",
  "four_seas_investor",
  "rising_bounty",
  "supernova_fortune",
  "emperors_treasury",
  "whale_position",
  "seven_day_sail",
  "seasoned_sailor",
  "unbroken_voyage",
  "king_of_exchange",
  "first_sight",
  "observation_haki",
  "clue_free_navigator",
  "winning_route",
  "grand_line_oracle",
  "first_command",
  "a_rank_captain",
  "s_rank_commander",
  "perfect_crew",
  "first_lesson",
  "sea_scholar",
  "ohara_archivist",
];

test("legendary progression migration is transactional and scoped", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /^BEGIN;\s/i);
  assert.match(migration, /COMMIT;\s+NOTIFY pgrst, 'reload schema';\s*$/i);
  assert.doesNotMatch(migration, /\bCASCADE\b/i);
  assert.doesNotMatch(migration, /\bEXECUTE\s+format\b|\bEXECUTE\s+v_|\bEXECUTE\s+'\s*/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.achievements/i);
});

test("achievement expansion migration is transactional and inserts exactly 30 approved catalog records", () => {
  assert.equal(existsSync(expansionMigrationPath), true);
  assert.match(expansionMigration, /^BEGIN;\s/i);
  assert.match(expansionMigration, /COMMIT;\s+NOTIFY pgrst, 'reload schema';\s*$/i);
  assert.doesNotMatch(expansionMigration, /\bCASCADE\b/i);
  assert.doesNotMatch(expansionMigration, /\bEXECUTE\s+format\b|\bEXECUTE\s+v_|\bEXECUTE\s+'\s*/i);

  const catalogInsert = between(
    expansionMigration,
    "INSERT INTO public.achievements",
    "ON CONFLICT (code) DO UPDATE",
  );
  const insertedCodes = [...catalogInsert.matchAll(/\(\s*'([a-z0-9_]+)',\s*'/g)].map(
    (match) => match[1],
  );

  assert.equal(insertedCodes.length, 30);
  assert.deepEqual(insertedCodes, expansionAchievementCodes);
  for (const code of achievementCodes) {
    assert.doesNotMatch(catalogInsert, new RegExp(`'${code}'`));
  }
});

test("achievement expansion catalog upsert is idempotent and reputation-only", () => {
  const catalogInsert = between(
    expansionMigration,
    "INSERT INTO public.achievements",
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
  );

  assert.match(catalogInsert, /ON CONFLICT \(code\) DO UPDATE/i);
  assert.match(catalogInsert, /reputation_reward = EXCLUDED\.reputation_reward/);
  for (const [tier, reward] of [
    ["beginner", 5],
    ["intermediate", 10],
    ["advanced", 20],
    ["legendary", 40],
  ] as const) {
    assert.match(
      catalogInsert,
      new RegExp(`'${tier}'::public\\.achievement_tier,[\\s\\S]*?${reward}`),
    );
  }
  assert.doesNotMatch(
    catalogInsert,
    /user_wallets|wallet_ledger_entries|transactions|reward_paid/i,
  );
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

test("achievement expansion checker grants exactly the full 44-code catalog", () => {
  const checker = between(
    expansionMigration,
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
    "REVOKE EXECUTE ON FUNCTION public.check_achievements(uuid)",
  );
  const allCodes = [...achievementCodes, ...expansionAchievementCodes];

  assert.match(checker, /RETURNS integer/i);
  for (const code of allCodes) {
    assert.match(checker, new RegExp(`public\\.grant_achievement\\(_user_id, '${code}'\\)`));
  }
  assert.equal((checker.match(/v_count := v_count \+ 1;/g) ?? []).length, allCodes.length);
  assert.doesNotMatch(checker, /PERFORM grant_achievement/);
});

test("achievement expansion checker uses the approved market and game data sources", () => {
  const checker = between(
    expansionMigration,
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
    "REVOKE EXECUTE ON FUNCTION public.check_achievements(uuid)",
  );

  assert.match(checker, /FROM public\.user_stats/);
  assert.match(checker, /FROM public\.leaderboard_cache[\s\S]*board_key = 'net_worth_all_time'/);
  assert.match(checker, /COUNT\(DISTINCT h\.character_id\), COUNT\(DISTINCT c\.category\)/);
  assert.match(checker, /FROM public\.user_holdings AS h[\s\S]*JOIN public\.characters AS c/);
  assert.match(checker, /FROM public\.grand_line_guess_stats AS stats/);
  assert.match(checker, /FROM public\.grand_line_guess_results AS results/);
  assert.match(
    checker,
    /FROM public\.daily_crew_submissions AS submissions[\s\S]*JOIN public\.daily_crew_missions AS missions/,
  );
  assert.match(checker, /FROM public\.trivia_attempts AS attempts/);
});

test("achievement expansion unlock thresholds match the approved manifest", () => {
  const checker = between(
    expansionMigration,
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
    "REVOKE EXECUTE ON FUNCTION public.check_achievements(uuid)",
  );

  for (const [condition, code] of [
    ["s\\.total_trades >= 10", "deckhand_dealer"],
    ["s\\.total_buys >= 25[\\s\\S]*s\\.total_sells >= 25", "balanced_ledger"],
    ["s\\.total_volume >= 1000000", "million_berry_mover"],
    ["s\\.best_trade_pnl >= 10000", "big_score"],
    ["s\\.best_trade_pnl >= 50000", "treasure_haul"],
    ["s\\.total_trades >= 500", "storm_trader"],
    ["v_holding_count >= 3", "first_crew"],
    ["v_holding_count >= 10", "crew_builder"],
    ["v_holding_count >= 25", "grand_fleet"],
    ["v_holding_category_count = 4", "four_seas_investor"],
    ["s\\.current_net_worth >= 50000", "rising_bounty"],
    ["s\\.current_net_worth >= 250000", "supernova_fortune"],
    ["s\\.current_net_worth >= 5000000", "emperors_treasury"],
    ["s\\.largest_position_value >= 250000", "whale_position"],
    ["s\\.login_streak >= 7", "seven_day_sail"],
    ["s\\.days_active >= 100", "seasoned_sailor"],
    ["s\\.login_streak >= 100", "unbroken_voyage"],
    ["v_rank = 1", "king_of_exchange"],
    ["v_glg_games_won >= 1", "first_sight"],
    ["v_glg_one_shot_wins >= 1", "observation_haki"],
    ["v_glg_hints_free", "clue_free_navigator"],
    ["v_glg_best_streak >= 10", "winning_route"],
    ["v_glg_games_won >= 50", "grand_line_oracle"],
    ["v_daily_crew_submission_count >= 1", "first_command"],
    ["v_daily_crew_a_or_s", "a_rank_captain"],
    ["v_daily_crew_s", "s_rank_commander"],
    ["v_daily_crew_perfect", "perfect_crew"],
    ["v_trivia_correct_count >= 1", "first_lesson"],
    ["v_trivia_correct_count >= 25", "sea_scholar"],
    ["v_trivia_correct_count >= 100", "ohara_archivist"],
  ] as const) {
    assert.match(checker, new RegExp(`${condition}[\\s\\S]*'${code}'`), code);
  }
});

test("achievement expansion backfills through the existing progression refresh system", () => {
  const backfillIndex = expansionMigration.lastIndexOf(
    "SELECT public.refresh_all_user_progression() AS achievement_expansion_30_backfill;",
  );

  assert.notEqual(backfillIndex, -1, "expansion should refresh eligible existing users once");
  assert.doesNotMatch(
    expansionMigration.slice(backfillIndex),
    /record_user_daily_activity|record_my_daily_activity/,
  );
});

test("achievement expansion checker remains service-role only with fixed search path", () => {
  const checkerHeader = between(
    expansionMigration,
    "CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)",
    "AS $$",
  );

  assert.match(checkerHeader, /RETURNS integer/i);
  assert.match(checkerHeader, /LANGUAGE plpgsql/i);
  assert.match(checkerHeader, /SECURITY DEFINER/i);
  assert.match(checkerHeader, /SET search_path = pg_catalog, public, pg_temp/i);
  assert.match(
    expansionMigration,
    /REVOKE EXECUTE ON FUNCTION public\.check_achievements\(uuid\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    expansionMigration,
    /GRANT EXECUTE ON FUNCTION public\.check_achievements\(uuid\) TO service_role;/,
  );
});

test("achievement expansion migration does not mutate wallets, gameplay rewards, prices, or holdings", () => {
  assert.doesNotMatch(
    expansionMigration,
    /\b(?:UPDATE|INSERT INTO|DELETE FROM|ALTER TABLE)\s+public\.(?:user_wallets|wallet_ledger_entries|transactions|price_history|character_price_history|user_holdings|daily_crew_submissions|daily_crew_missions|grand_line_guess|trivia_attempts|market_rumors|market_events)/i,
  );
  assert.doesNotMatch(
    expansionMigration,
    /reward_paid|balance_after|current_price|execute_trade|award_daily_crew|award_grand_line_guess|record_daily_crew_builder_submission/i,
  );
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
