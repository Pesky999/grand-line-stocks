import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  STOCK_TUTORIAL_FINAL_STEP,
  STOCK_TUTORIAL_VERSION,
  completeStockTutorial,
  createSoftOnboardingState,
  dismissPageTip,
  resetPageTips,
  restartStockTutorial,
  saveStockTutorialStep,
  skipAllPageTips,
  skipStockTutorial,
  startStockTutorial,
  type OnboardingProgressState,
  type StockTutorialStatus,
} from "@/lib/onboarding/progress";
import { PAGE_TIP_VERSION } from "@/lib/onboarding/page-tips";

export const ONBOARDING_QUERY_KEY = ["onboarding-progress"] as const;

const onboardingEventNames = [
  "onboarding_offer_seen",
  "stock_tutorial_started",
  "stock_tutorial_step_completed",
  "stock_tutorial_skipped",
  "stock_tutorial_completed",
  "stock_tutorial_replayed",
  "first_live_trade_started",
  "first_live_trade_completed",
  "page_tip_seen",
  "page_tip_completed",
  "page_tips_skipped",
] as const;

const onboardingProgressRowSchema = z
  .object({
    user_id: z.string().uuid(),
    stock_tutorial_version: z.number().int().positive(),
    stock_tutorial_status: z.enum(["not_started", "in_progress", "completed", "skipped"]),
    stock_tutorial_offer: z.enum(["first_login", "soft", "none"]),
    stock_tutorial_last_step: z.number().int().min(0).max(STOCK_TUTORIAL_FINAL_STEP),
    page_tips_disabled: z.boolean(),
    page_tip_versions: z.record(z.string(), z.number().int().positive()),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    skipped_at: z.string().nullable(),
  })
  .strict();

const eventMetadataValueSchema = z.union([
  z.string().max(120),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const recordOnboardingEventInputSchema = z
  .object({
    eventName: z.enum(onboardingEventNames),
    stepKey: z.string().max(80).nullable().optional(),
    pageKey: z.string().max(120).nullable().optional(),
    metadata: z.record(z.string().max(60), eventMetadataValueSchema).optional(),
    dedupeKey: z.string().max(160).nullable().optional(),
  })
  .strict();

const startTutorialInputSchema = z
  .object({
    restart: z.boolean().optional(),
    replay: z.boolean().optional(),
  })
  .strict()
  .optional();

const saveTutorialStepInputSchema = z
  .object({
    step: z.number().int().min(1).max(STOCK_TUTORIAL_FINAL_STEP),
    completedStepKey: z.string().max(80).nullable().optional(),
  })
  .strict();

const completeTutorialInputSchema = z
  .object({
    completedStepKey: z.string().max(80).nullable().optional(),
    replay: z.boolean().optional(),
  })
  .strict()
  .optional();

const dismissPageTipInputSchema = z
  .object({
    tipId: z.string().min(1).max(120),
    version: z.number().int().positive().default(PAGE_TIP_VERSION),
  })
  .strict();

type OnboardingDb = SupabaseClient<Database>;
type OnboardingEventInput = z.infer<typeof recordOnboardingEventInputSchema>;

async function admin(): Promise<OnboardingDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function nowIso() {
  return new Date().toISOString();
}

function toDatabasePatch(state: OnboardingProgressState) {
  return {
    stock_tutorial_version: state.stockTutorialVersion,
    stock_tutorial_status: state.stockTutorialStatus,
    stock_tutorial_offer: state.stockTutorialOffer,
    stock_tutorial_last_step: state.stockTutorialLastStep,
    page_tips_disabled: state.pageTipsDisabled,
    page_tip_versions: state.pageTipVersions as Json,
    started_at: state.startedAt,
    completed_at: state.completedAt,
    skipped_at: state.skippedAt,
  };
}

function normalizeProgressRow(row: unknown): OnboardingProgressState {
  const parsed = onboardingProgressRowSchema.parse(row);
  return {
    stockTutorialVersion: parsed.stock_tutorial_version,
    stockTutorialStatus: parsed.stock_tutorial_status,
    stockTutorialOffer: parsed.stock_tutorial_offer,
    stockTutorialLastStep: parsed.stock_tutorial_last_step,
    pageTipsDisabled: parsed.page_tips_disabled,
    pageTipVersions: parsed.page_tip_versions,
    startedAt: parsed.started_at,
    completedAt: parsed.completed_at,
    skippedAt: parsed.skipped_at,
  };
}

function defaultProgressForNewUser(): OnboardingProgressState {
  return createSoftOnboardingState();
}

function sanitizeEvent(event: OnboardingEventInput) {
  return {
    event_name: event.eventName,
    tutorial_version: STOCK_TUTORIAL_VERSION,
    step_key: event.stepKey ?? null,
    page_key: event.pageKey ?? null,
    metadata: (event.metadata ?? {}) as Json,
    dedupe_key: event.dedupeKey ?? null,
  };
}

function logOnboardingFailure(stage: string, code: string) {
  console.warn("[Onboarding]", { stage, code });
}

async function insertEventBestEffort(
  db: OnboardingDb,
  userId: string,
  event: OnboardingEventInput,
) {
  const { error } = await db.from("user_onboarding_events").insert({
    user_id: userId,
    ...sanitizeEvent(event),
  });

  if (error) {
    if (error.code === "23505") return;
    logOnboardingFailure("event_write", error.code ?? "ONBOARDING_EVENT_WRITE_FAILED");
  }
}

async function readOnboardingProgress(db: OnboardingDb, userId: string) {
  const { data, error } = await db
    .from("user_onboarding_progress")
    .select(
      "user_id,stock_tutorial_version,stock_tutorial_status,stock_tutorial_offer,stock_tutorial_last_step,page_tips_disabled,page_tip_versions,started_at,completed_at,skipped_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeProgressRow(data) : null;
}

async function ensureOnboardingProgress(db: OnboardingDb, userId: string) {
  const existing = await readOnboardingProgress(db, userId);
  if (existing) return existing;

  const next = defaultProgressForNewUser();
  const { data, error } = await db
    .from("user_onboarding_progress")
    .insert({
      user_id: userId,
      ...toDatabasePatch(next),
    })
    .select(
      "user_id,stock_tutorial_version,stock_tutorial_status,stock_tutorial_offer,stock_tutorial_last_step,page_tips_disabled,page_tip_versions,started_at,completed_at,skipped_at",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await readOnboardingProgress(db, userId);
      if (raced) return raced;
    }
    throw error;
  }

  return normalizeProgressRow(data);
}

async function updateOnboardingProgress(
  db: OnboardingDb,
  userId: string,
  next: OnboardingProgressState,
) {
  const { data, error } = await db
    .from("user_onboarding_progress")
    .update(toDatabasePatch(next))
    .eq("user_id", userId)
    .select(
      "user_id,stock_tutorial_version,stock_tutorial_status,stock_tutorial_offer,stock_tutorial_last_step,page_tips_disabled,page_tip_versions,started_at,completed_at,skipped_at",
    )
    .single();

  if (error) throw error;
  return normalizeProgressRow(data);
}

async function mutateProgress(
  userId: string,
  mutate: (current: OnboardingProgressState) => OnboardingProgressState,
) {
  const db = await admin();
  const current = await ensureOnboardingProgress(db, userId);
  return updateOnboardingProgress(db, userId, mutate(current));
}

export async function recordOnboardingEventBestEffort(userId: string, event: OnboardingEventInput) {
  try {
    const parsed = recordOnboardingEventInputSchema.parse(event);
    const db = await admin();
    await insertEventBestEffort(db, userId, parsed);
  } catch (error) {
    logOnboardingFailure(
      "event_best_effort",
      error instanceof Error ? "ONBOARDING_EVENT_BEST_EFFORT_FAILED" : "ONBOARDING_EVENT_UNKNOWN",
    );
  }
}

export const getMyOnboardingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const db = await admin();
      return await ensureOnboardingProgress(db, context.userId);
    } catch (error) {
      logOnboardingFailure(
        "read_progress",
        error instanceof Error ? "ONBOARDING_PROGRESS_READ_FAILED" : "ONBOARDING_PROGRESS_UNKNOWN",
      );
      throw new Error("Could not load onboarding state.");
    }
  });

export const startMyStockTutorial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => startTutorialInputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const input = data ?? {};
    const db = await admin();
    const current = await ensureOnboardingProgress(db, context.userId);

    if (input.replay && current.stockTutorialStatus === "completed") {
      await insertEventBestEffort(db, context.userId, {
        eventName: "stock_tutorial_replayed",
        metadata: { source: "profile" },
      });
      return current;
    }

    const next = input.restart
      ? restartStockTutorial(current, nowIso())
      : startStockTutorial(current, nowIso());
    const updated = await updateOnboardingProgress(db, context.userId, next);
    await insertEventBestEffort(db, context.userId, {
      eventName: input.restart ? "stock_tutorial_replayed" : "stock_tutorial_started",
      dedupeKey: input.restart ? null : `stock_tutorial_started:v${STOCK_TUTORIAL_VERSION}`,
      metadata: { restart: Boolean(input.restart) },
    });
    return updated;
  });

export const saveMyStockTutorialStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveTutorialStepInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const updated = await mutateProgress(context.userId, (current) =>
      saveStockTutorialStep(current, data.step),
    );
    if (data.completedStepKey) {
      await recordOnboardingEventBestEffort(context.userId, {
        eventName: "stock_tutorial_step_completed",
        stepKey: data.completedStepKey,
        dedupeKey: `stock_tutorial_step_completed:${data.completedStepKey}:v${STOCK_TUTORIAL_VERSION}`,
      });
    }
    return updated;
  });

export const completeMyStockTutorial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => completeTutorialInputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const input = data ?? {};
    if (input.replay) {
      await recordOnboardingEventBestEffort(context.userId, {
        eventName: "stock_tutorial_replayed",
        stepKey: input.completedStepKey ?? null,
        metadata: { source: "completion" },
      });
      const db = await admin();
      return ensureOnboardingProgress(db, context.userId);
    }

    const updated = await mutateProgress(context.userId, (current) =>
      completeStockTutorial(current, nowIso()),
    );
    if (input.completedStepKey) {
      await recordOnboardingEventBestEffort(context.userId, {
        eventName: "stock_tutorial_step_completed",
        stepKey: input.completedStepKey,
        dedupeKey: `stock_tutorial_step_completed:${input.completedStepKey}:v${STOCK_TUTORIAL_VERSION}`,
      });
    }
    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "stock_tutorial_completed",
      dedupeKey: `stock_tutorial_completed:v${STOCK_TUTORIAL_VERSION}`,
    });
    return updated;
  });

export const skipMyStockTutorial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const updated = await mutateProgress(context.userId, (current) =>
      skipStockTutorial(current, nowIso()),
    );
    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "stock_tutorial_skipped",
      dedupeKey: `stock_tutorial_skipped:v${STOCK_TUTORIAL_VERSION}`,
    });
    return updated;
  });

export const dismissMyPageTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => dismissPageTipInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const updated = await mutateProgress(context.userId, (current) =>
      dismissPageTip(current, data.tipId, data.version),
    );
    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "page_tip_completed",
      pageKey: data.tipId,
      dedupeKey: `page_tip_completed:${data.tipId}:v${data.version}`,
    });
    return updated;
  });

export const skipMyPageTips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const updated = await mutateProgress(context.userId, skipAllPageTips);
    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "page_tips_skipped",
      dedupeKey: `page_tips_skipped:v${STOCK_TUTORIAL_VERSION}`,
    });
    return updated;
  });

export const resetMyPageTips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => mutateProgress(context.userId, resetPageTips));

export const recordMyOnboardingEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => recordOnboardingEventInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await recordOnboardingEventBestEffort(context.userId, data);
    return { ok: true } as const;
  });

export type OnboardingEventName = (typeof onboardingEventNames)[number];
export type { OnboardingProgressState, StockTutorialStatus };
