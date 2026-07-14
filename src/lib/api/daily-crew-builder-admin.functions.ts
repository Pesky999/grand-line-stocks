import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";

const DAILY_CREW_ROLES = ["captain", "fighter", "navigator", "strategist", "support"] as const;
const DAILY_CREW_REVEAL_POLICIES = ["immediate", "next_day", "manual"] as const;
const DAILY_CREW_MISSION_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
const missionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const trimmedString = (max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(max));
const optionalTrimmedString = (max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(max))
    .nullable();
const tagSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(40));
const slugSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/));
const subtypeKeySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/));

const authoringPoolEntrySchema = z
  .object({
    characterId: z.string().uuid(),
    displayOrder: z.number().int().min(1).max(15),
    isStrawHat: z.boolean(),
    visibleTags: z.array(tagSchema).max(5).default([]),
  })
  .strict();

const authoringJobSchema = z
  .object({
    role: z.enum(DAILY_CREW_ROLES),
    subtypeKey: subtypeKeySchema,
    subtypeLabel: optionalTrimmedString(120),
    displayLabel: trimmedString(120),
    displayOrder: z.number().int().min(1).max(5),
    maxPoints: z.number().int().min(1).max(30),
  })
  .strict();

const authoringScoreSchema = z
  .object({
    characterId: z.string().uuid(),
    role: z.enum(DAILY_CREW_ROLES),
    score: z.number().int().min(0).max(30),
    explanation: trimmedString(500),
  })
  .strict();

const authoringPerfectSolutionSchema = z
  .object({
    role: z.enum(DAILY_CREW_ROLES),
    characterId: z.string().uuid(),
  })
  .strict();

const missionAuthoringInput = z
  .object({
    missionId: z.string().uuid().nullable().optional(),
    missionDate: missionDateSchema,
    slug: slugSchema,
    title: trimmedString(120),
    brief: trimmedString(2000),
    missionTags: z.array(tagSchema).max(8).default([]),
    revealPolicy: z.enum(DAILY_CREW_REVEAL_POLICIES),
    revealAt: z.string().datetime({ offset: true }).nullable(),
    pool: z
      .array(authoringPoolEntrySchema)
      .refine((pool) => pool.length === 9 || pool.length === 15, {
        message: "Daily Crew Builder missions require 9 or 15 pool characters.",
      }),
    jobs: z.array(authoringJobSchema).refine((jobs) => jobs.length === 3 || jobs.length === 5, {
      message: "Daily Crew Builder missions require 3 or 5 jobs.",
    }),
    scores: z.array(authoringScoreSchema),
    perfectSolution: z.array(authoringPerfectSolutionSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const supportedFormat =
      (value.pool.length === 9 && value.jobs.length === 3) ||
      (value.pool.length === 15 && value.jobs.length === 5);

    if (!supportedFormat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Daily Crew Builder missions must use either 9 pool characters with 3 jobs or 15 pool characters with 5 jobs.",
        path: ["jobs"],
      });
    }

    if (value.scores.length !== value.pool.length * value.jobs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Daily Crew Builder scores must cover every pool character and job.",
        path: ["scores"],
      });
    }

    if (value.perfectSolution.length !== value.jobs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Daily Crew Builder perfect solution must include one entry per job.",
        path: ["perfectSolution"],
      });
    }
  });

const missionIdInput = z.object({ missionId: z.string().uuid() }).strict();
const statusInput = z
  .object({
    missionId: z.string().uuid(),
    targetStatus: z.enum(DAILY_CREW_MISSION_STATUSES),
  })
  .strict();

const authoringRpcResultSchema = z
  .object({
    missionId: z.string().uuid(),
    missionDate: z.string(),
    slug: z.string(),
    status: z.enum(DAILY_CREW_MISSION_STATUSES),
    poolCount: z.number().int().nonnegative(),
    jobCount: z.number().int().nonnegative(),
    scoreCount: z.number().int().nonnegative(),
    submissionCount: z.number().int().nonnegative().optional(),
    ready: z.boolean(),
  })
  .strict();

const missionRowSchema = z
  .object({
    id: z.string().uuid(),
    mission_date: z.string(),
    slug: z.string(),
    title: z.string(),
    brief: z.string(),
    mission_tags: z.array(z.string()),
    status: z.enum(DAILY_CREW_MISSION_STATUSES),
    reveal_policy: z.enum(DAILY_CREW_REVEAL_POLICIES),
    reveal_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

const poolRowSchema = z
  .object({
    character_id: z.string().uuid(),
    display_order: z.number().int(),
    is_straw_hat: z.boolean(),
    visible_tags: z.array(z.string()),
  })
  .strict();

const jobRowSchema = z
  .object({
    role: z.enum(DAILY_CREW_ROLES),
    subtype_key: z.string(),
    subtype_label: z.string().nullable(),
    display_label: z.string(),
    display_order: z.number().int(),
    max_points: z.number().int(),
  })
  .strict();

const scoreRowSchema = z
  .object({
    character_id: z.string().uuid(),
    role: z.enum(DAILY_CREW_ROLES),
    score: z.number().int(),
    explanation: z.string(),
  })
  .strict();

const perfectSolutionRowSchema = z
  .object({
    role: z.enum(DAILY_CREW_ROLES),
    character_id: z.string().uuid(),
  })
  .strict();

type DailyCrewAdminDb = SupabaseClient<Database>;
type MissionAuthoringInput = z.infer<typeof missionAuthoringInput>;
type DailyCrewMissionStatus = Database["public"]["Enums"]["daily_crew_mission_status"];

export type AdminDailyCrewMissionSummary = {
  id: string;
  missionDate: string;
  slug: string;
  title: string;
  status: DailyCrewMissionStatus;
  revealPolicy: Database["public"]["Enums"]["daily_crew_reveal_policy"];
  revealAt: string | null;
  poolCount: number;
  jobCount: number;
  scoreCount: number;
  submissionCount: number;
  ready: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminDailyCrewMissionDetail = AdminDailyCrewMissionSummary & {
  brief: string;
  missionTags: string[];
  pool: z.infer<typeof authoringPoolEntrySchema>[];
  jobs: z.infer<typeof authoringJobSchema>[];
  scores: z.infer<typeof authoringScoreSchema>[];
  perfectSolution: z.infer<typeof authoringPerfectSolutionSchema>[];
};

async function admin(): Promise<DailyCrewAdminDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireAdminRole(db: DailyCrewAdminDb, userId: string): Promise<void> {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function authorizedAdmin(context: { supabase: DailyCrewAdminDb; userId: string }) {
  await requireAdminRole(context.supabase, context.userId);
  return admin();
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function mapAdminDailyCrewError(error: unknown): Error {
  const message =
    error instanceof Error ? error.message : "Daily Crew Builder admin request failed.";

  if (message.includes("admin role required")) {
    return new Error("Administrator authorization required.");
  }

  if (message.includes("already exists")) {
    return new Error(message);
  }

  if (
    message.includes("Daily Crew Builder") ||
    message.includes("violates check constraint") ||
    message.includes("violates foreign key constraint") ||
    message.includes("duplicate key value")
  ) {
    return new Error(message);
  }

  return new Error("Daily Crew Builder admin request failed.");
}

function countByMission(rows: { mission_id: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.mission_id, (counts.get(row.mission_id) ?? 0) + 1);
  }
  return counts;
}

async function getMissionReadyMap(db: DailyCrewAdminDb, missionIds: string[]) {
  const ready = new Map<string, boolean>();
  await Promise.all(
    missionIds.map(async (missionId) => {
      const { data, error } = await db.rpc("validate_daily_crew_mission", {
        _mission_id: missionId,
      });
      if (error) throw error;
      ready.set(missionId, Boolean(data));
    }),
  );
  return ready;
}

async function listRowsByMission(db: DailyCrewAdminDb, missionIds: string[]) {
  if (missionIds.length === 0) {
    return {
      poolRows: [],
      jobRows: [],
      scoreRows: [],
      submissionRows: [],
    };
  }

  const [poolResult, jobResult, scoreResult, submissionResult] = await Promise.all([
    db.from("daily_crew_mission_pool").select("mission_id").in("mission_id", missionIds),
    db.from("daily_crew_role_requirements").select("mission_id").in("mission_id", missionIds),
    db.from("daily_crew_character_role_scores").select("mission_id").in("mission_id", missionIds),
    db.from("daily_crew_submissions").select("mission_id").in("mission_id", missionIds),
  ]);

  if (poolResult.error) throw poolResult.error;
  if (jobResult.error) throw jobResult.error;
  if (scoreResult.error) throw scoreResult.error;
  if (submissionResult.error) throw submissionResult.error;

  return {
    poolRows: (poolResult.data ?? []) as { mission_id: string }[],
    jobRows: (jobResult.data ?? []) as { mission_id: string }[],
    scoreRows: (scoreResult.data ?? []) as { mission_id: string }[],
    submissionRows: (submissionResult.data ?? []) as { mission_id: string }[],
  };
}

function mapMissionSummary(args: {
  mission: z.infer<typeof missionRowSchema>;
  poolCounts: Map<string, number>;
  jobCounts: Map<string, number>;
  scoreCounts: Map<string, number>;
  submissionCounts: Map<string, number>;
  ready: Map<string, boolean>;
}): AdminDailyCrewMissionSummary {
  const { mission, poolCounts, jobCounts, scoreCounts, submissionCounts, ready } = args;
  return {
    id: mission.id,
    missionDate: mission.mission_date,
    slug: mission.slug,
    title: mission.title,
    status: mission.status,
    revealPolicy: mission.reveal_policy,
    revealAt: mission.reveal_at,
    poolCount: poolCounts.get(mission.id) ?? 0,
    jobCount: jobCounts.get(mission.id) ?? 0,
    scoreCount: scoreCounts.get(mission.id) ?? 0,
    submissionCount: submissionCounts.get(mission.id) ?? 0,
    ready: ready.get(mission.id) ?? false,
    createdAt: mission.created_at,
    updatedAt: mission.updated_at,
  };
}

export const listAdminDailyCrewMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDailyCrewMissionSummary[]> => {
    try {
      const db = await authorizedAdmin(context);
      const { data, error } = await db
        .from("daily_crew_missions")
        .select(
          "id,mission_date,slug,title,brief,mission_tags,status,reveal_policy,reveal_at,created_at,updated_at",
        )
        .order("mission_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const missions = missionRowSchema.array().parse(data ?? []);
      const missionIds = missions.map((mission) => mission.id);
      const [rows, ready] = await Promise.all([
        listRowsByMission(db, missionIds),
        getMissionReadyMap(db, missionIds),
      ]);
      const poolCounts = countByMission(rows.poolRows);
      const jobCounts = countByMission(rows.jobRows);
      const scoreCounts = countByMission(rows.scoreRows);
      const submissionCounts = countByMission(rows.submissionRows);

      return missions.map((mission) =>
        mapMissionSummary({
          mission,
          poolCounts,
          jobCounts,
          scoreCounts,
          submissionCounts,
          ready,
        }),
      );
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const getAdminDailyCrewMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => missionIdInput.parse(input))
  .handler(async ({ data, context }): Promise<AdminDailyCrewMissionDetail> => {
    try {
      const db = await authorizedAdmin(context);
      const { data: missionData, error: missionError } = await db
        .from("daily_crew_missions")
        .select(
          "id,mission_date,slug,title,brief,mission_tags,status,reveal_policy,reveal_at,created_at,updated_at",
        )
        .eq("id", data.missionId)
        .maybeSingle();
      if (missionError) throw missionError;
      if (!missionData) throw new Error("Daily Crew Builder mission not found");

      const [poolResult, jobsResult, scoresResult, solutionResult, submissionsResult, readyResult] =
        await Promise.all([
          db
            .from("daily_crew_mission_pool")
            .select("character_id,display_order,is_straw_hat,visible_tags")
            .eq("mission_id", data.missionId)
            .order("display_order", { ascending: true }),
          db
            .from("daily_crew_role_requirements")
            .select("role,subtype_key,subtype_label,display_label,display_order,max_points")
            .eq("mission_id", data.missionId)
            .order("display_order", { ascending: true }),
          db
            .from("daily_crew_character_role_scores")
            .select("character_id,role,score,explanation")
            .eq("mission_id", data.missionId)
            .order("role", { ascending: true })
            .order("character_id", { ascending: true }),
          db
            .from("daily_crew_perfect_solution")
            .select("role,character_id")
            .eq("mission_id", data.missionId)
            .order("role", { ascending: true }),
          db
            .from("daily_crew_submissions")
            .select("id", { count: "exact", head: true })
            .eq("mission_id", data.missionId),
          db.rpc("validate_daily_crew_mission", { _mission_id: data.missionId }),
        ]);

      if (poolResult.error) throw poolResult.error;
      if (jobsResult.error) throw jobsResult.error;
      if (scoresResult.error) throw scoresResult.error;
      if (solutionResult.error) throw solutionResult.error;
      if (submissionsResult.error) throw submissionsResult.error;
      if (readyResult.error) throw readyResult.error;

      const mission = missionRowSchema.parse(missionData);
      const pool = poolRowSchema.array().parse(poolResult.data ?? []);
      const jobs = jobRowSchema.array().parse(jobsResult.data ?? []);
      const scores = scoreRowSchema.array().parse(scoresResult.data ?? []);
      const perfectSolution = perfectSolutionRowSchema.array().parse(solutionResult.data ?? []);
      const submissionCount = submissionsResult.count ?? 0;

      return {
        id: mission.id,
        missionDate: mission.mission_date,
        slug: mission.slug,
        title: mission.title,
        brief: mission.brief,
        missionTags: mission.mission_tags,
        status: mission.status,
        revealPolicy: mission.reveal_policy,
        revealAt: mission.reveal_at,
        poolCount: pool.length,
        jobCount: jobs.length,
        scoreCount: scores.length,
        submissionCount,
        ready: Boolean(readyResult.data),
        createdAt: mission.created_at,
        updatedAt: mission.updated_at,
        pool: pool.map((row) => ({
          characterId: row.character_id,
          displayOrder: row.display_order,
          isStrawHat: row.is_straw_hat,
          visibleTags: row.visible_tags,
        })),
        jobs: jobs.map((row) => ({
          role: row.role,
          subtypeKey: row.subtype_key,
          subtypeLabel: row.subtype_label,
          displayLabel: row.display_label,
          displayOrder: row.display_order,
          maxPoints: row.max_points,
        })),
        scores: scores.map((row) => ({
          characterId: row.character_id,
          role: row.role,
          score: row.score,
          explanation: row.explanation,
        })),
        perfectSolution: perfectSolution.map((row) => ({
          role: row.role,
          characterId: row.character_id,
        })),
      };
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const saveAdminDailyCrewMissionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => missionAuthoringInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const db = await authorizedAdmin(context);
      const { data: result, error } = await db.rpc("admin_save_daily_crew_builder_mission", {
        _mission_id: data.missionId ?? null,
        _mission_date: data.missionDate,
        _slug: data.slug,
        _title: data.title,
        _brief: data.brief,
        _mission_tags: data.missionTags,
        _reveal_policy: data.revealPolicy,
        _reveal_at: data.revealAt,
        _pool: toJson(data.pool),
        _jobs: toJson(data.jobs),
        _scores: toJson(data.scores),
        _perfect_solution: toJson(data.perfectSolution),
      });
      if (error) throw error;
      return authoringRpcResultSchema.parse(result);
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const setAdminDailyCrewMissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => statusInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const db = await authorizedAdmin(context);
      const { data: result, error } = await db.rpc("admin_set_daily_crew_builder_mission_status", {
        _mission_id: data.missionId,
        _target_status: data.targetStatus,
      });
      if (error) throw error;
      return authoringRpcResultSchema.parse(result);
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });
