/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/lib/api/legendary.functions.ts"), "utf8");

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

test("getMyLegacyLog requires auth and is read-only", () => {
  const legacyLog = between("export const getMyLegacyLog", "export const listCharacterTopHolders");

  assert.match(legacyLog, /createServerFn\(\{ method: "GET" \}\)/);
  assert.match(legacyLog, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(legacyLog, /const userId = context\.userId/);
  assert.doesNotMatch(legacyLog, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.doesNotMatch(legacyLog, /record_my_daily_activity|refresh_user_progression/);
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
  assert.match(legacyLog, /largestHolderEligible = positiveHoldings\.some/);
  assert.doesNotMatch(legacyLog, /return \{[\s\S]*holderRows[\s\S]*\}/);
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
  assert.doesNotMatch(legacyLog, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
});
