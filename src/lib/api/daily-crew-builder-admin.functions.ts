import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";

const DAILY_CREW_ROLES = ["captain", "fighter", "navigator", "strategist", "support"] as const;
const DAILY_CREW_REVEAL_POLICIES = ["immediate", "next_day", "manual"] as const;
const DAILY_CREW_MISSION_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
const DAILY_CREW_ROTATION_TARGET_STATUSES = ["draft", "scheduled"] as const;
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
const templateSlugSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,67}[a-z0-9])?$/));
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

const templateAuthoringInput = z
  .object({
    templateId: z.string().uuid().nullable().optional(),
    slug: templateSlugSchema,
    title: trimmedString(120),
    brief: trimmedString(2000),
    missionTags: z.array(tagSchema).max(8).default([]),
    revealPolicy: z.enum(DAILY_CREW_REVEAL_POLICIES),
    isActive: z.boolean(),
    pool: z
      .array(authoringPoolEntrySchema)
      .refine((pool) => pool.length === 9 || pool.length === 15, {
        message: "Daily Crew Builder templates require 9 or 15 pool characters.",
      }),
    jobs: z.array(authoringJobSchema).refine((jobs) => jobs.length === 3 || jobs.length === 5, {
      message: "Daily Crew Builder templates require 3 or 5 jobs.",
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
          "Daily Crew Builder templates must use either 9 pool characters with 3 jobs or 15 pool characters with 5 jobs.",
        path: ["jobs"],
      });
    }

    if (value.scores.length !== value.pool.length * value.jobs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Daily Crew Builder template scores must cover every pool character and job.",
        path: ["scores"],
      });
    }

    if (value.perfectSolution.length !== value.jobs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Daily Crew Builder template perfect solution must include one entry per job.",
        path: ["perfectSolution"],
      });
    }
  });

const missionIdInput = z.object({ missionId: z.string().uuid() }).strict();
const templateIdInput = z.object({ templateId: z.string().uuid() }).strict();
const statusInput = z
  .object({
    missionId: z.string().uuid(),
    targetStatus: z.enum(DAILY_CREW_MISSION_STATUSES),
  })
  .strict();
const createMissionFromTemplateInput = z
  .object({
    templateId: z.string().uuid(),
    missionDate: missionDateSchema,
  })
  .strict();
const rotationPlanIdInput = z.object({ planId: z.string().uuid() }).strict();
const rotationSlotInput = z
  .object({
    slotNumber: z.number().int().min(1).max(30),
    templateId: z.string().uuid(),
  })
  .strict();
const rotationPlanSaveInput = z
  .object({
    planId: z.string().uuid().nullable().optional(),
    name: trimmedString(120),
    slots: z.array(rotationSlotInput).max(30).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seenSlots = new Set<number>();
    for (let index = 0; index < value.slots.length; index += 1) {
      const slot = value.slots[index];
      if (seenSlots.has(slot.slotNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Daily Crew Builder rotation slots cannot repeat slot numbers.",
          path: ["slots", index, "slotNumber"],
        });
      }
      seenSlots.add(slot.slotNumber);
    }
  });
const rotationRunInput = z
  .object({
    planId: z.string().uuid(),
    startDate: missionDateSchema,
    targetStatus: z.enum(DAILY_CREW_ROTATION_TARGET_STATUSES),
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

const templateRpcResultSchema = z
  .object({
    templateId: z.string().uuid(),
    slug: z.string(),
    revision: z.number().int().positive(),
    isActive: z.boolean(),
    poolCount: z.number().int().nonnegative(),
    jobCount: z.number().int().nonnegative(),
    scoreCount: z.number().int().nonnegative(),
    instanceCount: z.number().int().nonnegative(),
    ready: z.boolean(),
  })
  .strict();

const templateInstanceRpcResultSchema = z
  .object({
    missionId: z.string().uuid(),
    missionDate: z.string(),
    slug: z.string(),
    status: z.enum(DAILY_CREW_MISSION_STATUSES),
    sourceTemplateId: z.string().uuid(),
    sourceTemplateRevision: z.number().int().positive(),
    poolCount: z.number().int().nonnegative(),
    jobCount: z.number().int().nonnegative(),
    scoreCount: z.number().int().nonnegative(),
    submissionCount: z.number().int().nonnegative(),
    ready: z.boolean(),
  })
  .strict();

const rotationPlanSaveRpcResultSchema = z
  .object({
    planId: z.string().uuid(),
    name: z.string(),
    revision: z.number().int().positive(),
    slotCount: z.number().int().min(0).max(30),
    uniqueTemplateCount: z.number().int().min(0).max(30),
    ready: z.boolean(),
  })
  .strict();

const rotationPreviewSlotSchema = z
  .object({
    slotNumber: z.number().int().min(1).max(30),
    missionDate: z.string(),
    templateId: z.string().uuid().nullable(),
    templateTitle: z.string().nullable(),
    templateSlug: z.string().nullable(),
    templateRevision: z.number().int().positive().nullable(),
    templateActive: z.boolean().nullable(),
    templateReady: z.boolean(),
    generatedSlug: z.string().nullable(),
    dateConflict: z.boolean(),
    slugConflict: z.boolean(),
    blockingReasons: z.array(z.string()),
  })
  .strict();

const rotationPreviewRpcResultSchema = z
  .object({
    planId: z.string().uuid(),
    planName: z.string(),
    planRevision: z.number().int().positive(),
    startDate: z.string(),
    endDate: z.string(),
    targetStatus: z.enum(DAILY_CREW_ROTATION_TARGET_STATUSES),
    slotCount: z.number().int().min(0).max(30),
    uniqueTemplateCount: z.number().int().min(0).max(30),
    planReady: z.boolean(),
    conflictCount: z.number().int().nonnegative(),
    readyToGenerate: z.boolean(),
    slots: z.array(rotationPreviewSlotSchema).length(30),
  })
  .strict();

const generatedRotationMissionSchema = z
  .object({
    slotNumber: z.number().int().min(1).max(30),
    missionId: z.string().uuid(),
    missionDate: z.string(),
    slug: z.string(),
    status: z.enum(DAILY_CREW_ROTATION_TARGET_STATUSES),
    sourceTemplateId: z.string().uuid(),
    sourceTemplateRevision: z.number().int().positive(),
    sourceRotationPlanId: z.string().uuid(),
    sourceRotationPlanRevision: z.number().int().positive(),
  })
  .strict();

const rotationGenerateRpcResultSchema = z
  .object({
    planId: z.string().uuid(),
    planName: z.string(),
    planRevision: z.number().int().positive(),
    startDate: z.string(),
    endDate: z.string(),
    targetStatus: z.enum(DAILY_CREW_ROTATION_TARGET_STATUSES),
    createdCount: z.literal(30),
    missions: z.array(generatedRotationMissionSchema).length(30),
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

const templateRowSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    brief: z.string(),
    mission_tags: z.array(z.string()),
    reveal_policy: z.enum(DAILY_CREW_REVEAL_POLICIES),
    is_active: z.boolean(),
    revision: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

const rotationPlanRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    revision: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

const rotationSlotSummaryRowSchema = z
  .object({
    plan_id: z.string().uuid(),
    slot_number: z.number().int(),
    template_id: z.string().uuid(),
  })
  .strict();

const templateBasicRowSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    is_active: z.boolean(),
    revision: z.number().int(),
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
type DailyCrewMissionStatus = Database["public"]["Enums"]["daily_crew_mission_status"];
type DailyCrewRevealPolicy = Database["public"]["Enums"]["daily_crew_reveal_policy"];

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

export type AdminDailyCrewTemplateSummary = {
  id: string;
  slug: string;
  title: string;
  isActive: boolean;
  revision: number;
  revealPolicy: DailyCrewRevealPolicy;
  poolCount: number;
  jobCount: number;
  scoreCount: number;
  instanceCount: number;
  mostRecentMissionDate: string | null;
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

export type AdminDailyCrewTemplateDetail = AdminDailyCrewTemplateSummary & {
  brief: string;
  missionTags: string[];
  pool: z.infer<typeof authoringPoolEntrySchema>[];
  jobs: z.infer<typeof authoringJobSchema>[];
  scores: z.infer<typeof authoringScoreSchema>[];
  perfectSolution: z.infer<typeof authoringPerfectSolutionSchema>[];
};

export type AdminDailyCrewRotationPlanSummary = {
  id: string;
  name: string;
  revision: number;
  slotCount: number;
  uniqueTemplateCount: number;
  ready: boolean;
  generatedMissionCount: number;
  mostRecentGeneratedMissionDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminDailyCrewRotationPlanSlotDetail = {
  slotNumber: number;
  templateId: string;
  templateTitle: string;
  templateSlug: string;
  templateRevision: number;
  templateActive: boolean;
  templateReady: boolean;
  poolCount: number;
  jobCount: number;
  scoreCount: number;
};

export type AdminDailyCrewRotationPlanDetail = AdminDailyCrewRotationPlanSummary & {
  slots: AdminDailyCrewRotationPlanSlotDetail[];
};

export type AdminDailyCrewRotationPreviewSlot = z.infer<typeof rotationPreviewSlotSchema>;
export type AdminDailyCrewRotationPreviewResult = z.infer<typeof rotationPreviewRpcResultSchema>;
export type AdminDailyCrewGeneratedMission = z.infer<typeof generatedRotationMissionSchema>;
export type AdminDailyCrewRotationGenerationResult = z.infer<
  typeof rotationGenerateRpcResultSchema
>;

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

function countByTemplate(rows: { template_id: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1);
  }
  return counts;
}

function countByRotationPlan(rows: { plan_id: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.plan_id, (counts.get(row.plan_id) ?? 0) + 1);
  }
  return counts;
}

function summarizeTemplateInstances(rows: { source_template_id: string; mission_date: string }[]) {
  const counts = new Map<string, number>();
  const mostRecentMissionDates = new Map<string, string>();

  for (const row of rows) {
    counts.set(row.source_template_id, (counts.get(row.source_template_id) ?? 0) + 1);
    const current = mostRecentMissionDates.get(row.source_template_id);
    if (!current || row.mission_date > current) {
      mostRecentMissionDates.set(row.source_template_id, row.mission_date);
    }
  }

  return { counts, mostRecentMissionDates };
}

function summarizeRotationInstances(
  rows: {
    source_rotation_plan_id: string;
    mission_date: string;
  }[],
) {
  const counts = new Map<string, number>();
  const mostRecentMissionDates = new Map<string, string>();

  for (const row of rows) {
    counts.set(row.source_rotation_plan_id, (counts.get(row.source_rotation_plan_id) ?? 0) + 1);
    const current = mostRecentMissionDates.get(row.source_rotation_plan_id);
    if (!current || row.mission_date > current) {
      mostRecentMissionDates.set(row.source_rotation_plan_id, row.mission_date);
    }
  }

  return { counts, mostRecentMissionDates };
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

async function getTemplateReadyMap(db: DailyCrewAdminDb, templateIds: string[]) {
  const ready = new Map<string, boolean>();
  await Promise.all(
    templateIds.map(async (templateId) => {
      const { data, error } = await db.rpc("validate_daily_crew_template", {
        _template_id: templateId,
      });
      if (error) throw error;
      ready.set(templateId, Boolean(data));
    }),
  );
  return ready;
}

async function getRotationPlanReadyMap(db: DailyCrewAdminDb, planIds: string[]) {
  const ready = new Map<string, boolean>();
  await Promise.all(
    planIds.map(async (planId) => {
      const { data, error } = await db.rpc("validate_daily_crew_rotation_plan", {
        _plan_id: planId,
      });
      if (error) throw error;
      ready.set(planId, Boolean(data));
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

async function listTemplateBasics(db: DailyCrewAdminDb, templateIds: string[]) {
  if (templateIds.length === 0) {
    return new Map<string, z.infer<typeof templateBasicRowSchema>>();
  }

  const { data, error } = await db
    .from("daily_crew_mission_templates")
    .select("id,slug,title,is_active,revision")
    .in("id", templateIds);
  if (error) throw error;

  const templates = templateBasicRowSchema.array().parse(data ?? []);
  return new Map(templates.map((template) => [template.id, template]));
}

async function listRowsByTemplate(db: DailyCrewAdminDb, templateIds: string[]) {
  if (templateIds.length === 0) {
    return {
      poolRows: [],
      jobRows: [],
      scoreRows: [],
      instanceRows: [],
    };
  }

  const [poolResult, jobResult, scoreResult, instanceResult] = await Promise.all([
    db
      .from("daily_crew_mission_template_pool")
      .select("template_id")
      .in("template_id", templateIds),
    db
      .from("daily_crew_mission_template_role_requirements")
      .select("template_id")
      .in("template_id", templateIds),
    db
      .from("daily_crew_mission_template_character_role_scores")
      .select("template_id")
      .in("template_id", templateIds),
    db
      .from("daily_crew_missions")
      .select("source_template_id,mission_date")
      .in("source_template_id", templateIds),
  ]);

  if (poolResult.error) throw poolResult.error;
  if (jobResult.error) throw jobResult.error;
  if (scoreResult.error) throw scoreResult.error;
  if (instanceResult.error) throw instanceResult.error;

  const instanceRows = (
    (instanceResult.data ?? []) as { source_template_id: string | null; mission_date: string }[]
  ).filter(
    (row): row is { source_template_id: string; mission_date: string } =>
      row.source_template_id !== null,
  );

  return {
    poolRows: (poolResult.data ?? []) as { template_id: string }[],
    jobRows: (jobResult.data ?? []) as { template_id: string }[],
    scoreRows: (scoreResult.data ?? []) as { template_id: string }[],
    instanceRows,
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

function mapTemplateSummary(args: {
  template: z.infer<typeof templateRowSchema>;
  poolCounts: Map<string, number>;
  jobCounts: Map<string, number>;
  scoreCounts: Map<string, number>;
  instanceCounts: Map<string, number>;
  mostRecentMissionDates: Map<string, string>;
  ready: Map<string, boolean>;
}): AdminDailyCrewTemplateSummary {
  const {
    template,
    poolCounts,
    jobCounts,
    scoreCounts,
    instanceCounts,
    mostRecentMissionDates,
    ready,
  } = args;
  return {
    id: template.id,
    slug: template.slug,
    title: template.title,
    isActive: template.is_active,
    revision: template.revision,
    revealPolicy: template.reveal_policy,
    poolCount: poolCounts.get(template.id) ?? 0,
    jobCount: jobCounts.get(template.id) ?? 0,
    scoreCount: scoreCounts.get(template.id) ?? 0,
    instanceCount: instanceCounts.get(template.id) ?? 0,
    mostRecentMissionDate: mostRecentMissionDates.get(template.id) ?? null,
    ready: ready.get(template.id) ?? false,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

function mapRotationPlanSummary(args: {
  plan: z.infer<typeof rotationPlanRowSchema>;
  slotCounts: Map<string, number>;
  uniqueTemplateCounts: Map<string, number>;
  generatedMissionCounts: Map<string, number>;
  mostRecentGeneratedMissionDates: Map<string, string>;
  ready: Map<string, boolean>;
}): AdminDailyCrewRotationPlanSummary {
  const {
    plan,
    slotCounts,
    uniqueTemplateCounts,
    generatedMissionCounts,
    mostRecentGeneratedMissionDates,
    ready,
  } = args;
  return {
    id: plan.id,
    name: plan.name,
    revision: plan.revision,
    slotCount: slotCounts.get(plan.id) ?? 0,
    uniqueTemplateCount: uniqueTemplateCounts.get(plan.id) ?? 0,
    ready: ready.get(plan.id) ?? false,
    generatedMissionCount: generatedMissionCounts.get(plan.id) ?? 0,
    mostRecentGeneratedMissionDate: mostRecentGeneratedMissionDates.get(plan.id) ?? null,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
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

export const listAdminDailyCrewTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDailyCrewTemplateSummary[]> => {
    try {
      const db = await authorizedAdmin(context);
      const { data, error } = await db
        .from("daily_crew_mission_templates")
        .select(
          "id,slug,title,brief,mission_tags,reveal_policy,is_active,revision,created_at,updated_at",
        )
        .order("updated_at", { ascending: false })
        .order("slug", { ascending: true });
      if (error) throw error;

      const templates = templateRowSchema.array().parse(data ?? []);
      const templateIds = templates.map((template) => template.id);
      const [rows, ready] = await Promise.all([
        listRowsByTemplate(db, templateIds),
        getTemplateReadyMap(db, templateIds),
      ]);
      const poolCounts = countByTemplate(rows.poolRows);
      const jobCounts = countByTemplate(rows.jobRows);
      const scoreCounts = countByTemplate(rows.scoreRows);
      const { counts: instanceCounts, mostRecentMissionDates } = summarizeTemplateInstances(
        rows.instanceRows,
      );

      return templates.map((template) =>
        mapTemplateSummary({
          template,
          poolCounts,
          jobCounts,
          scoreCounts,
          instanceCounts,
          mostRecentMissionDates,
          ready,
        }),
      );
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const getAdminDailyCrewTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => templateIdInput.parse(input))
  .handler(async ({ data, context }): Promise<AdminDailyCrewTemplateDetail> => {
    try {
      const db = await authorizedAdmin(context);
      const { data: templateData, error: templateError } = await db
        .from("daily_crew_mission_templates")
        .select(
          "id,slug,title,brief,mission_tags,reveal_policy,is_active,revision,created_at,updated_at",
        )
        .eq("id", data.templateId)
        .maybeSingle();
      if (templateError) throw templateError;
      if (!templateData) throw new Error("Daily Crew Builder template not found");

      const [poolResult, jobsResult, scoresResult, solutionResult, instancesResult, readyResult] =
        await Promise.all([
          db
            .from("daily_crew_mission_template_pool")
            .select("character_id,display_order,is_straw_hat,visible_tags")
            .eq("template_id", data.templateId)
            .order("display_order", { ascending: true }),
          db
            .from("daily_crew_mission_template_role_requirements")
            .select("role,subtype_key,subtype_label,display_label,display_order,max_points")
            .eq("template_id", data.templateId)
            .order("display_order", { ascending: true }),
          db
            .from("daily_crew_mission_template_character_role_scores")
            .select("character_id,role,score,explanation")
            .eq("template_id", data.templateId)
            .order("role", { ascending: true })
            .order("character_id", { ascending: true }),
          db
            .from("daily_crew_mission_template_perfect_solution")
            .select("role,character_id")
            .eq("template_id", data.templateId)
            .order("role", { ascending: true }),
          db
            .from("daily_crew_missions")
            .select("source_template_id,mission_date")
            .eq("source_template_id", data.templateId),
          db.rpc("validate_daily_crew_template", { _template_id: data.templateId }),
        ]);

      if (poolResult.error) throw poolResult.error;
      if (jobsResult.error) throw jobsResult.error;
      if (scoresResult.error) throw scoresResult.error;
      if (solutionResult.error) throw solutionResult.error;
      if (instancesResult.error) throw instancesResult.error;
      if (readyResult.error) throw readyResult.error;

      const template = templateRowSchema.parse(templateData);
      const pool = poolRowSchema.array().parse(poolResult.data ?? []);
      const jobs = jobRowSchema.array().parse(jobsResult.data ?? []);
      const scores = scoreRowSchema.array().parse(scoresResult.data ?? []);
      const perfectSolution = perfectSolutionRowSchema.array().parse(solutionResult.data ?? []);
      const { counts: instanceCounts, mostRecentMissionDates } = summarizeTemplateInstances(
        (
          (instancesResult.data ?? []) as {
            source_template_id: string | null;
            mission_date: string;
          }[]
        ).filter(
          (row): row is { source_template_id: string; mission_date: string } =>
            row.source_template_id !== null,
        ),
      );

      return {
        id: template.id,
        slug: template.slug,
        title: template.title,
        brief: template.brief,
        missionTags: template.mission_tags,
        isActive: template.is_active,
        revision: template.revision,
        revealPolicy: template.reveal_policy,
        poolCount: pool.length,
        jobCount: jobs.length,
        scoreCount: scores.length,
        instanceCount: instanceCounts.get(template.id) ?? 0,
        mostRecentMissionDate: mostRecentMissionDates.get(template.id) ?? null,
        ready: Boolean(readyResult.data),
        createdAt: template.created_at,
        updatedAt: template.updated_at,
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

export const saveAdminDailyCrewTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => templateAuthoringInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const db = await authorizedAdmin(context);
      const { data: result, error } = await db.rpc("admin_save_daily_crew_builder_template", {
        _template_id: data.templateId ?? null,
        _slug: data.slug,
        _title: data.title,
        _brief: data.brief,
        _mission_tags: data.missionTags,
        _reveal_policy: data.revealPolicy,
        _is_active: data.isActive,
        _pool: toJson(data.pool),
        _jobs: toJson(data.jobs),
        _scores: toJson(data.scores),
        _perfect_solution: toJson(data.perfectSolution),
      });
      if (error) throw error;
      return templateRpcResultSchema.parse(result);
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const createAdminDailyCrewMissionFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createMissionFromTemplateInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const db = await authorizedAdmin(context);
      const { data: result, error } = await db.rpc(
        "admin_create_daily_crew_builder_mission_from_template",
        {
          _template_id: data.templateId,
          _mission_date: data.missionDate,
        },
      );
      if (error) throw error;
      return templateInstanceRpcResultSchema.parse(result);
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const listAdminDailyCrewRotationPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDailyCrewRotationPlanSummary[]> => {
    try {
      const db = await authorizedAdmin(context);
      const { data, error } = await db
        .from("daily_crew_rotation_plans")
        .select("id,name,revision,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;

      const plans = rotationPlanRowSchema.array().parse(data ?? []);
      const planIds = plans.map((plan) => plan.id);

      if (planIds.length === 0) {
        return [];
      }

      const [slotResult, missionResult, ready] = await Promise.all([
        db
          .from("daily_crew_rotation_plan_slots")
          .select("plan_id,slot_number,template_id")
          .in("plan_id", planIds),
        db
          .from("daily_crew_missions")
          .select("source_rotation_plan_id,mission_date")
          .in("source_rotation_plan_id", planIds),
        getRotationPlanReadyMap(db, planIds),
      ]);

      if (slotResult.error) throw slotResult.error;
      if (missionResult.error) throw missionResult.error;

      const slotRows = rotationSlotSummaryRowSchema.array().parse(slotResult.data ?? []);
      const missionRows = (
        (missionResult.data ?? []) as {
          source_rotation_plan_id: string | null;
          mission_date: string;
        }[]
      ).filter(
        (row): row is { source_rotation_plan_id: string; mission_date: string } =>
          row.source_rotation_plan_id !== null,
      );
      const slotCounts = countByRotationPlan(slotRows);
      const uniqueTemplateCounts = new Map<string, number>();
      for (const planId of planIds) {
        uniqueTemplateCounts.set(
          planId,
          new Set(
            slotRows.filter((slot) => slot.plan_id === planId).map((slot) => slot.template_id),
          ).size,
        );
      }
      const { counts: generatedMissionCounts, mostRecentMissionDates } =
        summarizeRotationInstances(missionRows);

      return plans.map((plan) =>
        mapRotationPlanSummary({
          plan,
          slotCounts,
          uniqueTemplateCounts,
          generatedMissionCounts,
          mostRecentGeneratedMissionDates: mostRecentMissionDates,
          ready,
        }),
      );
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const getAdminDailyCrewRotationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rotationPlanIdInput.parse(input))
  .handler(async ({ data, context }): Promise<AdminDailyCrewRotationPlanDetail> => {
    try {
      const db = await authorizedAdmin(context);
      const { data: planData, error: planError } = await db
        .from("daily_crew_rotation_plans")
        .select("id,name,revision,created_at,updated_at")
        .eq("id", data.planId)
        .maybeSingle();
      if (planError) throw planError;
      if (!planData) throw new Error("Daily Crew Builder rotation plan not found");

      const plan = rotationPlanRowSchema.parse(planData);
      const [slotResult, missionResult, readyResult] = await Promise.all([
        db
          .from("daily_crew_rotation_plan_slots")
          .select("plan_id,slot_number,template_id")
          .eq("plan_id", data.planId)
          .order("slot_number", { ascending: true }),
        db
          .from("daily_crew_missions")
          .select("source_rotation_plan_id,mission_date")
          .eq("source_rotation_plan_id", data.planId),
        db.rpc("validate_daily_crew_rotation_plan", { _plan_id: data.planId }),
      ]);

      if (slotResult.error) throw slotResult.error;
      if (missionResult.error) throw missionResult.error;
      if (readyResult.error) throw readyResult.error;

      const slotRows = rotationSlotSummaryRowSchema.array().parse(slotResult.data ?? []);
      const templateIds = Array.from(new Set(slotRows.map((slot) => slot.template_id)));
      const [templateBasics, templateRows, templateReady] = await Promise.all([
        listTemplateBasics(db, templateIds),
        listRowsByTemplate(db, templateIds),
        getTemplateReadyMap(db, templateIds),
      ]);
      const poolCounts = countByTemplate(templateRows.poolRows);
      const jobCounts = countByTemplate(templateRows.jobRows);
      const scoreCounts = countByTemplate(templateRows.scoreRows);
      const missionRows = (
        (missionResult.data ?? []) as {
          source_rotation_plan_id: string | null;
          mission_date: string;
        }[]
      ).filter(
        (row): row is { source_rotation_plan_id: string; mission_date: string } =>
          row.source_rotation_plan_id !== null,
      );
      const { counts: generatedMissionCounts, mostRecentMissionDates } =
        summarizeRotationInstances(missionRows);
      const summary = mapRotationPlanSummary({
        plan,
        slotCounts: new Map([[plan.id, slotRows.length]]),
        uniqueTemplateCounts: new Map([[plan.id, templateIds.length]]),
        generatedMissionCounts,
        mostRecentGeneratedMissionDates: mostRecentMissionDates,
        ready: new Map([[plan.id, Boolean(readyResult.data)]]),
      });

      return {
        ...summary,
        slots: slotRows.map((slot) => {
          const template = templateBasics.get(slot.template_id);
          if (!template) {
            throw new Error("Daily Crew Builder rotation plan references an unknown template");
          }

          return {
            slotNumber: slot.slot_number,
            templateId: template.id,
            templateTitle: template.title,
            templateSlug: template.slug,
            templateRevision: template.revision,
            templateActive: template.is_active,
            templateReady: templateReady.get(template.id) ?? false,
            poolCount: poolCounts.get(template.id) ?? 0,
            jobCount: jobCounts.get(template.id) ?? 0,
            scoreCount: scoreCounts.get(template.id) ?? 0,
          };
        }),
      };
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const saveAdminDailyCrewRotationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rotationPlanSaveInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const db = await authorizedAdmin(context);
      const { data: result, error } = await db.rpc("admin_save_daily_crew_rotation_plan", {
        _plan_id: data.planId ?? null,
        _name: data.name,
        _slots: toJson(data.slots),
      });
      if (error) throw error;
      return rotationPlanSaveRpcResultSchema.parse(result);
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const previewAdminDailyCrewRotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rotationRunInput.parse(input))
  .handler(async ({ data, context }): Promise<AdminDailyCrewRotationPreviewResult> => {
    try {
      const db = await authorizedAdmin(context);
      const { data: result, error } = await db.rpc("admin_preview_daily_crew_rotation", {
        _plan_id: data.planId,
        _start_date: data.startDate,
        _target_status: data.targetStatus,
      });
      if (error) throw error;
      return rotationPreviewRpcResultSchema.parse(result);
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });

export const generateAdminDailyCrewRotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rotationRunInput.parse(input))
  .handler(async ({ data, context }): Promise<AdminDailyCrewRotationGenerationResult> => {
    try {
      const db = await authorizedAdmin(context);
      const { data: result, error } = await db.rpc("admin_generate_daily_crew_rotation", {
        _plan_id: data.planId,
        _start_date: data.startDate,
        _target_status: data.targetStatus,
      });
      if (error) throw error;
      return rotationGenerateRpcResultSchema.parse(result);
    } catch (error) {
      throw mapAdminDailyCrewError(error);
    }
  });
