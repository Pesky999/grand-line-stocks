import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/lib/api/character-pricing-ratings.functions.ts"),
  "utf8",
);

function functionSource(name: string): string {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

test("every ratings server function requires authenticated middleware and admin role", () => {
  for (const name of [
    "getCharacterPricingRatings",
    "listCharacterPricingRatings",
    "saveCharacterPricingDraft",
    "saveAndApplyCharacterPricing",
    "resetCharacterPricingRatings",
  ]) {
    const body = functionSource(name);
    assert.match(body, /\.middleware\(\[requireSupabaseAuth\]\)/, `${name} requires auth`);
    assert.match(
      body,
      /requireAdminRole\(context\.supabase, context\.userId\)/,
      `${name} checks admin`,
    );
  }
  assert.doesNotMatch(source, /supabaseAdmin|client\.server/);
});

test("reads use authenticated context.supabase and no row maps to unrated", () => {
  const getOne = functionSource("getCharacterPricingRatings");
  const listAll = functionSource("listCharacterPricingRatings");

  assert.match(
    getOne,
    /context\.supabase[\s\S]*\.from\("character_pricing_ratings"\)[\s\S]*\.select\("\*"\)/,
  );
  assert.match(
    listAll,
    /context\.supabase[\s\S]*\.from\("character_pricing_ratings"\)[\s\S]*\.select\("\*"\)/,
  );
  assert.match(
    getOne,
    /if \(!row\) return createUnratedCharacterPricingState\(data\.characterId\)/,
  );
  assert.doesNotMatch(
    source,
    /\.from\("character_pricing_ratings"\)[\s\S]*\.(insert|update|delete)\(/,
  );
});

test("writes call only the approved RPCs with server-owned algorithm version", () => {
  const save = functionSource("saveCharacterPricingDraft");
  const apply = functionSource("saveAndApplyCharacterPricing");
  const reset = functionSource("resetCharacterPricingRatings");
  const inputShape = source.slice(
    source.indexOf("const persistentRatingsInput"),
    source.indexOf("async function requireAdminRole"),
  );

  assert.match(save, /\.rpc\("save_character_pricing_draft"/);
  assert.match(apply, /\.rpc\(\s*"save_and_apply_character_pricing"/);
  assert.match(reset, /\.rpc\("reset_character_pricing_ratings"/);
  assert.match(save, /_pricing_algorithm_version: MARKET_PRICING_ALGORITHM_VERSION/);
  assert.match(apply, /_pricing_algorithm_version: MARKET_PRICING_ALGORITHM_VERSION/);
  assert.doesNotMatch(source, /approve_character_pricing_ratings/);
  assert.doesNotMatch(source, /approve_and_apply_character_pricing_ratings/);
  assert.doesNotMatch(
    inputShape,
    /pricingAlgorithmVersion|ratingsStatus|createdBy|updatedBy|approvedBy/,
  );
});

test("apply workflow accepts current persistent inputs and does not submit a price", () => {
  const apply = functionSource("saveAndApplyCharacterPricing");

  assert.match(apply, /\.inputValidator\(\(input\) => persistentRatingsInput\.parse\(input\)\)/);
  assert.match(
    apply,
    /calculateIpoPricing\(\{[\s\S]*ratings: data\.ratings[\s\S]*category: data\.category[\s\S]*comparableAdjustment: data\.comparableAdjustment[\s\S]*uncertaintyDiscountPct: data\.uncertaintyDiscountPct[\s\S]*launchCatalystPct: data\.launchCatalystPct[\s\S]*\}\)/,
    "server calculates from the current persistent form input",
  );
  assert.match(apply, /const previewAppliedPrice = calculation\.suggestedPostCatalystPrice/);
  assert.doesNotMatch(apply, /_applied_price/);
  assert.match(apply, /_stock_category: data\.category/);
  assert.doesNotMatch(apply, /\.from\("character_pricing_ratings"\)[\s\S]*\.select\("\*"\)/);
  assert.doesNotMatch(
    apply,
    /data\.(appliedPrice|newPrice|price|pricingAlgorithmVersion|status|userId|approvedBy|updatedAt|calculationSnapshot)/,
    "client input cannot supply market application metadata or calculated prices",
  );
});

test("apply workflow treats the RPC-returned price as authoritative", () => {
  const mapResult = source.slice(
    source.indexOf("function mapApplyRpcResult"),
    source.indexOf("export const getCharacterPricingRatings"),
  );

  assert.match(mapResult, /newLivePrice: result\.newLivePrice/);
  assert.match(mapResult, /previousLivePrice: result\.previousLivePrice/);
  assert.match(mapResult, /percentageChange: result\.percentageChange/);
  assert.doesNotMatch(mapResult, /previewAppliedPrice|suggestedPostCatalystPrice/);
});

test("strict input validation accepts only persistent rating fields", () => {
  assert.match(source, /const persistentRatingsInput = characterIdSchema[\s\S]*\.strict\(\);/);
  for (const field of [
    "narrativeImportance",
    "currentRelevance",
    "strengthStatus",
    "popularity",
    "futurePotential",
    "investorConfidence",
    "volatility",
  ]) {
    assert.match(source, new RegExp(`${field}: ratingSchema`));
  }
  assert.match(source, /const ratingSchema = z\.number\(\)\.int\(\)\.min\(0\)\.max\(100\)/);
  for (const forbidden of [
    "currentMomentumPct",
    "approvedEventImpactPct",
    "isMajorEvent",
    "marketIndexEffectPct",
    "simulationEvents",
    "weightedScore",
    "suggestedOpeningPrice",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden), `${forbidden} is not accepted`);
  }
});

test("server code contains no live-market or financial mutations", () => {
  for (const forbidden of [
    /characters"\)[\s\S]*\.(insert|update|delete)\(/,
    /price_history"\)[\s\S]*\.(insert|update|delete)\(/,
    /user_wallets|user_holdings|transactions/,
    /market_events|market_event_impacts|market_rumors|market_rumor_impacts/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});
