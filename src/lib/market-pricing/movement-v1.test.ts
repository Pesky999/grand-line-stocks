/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MOVEMENT_CONFIGURATION,
  MOVEMENT_LIMITS,
  calculateDailyMovement,
  calculateMeanReversionPct,
  calculateNextMomentumPct,
  type CharacterMovementInput,
} from "./movement-v1.js";

const baseInput: CharacterMovementInput = {
  currentPrice: 100,
  fairValue: 100,
  category: "growth",
  currentMomentumPct: 0,
  approvedEventImpactPct: 0,
  marketIndexEffectPct: 0,
};

const roundForTest = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const hasWarning = (
  result: ReturnType<typeof calculateDailyMovement>,
  warningText: string,
): boolean => result.warnings.some((warning) => warning.includes(warningText));

const MAJOR_EVENT_WARNING = "Major-event movement cap was applicable.";

test("movement configuration defaults are explicit", () => {
  assert.deepEqual(DEFAULT_MOVEMENT_CONFIGURATION, {
    meanReversionStrength: 0.05,
    momentumDecay: 0.75,
    eventMomentumCarry: 0.35,
  });
});

test("mean reversion points underpriced characters upward and overpriced characters downward", () => {
  assert.equal(calculateMeanReversionPct(100, 100), 0);
  assert.ok(calculateMeanReversionPct(80, 100) > 0);
  assert.ok(calculateMeanReversionPct(120, 100) < 0);
});

test("mean reversion clamps to the approved daily range", () => {
  assert.equal(calculateMeanReversionPct(1, 1000), MOVEMENT_LIMITS.maximumMeanReversionPct);
  assert.equal(calculateMeanReversionPct(1000, 1), MOVEMENT_LIMITS.minimumMeanReversionPct);
});

test("momentum decays and approved event impact carries into future momentum", () => {
  assert.equal(calculateNextMomentumPct(4, 0), 3);
  assert.equal(calculateNextMomentumPct(0, 10), 3.5);
  assert.equal(calculateNextMomentumPct(4, 10), 5);
  assert.equal(calculateNextMomentumPct(-4, -10), -5);
});

test("daily movement validates inclusive input boundaries", () => {
  assert.doesNotThrow(() =>
    calculateDailyMovement({
      ...baseInput,
      currentMomentumPct: -5,
      approvedEventImpactPct: -30,
      marketIndexEffectPct: -1,
    }),
  );
  assert.doesNotThrow(() =>
    calculateDailyMovement({
      ...baseInput,
      currentMomentumPct: 5,
      approvedEventImpactPct: 30,
      marketIndexEffectPct: 1,
      isMajorEvent: true,
    }),
  );
  assert.doesNotThrow(() =>
    calculateDailyMovement({
      ...baseInput,
      configuration: {
        meanReversionStrength: 0,
        momentumDecay: 0,
        eventMomentumCarry: 0,
      },
    }),
  );
  assert.doesNotThrow(() =>
    calculateDailyMovement({
      ...baseInput,
      configuration: {
        meanReversionStrength: 0.25,
        momentumDecay: 1,
        eventMomentumCarry: 1,
      },
    }),
  );
});

test("daily movement rejects invalid prices, components, and configuration", () => {
  assert.throws(() => calculateDailyMovement({ ...baseInput, currentPrice: 0 }), /currentPrice/);
  assert.throws(() => calculateDailyMovement({ ...baseInput, fairValue: 0 }), /fairValue/);
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, currentPrice: Number.NaN }),
    /currentPrice/,
  );
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, currentMomentumPct: -5.01 }),
    /currentMomentumPct/,
  );
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, currentMomentumPct: 5.01 }),
    /currentMomentumPct/,
  );
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, approvedEventImpactPct: -30.01 }),
    /approvedEventImpactPct/,
  );
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, approvedEventImpactPct: 30.01 }),
    /approvedEventImpactPct/,
  );
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, marketIndexEffectPct: -1.01 }),
    /marketIndexEffectPct/,
  );
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, marketIndexEffectPct: 1.01 }),
    /marketIndexEffectPct/,
  );
  assert.throws(
    () =>
      calculateDailyMovement({
        ...baseInput,
        configuration: { meanReversionStrength: 0.26 },
      }),
    /meanReversionStrength/,
  );
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, configuration: { momentumDecay: 1.01 } }),
    /momentumDecay/,
  );
  assert.throws(
    () => calculateDailyMovement({ ...baseInput, configuration: { eventMomentumCarry: -0.01 } }),
    /eventMomentumCarry/,
  );
});

test("category normal caps constrain ordinary days", () => {
  const result = calculateDailyMovement({
    ...baseInput,
    category: "blue_chip",
    approvedEventImpactPct: 20,
  });

  assert.equal(result.appliedMovementCapPct, 4);
  assert.equal(result.clampedTotalChangePct, 4);
  assert.equal(result.nextPrice, 104);
  assert.equal(hasWarning(result, "category cap"), true);
});

test("category major-event caps apply only when explicitly requested", () => {
  const ordinary = calculateDailyMovement({
    ...baseInput,
    category: "blue_chip",
    approvedEventImpactPct: 20,
  });
  const major = calculateDailyMovement({
    ...baseInput,
    category: "blue_chip",
    approvedEventImpactPct: 20,
    isMajorEvent: true,
  });

  assert.equal(ordinary.appliedMovementCapPct, 4);
  assert.equal(major.appliedMovementCapPct, 12);
  assert.equal(major.clampedTotalChangePct, 12);
  assert.equal(major.warnings.includes(MAJOR_EVENT_WARNING), true);
});

test("exact cap boundaries do not emit cap warnings", () => {
  const cases: Array<{
    name: string;
    input: CharacterMovementInput;
    expectedCap: number;
    expectedChange: number;
  }> = [
    {
      name: "normal positive cap",
      input: { ...baseInput, category: "growth", approvedEventImpactPct: 7 },
      expectedCap: 7,
      expectedChange: 7,
    },
    {
      name: "normal negative cap",
      input: { ...baseInput, category: "growth", approvedEventImpactPct: -7 },
      expectedCap: 7,
      expectedChange: -7,
    },
    {
      name: "major positive cap",
      input: { ...baseInput, category: "growth", approvedEventImpactPct: 18, isMajorEvent: true },
      expectedCap: 18,
      expectedChange: 18,
    },
    {
      name: "major negative cap",
      input: { ...baseInput, category: "growth", approvedEventImpactPct: -18, isMajorEvent: true },
      expectedCap: 18,
      expectedChange: -18,
    },
  ];

  for (const testCase of cases) {
    const result = calculateDailyMovement(testCase.input);

    assert.equal(result.rawTotalChangePct, testCase.expectedChange, testCase.name);
    assert.equal(result.appliedMovementCapPct, testCase.expectedCap, testCase.name);
    assert.equal(result.clampedTotalChangePct, testCase.expectedChange, testCase.name);
    assert.equal(hasWarning(result, "category cap"), false, testCase.name);
  }
});

test("positive and negative movements are capped symmetrically", () => {
  const ordinaryPositive = calculateDailyMovement({
    ...baseInput,
    category: "speculative",
    approvedEventImpactPct: 20,
  });
  const ordinaryNegative = calculateDailyMovement({
    ...baseInput,
    category: "speculative",
    approvedEventImpactPct: -20,
  });
  const majorPositive = calculateDailyMovement({
    ...baseInput,
    category: "speculative",
    approvedEventImpactPct: 30,
    isMajorEvent: true,
  });
  const majorNegative = calculateDailyMovement({
    ...baseInput,
    category: "speculative",
    approvedEventImpactPct: -30,
    isMajorEvent: true,
  });

  assert.equal(ordinaryPositive.clampedTotalChangePct, 12);
  assert.equal(ordinaryNegative.clampedTotalChangePct, -12);
  assert.equal(majorPositive.clampedTotalChangePct, 25);
  assert.equal(majorNegative.clampedTotalChangePct, -25);
});

test("market index effect is accepted as an explicit component only", () => {
  const result = calculateDailyMovement({
    ...baseInput,
    marketIndexEffectPct: 1,
  });

  assert.equal(result.marketIndexEffectPct, 1);
  assert.equal(result.rawTotalChangePct, 1);
  assert.equal(result.nextPrice, 101);
});

test("price floor prevents non-positive Berry values", () => {
  const result = calculateDailyMovement({
    ...baseInput,
    currentPrice: 0.011,
    fairValue: 0.011,
    category: "meme",
    approvedEventImpactPct: -30,
  });

  assert.equal(result.preciseNextPrice, 0.01);
  assert.equal(result.nextPrice, 0.01);
  assert.equal(hasWarning(result, "Berry 0.01 floor"), true);
});

test("full precision is used before public Berry price rounding", () => {
  const result = calculateDailyMovement({
    ...baseInput,
    currentPrice: 123.45,
    fairValue: 140,
    approvedEventImpactPct: 0.333,
    currentMomentumPct: 0.777,
    marketIndexEffectPct: 0.222,
  });
  const expectedMeanReversionPct = 0.05 * Math.log(140 / 123.45) * 100;
  const expectedRawTotalChangePct = 0.333 + 0.777 + expectedMeanReversionPct + 0.222;
  const expectedPreciseNextPrice = 123.45 * (1 + expectedRawTotalChangePct / 100);

  assert.equal(result.meanReversionPct, expectedMeanReversionPct);
  assert.equal(result.rawTotalChangePct, expectedRawTotalChangePct);
  assert.equal(result.preciseNextPrice, expectedPreciseNextPrice);
  assert.equal(result.nextPrice, roundForTest(expectedPreciseNextPrice));
});

test("warnings are deterministic and informational", () => {
  const result = calculateDailyMovement({
    ...baseInput,
    currentPrice: 200,
    fairValue: 100,
    category: "blue_chip",
    currentMomentumPct: 4.5,
    approvedEventImpactPct: 20,
  });

  assert.equal(result.nextPrice, 208);
  assert.equal(hasWarning(result, "fair value"), true);
  assert.equal(hasWarning(result, "category cap"), true);
  assert.equal(hasWarning(result, "Momentum"), true);
});

test("warning boundaries are exact", () => {
  const fairValueBoundary = calculateDailyMovement({
    ...baseInput,
    currentPrice: 150,
    fairValue: 100,
  });
  const fairValueOverBoundary = calculateDailyMovement({
    ...baseInput,
    currentPrice: 150.01,
    fairValue: 100,
  });
  const positiveMomentumNearBoundary = calculateDailyMovement({
    ...baseInput,
    currentMomentumPct: 4.49,
  });
  const positiveMomentumBoundary = calculateDailyMovement({
    ...baseInput,
    currentMomentumPct: 4.5,
  });
  const negativeMomentumNearBoundary = calculateDailyMovement({
    ...baseInput,
    currentMomentumPct: -4.49,
  });
  const negativeMomentumBoundary = calculateDailyMovement({
    ...baseInput,
    currentMomentumPct: -4.5,
  });
  const exactFloor = calculateDailyMovement({
    ...baseInput,
    currentPrice: 0.013333333333333334,
    fairValue: 0.013333333333333334,
    category: "speculative",
    approvedEventImpactPct: -25,
    isMajorEvent: true,
  });
  const belowFloor = calculateDailyMovement({
    ...baseInput,
    currentPrice: 0.011,
    fairValue: 0.011,
    category: "meme",
    approvedEventImpactPct: -30,
    isMajorEvent: true,
  });
  const capBoundary = calculateDailyMovement({
    ...baseInput,
    category: "growth",
    approvedEventImpactPct: 7,
  });
  const capExceeded = calculateDailyMovement({
    ...baseInput,
    category: "growth",
    approvedEventImpactPct: 7.01,
  });
  const ordinaryDay = calculateDailyMovement(baseInput);
  const majorDay = calculateDailyMovement({
    ...baseInput,
    isMajorEvent: true,
  });

  assert.equal(hasWarning(fairValueBoundary, "fair value"), false);
  assert.equal(hasWarning(fairValueOverBoundary, "fair value"), true);
  assert.equal(hasWarning(positiveMomentumNearBoundary, "Momentum"), false);
  assert.equal(hasWarning(positiveMomentumBoundary, "Momentum"), true);
  assert.equal(hasWarning(negativeMomentumNearBoundary, "Momentum"), false);
  assert.equal(hasWarning(negativeMomentumBoundary, "Momentum"), true);
  assert.equal(exactFloor.nextPrice, 0.01);
  assert.equal(hasWarning(exactFloor, "Berry 0.01 floor"), false);
  assert.equal(belowFloor.nextPrice, 0.01);
  assert.equal(hasWarning(belowFloor, "Berry 0.01 floor"), true);
  assert.equal(hasWarning(capBoundary, "category cap"), false);
  assert.equal(hasWarning(capExceeded, "category cap"), true);
  assert.equal(ordinaryDay.warnings.includes(MAJOR_EVENT_WARNING), false);
  assert.equal(majorDay.warnings.includes(MAJOR_EVENT_WARNING), true);
  assert.deepEqual(majorDay.warnings, [MAJOR_EVENT_WARNING]);
});
