/// <reference types="node" />

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function normalizedSha256(source: string) {
  return createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
}

const source = readProjectFile("src/lib/api/legendary.functions.ts");
const legacyRankMigration = readProjectFile(
  "supabase/migrations/20260728020000_get_my_legacy_rank.sql",
);
const typesSource = readProjectFile("src/integrations/supabase/types.ts");

function between(start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

test("recordMyDailyActivity requires auth and accepts no user id", () => {
  const activity = between("export const recordMyDailyActivity", "export const getMyLegacyLog");

  assert.match(activity, /createServerFn\(\{ method: "POST" \}\)/);
  assert.match(activity, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.doesNotMatch(activity, /inputValidator/);
  assert.match(activity, /\.rpc\("record_my_daily_activity"\)/);
  assert.doesNotMatch(activity, /userId|_user_id|profileId/);
  assert.match(activity, /recordMyDailyActivityResultSchema\.parse\(data\)/);
});

test("public profile reads use the public client and never require service-role access", () => {
  const publicProfile = between("export const getPublicProfile", "export const listLegacy");

  assert.match(publicProfile, /const db = getPublicSupabaseClient\(\)/);
  assert.doesNotMatch(publicProfile, /await admin\(\)|supabaseAdmin|client\.server/);
  assert.match(publicProfile, /\.rpc\("get_public_investor_profile"/);
  assert.match(publicProfile, /_username: data\.username/);
  assert.match(publicProfile, /publicInvestorProfileResultSchema\.parse\(profile\)/);
  assert.doesNotMatch(publicProfile, /\.from\("profiles"\)/);
  assert.doesNotMatch(publicProfile, /\.from\("user_wallets"\)/);
  assert.doesNotMatch(publicProfile, /\.from\("user_holdings"\)/);
  assert.doesNotMatch(publicProfile, /cash: null|equity: null|holdings: \[\]/);
});

test("public profile lookup treats existing usernames as authoritative profile rows", () => {
  const publicProfile = between("export const getPublicProfile", "export const listLegacy");

  assert.match(source, /const PUBLIC_PROFILE_USERNAME_MAX_LENGTH = 64/);
  assert.match(publicProfile, /if \(!isPublicPlayerUsername\(data\.username\)\)/);
  assert.match(
    publicProfile,
    /\.rpc\("get_public_investor_profile", \{\s*_username: data\.username/,
  );
  assert.match(source, /z\.object\(\{ found: z\.literal\(false\) \}\)\.strict\(\)/);
  assert.doesNotMatch(source, /PUBLIC_PLAYER_USERNAME_PATTERN|value !== "anon"/);
  assert.doesNotMatch(publicProfile, /\.eq\("username", data\.username\)[\s\S]*\.maybeSingle\(\)/);
  assert.doesNotMatch(publicProfile, /!profile \|\| !isPublicPlayerUsername\(profile\.username\)/);
});

test("public profile failures and deleted usernames return a contained not-found result", () => {
  const publicProfile = between(
    "export const getPublicProfile",
    "export const setMyPublicTradingProfile",
  );

  assert.match(publicProfile, /return \{ found: false \} as const/);
  assert.match(publicProfile, /logPublicProfileReadFailure\("profile_read", error\)/);
  assert.doesNotMatch(publicProfile, /throw notFound|throw profileError|throw new Error/);
});

test("public profile schema accepts restored trading data without exposing private identity fields", () => {
  const schema = between(
    "const publicInvestorProfileResultSchema",
    "export function isPublicPlayerUsername",
  );

  assert.match(schema, /is_public: z\.boolean\(\)/);
  assert.match(schema, /cash: z\.coerce\.number\(\)\.nullable\(\)/);
  assert.match(schema, /equity: z\.coerce\.number\(\)\.nullable\(\)/);
  assert.match(schema, /net_worth: z\.coerce\.number\(\)\.nullable\(\)/);
  assert.match(schema, /holdings: z\.array\(publicProfileHoldingSchema\)/);
  assert.match(schema, /achievements: z\.array\(publicProfileAchievementSchema\)/);
  assert.match(schema, /snapshots: z\.array\(publicProfileSnapshotSchema\)/);
  assert.match(source, /value: z\.coerce\.number\(\)/);
  assert.doesNotMatch(schema, /user_id|id: z\.string\(\)\.uuid\(\)|email|auth|role|moderation/);
});

test("public leaderboard and holder APIs verify real profile rows instead of linking ghosts", () => {
  const helper = between(
    "async function filterRowsWithExistingPublicProfiles",
    "export const listLeaderboard",
  );
  const leaderboard = between("export const listLeaderboard", "export const getPublicProfile");
  const legacy = between("export const listLegacy", "export const listAchievementsCatalog");
  const topHolders = between(
    "export const listCharacterTopHolders",
    "export const listClimbersAndFallers",
  );
  const movers = source.slice(source.indexOf("export const listClimbersAndFallers"));

  assert.match(helper, /const candidateRows = rows\.filter\(hasPublicPlayerUsername\)/);
  assert.match(
    helper,
    /\.from\("profiles"\)[\s\S]*\.select\("username"\)[\s\S]*\.in\("username", usernames\)/,
  );
  assert.match(helper, /existingUsernames\.has\(row\.username\)/);
  assert.doesNotMatch(helper, /auth\.users|await admin\(\)|supabaseAdmin|client\.server/);
  assert.doesNotMatch(helper, /value !== "anon"|\?\? "anon"/);

  for (const [name, block] of [
    ["leaderboard", leaderboard],
    ["legacy", legacy],
    ["top holders", topHolders],
    ["movers", movers],
  ] as const) {
    assert.match(block, /filterRowsWithExistingPublicProfiles\(/, `${name} should verify profiles`);
    assert.doesNotMatch(block, /\?\? "anon"|"anon"/, `${name} should not synthesize anon`);
  }
});

test("public profile filtering preserves a real anon profile and drops stale anon rows", () => {
  const helper = between(
    "async function filterRowsWithExistingPublicProfiles",
    "export const listLeaderboard",
  );

  assert.doesNotMatch(source, /value !== "anon"|username:\s*"anon"|\?\?\s*"anon"/);
  assert.match(helper, /\.in\("username", usernames\)/);
  assert.match(helper, /const existingUsernames = new Set/);
  assert.match(
    helper,
    /return candidateRows\.filter\(\(row\) => existingUsernames\.has\(row\.username\)\)/,
  );
  assert.doesNotMatch(helper, /PUBLIC_PLAYER_USERNAME_PATTERN|\.test\(row\.username\)/);
});

test("public achievement catalog no longer needs the admin client", () => {
  const catalog = between(
    "export const listAchievementsCatalog",
    "export const recordMyDailyActivity",
  );

  assert.match(catalog, /const db = getPublicSupabaseClient\(\)/);
  assert.doesNotMatch(catalog, /await admin\(\)|supabaseAdmin|client\.server/);
});

test("getMyLegacyLog requires auth and is read-only", () => {
  const legacyLog = between("export const getMyLegacyLog", "export const listCharacterTopHolders");

  assert.match(legacyLog, /createServerFn\(\{ method: "GET" \}\)/);
  assert.match(legacyLog, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(legacyLog, /const db = context\.supabase/);
  assert.match(legacyLog, /const userId = context\.userId/);
  assert.doesNotMatch(legacyLog, /await admin\(\)|supabaseAdmin|client\.server/);
  assert.doesNotMatch(legacyLog, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.doesNotMatch(legacyLog, /record_my_daily_activity|refresh_user_progression/);
});

test("getMyLegacyLog reads its private all-time rank through the caller-only RPC", () => {
  const legacyLog = between("export const getMyLegacyLog", "export const listCharacterTopHolders");

  assert.match(legacyLog, /db\.rpc\("get_my_legacy_rank"\)\.maybeSingle\(\)/);
  assert.doesNotMatch(legacyLog, /\.from\("leaderboard_cache"\)/);
  assert.doesNotMatch(
    legacyLog,
    /get_my_legacy_rank[\s\S]*_user_id|_user_id[\s\S]*get_my_legacy_rank/,
  );
});

test("get_my_legacy_rank exposes only the authenticated player's private rank row", () => {
  assert.match(legacyRankMigration, /^BEGIN;/);
  assert.match(legacyRankMigration, /COMMIT;\s*$/);
  assert.match(
    legacyRankMigration,
    /CREATE OR REPLACE FUNCTION public\.get_my_legacy_rank\(\)\s+RETURNS TABLE \(\s*rank integer,\s*prev_rank integer,\s*value numeric\s*\)/,
  );
  assert.match(legacyRankMigration, /LANGUAGE sql\s+STABLE\s+SECURITY DEFINER/);
  assert.match(legacyRankMigration, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(
    legacyRankMigration,
    /FROM public\.leaderboard_cache AS leaderboard\s+WHERE leaderboard\.user_id = auth\.uid\(\)\s+AND leaderboard\.board_key = 'net_worth_all_time'/,
  );
  assert.doesNotMatch(
    legacyRankMigration.slice(
      legacyRankMigration.indexOf("public.get_my_legacy_rank("),
      legacyRankMigration.indexOf("RETURNS TABLE"),
    ),
    /user_id|uuid|text|integer|numeric/,
  );
  assert.doesNotMatch(legacyRankMigration, /username|display_name|profile|auth\.users/);
});

test("get_my_legacy_rank is caller-only without direct leaderboard table grants", () => {
  assert.match(
    legacyRankMigration,
    /REVOKE ALL ON FUNCTION public\.get_my_legacy_rank\(\) FROM PUBLIC;/,
  );
  assert.match(
    legacyRankMigration,
    /REVOKE EXECUTE ON FUNCTION public\.get_my_legacy_rank\(\) FROM anon;/,
  );
  assert.match(
    legacyRankMigration,
    /GRANT EXECUTE ON FUNCTION public\.get_my_legacy_rank\(\) TO authenticated, service_role;/,
  );
  assert.doesNotMatch(
    legacyRankMigration,
    /GRANT\s+(?:SELECT|ALL)\s+ON\s+(?:TABLE\s+)?public\.leaderboard_cache/i,
  );
  assert.match(legacyRankMigration, /NOTIFY pgrst, 'reload schema';/);
});

test("generated types expose the no-argument Legacy Log rank RPC", () => {
  assert.match(
    typesSource,
    /get_my_legacy_rank:\s*\{\s*Args: never\s*Returns:\s*\{\s*prev_rank: number\s*rank: number\s*value: number\s*\}\[\]\s*\}/,
  );
});

test("historical onboarding migrations remain byte-for-byte unchanged after line-ending normalization", () => {
  assert.equal(
    normalizedSha256(
      readProjectFile("supabase/migrations/20260725020000_add_stock_trading_onboarding.sql"),
    ),
    "ef09bde7d00b049f05e6e3f244c674209ac7469c12575a2612132056fbd6322d",
  );
  assert.equal(
    normalizedSha256(
      readProjectFile("supabase/migrations/20260725233000_reconcile_account_lifecycle.sql"),
    ),
    "58d1b7252b1ac9013fec4ac9dad0d9a55d656d2c2aae9bc746df68cab0774de5",
  );
});

test("getMyLegacyLog scopes private reads to the authenticated player", () => {
  const legacyLog = between("export const getMyLegacyLog", "export const listCharacterTopHolders");

  assert.match(legacyLog, /\.from\("profiles"\)[\s\S]*\.eq\("id", userId\)/);
  assert.match(legacyLog, /\.from\("user_stats"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(legacyLog, /\.from\("user_achievements"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(legacyLog, /\.from\("legacy_records"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(legacyLog, /\.from\("user_holdings"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(legacyLog, /\.from\("grand_line_guess_stats"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(legacyLog, /\.from\("grand_line_guess_results"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(legacyLog, /\.from\("daily_crew_submissions"\)[\s\S]*\.eq\("user_id", userId\)/);
});

test("Legacy Log returns catalog, unlocked achievements, records, and private progress metrics", () => {
  const legacyLog = between("export const getMyLegacyLog", "export const listCharacterTopHolders");

  assert.match(legacyLog, /\.from\("achievements"\)/);
  assert.match(legacyLog, /catalog: catalog \?\? \[\]/);
  assert.match(legacyLog, /unlocked: unlockedAchievements/);
  assert.match(legacyLog, /legacyRecords: legacyRecords \?\? \[\]/);
  assert.match(legacyLog, /maxOpenHoldingAgeDays/);
  assert.match(legacyLog, /largestHolderEligible/);
  assert.match(legacyLog, /firstEventEligible/);
  assert.match(legacyLog, /achievementCount: unlockedAchievements\.length/);
  assert.match(legacyLog, /achievementReputationRewardTotal/);
  assert.match(legacyLog, /currentTitle: stats\?\.title \?\? "rookie_pirate"/);
  assert.match(legacyLog, /currentSpecialization: stats\?\.specialization \?\? "generalist"/);
  assert.match(legacyLog, /totalBuys: Number\(stats\?\.total_buys \?\? 0\)/);
  assert.match(legacyLog, /totalSells: Number\(stats\?\.total_sells \?\? 0\)/);
  assert.match(legacyLog, /totalVolume: Number\(stats\?\.total_volume \?\? 0\)/);
  assert.match(legacyLog, /bestTradePnl: Number\(stats\?\.best_trade_pnl \?\? 0\)/);
  assert.match(legacyLog, /daysActive: Number\(stats\?\.days_active \?\? 0\)/);
  assert.match(legacyLog, /largestPositionValue: Number\(stats\?\.largest_position_value \?\? 0\)/);
  assert.match(legacyLog, /holdingCharacterCount: positiveHoldings\.length/);
  assert.match(legacyLog, /holdingCategoryCount: heldCategories\.size/);
  assert.match(legacyLog, /glgWins: Number\(glgStats\?\.games_won \?\? 0\)/);
  assert.match(legacyLog, /glgOneShotWins: Number\(glgStats\?\.one_shot_wins \?\? 0\)/);
  assert.match(legacyLog, /glgBestStreak: Number\(glgStats\?\.best_streak \?\? 0\)/);
  assert.match(legacyLog, /glgHintsFreeSolved: Number\(glgHintsFreeCount \?\? 0\) > 0/);
  assert.match(legacyLog, /dailyCrewSubmissionCount: dailyCrewRows\.length/);
  assert.match(legacyLog, /dailyCrewBestScore/);
  assert.match(legacyLog, /dailyCrewBestRank/);
  assert.match(legacyLog, /dailyCrewPerfectEligible/);
  assert.match(legacyLog, /dailyCrewHighRankCount/);
  assert.match(legacyLog, /dailyCrewPerfectCount/);
});

test("Legacy Log first-event and largest-holder eligibility are returned as booleans only", () => {
  const legacyLog = between("export const getMyLegacyLog", "export const listCharacterTopHolders");

  assert.match(legacyLog, /\.from\("market_events"\)[\s\S]*\.eq\("status", "published"\)/);
  assert.match(legacyLog, /\.gte\("published_at", profile\.created_at\)/);
  assert.match(legacyLog, /\.lte\("published_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(legacyLog, /firstEventEligible: \(firstEvent \?\? \[\]\)\.length > 0/);
  assert.match(legacyLog, /\.rpc\("is_my_character_largest_holder"/);
  assert.match(
    legacyLog,
    /largestHolderEligible = largestHolderResults\.some\(\(\{ data \}\) => data === true\)/,
  );
  assert.doesNotMatch(legacyLog, /get_public_character_top_holders|topSharesBySlug|holderRows/);
});

test("Legacy Log reads new achievement expansion data sources without writes", () => {
  const legacyLog = between("export const getMyLegacyLog", "export const listCharacterTopHolders");

  assert.match(
    legacyLog,
    /\.select\("character_id,shares,created_at,characters\(slug,name,current_price,category\)"\)/,
  );
  assert.match(legacyLog, /\.select\("games_won,one_shot_wins,best_streak"\)/);
  assert.match(legacyLog, /\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(legacyLog, /\.eq\("solved", true\)[\s\S]*\.eq\("hints_used", 0\)/);
  assert.match(legacyLog, /\.select\("score,rank,daily_crew_missions\(max_score\)"\)/);
  assert.match(
    legacyLog,
    /dailyCrewRows\.filter\(\(submission\) =>[\s\S]*\["a", "s"\]\.includes\(submission\.rank\)/,
  );
  assert.match(
    legacyLog,
    /Number\(submission\.score\) >= Number\(submission\.daily_crew_missions\?\.max_score \?\? 100\)/,
  );
  assert.match(
    legacyLog,
    /Number\(submission\.score\) === Number\(submission\.daily_crew_missions\?\.max_score \?\? 100\)/,
  );
  assert.doesNotMatch(legacyLog, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.doesNotMatch(legacyLog, /record_my_daily_activity|refresh_user_progression/);
});
