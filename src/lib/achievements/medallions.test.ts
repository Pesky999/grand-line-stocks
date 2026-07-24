/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ACHIEVEMENT_MEDALLION_PATHS, getAchievementMedallionPath } from "./medallions.ts";

const originalAchievementCodes = [
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
] as const;

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
  "mission_log",
  "crew_scholar",
  "grand_fleet_archivist",
] as const;

const achievementCodes = [...originalAchievementCodes, ...expansionAchievementCodes] as const;

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

test("achievement medallion map covers the full 44-code catalog", () => {
  assert.deepEqual(Object.keys(ACHIEVEMENT_MEDALLION_PATHS), [...achievementCodes]);

  for (const code of achievementCodes) {
    assert.equal(getAchievementMedallionPath(code), `/achievements/medallions/${code}.webp`);
  }
  assert.equal(getAchievementMedallionPath("future_unknown"), null);
});

test("original 14 achievement medallion mappings remain unchanged", () => {
  assert.deepEqual(
    Object.fromEntries(
      originalAchievementCodes.map((code) => [code, ACHIEVEMENT_MEDALLION_PATHS[code]]),
    ),
    Object.fromEntries(
      originalAchievementCodes.map((code) => [code, `/achievements/medallions/${code}.webp`]),
    ),
  );
});

test("all 30 achievement expansion medallions are mapped to their approved public assets", () => {
  assert.equal(expansionAchievementCodes.length, 30);
  for (const code of expansionAchievementCodes) {
    assert.equal(getAchievementMedallionPath(code), `/achievements/medallions/${code}.webp`);
  }
});

test("all mapped achievement medallion assets exist under public", () => {
  const directory = join(process.cwd(), "public/achievements/medallions");
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".webp"))
    .sort();

  assert.equal(files.length, 44);
  assert.deepEqual(files, [...achievementCodes].map((code) => `${code}.webp`).sort());

  for (const path of Object.values(ACHIEVEMENT_MEDALLION_PATHS)) {
    assert.equal(existsSync(join(process.cwd(), "public", path.replace(/^\//, ""))), true);
  }
});

test("AchievementMedallion keeps database icon text as the image failure fallback", () => {
  const component = read("src/components/AchievementMedallion.tsx");

  assert.match(component, /getAchievementMedallionPath\(code\)/);
  assert.match(component, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(component, /\{icon \?\? "\*"\}/);
  assert.match(component, /loading="lazy"/);
});

test("Legacy Log and profile surfaces render custom achievement medallions", () => {
  const legacyLog = read("src/routes/_authenticated/legacy-log.tsx");
  const privateProfile = read("src/routes/_authenticated/profile.tsx");
  const publicProfile = read("src/routes/u.$username.tsx");

  for (const source of [legacyLog, privateProfile, publicProfile]) {
    assert.match(source, /AchievementMedallion/);
    assert.match(source, /achievements\.icon|achievement\.icon/);
  }

  assert.match(legacyLog, /<AchievementMedallion[\s\S]*code=\{achievement\.code\}/);
  assert.match(privateProfile, /<AchievementMedallion[\s\S]*code=\{ua\.achievements\.code\}/);
  assert.match(publicProfile, /<AchievementMedallion[\s\S]*code=\{ua\.achievements\.code\}/);
});

test("tier badges remain separate from custom medallion artwork", () => {
  const legacyLog = read("src/routes/_authenticated/legacy-log.tsx");
  const publicProfile = read("src/routes/u.$username.tsx");

  assert.match(legacyLog, /TIER_TONE\[achievement\.tier\]/);
  assert.match(publicProfile, /TIER_TONE\[ua\.achievements\.tier\]/);
});
