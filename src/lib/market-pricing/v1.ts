export const MARKET_PRICING_ALGORITHM_VERSION = "1.0.0" as const;

export type MarketPricingAlgorithmVersion = typeof MARKET_PRICING_ALGORITHM_VERSION;

export type StockCategory = "blue_chip" | "growth" | "speculative" | "meme";

export type ConfidenceLevel = "high" | "medium" | "low";

export type CharacterValuationRatings = {
  narrativeImportance: number;
  currentRelevance: number;
  strengthStatus: number;
  popularity: number;
  futurePotential: number;
  investorConfidence: number;
  volatility: number;
};

export type StockCategoryMovementLimits = {
  normalMovementCapPct: number;
  majorEventCapPct: number;
};

type ReadonlyStockCategoryMovementLimits = Readonly<StockCategoryMovementLimits>;

export type IpoPricingInput = {
  ratings: CharacterValuationRatings;
  category: StockCategory;
  comparableAdjustment: number;
  uncertaintyDiscountPct: number;
  launchCatalystPct: number;
};

export type IpoPricingResult = {
  algorithmVersion: MarketPricingAlgorithmVersion;
  weightedScore: number;
  baseFairValue: number;
  comparableAdjustment: number;
  comparableAdjustedFairValue: number;
  uncertaintyDiscountPct: number;
  suggestedOpeningPrice: number;
  launchCatalystPct: number;
  suggestedPostCatalystPrice: number;
  category: StockCategory;
  movementLimits: StockCategoryMovementLimits;
  confidenceLevel: ConfidenceLevel;
  warnings: string[];
};

export const FUNDAMENTAL_RATING_WEIGHTS = {
  narrativeImportance: 0.25,
  currentRelevance: 0.2,
  strengthStatus: 0.15,
  popularity: 0.15,
  futurePotential: 0.15,
  investorConfidence: 0.1,
} as const;

export const STOCK_CATEGORY_MOVEMENT_LIMITS: Readonly<
  Record<StockCategory, ReadonlyStockCategoryMovementLimits>
> = Object.freeze({
  blue_chip: Object.freeze({
    normalMovementCapPct: 4,
    majorEventCapPct: 12,
  }),
  growth: Object.freeze({
    normalMovementCapPct: 7,
    majorEventCapPct: 18,
  }),
  speculative: Object.freeze({
    normalMovementCapPct: 12,
    majorEventCapPct: 25,
  }),
  meme: Object.freeze({
    normalMovementCapPct: 18,
    majorEventCapPct: 30,
  }),
});

const RATING_FIELDS = [
  "narrativeImportance",
  "currentRelevance",
  "strengthStatus",
  "popularity",
  "futurePotential",
  "investorConfidence",
  "volatility",
] as const;

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function assertRange(value: number, label: string, min: number, max: number): void {
  assertFiniteNumber(value, label);
  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
}

export function roundBerryValue(value: number): number {
  assertFiniteNumber(value, "Berry value");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateRatings(ratings: CharacterValuationRatings): CharacterValuationRatings {
  for (const field of RATING_FIELDS) {
    assertRange(ratings[field], field, 0, 100);
  }
  return ratings;
}

export function calculateWeightedScore(ratings: CharacterValuationRatings): number {
  validateRatings(ratings);
  return (
    ratings.narrativeImportance * FUNDAMENTAL_RATING_WEIGHTS.narrativeImportance +
    ratings.currentRelevance * FUNDAMENTAL_RATING_WEIGHTS.currentRelevance +
    ratings.strengthStatus * FUNDAMENTAL_RATING_WEIGHTS.strengthStatus +
    ratings.popularity * FUNDAMENTAL_RATING_WEIGHTS.popularity +
    ratings.futurePotential * FUNDAMENTAL_RATING_WEIGHTS.futurePotential +
    ratings.investorConfidence * FUNDAMENTAL_RATING_WEIGHTS.investorConfidence
  );
}

function calculateRawBaseFairValue(weightedScore: number): number {
  assertRange(weightedScore, "weightedScore", 0, 100);
  return 25 * Math.exp(0.025 * weightedScore);
}

export function calculateBaseFairValue(weightedScore: number): number {
  return roundBerryValue(calculateRawBaseFairValue(weightedScore));
}

export function classifyConfidence(uncertaintyDiscountPct: number): ConfidenceLevel {
  assertRange(uncertaintyDiscountPct, "uncertaintyDiscountPct", 0, 25);
  if (uncertaintyDiscountPct <= 5) return "high";
  if (uncertaintyDiscountPct <= 15) return "medium";
  return "low";
}

export function calculateIpoPricing(input: IpoPricingInput): IpoPricingResult {
  assertRange(input.comparableAdjustment, "comparableAdjustment", 0.75, 1.25);
  assertRange(input.uncertaintyDiscountPct, "uncertaintyDiscountPct", 0, 25);
  assertRange(input.launchCatalystPct, "launchCatalystPct", -30, 30);

  const movementLimits = STOCK_CATEGORY_MOVEMENT_LIMITS[input.category];
  if (!movementLimits) {
    throw new Error(`Unsupported stock category: ${input.category}`);
  }

  const weightedScore = calculateWeightedScore(input.ratings);
  const rawBaseFairValue = calculateRawBaseFairValue(weightedScore);
  const rawComparableAdjustedFairValue = rawBaseFairValue * input.comparableAdjustment;
  const rawSuggestedOpeningPrice =
    rawComparableAdjustedFairValue * (1 - input.uncertaintyDiscountPct / 100);
  const rawSuggestedPostCatalystPrice =
    rawSuggestedOpeningPrice * (1 + input.launchCatalystPct / 100);
  const baseFairValue = roundBerryValue(rawBaseFairValue);
  const comparableAdjustedFairValue = roundBerryValue(rawComparableAdjustedFairValue);
  const suggestedOpeningPrice = roundBerryValue(rawSuggestedOpeningPrice);
  const suggestedPostCatalystPrice = roundBerryValue(rawSuggestedPostCatalystPrice);
  const movementLimitsCopy: StockCategoryMovementLimits = {
    normalMovementCapPct: movementLimits.normalMovementCapPct,
    majorEventCapPct: movementLimits.majorEventCapPct,
  };
  const confidenceLevel = classifyConfidence(input.uncertaintyDiscountPct);
  const warnings: string[] = [];

  if (confidenceLevel === "low") {
    warnings.push("Low confidence: uncertainty discount is greater than 15%.");
  }
  if (input.comparableAdjustment < 0.85 || input.comparableAdjustment > 1.15) {
    warnings.push("Comparable adjustment is outside the typical 0.85 to 1.15 range.");
  }
  if (Math.abs(input.launchCatalystPct) > 15) {
    warnings.push("Launch catalyst exceeds 15%; avoid double-counting the same event.");
  }
  if (suggestedOpeningPrice < 25) {
    warnings.push("Suggested opening price is below Berry 25.");
  }
  if (suggestedOpeningPrice > 350) {
    warnings.push("Suggested opening price exceeds Berry 350.");
  }

  return {
    algorithmVersion: MARKET_PRICING_ALGORITHM_VERSION,
    weightedScore,
    baseFairValue,
    comparableAdjustment: input.comparableAdjustment,
    comparableAdjustedFairValue,
    uncertaintyDiscountPct: input.uncertaintyDiscountPct,
    suggestedOpeningPrice,
    launchCatalystPct: input.launchCatalystPct,
    suggestedPostCatalystPrice,
    category: input.category,
    movementLimits: movementLimitsCopy,
    confidenceLevel,
    warnings,
  };
}
