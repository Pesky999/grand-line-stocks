import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "../../integrations/supabase/auth-middleware.ts";
import { DAILY_CREW_SAMPLE_FIXTURES } from "../daily-crew-builder/fixtures.ts";
import {
  DAILY_CREW_ROLES,
  scoreDailyCrewSubmission,
  toPublicDailyCrewMission,
  type DailyCrewMissionFixture,
  type DailyCrewRole,
  type DailyCrewScoreResult,
  type DailyCrewSubmissionAssignment,
  type PublicDailyCrewMission,
} from "../daily-crew-builder/scoring.ts";

export type DailyCrewBuilderPreviewResult = Pick<
  DailyCrewScoreResult,
  | "score"
  | "rank"
  | "rewardAmount"
  | "baseScore"
  | "synergyScore"
  | "maxScore"
  | "isPerfectSolution"
  | "roles"
  | "synergy"
> & {
  rewardPreviewOnly: true;
};

const assignmentInput = z.object({
  role: z.enum(DAILY_CREW_ROLES),
  characterId: z.string().min(1),
});

const previewSubmissionInput = z.object({
  assignments: z.array(assignmentInput).length(DAILY_CREW_ROLES.length),
});

function utcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function utcDayIndex(dateString: string): number {
  const timestamp = Date.parse(`${dateString}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.floor(timestamp / 86_400_000);
}

export function getDailyCrewBuilderFixtureForDate(dateString = utcDateString()): DailyCrewMissionFixture {
  const index = utcDayIndex(dateString) % DAILY_CREW_SAMPLE_FIXTURES.length;
  return DAILY_CREW_SAMPLE_FIXTURES[index] ?? DAILY_CREW_SAMPLE_FIXTURES[0];
}

export function getPublicDailyCrewBuilderMissionForDate(dateString = utcDateString()): PublicDailyCrewMission {
  return toPublicDailyCrewMission(getDailyCrewBuilderFixtureForDate(dateString));
}

export function scoreDailyCrewBuilderPreviewForFixture(
  fixture: DailyCrewMissionFixture,
  assignments: DailyCrewSubmissionAssignment[],
): DailyCrewBuilderPreviewResult {
  const result = scoreDailyCrewSubmission(fixture, assignments);

  return {
    score: result.score,
    rank: result.rank,
    rewardAmount: result.rewardAmount,
    baseScore: result.baseScore,
    synergyScore: result.synergyScore,
    maxScore: result.maxScore,
    isPerfectSolution: result.isPerfectSolution,
    roles: result.roles,
    synergy: result.synergy,
    rewardPreviewOnly: true,
  };
}

export function scoreDailyCrewBuilderPreviewForDate(
  assignments: DailyCrewSubmissionAssignment[],
  dateString = utcDateString(),
): DailyCrewBuilderPreviewResult {
  return scoreDailyCrewBuilderPreviewForFixture(getDailyCrewBuilderFixtureForDate(dateString), assignments);
}

export const getTodayDailyCrewBuilderMission = createServerFn({ method: "GET" }).handler(async () => {
  return getPublicDailyCrewBuilderMissionForDate();
});

export const submitDailyCrewBuilderPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => previewSubmissionInput.parse(input))
  .handler(async ({ data }) => {
    return scoreDailyCrewBuilderPreviewForDate(
      data.assignments.map((assignment) => ({
        role: assignment.role as DailyCrewRole,
        characterId: assignment.characterId,
      })),
    );
  });
