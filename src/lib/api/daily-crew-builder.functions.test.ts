/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DAILY_CREW_SAMPLE_FIXTURES } from "../daily-crew-builder/fixtures.ts";
import { scoreDailyCrewBuilderPreviewForFixture } from "./daily-crew-builder.functions.ts";
import { toPublicDailyCrewMission } from "../daily-crew-builder/scoring.ts";

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

test("mission endpoint returns only public-safe mission data", () => {
  const mission = toPublicDailyCrewMission(DAILY_CREW_SAMPLE_FIXTURES[0]);
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

test("Daily Crew Builder server functions read missions from DB and use only approved RPCs for save and payout", () => {
  const payoutCall = source.match(/\.rpc\("award_daily_crew_builder_reward"[\s\S]*?\}\);/);

  assert.match(source, /export const getTodayDailyCrewBuilderMission = createServerFn\(\{ method: "GET" \}\)/);
  assert.match(source, /loadPublishedDailyCrewBuilderMissionFixture\(db\)/);
  assert.match(source, /export const getMyTodayDailyCrewBuilderResult = createServerFn\(\{ method: "POST" \}\)/);
  assert.match(source, /export const submitDailyCrewBuilderPreview = createServerFn\(\{ method: "POST" \}\)/);
  assert.match(source, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(source, /scoreDailyCrewBuilderPreviewForFixture\(fixture, assignments\)/);
  assert.match(source, /\.from\("daily_crew_missions"\)/);
  assert.match(source, /\.from\("daily_crew_mission_pool"\)/);
  assert.match(source, /\.from\("daily_crew_role_requirements"\)/);
  assert.match(source, /\.from\("daily_crew_character_role_scores"\)/);
  assert.match(source, /\.from\("daily_crew_perfect_solution"\)/);
  assert.match(source, /\.from\("characters"\)/);
  assert.match(source, /\.rpc\("record_daily_crew_builder_submission"/);
  assert.match(source, /_user_id: context\.userId/);
  assert.match(source, /_score: computedResult\.score/);
  assert.match(source, /_rank: computedResult\.rank/);
  assert.match(source, /_reward_amount: computedResult\.rewardAmount/);
  assert.match(source, /_score_breakdown: toJson\(computedResult\)/);
  assert.match(source, /_assignments: toJson\(assignments\)/);
  assert.match(source, /\.rpc\("award_daily_crew_builder_reward"/);
  assert.match(source, /_submission_id: args\.submissionId/);
  assert.match(source, /_user_id: args\.userId/);
  assert.ok(payoutCall, "payout RPC call should be present");
  assert.doesNotMatch(payoutCall[0], /_reward_amount|rewardAmount|score|rank/);

  assert.doesNotMatch(source, /DAILY_CREW_SAMPLE_FIXTURES/);
  assert.doesNotMatch(source, /user_wallets|wallet mutation|transactions/);
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\s*\(/);
});

test("Daily Crew Builder server functions handle already-submitted and payout results safely", () => {
  assert.match(source, /alreadySubmitted: z\.boolean\(\)/);
  assert.match(source, /const savedBreakdown = rpcResult\.alreadySubmitted/);
  assert.match(source, /previewResultSchema\.parse\(rpcResult\.scoreBreakdown\)/);
  assert.match(source, /submissionSaved: true/);
  assert.match(source, /rewardPreviewOnly: true/);
  assert.match(source, /rewardPaid: rpcResult\.rewardPaid/);
  assert.match(source, /if \(persistedResult\.rewardPaid\) return persistedResult/);
  assert.match(source, /awardDailyCrewBuilderRewardSafely/);
  assert.match(source, /applyDailyCrewPayoutResult/);
  assert.match(source, /applyDailyCrewPayoutFailure/);
  assert.match(source, /walletBalance: z\.number\(\)\.nullable\(\)/);
  assert.doesNotMatch(source, /walletBalance: z\.number\(\)\.int\(\)\.nullable\(\)/);
  assert.match(source, /DAILY_CREW_PAYOUT_RPC_FAILED/);
  assert.match(source, /Reward payout is pending\. Your saved result is safe\./);
  assert.doesNotMatch(source, /retryDailyCrew|retry_daily_crew|Retry payout/i);
});

test("Daily Crew Builder saved-result load uses stored submission data and existing payout only", () => {
  const savedResultFunction = source.match(
    /export const getMyTodayDailyCrewBuilderResult[\s\S]*?export const submitDailyCrewBuilderPreview/,
  )?.[0];

  assert.ok(savedResultFunction, "saved-result server function should be present");
  assert.match(savedResultFunction, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(savedResultFunction, /savedResultInput\.parse\(input\)/);
  assert.match(savedResultFunction, /loadPublishedDailyCrewBuilderMissionFixture\(db, \{ missionId: data\.missionId \}\)/);
  assert.match(savedResultFunction, /\.from\("daily_crew_submissions"\)/);
  assert.match(savedResultFunction, /\.select\("id,submitted_at,score,rank,reward_amount,reward_paid,score_breakdown"\)/);
  assert.match(savedResultFunction, /\.eq\("mission_id", fixture\.id\)/);
  assert.match(savedResultFunction, /\.eq\("user_id", context\.userId\)/);
  assert.match(savedResultFunction, /\.maybeSingle\(\)/);
  assert.match(savedResultFunction, /if \(!savedSubmissionRow\) return null/);
  assert.match(savedResultFunction, /parseSavedSubmissionResult\(savedSubmissionRow as DailyCrewSubmissionRow\)/);
  assert.match(savedResultFunction, /if \(savedResult\.rewardPaid\) return savedResult/);
  assert.match(savedResultFunction, /awardDailyCrewBuilderRewardSafely\(db, \{/);
  assert.match(savedResultFunction, /submissionId: savedResult\.submissionId/);
  assert.match(savedResultFunction, /userId: context\.userId/);
  assert.match(savedResultFunction, /applyDailyCrewPayoutResult\(savedResult, payoutAttempt\.result\)/);
  assert.match(savedResultFunction, /applyDailyCrewPayoutFailure\(savedResult, payoutAttempt\.failure\)/);
  assert.doesNotMatch(savedResultFunction, /_reward_amount|rewardAmount:|record_daily_crew_builder_submission/);
  assert.doesNotMatch(savedResultFunction, /user_wallets|transactions|roleScores|perfectSolution/);
  assert.doesNotMatch(savedResultFunction, /\.(insert|update|upsert|delete)\s*\(/);
  assert.match(source, /function parseSavedSubmissionResult\(row: DailyCrewSubmissionRow\)/);
  assert.match(source, /previewResultSchema\.parse\(savedSubmission\.score_breakdown\)/);
  assert.match(source, /alreadySubmitted: true/);
});
