import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  STOCK_TUTORIAL_FINAL_STEP,
  STOCK_TUTORIAL_VERSION,
  completeStockTutorial,
  dismissPageTip,
  recoverMissingOnboardingProgressState,
  resetPageTips,
  restartStockTutorial,
  saveStockTutorialStep,
  skipAllPageTips,
  skipStockTutorial,
  startStockTutorial,
  type MissingOnboardingProgressClassification,
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

const emptyMetadataSchema = z.object({}).strict();
const tutorialStartSourceSchema = z.enum(["welcome", "portfolio", "profile", "resume"]);
const tutorialReplaySourceSchema = z.enum(["profile"]);
const tutorialStepKeySchema = z.enum(["step_1", "step_2", "step_3", "step_4", "step_5"]);
const pageTipIdSchema = z.enum([
  "market.overview",
  "portfolio.overview",
  "portfolio.pnl",
  "market_bulletin.overview",
  "ranks.overview",
  "games.overview",
  "legacy.overview",
  "profile.overview",
]);
const pageTipVersionSchema = z.literal(PAGE_TIP_VERSION);
const profileCreatedAtRowSchema = z
  .object({
    created_at: z.string().nullable(),
  })
  .strict();

function tradeEventSchema(eventName: "first_live_trade_started" | "first_live_trade_completed") {
  return z
    .object({
      eventName: z.literal(eventName),
      side: z.enum(["buy", "sell"]),
    })
    .strict();
}

function trustedNoPayloadEventSchema(
  eventName: "stock_tutorial_skipped" | "stock_tutorial_completed" | "page_tips_skipped",
) {
  return z
    .object({
      eventName: z.literal(eventName),
    })
    .strict();
}

const recordOnboardingEventInputSchema = z.discriminatedUnion("eventName", [
  z
    .object({
      eventName: z.literal("onboarding_offer_seen"),
      offer: z.enum(["first_login", "soft"]),
    })
    .strict(),
  z
    .object({
      eventName: z.literal("stock_tutorial_started"),
      restart: z.boolean(),
      source: tutorialStartSourceSchema.optional(),
    })
    .strict(),
  z
    .object({
      eventName: z.literal("stock_tutorial_step_completed"),
      step: tutorialStepKeySchema,
    })
    .strict(),
  z
    .object({
      eventName: z.literal("stock_tutorial_replayed"),
      source: tutorialReplaySourceSchema,
    })
    .strict(),
  z
    .object({
      eventName: z.literal("page_tip_seen"),
      tipId: pageTipIdSchema,
      version: pageTipVersionSchema.default(PAGE_TIP_VERSION),
    })
    .strict(),
  z
    .object({
      eventName: z.literal("page_tip_completed"),
      tipId: pageTipIdSchema,
      version: pageTipVersionSchema.default(PAGE_TIP_VERSION),
    })
    .strict(),
  tradeEventSchema("first_live_trade_started"),
  tradeEventSchema("first_live_trade_completed"),
  trustedNoPayloadEventSchema("stock_tutorial_skipped"),
  trustedNoPayloadEventSchema("stock_tutorial_completed"),
  trustedNoPayloadEventSchema("page_tips_skipped"),
]);

const publicRecordOnboardingEventInputSchema = z.discriminatedUnion("eventName", [
  z
    .object({
      eventName: z.literal("onboarding_offer_seen"),
      offer: z.enum(["first_login", "soft"]),
    })
    .strict(),
  z
    .object({
      eventName: z.literal("page_tip_seen"),
      tipId: pageTipIdSchema,
      version: pageTipVersionSchema.default(PAGE_TIP_VERSION),
    })
    .strict(),
]);

const startTutorialInputSchema = z
  .object({
    restart: z.boolean().optional(),
    replay: z.boolean().optional(),
    source: tutorialStartSourceSchema.optional(),
  })
  .strict()
  .optional();

const saveTutorialStepInputSchema = z
  .object({
    step: z.number().int().min(1).max(STOCK_TUTORIAL_FINAL_STEP),
  })
  .strict();

const completeTutorialInputSchema = z
  .object({
    replay: z.boolean().optional(),
  })
  .strict()
  .optional();

const dismissPageTipInputSchema = z
  .object({
    tipId: pageTipIdSchema,
    version: pageTipVersionSchema.default(PAGE_TIP_VERSION),
  })
  .strict();

type OnboardingDb = SupabaseClient<Database>;
type OnboardingEventInput = z.infer<typeof recordOnboardingEventInputSchema>;
type TutorialStepKey = z.infer<typeof tutorialStepKeySchema>;

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

function completedStepForSavedStep(savedStep: number): TutorialStepKey | null {
  switch (savedStep) {
    case 2:
      return "step_1";
    case 3:
      return "step_2";
    case 4:
      return "step_3";
    case 5:
      return "step_4";
    default:
      return null;
  }
}

function toStoredEvent(event: OnboardingEventInput) {
  const base = {
    event_name: event.eventName,
    tutorial_version: STOCK_TUTORIAL_VERSION,
    step_key: null as string | null,
    page_key: null as string | null,
    metadata: emptyMetadataSchema.parse({}) as Json,
    dedupe_key: null as string | null,
  };

  switch (event.eventName) {
    case "onboarding_offer_seen":
      return {
        ...base,
        metadata: { offer: event.offer } as Json,
        dedupe_key: `onboarding_offer_seen:${event.offer}:v${STOCK_TUTORIAL_VERSION}`,
      };
    case "stock_tutorial_started":
      return {
        ...base,
        metadata: {
          restart: event.restart,
          source: event.source ?? "welcome",
        } as Json,
        dedupe_key: event.restart ? null : `stock_tutorial_started:v${STOCK_TUTORIAL_VERSION}`,
      };
    case "stock_tutorial_step_completed":
      return {
        ...base,
        step_key: event.step,
        dedupe_key: `stock_tutorial_step_completed:${event.step}:v${STOCK_TUTORIAL_VERSION}`,
      };
    case "stock_tutorial_completed":
      return {
        ...base,
        dedupe_key: `stock_tutorial_completed:v${STOCK_TUTORIAL_VERSION}`,
      };
    case "stock_tutorial_skipped":
      return {
        ...base,
        dedupe_key: `stock_tutorial_skipped:v${STOCK_TUTORIAL_VERSION}`,
      };
    case "stock_tutorial_replayed":
      return {
        ...base,
        metadata: { source: event.source } as Json,
      };
    case "first_live_trade_started":
      return {
        ...base,
        metadata: { side: event.side } as Json,
        dedupe_key: "first_live_trade_started",
      };
    case "first_live_trade_completed":
      return {
        ...base,
        metadata: { side: event.side } as Json,
        dedupe_key: "first_live_trade_completed",
      };
    case "page_tip_seen":
      return {
        ...base,
        page_key: event.tipId,
        dedupe_key: `page_tip_seen:${event.tipId}:v${event.version}`,
      };
    case "page_tip_completed":
      return {
        ...base,
        page_key: event.tipId,
        dedupe_key: `page_tip_completed:${event.tipId}:v${event.version}`,
      };
    case "page_tips_skipped":
      return {
        ...base,
        dedupe_key: `page_tips_skipped:v${STOCK_TUTORIAL_VERSION}`,
      };
  }

  const exhaustive: never = event;
  return exhaustive;
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
    ...toStoredEvent(event),
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

async function classifyMissingOnboardingProgress(
  db: OnboardingDb,
  userId: string,
): Promise<MissingOnboardingProgressClassification | null> {
  try {
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("created_at")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      logOnboardingFailure(
        "missing_progress_profile_read",
        profileError.code ?? "ONBOARDING_PROFILE_READ_FAILED",
      );
      return null;
    }

    const parsedProfile = profileCreatedAtRowSchema.safeParse(profile);
    if (!parsedProfile.success || !parsedProfile.data.created_at) return null;

    const { data: transactions, error: transactionsError } = await db
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (transactionsError) {
      logOnboardingFailure(
        "missing_progress_transaction_read",
        transactionsError.code ?? "ONBOARDING_TRANSACTION_READ_FAILED",
      );
      return null;
    }

    return {
      profileCreatedAt: parsedProfile.data.created_at,
      hasTransactions: (transactions ?? []).length > 0,
    };
  } catch {
    logOnboardingFailure(
      "missing_progress_classification",
      "ONBOARDING_PROGRESS_CLASSIFICATION_FAILED",
    );
    return null;
  }
}

async function ensureOnboardingProgress(db: OnboardingDb, userId: string) {
  const existing = await readOnboardingProgress(db, userId);
  if (existing) return existing;

  const next = recoverMissingOnboardingProgressState(
    await classifyMissingOnboardingProgress(db, userId),
  );
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
      await recordOnboardingEventBestEffort(context.userId, {
        eventName: "stock_tutorial_replayed",
        source: "profile",
      });
      return current;
    }

    const next = input.restart
      ? restartStockTutorial(current, nowIso())
      : startStockTutorial(current, nowIso());
    const updated = await updateOnboardingProgress(db, context.userId, next);
    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "stock_tutorial_started",
      restart: Boolean(input.restart),
      source: input.source ?? "welcome",
    });
    return updated;
  });

export const saveMyStockTutorialStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveTutorialStepInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const completedStep = completedStepForSavedStep(data.step);
    const updated = await mutateProgress(context.userId, (current) =>
      saveStockTutorialStep(current, data.step),
    );
    if (completedStep) {
      await recordOnboardingEventBestEffort(context.userId, {
        eventName: "stock_tutorial_step_completed",
        step: completedStep,
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
      const db = await admin();
      return ensureOnboardingProgress(db, context.userId);
    }

    const updated = await mutateProgress(context.userId, (current) =>
      completeStockTutorial(current, nowIso()),
    );
    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "stock_tutorial_step_completed",
      step: "step_5",
    });
    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "stock_tutorial_completed",
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
      tipId: data.tipId,
      version: data.version,
    });
    return updated;
  });

export const skipMyPageTips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const updated = await mutateProgress(context.userId, skipAllPageTips);
    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "page_tips_skipped",
    });
    return updated;
  });

export const resetMyPageTips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => mutateProgress(context.userId, resetPageTips));

export const recordMyOnboardingEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => publicRecordOnboardingEventInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (data.eventName === "onboarding_offer_seen") {
      await recordOnboardingEventBestEffort(context.userId, {
        eventName: "onboarding_offer_seen",
        offer: data.offer,
      });
      return { ok: true } as const;
    }

    await recordOnboardingEventBestEffort(context.userId, {
      eventName: "page_tip_seen",
      tipId: data.tipId,
      version: data.version,
    });
    return { ok: true } as const;
  });

export type OnboardingEventName = (typeof onboardingEventNames)[number];
export type { OnboardingProgressState, StockTutorialStatus };
