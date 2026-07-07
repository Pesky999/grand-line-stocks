import {
  calculateIpoPricing,
  type CharacterValuationRatings,
  type IpoPricingResult,
  type StockCategory,
} from "./v1.js";
import {
  RATING_KEYS,
  STOCK_CATEGORIES,
  validatePersistentPricingDraft,
  type RatingKey,
} from "./character-pricing-ratings.js";
import {
  calculateDailyMovement,
  type DailyMovementResult,
  type SimulationDayResult,
} from "./movement-v1.js";
import {
  simulateMarketMovement,
  type DailyApprovedEventImpact,
  type SimulationResult,
} from "./simulator-v1.js";

export type PricingPreviewCharacter = {
  slug: string;
  name: string;
  current_price: number;
  previous_price: number;
  category: StockCategory;
  momentum: number;
};

export { RATING_KEYS, STOCK_CATEGORIES, type RatingKey };

export type PreviewSimulationEventDraft = {
  id: string;
  day: string;
  impactPct: string;
  isMajorEvent: boolean;
  label: string;
};

export type PricingPreviewDraft = {
  ratings: Record<RatingKey, string>;
  category: StockCategory;
  comparableAdjustment: string;
  uncertaintyDiscountPct: string;
  launchCatalystPct: string;
  currentMomentumPct: string;
  approvedEventImpactPct: string;
  isMajorEvent: boolean;
  marketIndexEffectPct: string;
  simulationEvents: PreviewSimulationEventDraft[];
};

export type ParsedPricingPreviewDraft = {
  ratings: CharacterValuationRatings;
  category: StockCategory;
  comparableAdjustment: number;
  uncertaintyDiscountPct: number;
  launchCatalystPct: number;
  currentMomentumPct: number;
  approvedEventImpactPct: number;
  isMajorEvent: boolean;
  marketIndexEffectPct: number;
  simulationEvents: DailyApprovedEventImpact[];
};

export type PreviewValidationResult =
  | { ok: true; value: ParsedPricingPreviewDraft; errors: Record<string, never> }
  | { ok: false; errors: Record<string, string> };

export type PreviewChartRow = {
  day: number;
  endingPrice: number;
  fairValue: number;
};

export type PreviewTableRow = {
  day: number;
  startingPrice: number;
  endingPrice: number;
  approvedEventImpactPct: number;
  momentumContributionPct: number;
  meanReversionPct: number;
  clampedTotalChangePct: number;
  appliedMovementCapPct: number;
  hasWarnings: boolean;
};

export type PricingPreviewCalculation = {
  ipo: IpoPricingResult;
  movement: DailyMovementResult;
  simulation: SimulationResult;
  chartRows: PreviewChartRow[];
  tableRows: PreviewTableRow[];
};

const DEFAULT_RATING_VALUE = "50";
const DEFAULT_COMPARABLE_ADJUSTMENT = "1";
const DEFAULT_UNCERTAINTY_DISCOUNT = "5";
const DEFAULT_LAUNCH_CATALYST = "0";
const DEFAULT_EVENT_IMPACT = "0";
const DEFAULT_MARKET_INDEX_EFFECT = "0";
const SIMULATION_DAYS = 30;

export function createEmptySimulationEvent(id: number | string): PreviewSimulationEventDraft {
  return {
    id: String(id),
    day: "1",
    impactPct: "0",
    isMajorEvent: false,
    label: "",
  };
}

export function createDefaultPricingPreviewDraft(
  character: PricingPreviewCharacter | undefined,
): PricingPreviewDraft {
  const momentum = Number(character?.momentum ?? 0);
  const safeMomentum = Number.isFinite(momentum) && momentum >= -5 && momentum <= 5 ? momentum : 0;
  const category = character?.category ?? "growth";

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
    currentMomentumPct: String(safeMomentum),
    approvedEventImpactPct: DEFAULT_EVENT_IMPACT,
    isMajorEvent: false,
    marketIndexEffectPct: DEFAULT_MARKET_INDEX_EFFECT,
    simulationEvents: [],
  };
}

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

function normalizeLabel(label: string): string | undefined {
  const trimmed = label.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function validatePricingPreviewDraft(draft: PricingPreviewDraft): PreviewValidationResult {
  const persistentValidation = validatePersistentPricingDraft(draft);
  const errors: Record<string, string> = persistentValidation.ok
    ? {}
    : { ...persistentValidation.errors };
  const currentMomentumPct = readNumber(
    draft.currentMomentumPct,
    "currentMomentumPct",
    "Current momentum",
    -5,
    5,
    errors,
  );
  const approvedEventImpactPct = readNumber(
    draft.approvedEventImpactPct,
    "approvedEventImpactPct",
    "Approved event impact",
    -30,
    30,
    errors,
  );
  const marketIndexEffectPct = readNumber(
    draft.marketIndexEffectPct,
    "marketIndexEffectPct",
    "Market index effect",
    -1,
    1,
    errors,
  );

  const simulationEvents = draft.simulationEvents.map((event) => {
    const day = readNumber(
      event.day,
      `simulationEvents.${event.id}.day`,
      "Simulation event day",
      1,
      SIMULATION_DAYS,
      errors,
    );
    if (day !== undefined && !Number.isInteger(day)) {
      errors[`simulationEvents.${event.id}.day`] = "Simulation event day must be a whole number.";
    }
    const impactPct = readNumber(
      event.impactPct,
      `simulationEvents.${event.id}.impactPct`,
      "Simulation event impact",
      -30,
      30,
      errors,
    );
    return {
      day: day ?? 1,
      impactPct: impactPct ?? 0,
      isMajorEvent: event.isMajorEvent,
      label: normalizeLabel(event.label),
    };
  });

  if (Object.keys(errors).length > 0 || !persistentValidation.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: {},
    value: {
      ratings: persistentValidation.value.ratings,
      category: persistentValidation.value.category,
      comparableAdjustment: persistentValidation.value.comparableAdjustment,
      uncertaintyDiscountPct: persistentValidation.value.uncertaintyDiscountPct,
      launchCatalystPct: persistentValidation.value.launchCatalystPct,
      currentMomentumPct: currentMomentumPct ?? 0,
      approvedEventImpactPct: approvedEventImpactPct ?? 0,
      isMajorEvent: draft.isMajorEvent,
      marketIndexEffectPct: marketIndexEffectPct ?? 0,
      simulationEvents,
    },
  };
}

function readCharacterPrice(character: PricingPreviewCharacter): number {
  const currentPrice = Number(character.current_price);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error("Selected character current price must be greater than 0.");
  }
  return currentPrice;
}

function toChartRows(days: readonly SimulationDayResult[], fairValue: number): PreviewChartRow[] {
  return days.map((day) => ({
    day: day.day,
    endingPrice: day.endingPrice,
    fairValue,
  }));
}

function toTableRows(days: readonly SimulationDayResult[]): PreviewTableRow[] {
  return days.map((day) => ({
    day: day.day,
    startingPrice: day.startingPrice,
    endingPrice: day.endingPrice,
    approvedEventImpactPct: day.approvedEventImpactPct,
    momentumContributionPct: day.momentumContributionPct,
    meanReversionPct: day.meanReversionPct,
    clampedTotalChangePct: day.clampedTotalChangePct,
    appliedMovementCapPct: day.appliedMovementCapPct,
    hasWarnings: day.warnings.length > 0,
  }));
}

export function calculatePricingPreview(
  character: PricingPreviewCharacter,
  input: ParsedPricingPreviewDraft,
): PricingPreviewCalculation {
  const currentPrice = readCharacterPrice(character);
  const ipo = calculateIpoPricing({
    ratings: input.ratings,
    category: input.category,
    comparableAdjustment: input.comparableAdjustment,
    uncertaintyDiscountPct: input.uncertaintyDiscountPct,
    launchCatalystPct: input.launchCatalystPct,
  });
  const fairValue = ipo.baseFairValue;
  const movement = calculateDailyMovement({
    currentPrice,
    fairValue,
    category: input.category,
    currentMomentumPct: input.currentMomentumPct,
    approvedEventImpactPct: input.approvedEventImpactPct,
    isMajorEvent: input.isMajorEvent,
    marketIndexEffectPct: input.marketIndexEffectPct,
  });
  const simulation = simulateMarketMovement({
    initialPrice: currentPrice,
    fairValue,
    category: input.category,
    initialMomentumPct: input.currentMomentumPct,
    days: SIMULATION_DAYS,
    approvedEvents: input.simulationEvents,
    dailyMarketIndexEffects: [],
  });

  return {
    ipo,
    movement,
    simulation,
    chartRows: toChartRows(simulation.days, fairValue),
    tableRows: toTableRows(simulation.days),
  };
}
