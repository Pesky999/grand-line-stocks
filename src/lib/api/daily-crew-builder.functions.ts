import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "../../integrations/supabase/auth-middleware.ts";
import type { Database, Json } from "../../integrations/supabase/types.ts";
import {
  DAILY_CREW_ROLE_LABELS,
  DAILY_CREW_ROLES,
  scoreDailyCrewSubmission,
  toPublicDailyCrewMission,
  type DailyCrewMissionFixture,
  type DailyCrewRank,
  type DailyCrewRole,
  type DailyCrewScoreResult,
  type DailyCrewSubmissionAssignment,
  type PublicDailyCrewMission,
} from "../daily-crew-builder/scoring.ts";

type DailyCrewDb = SupabaseClient<Database>;
type DailyCrewMissionRow = Pick<
  Database["public"]["Tables"]["daily_crew_missions"]["Row"],
  "id" | "mission_date" | "slug" | "title" | "brief" | "mission_tags" | "max_score"
>;
type DailyCrewPoolRow = Pick<
  Database["public"]["Tables"]["daily_crew_mission_pool"]["Row"],
  "character_id" | "display_order" | "is_straw_hat" | "visible_tags"
>;
type DailyCrewCharacterRow = Pick<
  Database["public"]["Tables"]["characters"]["Row"],
  "id" | "name" | "slug"
>;
type DailyCrewRoleRequirementRow = Pick<
  Database["public"]["Tables"]["daily_crew_role_requirements"]["Row"],
  "role" | "subtype_key" | "subtype_label" | "display_label" | "display_order" | "max_points"
>;
type DailyCrewRoleScoreRow = Pick<
  Database["public"]["Tables"]["daily_crew_character_role_scores"]["Row"],
  "character_id" | "role" | "score" | "explanation"
>;
type DailyCrewPerfectSolutionRow = Pick<
  Database["public"]["Tables"]["daily_crew_perfect_solution"]["Row"],
  "role" | "character_id"
>;
type DailyCrewSubmissionRow = Pick<
  Database["public"]["Tables"]["daily_crew_submissions"]["Row"],
  "id" | "submitted_at" | "score" | "rank" | "reward_amount" | "reward_paid" | "score_breakdown"
>;

type DailyCrewDbMissionFixture = DailyCrewMissionFixture & { id: string };

export type DailyCrewBuilderPublicMission = PublicDailyCrewMission & { id: string };

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

export type DailyCrewBuilderPersistedResult = DailyCrewBuilderPreviewResult & {
  submissionSaved: true;
  alreadySubmitted: boolean;
  submissionId: string;
  submittedAt: string | null;
  rewardPaid: boolean;
  walletBalance: number | null;
  payoutErrorCode?: string;
  payoutErrorStep?: DailyCrewPayoutErrorStep;
};

type DailyCrewPayoutErrorStep = "DAILY_CREW_PAYOUT_RPC_FAILED" | "DAILY_CREW_PAYOUT_UNKNOWN_FAILED";

const dailyCrewRankSchema = z.enum(["s", "a", "b", "c", "fail"]);

const assignmentInput = z.object({
  role: z.enum(DAILY_CREW_ROLES),
  characterId: z.string().uuid(),
});

const previewSubmissionInput = z.object({
  missionId: z.string().uuid(),
  assignments: z.array(assignmentInput).min(1).max(DAILY_CREW_ROLES.length),
});

const savedResultInput = z.object({
  missionId: z.string().uuid().optional(),
});

const previewResultSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    rank: dailyCrewRankSchema,
    rewardAmount: z.number().int().min(0),
    baseScore: z.number().int().min(0),
    synergyScore: z.number().int().min(0),
    maxScore: z.literal(100),
    isPerfectSolution: z.boolean(),
    rewardPreviewOnly: z.literal(true),
    roles: z.array(
      z
        .object({
          role: z.enum(DAILY_CREW_ROLES),
          roleName: z.string(),
          characterId: z.string().uuid(),
          characterName: z.string(),
          score: z.number().int().min(0).max(30),
          maxScore: z.number().int().min(1).max(30),
          explanation: z.string(),
        })
        .strict(),
    ),
    synergy: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          points: z.number().int().min(0),
          explanation: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

const recordSubmissionResultSchema = z
  .object({
    alreadySubmitted: z.boolean(),
    submissionId: z.string().uuid(),
    submittedAt: z.string().nullable(),
    score: z.number().int().min(0).max(100),
    rank: dailyCrewRankSchema,
    rewardAmount: z.number().int().min(0),
    rewardPaid: z.boolean(),
    scoreBreakdown: z.unknown(),
  })
  .strict();

const savedSubmissionResultSchema = z
  .object({
    id: z.string().uuid(),
    submitted_at: z.string().nullable(),
    score: z.number().int().min(0).max(100),
    rank: dailyCrewRankSchema,
    reward_amount: z.number().int().min(0),
    reward_paid: z.boolean(),
    score_breakdown: z.unknown(),
  })
  .strict();

const awardDailyCrewRewardResultSchema = z
  .object({
    submissionId: z.string().uuid(),
    rewardAmount: z.number().int().min(0),
    rewardPaid: z.literal(true),
    alreadyPaid: z.boolean(),
    walletBalance: z.number().nullable(),
  })
  .strict();

type DailyCrewPayoutResult = z.infer<typeof awardDailyCrewRewardResultSchema>;

const DAILY_CREW_PAYOUT_ERROR_MESSAGE = "Reward payout is pending. Your saved result is safe.";

class DailyCrewPayoutError extends Error {
  payoutErrorCode: string;
  payoutErrorStep: DailyCrewPayoutErrorStep;

  constructor(step: DailyCrewPayoutErrorStep, supabaseCode?: string) {
    super(DAILY_CREW_PAYOUT_ERROR_MESSAGE);
    this.name = "DailyCrewPayoutError";
    this.payoutErrorStep = step;
    this.payoutErrorCode = safeDailyCrewPayoutCode(step, supabaseCode);
  }
}

type DailyCrewPayoutFailure = {
  message: string;
  payoutErrorCode: string;
  payoutErrorStep: DailyCrewPayoutErrorStep;
};

type DailyCrewPayoutAttempt =
  | { ok: true; result: DailyCrewPayoutResult }
  | { ok: false; failure: DailyCrewPayoutFailure };

function safeDailyCrewPayoutCode(step: DailyCrewPayoutErrorStep, supabaseCode?: string): string {
  const safeCode = supabaseCode?.replace(/[^A-Za-z0-9_]/g, "_");
  return safeCode ? `${step}_${safeCode}` : step;
}

function dailyCrewPayoutFailureFromError(error: unknown): DailyCrewPayoutFailure {
  if (error instanceof DailyCrewPayoutError) {
    return {
      message: error.message,
      payoutErrorCode: error.payoutErrorCode,
      payoutErrorStep: error.payoutErrorStep,
    };
  }

  return {
    message: DAILY_CREW_PAYOUT_ERROR_MESSAGE,
    payoutErrorCode: "DAILY_CREW_PAYOUT_UNKNOWN_FAILED",
    payoutErrorStep: "DAILY_CREW_PAYOUT_UNKNOWN_FAILED",
  };
}

function logDailyCrewPayoutSupabaseError(
  message: string,
  error: { code?: string; message?: string; details?: string; hint?: string },
) {
  console.error(message, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

async function admin(): Promise<DailyCrewDb> {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server.ts");
  return supabaseAdmin;
}

function utcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function toPreviewResult(result: DailyCrewScoreResult): DailyCrewBuilderPreviewResult {
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

function toPublicDailyCrewBuilderMission(
  fixture: DailyCrewDbMissionFixture,
): DailyCrewBuilderPublicMission {
  return {
    id: fixture.id,
    ...toPublicDailyCrewMission(fixture),
  };
}

function perfectSolutionSynergyRule(fixture: DailyCrewDbMissionFixture) {
  const roles = Object.fromEntries(
    fixture.perfectSolution.map((solution) => [solution.role, solution.characterId]),
  ) as Partial<Record<DailyCrewRole, string>>;

  return {
    id: `${fixture.slug}-perfect-crew`,
    label: `${fixture.title} perfect crew`,
    points: 10,
    explanation:
      "The exact crew covers every hidden role profile and earns the mission synergy bonus.",
    roles,
  };
}

async function loadActiveDailyCrewBuilderMissionFixture(
  db: DailyCrewDb,
  options: { missionId?: string } = {},
): Promise<DailyCrewDbMissionFixture> {
  const missionDate = utcDateString();
  let missionQuery = db
    .from("daily_crew_missions")
    .select("id,mission_date,slug,title,brief,mission_tags,max_score")
    .eq("mission_date", missionDate)
    .in("status", ["published", "scheduled"])
    .limit(1);

  if (options.missionId) {
    missionQuery = missionQuery.eq("id", options.missionId);
  }

  const missionResult = await missionQuery.maybeSingle();
  if (missionResult.error) throw missionResult.error;

  const mission = missionResult.data as DailyCrewMissionRow | null;
  if (!mission) {
    throw new Error("No Daily Crew Builder mission is active for today.");
  }
  if (mission.max_score !== 100) {
    throw new Error("Daily Crew Builder mission has an unsupported max score.");
  }

  const [poolResult, requirementsResult, scoresResult, solutionResult] = await Promise.all([
    db
      .from("daily_crew_mission_pool")
      .select("character_id,display_order,is_straw_hat,visible_tags")
      .eq("mission_id", mission.id)
      .order("display_order", { ascending: true }),
    db
      .from("daily_crew_role_requirements")
      .select("role,subtype_key,subtype_label,display_label,display_order,max_points")
      .eq("mission_id", mission.id),
    db
      .from("daily_crew_character_role_scores")
      .select("character_id,role,score,explanation")
      .eq("mission_id", mission.id),
    db.from("daily_crew_perfect_solution").select("role,character_id").eq("mission_id", mission.id),
  ]);

  if (poolResult.error) throw poolResult.error;
  if (requirementsResult.error) throw requirementsResult.error;
  if (scoresResult.error) throw scoresResult.error;
  if (solutionResult.error) throw solutionResult.error;

  const poolRows = (poolResult.data ?? []) as DailyCrewPoolRow[];
  const characterIds = poolRows.map((row) => row.character_id);
  const charactersResult = await db
    .from("characters")
    .select("id,name,slug")
    .in("id", characterIds);
  if (charactersResult.error) throw charactersResult.error;

  const charactersById = new Map(
    ((charactersResult.data ?? []) as DailyCrewCharacterRow[]).map((character) => [
      character.id,
      character,
    ]),
  );

  const pool = poolRows.map((row) => {
    const character = charactersById.get(row.character_id);
    if (!character) {
      throw new Error("Daily Crew Builder mission references a missing market character.");
    }

    return {
      id: character.id,
      name: character.name,
      slug: character.slug,
      displayOrder: row.display_order,
      isStrawHat: row.is_straw_hat,
      visibleTags: row.visible_tags,
    };
  });

  const fixture: DailyCrewDbMissionFixture = {
    id: mission.id,
    missionDate: mission.mission_date,
    slug: mission.slug,
    title: mission.title,
    brief: mission.brief,
    missionTags: mission.mission_tags,
    maxScore: 100,
    pool,
    roleRequirements: ((requirementsResult.data ?? []) as DailyCrewRoleRequirementRow[]).map(
      (row) => ({
        role: row.role,
        subtypeKey: row.subtype_key,
        subtypeLabel: row.subtype_label ?? undefined,
        displayLabel: row.display_label ?? undefined,
        displayOrder: row.display_order,
        maxPoints: row.max_points,
      }),
    ),
    roleScores: ((scoresResult.data ?? []) as DailyCrewRoleScoreRow[]).map((row) => ({
      characterId: row.character_id,
      role: row.role,
      score: row.score,
      explanation: row.explanation,
    })),
    perfectSolution: ((solutionResult.data ?? []) as DailyCrewPerfectSolutionRow[]).map((row) => ({
      role: row.role,
      characterId: row.character_id,
    })),
    synergyRules: [],
  };

  fixture.synergyRules = [perfectSolutionSynergyRule(fixture)];
  return fixture;
}

export function scoreDailyCrewBuilderPreviewForFixture(
  fixture: DailyCrewMissionFixture,
  assignments: DailyCrewSubmissionAssignment[],
): DailyCrewBuilderPreviewResult {
  return toPreviewResult(scoreDailyCrewSubmission(fixture, assignments));
}

function parsePersistedResult(
  rpcValue: unknown,
  computedResult: DailyCrewBuilderPreviewResult,
): DailyCrewBuilderPersistedResult {
  const rpcResult = recordSubmissionResultSchema.parse(rpcValue);
  const savedBreakdown = rpcResult.alreadySubmitted
    ? previewResultSchema.parse(rpcResult.scoreBreakdown)
    : computedResult;

  return {
    ...savedBreakdown,
    score: rpcResult.score,
    rank: rpcResult.rank as DailyCrewRank,
    rewardAmount: rpcResult.rewardAmount,
    rewardPreviewOnly: true,
    submissionSaved: true,
    alreadySubmitted: rpcResult.alreadySubmitted,
    submissionId: rpcResult.submissionId,
    submittedAt: rpcResult.submittedAt,
    rewardPaid: rpcResult.rewardPaid,
    walletBalance: null,
  };
}

function parseSavedSubmissionResult(row: DailyCrewSubmissionRow): DailyCrewBuilderPersistedResult {
  const savedSubmission = savedSubmissionResultSchema.parse(row);
  const savedBreakdown = previewResultSchema.parse(savedSubmission.score_breakdown);

  return {
    ...savedBreakdown,
    score: savedSubmission.score,
    rank: savedSubmission.rank as DailyCrewRank,
    rewardAmount: savedSubmission.reward_amount,
    rewardPreviewOnly: true,
    submissionSaved: true,
    alreadySubmitted: true,
    submissionId: savedSubmission.id,
    submittedAt: savedSubmission.submitted_at,
    rewardPaid: savedSubmission.reward_paid,
    walletBalance: null,
  };
}

async function awardDailyCrewBuilderReward(
  db: DailyCrewDb,
  args: { submissionId: string; userId: string },
): Promise<DailyCrewPayoutResult> {
  const { data, error } = await db.rpc("award_daily_crew_builder_reward", {
    _submission_id: args.submissionId,
    _user_id: args.userId,
  });

  if (error) {
    logDailyCrewPayoutSupabaseError("Daily Crew Builder reward RPC failed", error);
    throw new DailyCrewPayoutError("DAILY_CREW_PAYOUT_RPC_FAILED", error.code);
  }

  return awardDailyCrewRewardResultSchema.parse(data);
}

async function awardDailyCrewBuilderRewardSafely(
  db: DailyCrewDb,
  args: { submissionId: string; userId: string },
): Promise<DailyCrewPayoutAttempt> {
  try {
    const result = await awardDailyCrewBuilderReward(db, args);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, failure: dailyCrewPayoutFailureFromError(error) };
  }
}

function applyDailyCrewPayoutResult(
  state: DailyCrewBuilderPersistedResult,
  payout: DailyCrewPayoutResult,
): DailyCrewBuilderPersistedResult {
  return {
    ...state,
    rewardAmount: payout.rewardAmount,
    rewardPaid: payout.rewardPaid,
    walletBalance: payout.walletBalance,
  };
}

function applyDailyCrewPayoutFailure(
  state: DailyCrewBuilderPersistedResult,
  failure: DailyCrewPayoutFailure,
): DailyCrewBuilderPersistedResult {
  return {
    ...state,
    rewardPaid: false,
    payoutErrorCode: failure.payoutErrorCode,
    payoutErrorStep: failure.payoutErrorStep,
  };
}

export const getTodayDailyCrewBuilderMission = createServerFn({ method: "GET" }).handler(
  async () => {
    const db = await admin();
    const fixture = await loadActiveDailyCrewBuilderMissionFixture(db);
    return toPublicDailyCrewBuilderMission(fixture);
  },
);

export const getMyTodayDailyCrewBuilderResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => savedResultInput.parse(input))
  .handler(async ({ data, context }): Promise<DailyCrewBuilderPersistedResult | null> => {
    const db = await admin();
    const fixture = await loadActiveDailyCrewBuilderMissionFixture(db, {
      missionId: data.missionId,
    });

    const { data: savedSubmissionRow, error } = await db
      .from("daily_crew_submissions")
      .select("id,submitted_at,score,rank,reward_amount,reward_paid,score_breakdown")
      .eq("mission_id", fixture.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw error;
    if (!savedSubmissionRow) return null;

    const savedResult = parseSavedSubmissionResult(savedSubmissionRow as DailyCrewSubmissionRow);
    if (savedResult.rewardPaid) return savedResult;

    const payoutAttempt = await awardDailyCrewBuilderRewardSafely(db, {
      submissionId: savedResult.submissionId,
      userId: context.userId,
    });

    return payoutAttempt.ok
      ? applyDailyCrewPayoutResult(savedResult, payoutAttempt.result)
      : applyDailyCrewPayoutFailure(savedResult, payoutAttempt.failure);
  });

export const submitDailyCrewBuilderPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => previewSubmissionInput.parse(input))
  .handler(async ({ data, context }): Promise<DailyCrewBuilderPersistedResult> => {
    const db = await admin();
    const fixture = await loadActiveDailyCrewBuilderMissionFixture(db, {
      missionId: data.missionId,
    });
    const assignments = data.assignments.map((assignment) => ({
      role: assignment.role as DailyCrewRole,
      characterId: assignment.characterId,
    }));
    const computedResult = scoreDailyCrewBuilderPreviewForFixture(fixture, assignments);

    const { data: rpcResult, error } = await db.rpc("record_daily_crew_builder_submission", {
      _mission_id: data.missionId,
      _user_id: context.userId,
      _score: computedResult.score,
      _rank: computedResult.rank,
      _reward_amount: computedResult.rewardAmount,
      _score_breakdown: toJson(computedResult),
      _assignments: toJson(assignments),
    });
    if (error) throw error;

    const persistedResult = parsePersistedResult(rpcResult, computedResult);
    if (persistedResult.rewardPaid) return persistedResult;

    const payoutAttempt = await awardDailyCrewBuilderRewardSafely(db, {
      submissionId: persistedResult.submissionId,
      userId: context.userId,
    });

    return payoutAttempt.ok
      ? applyDailyCrewPayoutResult(persistedResult, payoutAttempt.result)
      : applyDailyCrewPayoutFailure(persistedResult, payoutAttempt.failure);
  });
