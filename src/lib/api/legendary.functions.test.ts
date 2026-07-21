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
