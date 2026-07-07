import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultPersistentPricingInput,
  createUnratedCharacterPricingState,
  hasPersistentPricingDraftChanges,
  hydratePersistentPricingDraftFields,
  mapCharacterPricingRatingsRow,
  persistentPricingInputsEqual,
  validatePersistentPricingDraft,
  type CharacterPricingRatingsRow,
  type PersistentPricingDraftFields,
} from "./character-pricing-ratings.js";

const currentRow: CharacterPricingRatingsRow = {
  character_id: "00000000-0000-0000-0000-000000000001",
  narrative_importance: 90,
  current_relevance: 80,
  strength_status: 70,
  popularity: 60,
  future_potential: 50,
  investor_confidence: 40,
  volatility: 30,
  stock_category: "blue_chip",
  comparable_adjustment: 1.1,
  uncertainty_discount_pct: 4,
  launch_catalyst_pct: 8,
  pricing_algorithm_version: "1.1.0",
  ratings_status: "draft",
  created_at: "2026-07-01T00:00:00Z",
  created_by: "00000000-0000-0000-0000-000000000101",
  updated_at: "2026-07-02T00:00:00Z",
  updated_by: "00000000-0000-0000-0000-000000000102",
  approved_at: null,
  approved_by: null,
};

const draftFields: PersistentPricingDraftFields = {
  ratings: {
    narrativeImportance: "90",
    currentRelevance: "80",
    strengthStatus: "70",
    popularity: "60",
    futurePotential: "50",
    investorConfidence: "40",
    volatility: "30",
  },
  category: "blue_chip",
  comparableAdjustment: "1.1",
  uncertaintyDiscountPct: "4",
  launchCatalystPct: "8",
};

test("maps unrated, current draft, and current approved states", () => {
  assert.deepEqual(createUnratedCharacterPricingState(currentRow.character_id), {
    characterId: currentRow.character_id,
    state: "unrated",
    databaseStatus: null,
    isStale: false,
    currentAlgorithmVersion: "1.1.0",
    storedAlgorithmVersion: null,
    persistent: null,
    audit: null,
  });

  const draft = mapCharacterPricingRatingsRow(currentRow);
  assert.equal(draft.state, "draft");
  assert.equal(draft.databaseStatus, "draft");
  assert.equal(draft.isStale, false);
  assert.deepEqual(draft.persistent?.ratings, {
    narrativeImportance: 90,
    currentRelevance: 80,
    strengthStatus: 70,
    popularity: 60,
    futurePotential: 50,
    investorConfidence: 40,
    volatility: 30,
  });

  const approved = mapCharacterPricingRatingsRow({
    ...currentRow,
    ratings_status: "approved",
    approved_at: "2026-07-03T00:00:00Z",
    approved_by: "00000000-0000-0000-0000-000000000103",
  });
  assert.equal(approved.state, "approved");
  assert.equal(approved.databaseStatus, "approved");
});

test("derives stale draft and stale approved states from stored algorithm version", () => {
  const staleDraft = mapCharacterPricingRatingsRow({
    ...currentRow,
    pricing_algorithm_version: "1.0.0",
  });
  const staleApproved = mapCharacterPricingRatingsRow({
    ...currentRow,
    ratings_status: "approved",
    pricing_algorithm_version: "1.0.0",
    approved_at: "2026-07-03T00:00:00Z",
    approved_by: "00000000-0000-0000-0000-000000000103",
  });

  assert.equal(staleDraft.state, "stale_draft");
  assert.equal(staleDraft.isStale, true);
  assert.equal(staleApproved.state, "stale_approved");
  assert.equal(staleApproved.isStale, true);
});

test("hydrates only persistent preview fields from saved ratings", () => {
  const base = {
    ...draftFields,
    ratings: {
      narrativeImportance: "50",
      currentRelevance: "50",
      strengthStatus: "50",
      popularity: "50",
      futurePotential: "50",
      investorConfidence: "50",
      volatility: "50",
    },
    category: "growth" as const,
    comparableAdjustment: "1",
    uncertaintyDiscountPct: "5",
    launchCatalystPct: "0",
    currentMomentumPct: "1.25",
    approvedEventImpactPct: "3",
    isMajorEvent: true,
    marketIndexEffectPct: "0.5",
    simulationEvents: [{ id: "event-1", day: "2", impactPct: "5", isMajorEvent: false, label: "" }],
  };
  const hydrated = hydratePersistentPricingDraftFields(
    base,
    mapCharacterPricingRatingsRow(currentRow),
  );

  assert.equal(hydrated.category, "blue_chip");
  assert.equal(hydrated.ratings.narrativeImportance, "90");
  assert.equal(hydrated.currentMomentumPct, "1.25");
  assert.equal(hydrated.approvedEventImpactPct, "3");
  assert.equal(hydrated.simulationEvents.length, 1);
});

test("extracts persistent inputs and rejects decimal ratings", () => {
  const validation = validatePersistentPricingDraft(draftFields);
  assert.equal(validation.ok, true);
  if (!validation.ok) throw new Error("expected valid persistent fields");
  assert.equal(validation.value.ratings.narrativeImportance, 90);
  assert.equal(validation.value.category, "blue_chip");

  const invalid = validatePersistentPricingDraft({
    ...draftFields,
    ratings: { ...draftFields.ratings, volatility: "30.5" },
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors["ratings.volatility"], /whole number/);
});

test("persistent dirtiness ignores temporary movement and simulation fields", () => {
  const validation = validatePersistentPricingDraft(draftFields);
  assert.equal(validation.ok, true);
  if (!validation.ok) throw new Error("expected valid persistent fields");

  assert.equal(hasPersistentPricingDraftChanges(draftFields, validation.value), false);
  assert.equal(persistentPricingInputsEqual(validation.value, validation.value), true);
  assert.equal(
    hasPersistentPricingDraftChanges(
      {
        ...draftFields,
        ratings: { ...draftFields.ratings, popularity: "61" },
      },
      validation.value,
    ),
    true,
  );

  const defaults = createDefaultPersistentPricingInput("growth");
  assert.equal(defaults.ratings.narrativeImportance, 50);
  assert.equal(defaults.category, "growth");
});
