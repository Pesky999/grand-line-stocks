/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNDAMENTAL_RATING_WEIGHTS,
  MARKET_PRICING_ALGORITHM_VERSION,
  STOCK_CATEGORY_MOVEMENT_LIMITS,
  calculateBaseFairValue,
  calculateIpoPricing,
  calculateWeightedScore,
  classifyConfidence,
  type CharacterValuationRatings,
  type IpoPricingInput,
} from "./v1.js";

const ratingFields = [
  "narrativeImportance",
  "currentRelevance",
  "strengthStatus",
  "popularity",
  "futurePotential",
  "investorConfidence",
  "volatility",
] as const satisfies ReadonlyArray<keyof CharacterValuationRatings>;

const allRatings = (value: number): CharacterValuationRatings => ({
  narrativeImportance: value,
  currentRelevance: value,
  strengthStatus: value,
  popularity: value,
  futurePotential: value,
  investorConfidence: value,
  volatility: value,
});

const baseInput: IpoPricingInput = {
  ratings: allRatings(50),
  category: "growth",
  comparableAdjustment: 1,
  uncertaintyDiscountPct: 0,
  launchCatalystPct: 0,
};

const roundForTest = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const hasWarning = (result: ReturnType<typeof calculateIpoPricing>, warningText: string): boolean =>
  result.warnings.some((warning) => warning.includes(warningText));

const exampleFixtures = [
  {
    name: "Established blue-chip placeholder",
    input: {
      ratings: {
        narrativeImportance: 92,
        currentRelevance: 85,
        strengthStatus: 90,
        popularity: 88,
        futurePotential: 75,
        investorConfidence: 90,
        volatility: 20,
      },
      category: "blue_chip",
      comparableAdjustment: 1.05,
      uncertaintyDiscountPct: 4,
      launchCatalystPct: 0,
    },
  },
  {
    name: "New growth placeholder",
    input: {
      ratings: {
        narrativeImportance: 62,
        currentRelevance: 70,
        strengthStatus: 58,
        popularity: 55,
        futurePotential: 78,
        investorConfidence: 60,
        volatility: 45,
      },
      category: "growth",
      comparableAdjustment: 0.95,
      uncertaintyDiscountPct: 12,
      launchCatalystPct: 8,
    },
  },
  {
    name: "Speculative low-confidence placeholder",
    input: {
      ratings: {
        narrativeImportance: 40,
        currentRelevance: 35,
        strengthStatus: 45,
        popularity: 68,
        futurePotential: 82,
        investorConfidence: 38,
        volatility: 90,
      },
      category: "speculative",
      comparableAdjustment: 0.82,
      uncertaintyDiscountPct: 22,
      launchCatalystPct: -18,
    },
  },
] as const satisfies ReadonlyArray<{ name: string; input: IpoPricingInput }>;

test("fundamental rating weights total 1 and exclude volatility", () => {
  const totalWeight = Object.values(FUNDAMENTAL_RATING_WEIGHTS).reduce(
    (total, weight) => total + weight,
    0,
  );

  assert.equal(totalWeight, 1);
  assert.equal("volatility" in FUNDAMENTAL_RATING_WEIGHTS, false);
});

test("base fair value uses calibrated Candidate C checkpoints across the full score range", () => {
  const checkpoints = [
    [0, 50],
    [20, 102.38],
    [40, 209.65],
    [50, 300],
    [60, 429.29],
    [70, 614.29],
    [80, 879.03],
    [90, 1257.87],
    [100, 1799.97],
  ] as const;

  for (const [weightedScore, expectedBaseFairValue] of checkpoints) {
    assert.equal(calculateBaseFairValue(weightedScore), expectedBaseFairValue);
  }
});

test("all ratings at 0 produce score 0 and Berry 50.00 base value", () => {
  const ratings = allRatings(0);

  assert.equal(calculateWeightedScore(ratings), 0);
  assert.equal(calculateBaseFairValue(0), 50);
  assert.equal(calculateIpoPricing({ ...baseInput, ratings }).baseFairValue, 50);
});

test("all six fundamental ratings at 100 produce score 100 and approximately Berry 1,799.97", () => {
  const ratings = allRatings(100);
  const result = calculateIpoPricing({ ...baseInput, ratings });

  assert.equal(result.weightedScore, 100);
  assert.equal(result.baseFairValue, 1799.97);
});

test("ratings at 50 produce the expected rounded formula result", () => {
  const ratings = allRatings(50);
  const result = calculateIpoPricing({ ...baseInput, ratings });

  assert.equal(result.weightedScore, 50);
  assert.equal(result.baseFairValue, 300);
});

test("volatility does not affect weighted score or base fair value", () => {
  const lowVolatility = calculateIpoPricing({
    ...baseInput,
    ratings: { ...allRatings(50), volatility: 0 },
  });
  const highVolatility = calculateIpoPricing({
    ...baseInput,
    ratings: { ...allRatings(50), volatility: 100 },
  });

  assert.equal(lowVolatility.weightedScore, highVolatility.weightedScore);
  assert.equal(lowVolatility.baseFairValue, highVolatility.baseFairValue);
});

test("algorithm version is stable and explicit", () => {
  const result = calculateIpoPricing(baseInput);

  assert.equal(MARKET_PRICING_ALGORITHM_VERSION, "1.1.0");
  assert.equal(result.algorithmVersion, "1.1.0");
});

test("comparable adjustment applies directly to fair value", () => {
  const neutral = calculateIpoPricing({ ...baseInput, comparableAdjustment: 1 });
  const lower = calculateIpoPricing({ ...baseInput, comparableAdjustment: 0.9 });
  const higher = calculateIpoPricing({ ...baseInput, comparableAdjustment: 1.1 });

  assert.equal(neutral.comparableAdjustedFairValue, neutral.baseFairValue);
  assert.equal(lower.comparableAdjustedFairValue, 270);
  assert.equal(higher.comparableAdjustedFairValue, 330);
});

test("uncertainty discount lowers opening price", () => {
  const neutral = calculateIpoPricing({ ...baseInput, uncertaintyDiscountPct: 0 });
  const medium = calculateIpoPricing({ ...baseInput, uncertaintyDiscountPct: 15 });
  const high = calculateIpoPricing({ ...baseInput, uncertaintyDiscountPct: 25 });

  assert.equal(neutral.suggestedOpeningPrice, neutral.comparableAdjustedFairValue);
  assert.equal(medium.suggestedOpeningPrice, 255);
  assert.equal(high.suggestedOpeningPrice, 225);
});

test("launch catalyst is returned separately and supports positive, negative, and zero adjustments", () => {
  const zero = calculateIpoPricing({ ...baseInput, launchCatalystPct: 0 });
  const positive = calculateIpoPricing({ ...baseInput, launchCatalystPct: 10 });
  const negative = calculateIpoPricing({ ...baseInput, launchCatalystPct: -10 });

  assert.equal(zero.suggestedPostCatalystPrice, zero.suggestedOpeningPrice);
  assert.equal(positive.suggestedPostCatalystPrice, 330);
  assert.equal(negative.suggestedPostCatalystPrice, 270);
});

test("maximum valuation outputs reflect the calibrated Candidate C scale", () => {
  const result = calculateIpoPricing({
    ...baseInput,
    ratings: allRatings(100),
    comparableAdjustment: 1.25,
    uncertaintyDiscountPct: 0,
    launchCatalystPct: 30,
  });

  assert.equal(result.baseFairValue, 1799.97);
  assert.equal(result.comparableAdjustedFairValue, 2249.96);
  assert.equal(result.suggestedOpeningPrice, 2249.96);
  assert.equal(result.suggestedPostCatalystPrice, 2924.94);
});

test("confidence boundaries are deterministic", () => {
  assert.equal(classifyConfidence(5), "high");
  assert.equal(classifyConfidence(5.01), "medium");
  assert.equal(classifyConfidence(15), "medium");
  assert.equal(classifyConfidence(15.01), "low");
  assert.equal(classifyConfidence(25), "low");
});

test("validation rejects every rating field outside the inclusive 0 to 100 range", () => {
  for (const field of ratingFields) {
    assert.throws(
      () => calculateWeightedScore({ ...allRatings(50), [field]: -0.01 }),
      new RegExp(field),
    );
    assert.throws(
      () => calculateWeightedScore({ ...allRatings(50), [field]: 100.01 }),
      new RegExp(field),
    );
  }
});

test("validation rejects non-finite values across rating fields and IPO inputs", () => {
  assert.throws(
    () => calculateWeightedScore({ ...allRatings(50), narrativeImportance: Number.NaN }),
    /narrativeImportance/,
  );
  assert.throws(
    () => calculateWeightedScore({ ...allRatings(50), futurePotential: Infinity }),
    /futurePotential/,
  );
  assert.throws(
    () => calculateWeightedScore({ ...allRatings(50), volatility: -Infinity }),
    /volatility/,
  );
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, comparableAdjustment: Number.NaN }),
    /comparableAdjustment/,
  );
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, uncertaintyDiscountPct: Infinity }),
    /uncertaintyDiscountPct/,
  );
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, launchCatalystPct: -Infinity }),
    /launchCatalystPct/,
  );
});

test("IPO input validation rejects values outside approved ranges", () => {
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, comparableAdjustment: 0.74 }),
    /comparableAdjustment/,
  );
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, comparableAdjustment: 1.26 }),
    /comparableAdjustment/,
  );
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, uncertaintyDiscountPct: -1 }),
    /uncertaintyDiscountPct/,
  );
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, uncertaintyDiscountPct: 26 }),
    /uncertaintyDiscountPct/,
  );
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, launchCatalystPct: -31 }),
    /launchCatalystPct/,
  );
  assert.throws(
    () => calculateIpoPricing({ ...baseInput, launchCatalystPct: 31 }),
    /launchCatalystPct/,
  );
});

test("inclusive valid boundaries are accepted", () => {
  assert.doesNotThrow(() => calculateWeightedScore(allRatings(0)));
  assert.doesNotThrow(() => calculateWeightedScore(allRatings(100)));
  assert.doesNotThrow(() => calculateIpoPricing({ ...baseInput, comparableAdjustment: 0.75 }));
  assert.doesNotThrow(() => calculateIpoPricing({ ...baseInput, comparableAdjustment: 1.25 }));
  assert.doesNotThrow(() => calculateIpoPricing({ ...baseInput, uncertaintyDiscountPct: 0 }));
  assert.doesNotThrow(() => calculateIpoPricing({ ...baseInput, uncertaintyDiscountPct: 25 }));
  assert.doesNotThrow(() => calculateIpoPricing({ ...baseInput, launchCatalystPct: -30 }));
  assert.doesNotThrow(() => calculateIpoPricing({ ...baseInput, launchCatalystPct: 30 }));
});

test("invalid runtime category is rejected", () => {
  assert.throws(
    () =>
      calculateIpoPricing({
        ...baseInput,
        category: "invalid_category" as IpoPricingInput["category"],
      }),
    /Unsupported stock category/,
  );
});

test("warning boundaries are deterministic and exclusive", () => {
  const comparableAtLowerBoundary = calculateIpoPricing({
    ...baseInput,
    comparableAdjustment: 0.85,
  });
  const comparableAtUpperBoundary = calculateIpoPricing({
    ...baseInput,
    comparableAdjustment: 1.15,
  });
  const comparableBelowBoundary = calculateIpoPricing({ ...baseInput, comparableAdjustment: 0.84 });
  const comparableAboveBoundary = calculateIpoPricing({ ...baseInput, comparableAdjustment: 1.16 });
  const catalystAtLowerBoundary = calculateIpoPricing({ ...baseInput, launchCatalystPct: -15 });
  const catalystAtUpperBoundary = calculateIpoPricing({ ...baseInput, launchCatalystPct: 15 });
  const catalystBelowBoundary = calculateIpoPricing({ ...baseInput, launchCatalystPct: -15.01 });
  const catalystAboveBoundary = calculateIpoPricing({ ...baseInput, launchCatalystPct: 15.01 });

  assert.equal(hasWarning(comparableAtLowerBoundary, "Comparable"), false);
  assert.equal(hasWarning(comparableAtUpperBoundary, "Comparable"), false);
  assert.equal(hasWarning(comparableBelowBoundary, "Comparable"), true);
  assert.equal(hasWarning(comparableAboveBoundary, "Comparable"), true);
  assert.equal(hasWarning(catalystAtLowerBoundary, "Launch catalyst"), false);
  assert.equal(hasWarning(catalystAtUpperBoundary, "Launch catalyst"), false);
  assert.equal(hasWarning(catalystBelowBoundary, "Launch catalyst"), true);
  assert.equal(hasWarning(catalystAboveBoundary, "Launch catalyst"), true);

  const belowLowOpeningPrice = calculateIpoPricing({
    ...baseInput,
    ratings: allRatings(0),
    comparableAdjustment: 0.75,
    uncertaintyDiscountPct: 25,
  });
  const exactLowOpeningPrice = calculateIpoPricing({
    ...baseInput,
    ratings: allRatings(0),
    comparableAdjustment: 1,
    uncertaintyDiscountPct: 20,
  });
  const exactHighComparableAdjustment = 2000 / calculateBaseFairValue(100);
  const exactHighPrice = calculateIpoPricing({
    ...baseInput,
    ratings: allRatings(100),
    comparableAdjustment: exactHighComparableAdjustment,
    uncertaintyDiscountPct: 0,
  });
  const ordinaryElitePrice = calculateIpoPricing({
    ...baseInput,
    ratings: allRatings(100),
    comparableAdjustment: 1,
    uncertaintyDiscountPct: 0,
  });
  const aboveHighPrice = calculateIpoPricing({
    ...baseInput,
    ratings: allRatings(100),
    comparableAdjustment: 1.25,
    uncertaintyDiscountPct: 0,
  });

  assert.equal(belowLowOpeningPrice.suggestedOpeningPrice, 28.13);
  assert.equal(hasWarning(belowLowOpeningPrice, "below Berry 40"), true);
  assert.equal(exactLowOpeningPrice.suggestedOpeningPrice, 40);
  assert.equal(hasWarning(exactLowOpeningPrice, "below Berry 40"), false);
  assert.equal(exactHighPrice.suggestedOpeningPrice, 2000);
  assert.equal(hasWarning(exactHighPrice, "exceeds Berry 2,000"), false);
  assert.equal(ordinaryElitePrice.suggestedOpeningPrice, 1799.97);
  assert.equal(hasWarning(ordinaryElitePrice, "exceeds Berry 2,000"), false);
  assert.equal(aboveHighPrice.suggestedOpeningPrice, 2249.96);
  assert.equal(hasWarning(aboveHighPrice, "exceeds Berry 2,000"), true);
});

test("returned movement limits are safe copies of frozen shared category configuration", () => {
  const first = calculateIpoPricing({ ...baseInput, category: "growth" });

  first.movementLimits.normalMovementCapPct = 999;
  first.movementLimits.majorEventCapPct = 999;

  const second = calculateIpoPricing({ ...baseInput, category: "growth" });

  assert.equal(Object.isFrozen(STOCK_CATEGORY_MOVEMENT_LIMITS), true);
  assert.equal(Object.isFrozen(STOCK_CATEGORY_MOVEMENT_LIMITS.growth), true);
  assert.deepEqual(STOCK_CATEGORY_MOVEMENT_LIMITS.growth, {
    normalMovementCapPct: 7,
    majorEventCapPct: 18,
  });
  assert.deepEqual(second.movementLimits, {
    normalMovementCapPct: 7,
    majorEventCapPct: 18,
  });
  assert.notStrictEqual(first.movementLimits, second.movementLimits);
});

test("post-catalyst price uses raw opening price rather than rounded opening price", () => {
  const precisionFixture = {
    ...baseInput,
    ratings: allRatings(1),
    comparableAdjustment: 0.77,
    uncertaintyDiscountPct: 1.3,
    launchCatalystPct: -22.3,
  };
  const rawWeightedScore = 1;
  const result = calculateIpoPricing(precisionFixture);
  const incorrectRoundedOpeningPipeline = roundForTest(
    result.suggestedOpeningPrice * (1 + precisionFixture.launchCatalystPct / 100),
  );

  assert.equal(result.weightedScore, rawWeightedScore);
  assert.equal(result.suggestedOpeningPrice, 39.39);
  assert.equal(result.suggestedPostCatalystPrice, 30.6);
  assert.equal(incorrectRoundedOpeningPipeline, 30.61);
  assert.notEqual(result.suggestedPostCatalystPrice, incorrectRoundedOpeningPipeline);
});

test("repeated identical inputs produce identical outputs", () => {
  const first = calculateIpoPricing(exampleFixtures[0].input);
  const second = calculateIpoPricing(exampleFixtures[0].input);

  assert.deepEqual(first, second);
});

test("every stock category returns the approved movement configuration", () => {
  assert.deepEqual(STOCK_CATEGORY_MOVEMENT_LIMITS.blue_chip, {
    normalMovementCapPct: 4,
    majorEventCapPct: 12,
  });
  assert.deepEqual(STOCK_CATEGORY_MOVEMENT_LIMITS.growth, {
    normalMovementCapPct: 7,
    majorEventCapPct: 18,
  });
  assert.deepEqual(STOCK_CATEGORY_MOVEMENT_LIMITS.speculative, {
    normalMovementCapPct: 12,
    majorEventCapPct: 25,
  });
  assert.deepEqual(STOCK_CATEGORY_MOVEMENT_LIMITS.meme, {
    normalMovementCapPct: 18,
    majorEventCapPct: 30,
  });
});

test("documented placeholder fixtures calculate without mutating inputs", () => {
  for (const fixture of exampleFixtures) {
    const before = structuredClone(fixture.input);
    const result = calculateIpoPricing(fixture.input);

    assert.equal(result.algorithmVersion, "1.1.0", fixture.name);
    assert.equal(result.category, fixture.input.category, fixture.name);
    assert.deepEqual(fixture.input, before, fixture.name);
  }
});
