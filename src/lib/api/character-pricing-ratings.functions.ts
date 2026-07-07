import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { MARKET_PRICING_ALGORITHM_VERSION } from "@/lib/market-pricing/v1";
import {
  STOCK_CATEGORIES,
  createUnratedCharacterPricingState,
  mapCharacterPricingRatingsRow,
  type CharacterPricingRatingsModel,
  type CharacterPricingRatingsRow,
} from "@/lib/market-pricing/character-pricing-ratings";

const ratingSchema = z.number().int().min(0).max(100);
const characterIdSchema = z.object({ characterId: z.string().uuid() }).strict();

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
  if (message.includes("admin role required")) return new Error("Forbidden: admin role required");
  if (message.includes("Character not found")) return new Error("Character not found");
  if (message.includes("Draft character pricing ratings not found")) {
    return new Error("No draft ratings exist for this character.");
  }
  if (message.includes("must be a draft")) {
    return new Error("Approval requires a saved draft.");
  }
  if (message.includes("algorithm version is stale")) {
    return new Error("Saved ratings are stale. Save a new draft before approving.");
  }
  return new Error(message);
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

export const approveCharacterPricingRatings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => characterIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<CharacterPricingRatingsModel> => {
    await requireAdminRole(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.rpc("approve_character_pricing_ratings", {
      _character_id: data.characterId,
      _expected_pricing_algorithm_version: MARKET_PRICING_ALGORITHM_VERSION,
    });
    if (error) throw mapDatabaseError(error);
    if (!row) throw new Error("Character pricing approval returned no row.");
    return mapCharacterPricingRatingsRow(row as CharacterPricingRatingsRow);
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
