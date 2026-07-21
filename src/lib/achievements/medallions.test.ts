/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ACHIEVEMENT_MEDALLION_PATHS, getAchievementMedallionPath } from "./medallions.ts";

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
] as const;

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

test("achievement medallion map covers the existing 14 achievement codes", () => {
  assert.deepEqual(Object.keys(ACHIEVEMENT_MEDALLION_PATHS), [...achievementCodes]);

  for (const code of achievementCodes) {
    assert.equal(getAchievementMedallionPath(code), `/achievements/medallions/${code}.webp`);
  }
  assert.equal(getAchievementMedallionPath("future_unknown"), null);
});

test("all mapped achievement medallion assets exist under public", () => {
  const directory = join(process.cwd(), "public/achievements/medallions");
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".webp"))
    .sort();

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
