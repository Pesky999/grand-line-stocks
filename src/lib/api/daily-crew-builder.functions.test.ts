/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DAILY_CREW_SAMPLE_FIXTURES } from "../daily-crew-builder/fixtures.ts";
import {
  getPublicDailyCrewBuilderMissionForDate,
  scoreDailyCrewBuilderPreviewForFixture,
} from "./daily-crew-builder.functions.ts";

const source = readFileSync(
  join(process.cwd(), "src/lib/api/daily-crew-builder.functions.ts"),
  "utf8",
);

function perfectAssignmentsForFirstFixture() {
  return DAILY_CREW_SAMPLE_FIXTURES[0].perfectSolution.map((assignment) => ({
    role: assignment.role,
    characterId: assignment.characterId,
  }));
}

test("mission endpoint helper returns only public-safe mission data", () => {
  const mission = getPublicDailyCrewBuilderMissionForDate("2026-07-10");
  const json = JSON.stringify(mission);

  assert.equal(mission.pool.length, 15);
  assert.equal(mission.roles.length, 5);
  assert.equal(Object.hasOwn(mission, "roleScores"), false);
  assert.equal(Object.hasOwn(mission, "roleRequirements"), false);
  assert.equal(Object.hasOwn(mission, "synergyRules"), false);
  assert.equal(Object.hasOwn(mission, "perfectSolution"), false);
  assert.doesNotMatch(json, /roleScores|roleRequirements|subtypeKey|subtypeLabel|synergyRules|perfectSolution/i);
  assert.doesNotMatch(json, /Hidden command profile|Hidden combat profile|Hidden route profile/i);
});

test("submit preview helper returns safe score data without hidden tables", () => {
  const result = scoreDailyCrewBuilderPreviewForFixture(
    DAILY_CREW_SAMPLE_FIXTURES[0],
    perfectAssignmentsForFirstFixture(),
  );
  const json = JSON.stringify(result);

  assert.equal(result.score, 100);
  assert.equal(result.rank, "s");
  assert.equal(result.rewardAmount, 1000);
  assert.equal(result.rewardPreviewOnly, true);
  assert.equal(result.isPerfectSolution, true);
  assert.equal(result.roles.length, 5);
  assert.doesNotMatch(json, /roleScores|roleRequirements|subtypeKey|subtypeLabel|"perfectSolution"/i);
  assert.equal(result.roles.some((role) => role.characterId === "char-zoro" && role.role === "navigator"), false);
  assert.equal(result.roles.some((role) => role.characterId === "char-nami" && role.role === "fighter"), false);
});

test("submit preview rejects missing roles, duplicate characters, and unknown characters", () => {
  const fixture = DAILY_CREW_SAMPLE_FIXTURES[0];
  const perfect = perfectAssignmentsForFirstFixture();

  assert.throws(
    () => scoreDailyCrewBuilderPreviewForFixture(fixture, perfect.slice(0, 4)),
    /exactly 5 roles/,
  );

  assert.throws(
    () =>
      scoreDailyCrewBuilderPreviewForFixture(fixture, [
        { role: "captain", characterId: "char-luffy" },
        { role: "fighter", characterId: "char-luffy" },
        { role: "navigator", characterId: "char-nami" },
        { role: "strategist", characterId: "char-law" },
        { role: "support", characterId: "char-marco" },
      ]),
    /same character/,
  );

  assert.throws(
    () =>
      scoreDailyCrewBuilderPreviewForFixture(
        fixture,
        perfect.map((assignment) =>
          assignment.role === "support"
            ? { ...assignment, characterId: "char-not-in-pool" }
            : assignment,
        ),
      ),
    /outside the mission pool/,
  );
});

test("Daily Crew Builder server functions are preview-only and do not persist or pay rewards", () => {
  assert.match(source, /export const getTodayDailyCrewBuilderMission = createServerFn\(\{ method: "GET" \}\)/);
  assert.match(source, /return getPublicDailyCrewBuilderMissionForDate\(\)/);
  assert.match(source, /export const submitDailyCrewBuilderPreview = createServerFn\(\{ method: "POST" \}\)/);
  assert.match(source, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(source, /scoreDailyCrewBuilderPreviewForDate/);

  assert.doesNotMatch(source, /\.from\s*\(/);
  assert.doesNotMatch(source, /\.rpc\s*\(/);
  assert.doesNotMatch(source, /daily_crew_submissions|daily_crew_submission_roles/);
  assert.doesNotMatch(source, /user_wallets|wallet mutation|transactions/);
  assert.doesNotMatch(source, /award_daily_crew|reward_paid|payout RPC/i);
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\s*\(/);
});
