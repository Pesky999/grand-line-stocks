import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { calculateIpoPricing, MARKET_PRICING_ALGORITHM_VERSION } from "@/lib/market-pricing/v1";
import {
  STOCK_CATEGORIES,
  createUnratedCharacterPricingState,
  mapCharacterPricingRatingsRow,
  type CharacterPricingApplicationResult,
  type CharacterPricingRatingsModel,
  type CharacterPricingRatingsRow,
} from "@/lib/market-pricing/character-pricing-ratings";

const ratingSchema = z.number().int().min(0).max(100);
const characterIdSchema = z.object({ characterId: z.string().uuid() }).strict();
const MAX_SUPPORTED_MARKET_PRICE = 99999;

const persistentRatingsInput = characterIdSchema
  .extend({
    ratings: z
      .object({
        narrativeImportance: ratingSchema,
        currentRelevance: ratingSchema,
        strengthStatus: ratingSchema,
        popularity: ratingSchema,
        futurePotential: ratingSchema,
        investorConfidence: ratingSchema,
        volatility: ratingSchema,
      })
      .strict(),
    category: z.enum(STOCK_CATEGORIES),
    comparableAdjustment: z.number().finite().min(0.75).max(1.25),
    uncertaintyDiscountPct: z.number().finite().min(0).max(25),
    launchCatalystPct: z.number().finite().min(-30).max(30),
  })
  .strict();

async function requireAdminRole(db: SupabaseClient<Database>, userId: string): Promise<void> {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function ensureCharacterExists(
  db: SupabaseClient<Database>,
  characterId: string,
): Promise<void> {
  const { data, error } = await db
    .from("characters")
    .select("id")
    .eq("id", characterId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Character not found");
}

function mapDatabaseError(error: { message?: string } | null): Error {
  const message = error?.message ?? "Character pricing ratings request failed";
  if (message.includes("admin role required")) {
    return new Error("Administrator authorization required.");
  }
  if (message.includes("Character not found")) return new Error("Character not found");
  if (
    message.includes("pricing_algorithm_version") ||
    message.includes("pricing algorithm version")
  ) {
    return new Error("Unsupported pricing algorithm version.");
  }
  if (message.includes("must be between") || message.includes("is required")) {
    return new Error("Invalid pricing inputs.");
  }
  if (message.includes("applied price") || message.includes("valuation")) {
    return new Error("Market valuation could not be applied.");
  }
  return new Error(message);
}

const ratingsRowSchema = z
  .object({
    character_id: z.string().uuid(),
    narrative_importance: ratingSchema,
    current_relevance: ratingSchema,
    strength_status: ratingSchema,
    popularity: ratingSchema,
    future_potential: ratingSchema,
    investor_confidence: ratingSchema,
    volatility: ratingSchema,
    stock_category: z.enum(STOCK_CATEGORIES),
    comparable_adjustment: z.number(),
    uncertainty_discount_pct: z.number(),
    launch_catalyst_pct: z.number(),
    pricing_algorithm_version: z.string(),
    ratings_status: z.enum(["draft", "approved"]),
    created_at: z.string(),
    created_by: z.string().uuid().nullable(),
    updated_at: z.string(),
    updated_by: z.string().uuid().nullable(),
    approved_at: z.string().nullable(),
    approved_by: z.string().uuid().nullable(),
  })
  .strict();

const applyRpcResultSchema = z
  .object({
    ratings: ratingsRowSchema,
    appliedAt: z.string(),
    priceHistoryId: z.string().uuid(),
    pricingAlgorithmVersion: z.literal(MARKET_PRICING_ALGORITHM_VERSION),
    previousLivePrice: z.number(),
    newLivePrice: z.number(),
    percentageChange: z.number(),
    previousCategory: z.enum(STOCK_CATEGORIES),
    newCategory: z.enum(STOCK_CATEGORIES),
  })
  .strict();

function mapApplyRpcResult(value: unknown): CharacterPricingApplicationResult {
  const result = applyRpcResultSchema.parse(value);
  const ratings = mapCharacterPricingRatingsRow(result.ratings as CharacterPricingRatingsRow);
  return {
    ratings,
    appliedAt: result.appliedAt,
    priceHistoryId: result.priceHistoryId,
    pricingAlgorithmVersion: result.pricingAlgorithmVersion,
    previousLivePrice: result.previousLivePrice,
    newLivePrice: result.newLivePrice,
    percentageChange: result.percentageChange,
    previousCategory: result.previousCategory,
    newCategory: result.newCategory,
  };
}

export const getCharacterPricingRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => characterIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<CharacterPricingRatingsModel> => {
    await requireAdminRole(context.supabase, context.userId);
    await ensureCharacterExists(context.supabase, data.characterId);

    const { data: row, error } = await context.supabase
      .from("character_pricing_ratings")
      .select("*")
      .eq("character_id", data.characterId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return createUnratedCharacterPricingState(data.characterId);
    return mapCharacterPricingRatingsRow(row as CharacterPricingRatingsRow);
  });

export const listCharacterPricingRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CharacterPricingRatingsModel[]> => {
    await requireAdminRole(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("character_pricing_ratings")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) =>
      mapCharacterPricingRatingsRow(row as CharacterPricingRatingsRow),
    );
  });

export const saveCharacterPricingDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => persistentRatingsInput.parse(input))
  .handler(async ({ data, context }): Promise<CharacterPricingRatingsModel> => {
    await requireAdminRole(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.rpc("save_character_pricing_draft", {
      _character_id: data.characterId,
      _narrative_importance: data.ratings.narrativeImportance,
      _current_relevance: data.ratings.currentRelevance,
      _strength_status: data.ratings.strengthStatus,
      _popularity: data.ratings.popularity,
      _future_potential: data.ratings.futurePotential,
      _investor_confidence: data.ratings.investorConfidence,
      _volatility: data.ratings.volatility,
      _stock_category: data.category,
      _comparable_adjustment: data.comparableAdjustment,
      _uncertainty_discount_pct: data.uncertaintyDiscountPct,
      _launch_catalyst_pct: data.launchCatalystPct,
      _pricing_algorithm_version: MARKET_PRICING_ALGORITHM_VERSION,
    });
    if (error) throw mapDatabaseError(error);
    if (!row) throw new Error("Character pricing draft save returned no row.");
    return mapCharacterPricingRatingsRow(row as CharacterPricingRatingsRow);
  });

export const saveAndApplyCharacterPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => persistentRatingsInput.parse(input))
  .handler(async ({ data, context }): Promise<CharacterPricingApplicationResult> => {
    await requireAdminRole(context.supabase, context.userId);
    const calculation = calculateIpoPricing({
      ratings: data.ratings,
      category: data.category,
      comparableAdjustment: data.comparableAdjustment,
      uncertaintyDiscountPct: data.uncertaintyDiscountPct,
      launchCatalystPct: data.launchCatalystPct,
    });
    const previewAppliedPrice = calculation.suggestedPostCatalystPrice;
    if (
      !Number.isFinite(previewAppliedPrice) ||
      previewAppliedPrice <= 0 ||
      previewAppliedPrice > MAX_SUPPORTED_MARKET_PRICE
    ) {
      throw new Error("Calculated applied price is outside the supported market price range.");
    }

    const { data: result, error } = await context.supabase.rpc("save_and_apply_character_pricing", {
      _character_id: data.characterId,
      _narrative_importance: data.ratings.narrativeImportance,
      _current_relevance: data.ratings.currentRelevance,
      _strength_status: data.ratings.strengthStatus,
      _popularity: data.ratings.popularity,
      _future_potential: data.ratings.futurePotential,
      _investor_confidence: data.ratings.investorConfidence,
      _volatility: data.ratings.volatility,
      _stock_category: data.category,
      _comparable_adjustment: data.comparableAdjustment,
      _uncertainty_discount_pct: data.uncertaintyDiscountPct,
      _launch_catalyst_pct: data.launchCatalystPct,
      _pricing_algorithm_version: MARKET_PRICING_ALGORITHM_VERSION,
    });
    if (error) throw mapDatabaseError(error);
    return mapApplyRpcResult(result);
  });

export const resetCharacterPricingRatings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => characterIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<CharacterPricingRatingsModel> => {
    await requireAdminRole(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("reset_character_pricing_ratings", {
      _character_id: data.characterId,
    });
    if (error) throw mapDatabaseError(error);
    return createUnratedCharacterPricingState(data.characterId);
  });
