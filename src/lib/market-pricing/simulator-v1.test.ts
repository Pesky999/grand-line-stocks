/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { SIMULATION_SCENARIOS, runMarketPricingSimulationSuite } from "./simulation-runner-v1.js";
import {
  normalizeApprovedEvents,
  simulateMarketMovement,
  type DailyMarketIndexEffect,
  type SimulationInput,
} from "./simulator-v1.js";
import type { ApprovedEventImpact, MovementConfiguration } from "./movement-v1.js";

const scenarioByName = new Map(SIMULATION_SCENARIOS.map((scenario) => [scenario.name, scenario]));

const roundBerryForTest = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const roundPercentForTest = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10000) / 10000;

const calculateFullPrecisionExpected = (
  input: SimulationInput,
): {
  finalPrice: number;
  priceHistory: number[];
  dayChanges: number[];
  totalApprovedEventImpactPct: number;
  cappedDays: number;
} => {
  const configuration = {
    meanReversionStrength: 0.05,
    momentumDecay: 0.75,
    eventMomentumCarry: 0.35,
    ...input.configuration,
  };
  const eventByDay = new Map<number, { impactPct: number; isMajorEvent: boolean }>();
  const marketByDay = new Map<number, number>();
  let currentPrice = input.initialPrice;
  let currentMomentumPct = input.initialMomentumPct;
  let totalApprovedEventImpactPct = 0;
  let cappedDays = 0;
  const priceHistory = [currentPrice];
  const dayChanges: number[] = [];

  for (const event of input.approvedEvents ?? []) {
    const existing = eventByDay.get(event.day);
    if (existing) {
      existing.impactPct += event.impactPct;
      existing.isMajorEvent = existing.isMajorEvent || event.isMajorEvent === true;
    } else {
      eventByDay.set(event.day, {
        impactPct: event.impactPct,
        isMajorEvent: event.isMajorEvent === true,
      });
    }
  }
  for (const effect of input.dailyMarketIndexEffects ?? []) {
    marketByDay.set(effect.day, effect.marketIndexEffectPct);
  }

  for (let day = 1; day <= input.days; day += 1) {
    const event = eventByDay.get(day);
    const approvedEventImpactPct = event?.impactPct ?? 0;
    const meanReversionPct = Math.min(
      2,
      Math.max(
        -2,
        configuration.meanReversionStrength * Math.log(input.fairValue / currentPrice) * 100,
      ),
    );
    const rawTotalChangePct =
      approvedEventImpactPct + currentMomentumPct + meanReversionPct + (marketByDay.get(day) ?? 0);
    const movementCapPct = event?.isMajorEvent === true ? 18 : 7;
    const clampedTotalChangePct = Math.min(
      movementCapPct,
      Math.max(-movementCapPct, rawTotalChangePct),
    );

    if (clampedTotalChangePct !== rawTotalChangePct) {
      cappedDays += 1;
    }
    totalApprovedEventImpactPct += approvedEventImpactPct;
    dayChanges.push(clampedTotalChangePct);
    currentPrice = Math.max(0.01, currentPrice * (1 + clampedTotalChangePct / 100));
    currentMomentumPct = Math.min(
      5,
      Math.max(
        -5,
        currentMomentumPct * configuration.momentumDecay +
          approvedEventImpactPct * configuration.eventMomentumCarry,
      ),
    );
    priceHistory.push(currentPrice);
  }

  return {
    finalPrice: currentPrice,
    priceHistory,
    dayChanges,
    totalApprovedEventImpactPct,
    cappedDays,
  };
};

const calculateRoundedFeedbackFinalPrice = (input: SimulationInput): number => {
  const configuration = {
    meanReversionStrength: 0.05,
    momentumDecay: 0.75,
    eventMomentumCarry: 0.35,
    ...input.configuration,
  };
  const eventByDay = new Map<number, { impactPct: number; isMajorEvent: boolean }>();
  const marketByDay = new Map<number, number>();
  let currentPrice = input.initialPrice;
  let currentMomentumPct = input.initialMomentumPct;

  for (const event of input.approvedEvents ?? []) {
    const existing = eventByDay.get(event.day);
    if (existing) {
      existing.impactPct += event.impactPct;
      existing.isMajorEvent = existing.isMajorEvent || event.isMajorEvent === true;
    } else {
      eventByDay.set(event.day, {
        impactPct: event.impactPct,
        isMajorEvent: event.isMajorEvent === true,
      });
    }
  }
  for (const effect of input.dailyMarketIndexEffects ?? []) {
    marketByDay.set(effect.day, effect.marketIndexEffectPct);
  }

  for (let day = 1; day <= input.days; day += 1) {
    const event = eventByDay.get(day);
    const meanReversionPct = Math.min(
      2,
      Math.max(
        -2,
        configuration.meanReversionStrength * Math.log(input.fairValue / currentPrice) * 100,
      ),
    );
    const rawTotalChangePct =
      (event?.impactPct ?? 0) + currentMomentumPct + meanReversionPct + (marketByDay.get(day) ?? 0);
    const movementCapPct = event?.isMajorEvent === true ? 18 : 7;
    const clampedTotalChangePct = Math.min(
      movementCapPct,
      Math.max(-movementCapPct, rawTotalChangePct),
    );

    currentPrice = roundBerryForTest(
      Math.max(0.01, currentPrice * (1 + clampedTotalChangePct / 100)),
    );
    currentMomentumPct = Math.min(
      5,
      Math.max(
        -5,
        currentMomentumPct * configuration.momentumDecay +
          (event?.impactPct ?? 0) * configuration.eventMomentumCarry,
      ),
    );
  }

  return currentPrice;
};

const runScenario = (name: string) => {
  const scenario = scenarioByName.get(name);
  assert.ok(scenario, `Missing scenario: ${name}`);
  return simulateMarketMovement(scenario.input);
};

const assertFiniteSimulation = (input: SimulationInput): void => {
  const result = simulateMarketMovement(input);

  for (const day of result.days) {
    assert.equal(Number.isFinite(day.startingPrice), true);
    assert.equal(Number.isFinite(day.endingPrice), true);
    assert.equal(Number.isFinite(day.clampedTotalChangePct), true);
    assert.equal(Number.isFinite(day.endingMomentumPct), true);
  }
  assert.equal(Number.isFinite(result.summary.endingPrice), true);
  assert.equal(Number.isFinite(result.summary.percentageReturnPct), true);
};

test("simulation validates day, price, momentum, event, and market-effect boundaries", () => {
  assert.doesNotThrow(() =>
    simulateMarketMovement({
      initialPrice: 100,
      fairValue: 100,
      category: "growth",
      initialMomentumPct: -5,
      days: 1,
      approvedEvents: [{ day: 1, impactPct: -30 }],
      dailyMarketIndexEffects: [{ day: 1, marketIndexEffectPct: -1 }],
    }),
  );
  assert.doesNotThrow(() =>
    simulateMarketMovement({
      initialPrice: 100,
      fairValue: 100,
      category: "growth",
      initialMomentumPct: 5,
      days: 365,
      approvedEvents: [{ day: 365, impactPct: 30, isMajorEvent: true }],
      dailyMarketIndexEffects: [{ day: 365, marketIndexEffectPct: 1 }],
    }),
  );
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 0,
        fairValue: 100,
        category: "growth",
        initialMomentumPct: 0,
        days: 1,
      }),
    /initialPrice/,
  );
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 100,
        fairValue: 0,
        category: "growth",
        initialMomentumPct: 0,
        days: 1,
      }),
    /fairValue/,
  );
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 100,
        fairValue: 100,
        category: "growth",
        initialMomentumPct: 0,
        days: 0,
      }),
    /days/,
  );
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 100,
        fairValue: 100,
        category: "growth",
        initialMomentumPct: 0,
        days: 366,
      }),
    /days/,
  );
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 100,
        fairValue: 100,
        category: "growth",
        initialMomentumPct: 5.01,
        days: 1,
      }),
    /initialMomentumPct/,
  );
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 100,
        fairValue: 100,
        category: "growth",
        initialMomentumPct: 0,
        days: 1,
        approvedEvents: [{ day: 2, impactPct: 1 }],
      }),
    /approved event day/,
  );
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 100,
        fairValue: 100,
        category: "growth",
        initialMomentumPct: 0,
        days: 1,
        dailyMarketIndexEffects: [{ day: 1, marketIndexEffectPct: 1.01 }],
      }),
    /marketIndexEffectPct/,
  );
});

test("same-day approved events are summed deterministically", () => {
  const first = simulateMarketMovement({
    initialPrice: 100,
    fairValue: 100,
    category: "growth",
    initialMomentumPct: 0,
    days: 2,
    approvedEvents: [
      { day: 1, impactPct: 5, label: "first" },
      { day: 1, impactPct: 6, label: "second" },
    ],
  });
  const second = simulateMarketMovement({
    initialPrice: 100,
    fairValue: 100,
    category: "growth",
    initialMomentumPct: 0,
    days: 2,
    approvedEvents: [
      { day: 1, impactPct: 6, label: "second" },
      { day: 1, impactPct: 5, label: "first" },
    ],
  });
  const normalizedEvents = normalizeApprovedEvents(
    [
      { day: 1, impactPct: 5 },
      { day: 1, impactPct: 6 },
    ],
    2,
  );

  assert.equal(normalizedEvents.get(1)?.approvedEventImpactPct, 11);
  assert.deepEqual(first, second);
  assert.equal(first.days[0].approvedEventImpactPct, 11);
});

test("mixed same-day major events preserve arithmetic regardless of input order", () => {
  const firstEvents: ApprovedEventImpact[] = [
    { day: 1, impactPct: 8, isMajorEvent: false, label: "minor" },
    { day: 1, impactPct: 4, isMajorEvent: true, label: "major" },
  ];
  const secondEvents: ApprovedEventImpact[] = [...firstEvents].reverse();
  const first = simulateMarketMovement({
    initialPrice: 100,
    fairValue: 100,
    category: "blue_chip",
    initialMomentumPct: 0,
    days: 2,
    approvedEvents: firstEvents,
  });
  const second = simulateMarketMovement({
    initialPrice: 100,
    fairValue: 100,
    category: "blue_chip",
    initialMomentumPct: 0,
    days: 2,
    approvedEvents: secondEvents,
  });
  const normalized = normalizeApprovedEvents(firstEvents, 2);

  assert.equal(normalized.get(1)?.approvedEventImpactPct, 12);
  assert.equal(normalized.get(1)?.isMajorEvent, true);
  assert.equal(first.days[0].approvedEventImpactPct, 12);
  assert.equal(first.days[0].isMajorEvent, true);
  assert.equal(first.days[0].appliedMovementCapPct, 12);
  assert.deepEqual(first.days, second.days);
  assert.deepEqual(first.summary, second.summary);
});

test("same-day approved event sums are rejected when the combined impact is out of range", () => {
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 100,
        fairValue: 100,
        category: "growth",
        initialMomentumPct: 0,
        days: 1,
        approvedEvents: [
          { day: 1, impactPct: 20 },
          { day: 1, impactPct: 11 },
        ],
      }),
    /combined approvedEventImpactPct/,
  );
});

test("duplicate market index effects are rejected clearly", () => {
  assert.throws(
    () =>
      simulateMarketMovement({
        initialPrice: 100,
        fairValue: 100,
        category: "growth",
        initialMomentumPct: 0,
        days: 1,
        dailyMarketIndexEffects: [
          { day: 1, marketIndexEffectPct: 0.25 },
          { day: 1, marketIndexEffectPct: 0.25 },
        ],
      }),
    /Duplicate market index effect/,
  );
});

test("Scenario A remains unchanged for 30 inactive fair-value days", () => {
  const result = runScenario("Scenario A - no events for 30 days");

  assert.equal(result.days.length, 30);
  assert.equal(result.summary.startingPrice, 100);
  assert.equal(result.summary.endingPrice, 100);
  assert.equal(result.summary.absoluteReturn, 0);
  assert.equal(result.summary.percentageReturnPct, 0);
  assert.equal(result.summary.numberOfCappedDays, 0);
  assert.equal(result.summary.minimumPrice, 100);
  assert.equal(result.summary.maximumPrice, 100);
  assert.equal(result.summary.finalPriceDifferenceFromFairValuePct, 0);
  assert.equal(result.summary.totalApprovedEventImpactPct, 0);
});

test("Scenario B moves an underpriced character upward without violent overshoot", () => {
  const result = runScenario("Scenario B - underpriced character for 30 days");

  assert.ok(result.summary.endingPrice > result.summary.startingPrice);
  assert.ok(Math.abs(result.summary.finalPriceDifferenceFromFairValuePct) < 40);
  assert.equal(result.summary.numberOfCappedDays, 0);
  assert.ok(
    result.days.every((day) => Math.abs(day.clampedTotalChangePct) <= day.appliedMovementCapPct),
  );
});

test("Scenario C moves an overpriced character downward toward fair value", () => {
  const result = runScenario("Scenario C - overpriced character for 30 days");

  assert.ok(result.summary.endingPrice < result.summary.startingPrice);
  assert.ok(Math.abs(result.summary.finalPriceDifferenceFromFairValuePct) < 60);
  assert.equal(result.summary.numberOfCappedDays, 0);
});

test("Scenario D applies a major positive event cap and carries decaying momentum", () => {
  const result = runScenario("Scenario D - one major positive event");
  const eventDay = result.days[4];
  const nextDay = result.days[5];
  const laterDay = result.days[6];

  assert.equal(eventDay.isMajorEvent, true);
  assert.equal(eventDay.appliedMovementCapPct, 18);
  assert.equal(eventDay.clampedTotalChangePct, 18);
  assert.ok(nextDay.momentumContributionPct > 0);
  assert.ok(laterDay.momentumContributionPct < nextDay.momentumContributionPct);
  assert.ok(result.days[29].clampedTotalChangePct < nextDay.clampedTotalChangePct);
});

test("major-event cap does not persist into residual-momentum days", () => {
  const result = simulateMarketMovement({
    initialPrice: 100,
    fairValue: 100,
    category: "blue_chip",
    initialMomentumPct: 0,
    days: 2,
    approvedEvents: [{ day: 1, impactPct: 20, isMajorEvent: true }],
  });
  const eventDay = result.days[0];
  const residualMomentumDay = result.days[1];

  assert.equal(eventDay.isMajorEvent, true);
  assert.equal(eventDay.appliedMovementCapPct, 12);
  assert.equal(eventDay.clampedTotalChangePct, 12);
  assert.equal(residualMomentumDay.isMajorEvent, false);
  assert.equal(residualMomentumDay.appliedMovementCapPct, 4);
  assert.equal(residualMomentumDay.clampedTotalChangePct, 4);
});

test("Scenario E applies a major negative event cap and remains above the price floor", () => {
  const result = runScenario("Scenario E - one major negative event");
  const eventDay = result.days[4];
  const nextDay = result.days[5];

  assert.equal(eventDay.isMajorEvent, true);
  assert.equal(eventDay.appliedMovementCapPct, 25);
  assert.equal(eventDay.clampedTotalChangePct, -25);
  assert.ok(nextDay.momentumContributionPct < 0);
  assert.ok(result.summary.minimumPrice > 0.01);
});

test("Scenario F repeated positive events remain finite, capped, and explainable", () => {
  const result = runScenario("Scenario F - repeated positive events");

  assertFiniteSimulation(scenarioByName.get("Scenario F - repeated positive events")!.input);
  assert.ok(result.summary.numberOfCappedDays > 0);
  assert.ok(result.days.every((day) => Math.abs(day.endingMomentumPct) <= 5));
  assert.ok(result.summary.maximumPrice < 1000);
});

test("Scenario G inactive near-fair character has no unexplained meaningful movement", () => {
  const result = runScenario("Scenario G - inactive character");

  assert.equal(result.summary.numberOfCappedDays, 0);
  assert.ok(Math.abs(result.summary.percentageReturnPct) < 2);
  assert.ok(Math.abs(result.summary.finalPriceDifferenceFromFairValuePct) < 2);
});

test("Scenario H category comparison respects different normal caps", () => {
  const blueChip = runScenario("Scenario H - category comparison blue_chip");
  const growth = runScenario("Scenario H - category comparison growth");
  const speculative = runScenario("Scenario H - category comparison speculative");
  const meme = runScenario("Scenario H - category comparison meme");

  assert.equal(blueChip.days[0].clampedTotalChangePct, 4);
  assert.equal(growth.days[0].clampedTotalChangePct, 7);
  assert.equal(speculative.days[0].clampedTotalChangePct, 12);
  assert.equal(meme.days[0].clampedTotalChangePct, 18);
  assert.ok(blueChip.summary.endingPrice < growth.summary.endingPrice);
  assert.ok(growth.summary.endingPrice < speculative.summary.endingPrice);
  assert.ok(speculative.summary.endingPrice < meme.summary.endingPrice);
});

test("90-day stability scenario has the requested length and remains deterministic", () => {
  const scenario = scenarioByName.get("90-day stability - overpriced drift")!;
  const first = simulateMarketMovement(scenario.input);
  const second = simulateMarketMovement(scenario.input);

  assert.equal(first.days.length, 90);
  assert.ok(first.summary.endingPrice < first.summary.startingPrice);
  assert.ok(Math.abs(first.summary.finalPriceDifferenceFromFairValuePct) < 20);
  assert.deepEqual(first, second);
});

test("rounded public prices do not feed back into later simulation days", () => {
  const input: SimulationInput = {
    initialPrice: 123.456,
    fairValue: 141.789,
    category: "growth",
    initialMomentumPct: 0.777,
    days: 6,
    approvedEvents: [
      { day: 2, impactPct: 0.333 },
      { day: 5, impactPct: -0.222 },
    ],
    dailyMarketIndexEffects: [{ day: 3, marketIndexEffectPct: 0.111 }],
  };
  const result = simulateMarketMovement(input);
  const fullPrecision = calculateFullPrecisionExpected(input);
  const roundedFeedbackFinalPrice = calculateRoundedFeedbackFinalPrice(input);

  assert.equal(result.summary.endingPrice, roundBerryForTest(fullPrecision.finalPrice));
  assert.notEqual(
    roundBerryForTest(fullPrecision.finalPrice),
    roundBerryForTest(roundedFeedbackFinalPrice),
  );
  assert.notEqual(result.summary.endingPrice, roundBerryForTest(roundedFeedbackFinalPrice));
});

test("summary metrics use full-precision state consistently", () => {
  const input: SimulationInput = {
    initialPrice: 101.137,
    fairValue: 103.333,
    category: "growth",
    initialMomentumPct: 0.321,
    days: 4,
    approvedEvents: [
      { day: 1, impactPct: 7.5 },
      { day: 3, impactPct: -0.456 },
    ],
    dailyMarketIndexEffects: [
      { day: 1, marketIndexEffectPct: 0.111 },
      { day: 4, marketIndexEffectPct: -0.222 },
    ],
    configuration: {
      meanReversionStrength: 0.04,
      momentumDecay: 0.6,
      eventMomentumCarry: 0.2,
    },
  };
  const result = simulateMarketMovement(input);
  const expected = calculateFullPrecisionExpected(input);
  const expectedFinalPrice = expected.finalPrice;
  const expectedAbsoluteReturn = expectedFinalPrice - input.initialPrice;
  const expectedPercentageReturnPct = (expectedAbsoluteReturn / input.initialPrice) * 100;
  const expectedFinalDistancePct = ((expectedFinalPrice - input.fairValue) / input.fairValue) * 100;

  assert.equal(result.summary.endingPrice, roundBerryForTest(expectedFinalPrice));
  assert.equal(result.summary.absoluteReturn, roundBerryForTest(expectedAbsoluteReturn));
  assert.equal(
    result.summary.percentageReturnPct,
    roundPercentForTest(expectedPercentageReturnPct),
  );
  assert.equal(result.summary.minimumPrice, roundBerryForTest(Math.min(...expected.priceHistory)));
  assert.equal(result.summary.maximumPrice, roundBerryForTest(Math.max(...expected.priceHistory)));
  assert.equal(
    result.summary.finalPriceDifferenceFromFairValuePct,
    roundPercentForTest(expectedFinalDistancePct),
  );
  assert.equal(
    result.summary.totalApprovedEventImpactPct,
    roundPercentForTest(expected.totalApprovedEventImpactPct),
  );
  assert.equal(result.summary.numberOfCappedDays, expected.cappedDays);
});

test("largest gain and loss ties choose the earliest day deterministically", () => {
  const tiedGains = simulateMarketMovement({
    initialPrice: 100,
    fairValue: 100,
    category: "growth",
    initialMomentumPct: 0,
    days: 3,
    approvedEvents: [
      { day: 1, impactPct: 3 },
      { day: 2, impactPct: 3 },
    ],
    configuration: {
      meanReversionStrength: 0,
      momentumDecay: 0,
      eventMomentumCarry: 0,
    },
  });
  const tiedLosses = simulateMarketMovement({
    initialPrice: 100,
    fairValue: 100,
    category: "growth",
    initialMomentumPct: 0,
    days: 3,
    approvedEvents: [
      { day: 1, impactPct: -3 },
      { day: 2, impactPct: -3 },
    ],
    configuration: {
      meanReversionStrength: 0,
      momentumDecay: 0,
      eventMomentumCarry: 0,
    },
  });

  assert.equal(tiedGains.days[0].clampedTotalChangePct, tiedGains.days[1].clampedTotalChangePct);
  assert.equal(tiedGains.summary.largestGainDay.day, 1);
  assert.equal(tiedLosses.days[0].clampedTotalChangePct, tiedLosses.days[1].clampedTotalChangePct);
  assert.equal(tiedLosses.summary.largestLossDay.day, 1);
});

test("simulation configuration overrides change deterministic outcomes", () => {
  const baselineInput: SimulationInput = {
    initialPrice: 80,
    fairValue: 120,
    category: "growth",
    initialMomentumPct: 2,
    days: 3,
    approvedEvents: [{ day: 1, impactPct: 6 }],
  };
  const baseline = simulateMarketMovement(baselineInput);
  const noMeanReversion = simulateMarketMovement({
    ...baselineInput,
    configuration: { meanReversionStrength: 0 },
  });
  const fasterMomentumDecay = simulateMarketMovement({
    ...baselineInput,
    configuration: { momentumDecay: 0.25 },
  });
  const lowerEventMomentumCarry = simulateMarketMovement({
    ...baselineInput,
    configuration: { eventMomentumCarry: 0.1 },
  });

  assert.notEqual(noMeanReversion.days[0].meanReversionPct, baseline.days[0].meanReversionPct);
  assert.notEqual(noMeanReversion.summary.endingPrice, baseline.summary.endingPrice);
  assert.notEqual(
    fasterMomentumDecay.days[2].momentumContributionPct,
    baseline.days[2].momentumContributionPct,
  );
  assert.notEqual(
    lowerEventMomentumCarry.days[1].momentumContributionPct,
    baseline.days[1].momentumContributionPct,
  );
  assert.deepEqual(
    simulateMarketMovement({ ...baselineInput, configuration: { momentumDecay: 0.25 } }),
    fasterMomentumDecay,
  );
});

test("simulation rejects invalid configuration override boundaries", () => {
  const input: SimulationInput = {
    initialPrice: 100,
    fairValue: 100,
    category: "growth",
    initialMomentumPct: 0,
    days: 1,
  };

  assert.throws(
    () => simulateMarketMovement({ ...input, configuration: { meanReversionStrength: -0.01 } }),
    /meanReversionStrength/,
  );
  assert.throws(
    () => simulateMarketMovement({ ...input, configuration: { meanReversionStrength: 0.26 } }),
    /meanReversionStrength/,
  );
  assert.throws(
    () => simulateMarketMovement({ ...input, configuration: { momentumDecay: -0.01 } }),
    /momentumDecay/,
  );
  assert.throws(
    () => simulateMarketMovement({ ...input, configuration: { momentumDecay: 1.01 } }),
    /momentumDecay/,
  );
  assert.throws(
    () => simulateMarketMovement({ ...input, configuration: { eventMomentumCarry: -0.01 } }),
    /eventMomentumCarry/,
  );
  assert.throws(
    () => simulateMarketMovement({ ...input, configuration: { eventMomentumCarry: 1.01 } }),
    /eventMomentumCarry/,
  );
});

test("simulation does not mutate caller-provided input objects", () => {
  const approvedEvents: ApprovedEventImpact[] = [
    { day: 1, impactPct: 2, label: "first" },
    { day: 1, impactPct: 3, isMajorEvent: true, label: "second" },
  ];
  const dailyMarketIndexEffects: DailyMarketIndexEffect[] = [
    { day: 2, marketIndexEffectPct: 0.25 },
  ];
  const configuration: Partial<MovementConfiguration> = {
    meanReversionStrength: 0.04,
    momentumDecay: 0.5,
    eventMomentumCarry: 0.25,
  };
  const input: SimulationInput = {
    initialPrice: 100,
    fairValue: 110,
    category: "growth",
    initialMomentumPct: 0.5,
    days: 3,
    approvedEvents,
    dailyMarketIndexEffects,
    configuration,
  };
  const before = structuredClone(input);

  for (const event of approvedEvents) Object.freeze(event);
  Object.freeze(approvedEvents);
  for (const effect of dailyMarketIndexEffects) Object.freeze(effect);
  Object.freeze(dailyMarketIndexEffects);
  Object.freeze(configuration);
  Object.freeze(input);

  assert.doesNotThrow(() => simulateMarketMovement(input));
  assert.deepEqual(input, before);
});

test("simulation suite returns deterministic summary rows for every documented scenario", () => {
  const first = runMarketPricingSimulationSuite();
  const second = runMarketPricingSimulationSuite();

  assert.equal(first.scenarios.length, SIMULATION_SCENARIOS.length);
  assert.equal(first.summaryRows.length, SIMULATION_SCENARIOS.length);
  assert.deepEqual(first, second);
});
