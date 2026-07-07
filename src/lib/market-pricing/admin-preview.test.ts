import assert from "node:assert/strict";
import test from "node:test";
import { calculateDailyMovement } from "./movement-v1.js";
import {
  calculatePricingPreview,
  createDefaultPricingPreviewDraft,
  createEmptySimulationEvent,
  validatePricingPreviewDraft,
  type PricingPreviewCharacter,
} from "./admin-preview.js";
import { calculateIpoPricing } from "./v1.js";
import { simulateMarketMovement } from "./simulator-v1.js";

const character: PricingPreviewCharacter = {
  slug: "luffy",
  name: "Monkey D. Luffy",
  current_price: 120,
  previous_price: 100,
  category: "growth",
  momentum: 1.25,
};

test("default draft uses public character category and momentum while ratings start as scratch values", () => {
  const draft = createDefaultPricingPreviewDraft(character);

  assert.equal(draft.category, "growth");
  assert.equal(draft.currentMomentumPct, "1.25");
  assert.deepEqual(draft.ratings, {
    narrativeImportance: "50",
    currentRelevance: "50",
    strengthStatus: "50",
    popularity: "50",
    futurePotential: "50",
    investorConfidence: "50",
    volatility: "50",
  });
  assert.deepEqual(draft.simulationEvents, []);
});

test("default draft falls back safely for missing or unsafe public momentum", () => {
  const missing = createDefaultPricingPreviewDraft(undefined);
  const malformed = createDefaultPricingPreviewDraft({ ...character, momentum: Number.NaN });
  const tooHigh = createDefaultPricingPreviewDraft({ ...character, momentum: 6 });
  const tooLow = createDefaultPricingPreviewDraft({ ...character, momentum: -6 });

  assert.equal(missing.category, "growth");
  assert.equal(missing.currentMomentumPct, "0");
  assert.equal(missing.simulationEvents.length, 0);
  assert.equal(malformed.currentMomentumPct, "0");
  assert.equal(tooHigh.currentMomentumPct, "0");
  assert.equal(tooLow.currentMomentumPct, "0");
});

test("preview calculation delegates to the pricing, movement, and simulator cores", () => {
  const draft = createDefaultPricingPreviewDraft(character);
  const validation = validatePricingPreviewDraft({
    ...draft,
    approvedEventImpactPct: "4",
    marketIndexEffectPct: "0.25",
    simulationEvents: [
      {
        ...createEmptySimulationEvent("event-1"),
        day: "3",
        impactPct: "8",
        isMajorEvent: true,
        label: "Local catalyst",
      },
    ],
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) throw new Error("Expected preview validation to pass");

  const preview = calculatePricingPreview(character, validation.value);
  const expectedIpo = calculateIpoPricing({
    ratings: validation.value.ratings,
    category: validation.value.category,
    comparableAdjustment: validation.value.comparableAdjustment,
    uncertaintyDiscountPct: validation.value.uncertaintyDiscountPct,
    launchCatalystPct: validation.value.launchCatalystPct,
  });
  const expectedMovement = calculateDailyMovement({
    currentPrice: character.current_price,
    fairValue: expectedIpo.baseFairValue,
    category: validation.value.category,
    currentMomentumPct: validation.value.currentMomentumPct,
    approvedEventImpactPct: validation.value.approvedEventImpactPct,
    isMajorEvent: validation.value.isMajorEvent,
    marketIndexEffectPct: validation.value.marketIndexEffectPct,
  });
  const expectedSimulation = simulateMarketMovement({
    initialPrice: character.current_price,
    fairValue: expectedIpo.baseFairValue,
    category: validation.value.category,
    initialMomentumPct: validation.value.currentMomentumPct,
    days: 30,
    approvedEvents: validation.value.simulationEvents,
    dailyMarketIndexEffects: [],
  });

  assert.deepEqual(preview.ipo, expectedIpo);
  assert.deepEqual(preview.movement, expectedMovement);
  assert.deepEqual(preview.simulation, expectedSimulation);
  assert.equal(preview.chartRows.length, 30);
  assert.equal(preview.tableRows.length, 30);
  assert.deepEqual(preview.chartRows[0], {
    day: 1,
    endingPrice: expectedSimulation.days[0].endingPrice,
    fairValue: expectedIpo.baseFairValue,
  });
});

test("invalid temporary inputs are reported without calculating output", () => {
  const draft = createDefaultPricingPreviewDraft(character);
  const validation = validatePricingPreviewDraft({
    ...draft,
    ratings: {
      ...draft.ratings,
      popularity: "Infinity",
      volatility: "101",
    },
    comparableAdjustment: "1.5",
    currentMomentumPct: "-6",
    marketIndexEffectPct: "2",
    simulationEvents: [
      {
        ...createEmptySimulationEvent("event-1"),
        day: "31",
        impactPct: "-31",
      },
    ],
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors["ratings.popularity"], /finite number/);
  assert.match(validation.errors["ratings.volatility"], /between 0 and 100/);
  assert.match(validation.errors.comparableAdjustment, /between 0.75 and 1.25/);
  assert.match(validation.errors.currentMomentumPct, /between -5 and 5/);
  assert.match(validation.errors.marketIndexEffectPct, /between -1 and 1/);
  assert.match(validation.errors["simulationEvents.event-1.day"], /1 and 30/);
  assert.match(validation.errors["simulationEvents.event-1.impactPct"], /-30 and 30/);
});

test("rating decimals are rejected before preview calculation", () => {
  const draft = createDefaultPricingPreviewDraft(character);
  const validation = validatePricingPreviewDraft({
    ...draft,
    ratings: {
      ...draft.ratings,
      investorConfidence: "50.5",
    },
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors["ratings.investorConfidence"], /whole number/);
});

test("invalid runtime category is a field-level validation error", () => {
  const draft = createDefaultPricingPreviewDraft(character);
  const validation = validatePricingPreviewDraft({
    ...draft,
    category: "invalid" as typeof draft.category,
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.category, /blue_chip, growth, speculative, or meme/);
});

test("duplicate same-day events are delegated to simulator validation", () => {
  const draft = createDefaultPricingPreviewDraft(character);
  const validation = validatePricingPreviewDraft({
    ...draft,
    simulationEvents: [
      {
        ...createEmptySimulationEvent("event-1"),
        day: "4",
        impactPct: "20",
      },
      {
        ...createEmptySimulationEvent("event-2"),
        day: "4",
        impactPct: "15",
      },
    ],
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) throw new Error("Expected preview validation to pass");

  assert.throws(
    () => calculatePricingPreview(character, validation.value),
    /combined approvedEventImpactPct must be between -30 and 30/,
  );
});
