import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  STOCK_TUTORIAL_FINAL_STEP,
  createSoftOnboardingState,
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
type OnboardingMutation =
  | "start"
  | "restart"
  | "save_step"
  | "complete"
  | "skip"
  | "dismiss_tip"
  | "skip_tips"
  | "reset_tips";

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

function toRpcEventData(event: OnboardingEventInput): Json {
  switch (event.eventName) {
    case "onboarding_offer_seen":
      return { offer: event.offer };
    case "stock_tutorial_started":
      return {
        restart: event.restart,
        source: event.source ?? "welcome",
      };
    case "stock_tutorial_step_completed":
      return { step: event.step };
    case "stock_tutorial_completed":
    case "stock_tutorial_skipped":
    case "page_tips_skipped":
      return emptyMetadataSchema.parse({});
    case "stock_tutorial_replayed":
      return { source: event.source };
    case "first_live_trade_started":
    case "first_live_trade_completed":
      return { side: event.side };
    case "page_tip_seen":
    case "page_tip_completed":
      return {
        tipId: event.tipId,
        version: event.version,
      };
  }

  const exhaustive: never = event;
  return exhaustive;
}

function logOnboardingFailure(stage: string, code: string) {
  console.warn("[Onboarding]", { stage, code });
}

async function readMyOnboardingProgress(db: OnboardingDb) {
  const { data, error } = await db.rpc("get_my_onboarding_progress");
  if (error) throw error;
  return normalizeProgressRow(data);
}

async function mutateMyOnboardingProgress(
  db: OnboardingDb,
  mutation: OnboardingMutation,
  options: { step?: number; tipId?: string; tipVersion?: number } = {},
) {
  const { data, error } = await db.rpc("mutate_my_onboarding_progress", {
    _mutation: mutation,
    _step: options.step ?? null,
    _tip_id: options.tipId ?? null,
    _tip_version: options.tipVersion ?? null,
  });
  if (error) throw error;
  return normalizeProgressRow(data);
}

export async function recordOnboardingEventBestEffort(
  db: OnboardingDb,
  event: OnboardingEventInput,
) {
  try {
    const parsed = recordOnboardingEventInputSchema.parse(event);
    const { error } = await db.rpc("record_my_onboarding_event", {
      _event_name: parsed.eventName,
      _event_data: toRpcEventData(parsed),
    });
    if (!error) return;
    if (error) {
      logOnboardingFailure("event_write", error.code ?? "ONBOARDING_EVENT_WRITE_FAILED");
    }
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
      return await readMyOnboardingProgress(context.supabase);
    } catch (error) {
      logOnboardingFailure(
        "read_progress",
        error instanceof Error ? "ONBOARDING_PROGRESS_READ_FAILED" : "ONBOARDING_PROGRESS_UNKNOWN",
      );
      return createSoftOnboardingState();
    }
  });

export const startMyStockTutorial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => startTutorialInputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const input = data ?? {};
    const current = await readMyOnboardingProgress(context.supabase);

    if (input.replay && current.stockTutorialStatus === "completed") {
      await recordOnboardingEventBestEffort(context.supabase, {
        eventName: "stock_tutorial_replayed",
        source: "profile",
      });
      return current;
    }

    const updated = await mutateMyOnboardingProgress(
      context.supabase,
      input.restart ? "restart" : "start",
    );
    await recordOnboardingEventBestEffort(context.supabase, {
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
    const updated = await mutateMyOnboardingProgress(context.supabase, "save_step", {
      step: data.step,
    });
    if (completedStep) {
      await recordOnboardingEventBestEffort(context.supabase, {
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
      return readMyOnboardingProgress(context.supabase);
    }

    const updated = await mutateMyOnboardingProgress(context.supabase, "complete");
    await recordOnboardingEventBestEffort(context.supabase, {
      eventName: "stock_tutorial_step_completed",
      step: "step_5",
    });
    await recordOnboardingEventBestEffort(context.supabase, {
      eventName: "stock_tutorial_completed",
    });
    return updated;
  });

export const skipMyStockTutorial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const updated = await mutateMyOnboardingProgress(context.supabase, "skip");
    await recordOnboardingEventBestEffort(context.supabase, {
      eventName: "stock_tutorial_skipped",
    });
    return updated;
  });

export const dismissMyPageTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => dismissPageTipInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const updated = await mutateMyOnboardingProgress(context.supabase, "dismiss_tip", {
      tipId: data.tipId,
      tipVersion: data.version,
    });
    await recordOnboardingEventBestEffort(context.supabase, {
      eventName: "page_tip_completed",
      tipId: data.tipId,
      version: data.version,
    });
    return updated;
  });

export const skipMyPageTips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const updated = await mutateMyOnboardingProgress(context.supabase, "skip_tips");
    await recordOnboardingEventBestEffort(context.supabase, {
      eventName: "page_tips_skipped",
    });
    return updated;
  });

export const resetMyPageTips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => mutateMyOnboardingProgress(context.supabase, "reset_tips"));

export const recordMyOnboardingEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => publicRecordOnboardingEventInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (data.eventName === "onboarding_offer_seen") {
      await recordOnboardingEventBestEffort(context.supabase, {
        eventName: "onboarding_offer_seen",
        offer: data.offer,
      });
      return { ok: true } as const;
    }

    await recordOnboardingEventBestEffort(context.supabase, {
      eventName: "page_tip_seen",
      tipId: data.tipId,
      version: data.version,
    });
    return { ok: true } as const;
  });

export type OnboardingEventName = (typeof onboardingEventNames)[number];
export type { OnboardingProgressState, StockTutorialStatus };
