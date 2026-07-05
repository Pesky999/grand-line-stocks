import {
  MARKET_PRICING_ALGORITHM_VERSION,
  STOCK_CATEGORY_MOVEMENT_LIMITS,
  roundBerryValue,
  type MarketPricingAlgorithmVersion,
  type StockCategory,
} from "./v1.js";

export type DailyMarketState = {
  marketIndexEffectPct: number;
};

export type ApprovedEventImpact = {
  day: number;
  impactPct: number;
  isMajorEvent?: boolean;
  label?: string;
};

export type MovementConfiguration = {
  meanReversionStrength: number;
  momentumDecay: number;
  eventMomentumCarry: number;
};

export type CharacterMovementInput = DailyMarketState & {
  currentPrice: number;
  fairValue: number;
  category: StockCategory;
  currentMomentumPct: number;
  approvedEventImpactPct: number;
  isMajorEvent?: boolean;
  configuration?: Partial<MovementConfiguration>;
};

export type MovementComponents = {
  approvedEventImpactPct: number;
  momentumContributionPct: number;
  meanReversionPct: number;
  marketIndexEffectPct: number;
};

export type DailyMovementResult = MovementComponents & {
  algorithmVersion: MarketPricingAlgorithmVersion;
  currentPrice: number;
  fairValue: number;
  category: StockCategory;
  isMajorEvent: boolean;
  rawTotalChangePct: number;
  appliedMovementCapPct: number;
  clampedTotalChangePct: number;
  nextPrice: number;
  preciseNextPrice: number;
  currentMomentumPct: number;
  nextMomentumPct: number;
  warnings: string[];
};

export type SimulationDayResult = MovementComponents & {
  algorithmVersion: MarketPricingAlgorithmVersion;
  day: number;
  startingPrice: number;
  endingPrice: number;
  startingMomentumPct: number;
  endingMomentumPct: number;
  rawTotalChangePct: number;
  appliedMovementCapPct: number;
  clampedTotalChangePct: number;
  isMajorEvent: boolean;
  warnings: string[];
};

export type SimulationExtremeDay = {
  day: number;
  startingPrice: number;
  endingPrice: number;
  changePct: number;
};

export type SimulationSummary = {
  algorithmVersion: MarketPricingAlgorithmVersion;
  startingPrice: number;
  endingPrice: number;
  absoluteReturn: number;
  percentageReturnPct: number;
  minimumPrice: number;
  maximumPrice: number;
  largestGainDay: SimulationExtremeDay;
  largestLossDay: SimulationExtremeDay;
  numberOfCappedDays: number;
  finalPriceDifferenceFromFairValuePct: number;
  totalApprovedEventImpactPct: number;
};

export const DEFAULT_MOVEMENT_CONFIGURATION: Readonly<MovementConfiguration> = Object.freeze({
  meanReversionStrength: 0.05,
  momentumDecay: 0.75,
  eventMomentumCarry: 0.35,
});

export const MOVEMENT_LIMITS = Object.freeze({
  minimumMeanReversionPct: -2,
  maximumMeanReversionPct: 2,
  minimumMomentumPct: -5,
  maximumMomentumPct: 5,
  priceFloor: 0.01,
});

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

function assertPositive(value: number, label: string): void {
  assertFiniteNumber(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveConfiguration(overrides?: Partial<MovementConfiguration>): MovementConfiguration {
  const configuration = {
    ...DEFAULT_MOVEMENT_CONFIGURATION,
    ...overrides,
  };

  assertRange(configuration.meanReversionStrength, "meanReversionStrength", 0, 0.25);
  assertRange(configuration.momentumDecay, "momentumDecay", 0, 1);
  assertRange(configuration.eventMomentumCarry, "eventMomentumCarry", 0, 1);

  return configuration;
}

export function calculateMeanReversionPct(
  currentPrice: number,
  fairValue: number,
  meanReversionStrength = DEFAULT_MOVEMENT_CONFIGURATION.meanReversionStrength,
): number {
  assertPositive(currentPrice, "currentPrice");
  assertPositive(fairValue, "fairValue");
  assertRange(meanReversionStrength, "meanReversionStrength", 0, 0.25);

  const rawMeanReversionPct = meanReversionStrength * Math.log(fairValue / currentPrice) * 100;

  return clamp(
    rawMeanReversionPct,
    MOVEMENT_LIMITS.minimumMeanReversionPct,
    MOVEMENT_LIMITS.maximumMeanReversionPct,
  );
}

export function calculateNextMomentumPct(
  currentMomentumPct: number,
  approvedEventImpactPct: number,
  configurationOverrides?: Partial<MovementConfiguration>,
): number {
  const configuration = resolveConfiguration(configurationOverrides);

  assertRange(currentMomentumPct, "currentMomentumPct", -5, 5);
  assertRange(approvedEventImpactPct, "approvedEventImpactPct", -30, 30);

  const rawNextMomentumPct =
    currentMomentumPct * configuration.momentumDecay +
    approvedEventImpactPct * configuration.eventMomentumCarry;

  return clamp(
    rawNextMomentumPct,
    MOVEMENT_LIMITS.minimumMomentumPct,
    MOVEMENT_LIMITS.maximumMomentumPct,
  );
}

export function calculateDailyMovement(input: CharacterMovementInput): DailyMovementResult {
  const configuration = resolveConfiguration(input.configuration);

  assertPositive(input.currentPrice, "currentPrice");
  assertPositive(input.fairValue, "fairValue");
  assertRange(input.currentMomentumPct, "currentMomentumPct", -5, 5);
  assertRange(input.approvedEventImpactPct, "approvedEventImpactPct", -30, 30);
  assertRange(input.marketIndexEffectPct, "marketIndexEffectPct", -1, 1);

  const categoryLimits = STOCK_CATEGORY_MOVEMENT_LIMITS[input.category];
  if (!categoryLimits) {
    throw new Error(`Unsupported stock category: ${input.category}`);
  }

  const isMajorEvent = input.isMajorEvent === true;
  const approvedEventImpactPct = input.approvedEventImpactPct;
  const momentumContributionPct = input.currentMomentumPct;
  const meanReversionPct = calculateMeanReversionPct(
    input.currentPrice,
    input.fairValue,
    configuration.meanReversionStrength,
  );
  const marketIndexEffectPct = input.marketIndexEffectPct;
  const rawTotalChangePct =
    approvedEventImpactPct + momentumContributionPct + meanReversionPct + marketIndexEffectPct;
  const appliedMovementCapPct = isMajorEvent
    ? categoryLimits.majorEventCapPct
    : categoryLimits.normalMovementCapPct;
  const clampedTotalChangePct = clamp(
    rawTotalChangePct,
    -appliedMovementCapPct,
    appliedMovementCapPct,
  );
  const rawNextPrice = input.currentPrice * (1 + clampedTotalChangePct / 100);
  const preciseNextPrice = Math.max(MOVEMENT_LIMITS.priceFloor, rawNextPrice);
  const nextMomentumPct = calculateNextMomentumPct(
    input.currentMomentumPct,
    approvedEventImpactPct,
    configuration,
  );
  const warnings: string[] = [];
  const fairValueDistanceRatio = Math.abs(input.currentPrice - input.fairValue) / input.fairValue;

  if (fairValueDistanceRatio > 0.5) {
    warnings.push("Current price differs from fair value by more than 50%.");
  }
  if (clampedTotalChangePct !== rawTotalChangePct) {
    warnings.push("Daily movement hit the category cap.");
  }
  if (isMajorEvent) {
    warnings.push("Major-event movement cap was applicable.");
  }
  if (Math.abs(input.currentMomentumPct) >= 4.5 || Math.abs(nextMomentumPct) >= 4.5) {
    warnings.push("Momentum is at or near its clamp.");
  }
  if (
    preciseNextPrice === MOVEMENT_LIMITS.priceFloor &&
    rawNextPrice < MOVEMENT_LIMITS.priceFloor
  ) {
    warnings.push("Price reached the Berry 0.01 floor.");
  }

  return {
    algorithmVersion: MARKET_PRICING_ALGORITHM_VERSION,
    currentPrice: roundBerryValue(input.currentPrice),
    fairValue: roundBerryValue(input.fairValue),
    category: input.category,
    isMajorEvent,
    approvedEventImpactPct,
    momentumContributionPct,
    meanReversionPct,
    marketIndexEffectPct,
    rawTotalChangePct,
    appliedMovementCapPct,
    clampedTotalChangePct,
    nextPrice: roundBerryValue(preciseNextPrice),
    preciseNextPrice,
    currentMomentumPct: input.currentMomentumPct,
    nextMomentumPct,
    warnings,
  };
}
