import {
  MARKET_PRICING_ALGORITHM_VERSION,
  roundBerryValue,
  type MarketPricingAlgorithmVersion,
  type StockCategory,
} from "./v1.js";
import {
  calculateDailyMovement,
  type ApprovedEventImpact,
  type DailyMovementResult,
  type MovementConfiguration,
  type SimulationDayResult,
  type SimulationExtremeDay,
  type SimulationSummary,
} from "./movement-v1.js";

export type DailyMarketIndexEffect = {
  day: number;
  marketIndexEffectPct: number;
};

export type DailyApprovedEventImpact = ApprovedEventImpact;

export type SimulationInput = {
  initialPrice: number;
  fairValue: number;
  category: StockCategory;
  initialMomentumPct: number;
  days: number;
  approvedEvents?: DailyApprovedEventImpact[];
  dailyMarketIndexEffects?: DailyMarketIndexEffect[];
  configuration?: Partial<MovementConfiguration>;
};

export type NormalizedDailyEvent = {
  day: number;
  approvedEventImpactPct: number;
  isMajorEvent: boolean;
  labels: string[];
};

export type SimulationResult = {
  algorithmVersion: MarketPricingAlgorithmVersion;
  days: SimulationDayResult[];
  summary: SimulationSummary;
};

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

function assertValidDay(day: number, totalDays: number, label: string): void {
  if (!Number.isInteger(day) || day < 1 || day > totalDays) {
    throw new Error(`${label} must be an integer from 1 through ${totalDays}.`);
  }
}

function roundPercentValue(value: number): number {
  assertFiniteNumber(value, "percentage value");
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function normalizeApprovedEvents(
  approvedEvents: readonly DailyApprovedEventImpact[] | undefined,
  days: number,
): Map<number, NormalizedDailyEvent> {
  const eventsByDay = new Map<number, NormalizedDailyEvent>();

  for (const event of approvedEvents ?? []) {
    assertValidDay(event.day, days, "approved event day");
    assertRange(event.impactPct, "approvedEventImpactPct", -30, 30);

    const existing = eventsByDay.get(event.day);
    if (existing) {
      existing.approvedEventImpactPct += event.impactPct;
      existing.isMajorEvent = existing.isMajorEvent || event.isMajorEvent === true;
      if (event.label) existing.labels.push(event.label);
      assertRange(existing.approvedEventImpactPct, "combined approvedEventImpactPct", -30, 30);
      continue;
    }

    eventsByDay.set(event.day, {
      day: event.day,
      approvedEventImpactPct: event.impactPct,
      isMajorEvent: event.isMajorEvent === true,
      labels: event.label ? [event.label] : [],
    });
  }

  return eventsByDay;
}

function normalizeMarketIndexEffects(
  marketIndexEffects: readonly DailyMarketIndexEffect[] | undefined,
  days: number,
): Map<number, number> {
  const effectsByDay = new Map<number, number>();

  for (const effect of marketIndexEffects ?? []) {
    assertValidDay(effect.day, days, "market index effect day");
    assertRange(effect.marketIndexEffectPct, "marketIndexEffectPct", -1, 1);
    if (effectsByDay.has(effect.day)) {
      throw new Error(`Duplicate market index effect for day ${effect.day}.`);
    }
    effectsByDay.set(effect.day, effect.marketIndexEffectPct);
  }

  return effectsByDay;
}

function createSimulationDayResult(
  day: number,
  movement: DailyMovementResult,
): SimulationDayResult {
  return {
    algorithmVersion: movement.algorithmVersion,
    day,
    startingPrice: movement.currentPrice,
    endingPrice: movement.nextPrice,
    startingMomentumPct: movement.currentMomentumPct,
    endingMomentumPct: movement.nextMomentumPct,
    approvedEventImpactPct: movement.approvedEventImpactPct,
    momentumContributionPct: movement.momentumContributionPct,
    meanReversionPct: movement.meanReversionPct,
    marketIndexEffectPct: movement.marketIndexEffectPct,
    rawTotalChangePct: movement.rawTotalChangePct,
    appliedMovementCapPct: movement.appliedMovementCapPct,
    clampedTotalChangePct: movement.clampedTotalChangePct,
    isMajorEvent: movement.isMajorEvent,
    warnings: [...movement.warnings],
  };
}

function createExtremeDay(day: SimulationDayResult): SimulationExtremeDay {
  return {
    day: day.day,
    startingPrice: day.startingPrice,
    endingPrice: day.endingPrice,
    changePct: day.clampedTotalChangePct,
  };
}

function createSummary(
  initialPrice: number,
  fairValue: number,
  finalPrecisePrice: number,
  days: readonly SimulationDayResult[],
  precisePriceHistory: readonly number[],
): SimulationSummary {
  const largestGainDay = days.reduce((largest, day) =>
    day.clampedTotalChangePct > largest.clampedTotalChangePct ? day : largest,
  );
  const largestLossDay = days.reduce((largestLoss, day) =>
    day.clampedTotalChangePct < largestLoss.clampedTotalChangePct ? day : largestLoss,
  );
  const numberOfCappedDays = days.filter(
    (day) => day.clampedTotalChangePct !== day.rawTotalChangePct,
  ).length;
  const totalApprovedEventImpactPct = days.reduce(
    (total, day) => total + day.approvedEventImpactPct,
    0,
  );
  const minimumPrecisePrice = Math.min(...precisePriceHistory);
  const maximumPrecisePrice = Math.max(...precisePriceHistory);
  const absoluteReturn = finalPrecisePrice - initialPrice;
  const percentageReturnPct = (absoluteReturn / initialPrice) * 100;
  const finalPriceDifferenceFromFairValuePct = ((finalPrecisePrice - fairValue) / fairValue) * 100;

  return {
    algorithmVersion: MARKET_PRICING_ALGORITHM_VERSION,
    startingPrice: roundBerryValue(initialPrice),
    endingPrice: roundBerryValue(finalPrecisePrice),
    absoluteReturn: roundBerryValue(absoluteReturn),
    percentageReturnPct: roundPercentValue(percentageReturnPct),
    minimumPrice: roundBerryValue(minimumPrecisePrice),
    maximumPrice: roundBerryValue(maximumPrecisePrice),
    largestGainDay: createExtremeDay(largestGainDay),
    largestLossDay: createExtremeDay(largestLossDay),
    numberOfCappedDays,
    finalPriceDifferenceFromFairValuePct: roundPercentValue(finalPriceDifferenceFromFairValuePct),
    totalApprovedEventImpactPct: roundPercentValue(totalApprovedEventImpactPct),
  };
}

export function simulateMarketMovement(input: SimulationInput): SimulationResult {
  assertPositive(input.initialPrice, "initialPrice");
  assertPositive(input.fairValue, "fairValue");
  assertRange(input.initialMomentumPct, "initialMomentumPct", -5, 5);
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 365) {
    throw new Error("days must be an integer from 1 through 365.");
  }

  const eventsByDay = normalizeApprovedEvents(input.approvedEvents, input.days);
  const marketEffectsByDay = normalizeMarketIndexEffects(input.dailyMarketIndexEffects, input.days);
  const days: SimulationDayResult[] = [];
  const precisePriceHistory = [input.initialPrice];
  let preciseCurrentPrice = input.initialPrice;
  let currentMomentumPct = input.initialMomentumPct;

  for (let day = 1; day <= input.days; day += 1) {
    const event = eventsByDay.get(day);
    const movement = calculateDailyMovement({
      currentPrice: preciseCurrentPrice,
      fairValue: input.fairValue,
      category: input.category,
      currentMomentumPct,
      approvedEventImpactPct: event?.approvedEventImpactPct ?? 0,
      isMajorEvent: event?.isMajorEvent ?? false,
      marketIndexEffectPct: marketEffectsByDay.get(day) ?? 0,
      configuration: input.configuration,
    });

    days.push(createSimulationDayResult(day, movement));
    preciseCurrentPrice = movement.preciseNextPrice;
    currentMomentumPct = movement.nextMomentumPct;
    precisePriceHistory.push(preciseCurrentPrice);
  }

  return {
    algorithmVersion: MARKET_PRICING_ALGORITHM_VERSION,
    days,
    summary: createSummary(
      input.initialPrice,
      input.fairValue,
      preciseCurrentPrice,
      days,
      precisePriceHistory,
    ),
  };
}
