import type { Database } from "@/integrations/supabase/types";
import {
  MARKET_PRICING_ALGORITHM_VERSION,
  type CharacterValuationRatings,
  type StockCategory,
} from "./v1.js";

export const RATING_KEYS = [
  "narrativeImportance",
  "currentRelevance",
  "strengthStatus",
  "popularity",
  "futurePotential",
  "investorConfidence",
  "volatility",
] as const;

export const STOCK_CATEGORIES = ["blue_chip", "growth", "speculative", "meme"] as const;

export type RatingKey = (typeof RATING_KEYS)[number];

export type CharacterPricingRatingsRow =
  Database["public"]["Tables"]["character_pricing_ratings"]["Row"];

export type CharacterPricingDatabaseStatus = "draft" | "approved";
export type CharacterPricingState =
  | "unrated"
  | "draft"
  | "approved"
  | "stale_draft"
  | "stale_approved";

export type PersistentPricingInput = {
  ratings: CharacterValuationRatings;
  category: StockCategory;
  comparableAdjustment: number;
  uncertaintyDiscountPct: number;
  launchCatalystPct: number;
};

export type PersistentPricingDraftFields = {
  ratings: Record<RatingKey, string>;
  category: StockCategory;
  comparableAdjustment: string;
  uncertaintyDiscountPct: string;
  launchCatalystPct: string;
};

export type CharacterPricingAudit = {
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
};

export type CharacterPricingRatingsModel = {
  characterId: string;
  state: CharacterPricingState;
  databaseStatus: CharacterPricingDatabaseStatus | null;
  isStale: boolean;
  currentAlgorithmVersion: typeof MARKET_PRICING_ALGORITHM_VERSION;
  storedAlgorithmVersion: string | null;
  persistent: PersistentPricingInput | null;
  audit: CharacterPricingAudit | null;
};

export type CharacterPricingApplicationResult = {
  ratings: CharacterPricingRatingsModel;
  appliedAt: string;
  priceHistoryId: string;
  pricingAlgorithmVersion: typeof MARKET_PRICING_ALGORITHM_VERSION;
  previousLivePrice: number;
  newLivePrice: number;
  percentageChange: number;
  previousCategory: StockCategory;
  newCategory: StockCategory;
};

export type PersistentPricingValidationResult =
  | { ok: true; value: PersistentPricingInput; errors: Record<string, never> }
  | { ok: false; errors: Record<string, string> };

const DEFAULT_RATING_VALUE = 50;
const DEFAULT_COMPARABLE_ADJUSTMENT = 1;
const DEFAULT_UNCERTAINTY_DISCOUNT = 5;
const DEFAULT_LAUNCH_CATALYST = 0;

function readNumber(
  value: string,
  field: string,
  label: string,
  min: number,
  max: number,
  errors: Record<string, string>,
): number | undefined {
  const trimmed = value.trim();
  const parsed = trimmed === "" ? Number.NaN : Number(trimmed);
  if (!Number.isFinite(parsed)) {
    errors[field] = `${label} must be a finite number.`;
    return undefined;
  }
  if (parsed < min || parsed > max) {
    errors[field] = `${label} must be between ${min} and ${max}.`;
    return undefined;
  }
  return parsed;
}

function readInteger(
  value: string,
  field: string,
  label: string,
  min: number,
  max: number,
  errors: Record<string, string>,
): number | undefined {
  const parsed = readNumber(value, field, label, min, max, errors);
  if (parsed === undefined) return undefined;
  if (!Number.isInteger(parsed)) {
    errors[field] = `${label} must be a whole number.`;
    return undefined;
  }
  return parsed;
}

function stringifyNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value));
}

function databaseStatus(value: string): CharacterPricingDatabaseStatus {
  if (value === "draft" || value === "approved") return value;
  throw new Error(`Unsupported character pricing ratings status: ${value}`);
}

export function createDefaultPersistentPricingInput(
  category: StockCategory,
): PersistentPricingInput {
  return {
    ratings: {
      narrativeImportance: DEFAULT_RATING_VALUE,
      currentRelevance: DEFAULT_RATING_VALUE,
      strengthStatus: DEFAULT_RATING_VALUE,
      popularity: DEFAULT_RATING_VALUE,
      futurePotential: DEFAULT_RATING_VALUE,
      investorConfidence: DEFAULT_RATING_VALUE,
      volatility: DEFAULT_RATING_VALUE,
    },
    category,
    comparableAdjustment: DEFAULT_COMPARABLE_ADJUSTMENT,
    uncertaintyDiscountPct: DEFAULT_UNCERTAINTY_DISCOUNT,
    launchCatalystPct: DEFAULT_LAUNCH_CATALYST,
  };
}

export function persistentPricingInputToDraftFields(
  input: PersistentPricingInput,
): PersistentPricingDraftFields {
  return {
    ratings: {
      narrativeImportance: stringifyNumber(input.ratings.narrativeImportance),
      currentRelevance: stringifyNumber(input.ratings.currentRelevance),
      strengthStatus: stringifyNumber(input.ratings.strengthStatus),
      popularity: stringifyNumber(input.ratings.popularity),
      futurePotential: stringifyNumber(input.ratings.futurePotential),
      investorConfidence: stringifyNumber(input.ratings.investorConfidence),
      volatility: stringifyNumber(input.ratings.volatility),
    },
    category: input.category,
    comparableAdjustment: stringifyNumber(input.comparableAdjustment),
    uncertaintyDiscountPct: stringifyNumber(input.uncertaintyDiscountPct),
    launchCatalystPct: stringifyNumber(input.launchCatalystPct),
  };
}

export function validatePersistentPricingDraft(
  draft: PersistentPricingDraftFields,
): PersistentPricingValidationResult {
  const errors: Record<string, string> = {};
  const ratings = {} as CharacterValuationRatings;
  const category = draft.category as string;

  for (const key of RATING_KEYS) {
    const parsed = readInteger(draft.ratings[key], `ratings.${key}`, key, 0, 100, errors);
    ratings[key] = parsed ?? 0;
  }

  if (!STOCK_CATEGORIES.includes(category as StockCategory)) {
    errors.category = "Category must be blue_chip, growth, speculative, or meme.";
  }

  const comparableAdjustment = readNumber(
    draft.comparableAdjustment,
    "comparableAdjustment",
    "Comparable adjustment",
    0.75,
    1.25,
    errors,
  );
  const uncertaintyDiscountPct = readNumber(
    draft.uncertaintyDiscountPct,
    "uncertaintyDiscountPct",
    "Uncertainty discount",
    0,
    25,
    errors,
  );
  const launchCatalystPct = readNumber(
    draft.launchCatalystPct,
    "launchCatalystPct",
    "Launch catalyst",
    -30,
    30,
    errors,
  );

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: {},
    value: {
      ratings,
      category: draft.category,
      comparableAdjustment: comparableAdjustment ?? DEFAULT_COMPARABLE_ADJUSTMENT,
      uncertaintyDiscountPct: uncertaintyDiscountPct ?? DEFAULT_UNCERTAINTY_DISCOUNT,
      launchCatalystPct: launchCatalystPct ?? DEFAULT_LAUNCH_CATALYST,
    },
  };
}

export function persistentPricingInputsEqual(
  left: PersistentPricingInput,
  right: PersistentPricingInput,
): boolean {
  return (
    left.category === right.category &&
    left.comparableAdjustment === right.comparableAdjustment &&
    left.uncertaintyDiscountPct === right.uncertaintyDiscountPct &&
    left.launchCatalystPct === right.launchCatalystPct &&
    RATING_KEYS.every((key) => left.ratings[key] === right.ratings[key])
  );
}

export function hasPersistentPricingDraftChanges(
  draft: PersistentPricingDraftFields,
  baseline: PersistentPricingInput,
): boolean {
  const validation = validatePersistentPricingDraft(draft);
  if (!validation.ok) return true;
  return !persistentPricingInputsEqual(validation.value, baseline);
}

export function hydratePersistentPricingDraftFields<T extends PersistentPricingDraftFields>(
  draft: T,
  state: CharacterPricingRatingsModel,
): T {
  if (!state.persistent) return draft;
  const fields = persistentPricingInputToDraftFields(state.persistent);
  return {
    ...draft,
    ...fields,
    ratings: fields.ratings,
  };
}

export function createUnratedCharacterPricingState(
  characterId: string,
): CharacterPricingRatingsModel {
  return {
    characterId,
    state: "unrated",
    databaseStatus: null,
    isStale: false,
    currentAlgorithmVersion: MARKET_PRICING_ALGORITHM_VERSION,
    storedAlgorithmVersion: null,
    persistent: null,
    audit: null,
  };
}

export function mapCharacterPricingRatingsRow(
  row: CharacterPricingRatingsRow,
): CharacterPricingRatingsModel {
  const status = databaseStatus(row.ratings_status);
  const isStale = row.pricing_algorithm_version !== MARKET_PRICING_ALGORITHM_VERSION;
  const state: CharacterPricingState = isStale ? `stale_${status}` : status;

  return {
    characterId: row.character_id,
    state,
    databaseStatus: status,
    isStale,
    currentAlgorithmVersion: MARKET_PRICING_ALGORITHM_VERSION,
    storedAlgorithmVersion: row.pricing_algorithm_version,
    persistent: {
      ratings: {
        narrativeImportance: row.narrative_importance,
        currentRelevance: row.current_relevance,
        strengthStatus: row.strength_status,
        popularity: row.popularity,
        futurePotential: row.future_potential,
        investorConfidence: row.investor_confidence,
        volatility: row.volatility,
      },
      category: row.stock_category,
      comparableAdjustment: Number(row.comparable_adjustment),
      uncertaintyDiscountPct: Number(row.uncertainty_discount_pct),
      launchCatalystPct: Number(row.launch_catalyst_pct),
    },
    audit: {
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
    },
  };
}
