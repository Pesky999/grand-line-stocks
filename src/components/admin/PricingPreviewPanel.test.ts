import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const panelSource = readSource("src/components/admin/PricingPreviewPanel.tsx");
const routeSource = readSource("src/routes/_authenticated/pricing-admin.tsx");
const adminSource = readSource("src/routes/_authenticated/admin.tsx");
const characterPanelSource = readSource("src/components/admin/CharacterManagementPanel.tsx");
const marketFunctionsSource = readSource("src/lib/api/market.functions.ts");
const helperSource = readSource("src/lib/market-pricing/admin-preview.ts");
const ratingsHelperSource = readSource("src/lib/market-pricing/character-pricing-ratings.ts");

function readSource(workspacePath: string): string {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

test("pricing admin route stays under the authenticated admin authorization pattern", () => {
  assert.match(routeSource, /createFileRoute\("\/_authenticated\/pricing-admin"\)/);
  assert.match(routeSource, /amIAdmin\(\)/);
  assert.match(routeSource, /redirect\(\{ to: "\/" \}\)/);
  assert.match(routeSource, /listCharacters/);
  assert.match(adminSource, /to="\/pricing-admin"/);
});

test("preview source keeps the route admin-only and avoids hidden attributes or URL state", () => {
  const combinedSource = `${panelSource}\n${routeSource}\n${helperSource}\n${ratingsHelperSource}`;

  assert.doesNotMatch(combinedSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(combinedSource, /adminCreate|adminUpdate|adminPost/);
  assert.doesNotMatch(combinedSource, /character_attributes/);
  assert.doesNotMatch(combinedSource, /useSearch|searchParams|navigate\(/);
});

test("preview exposes ratings persistence controls and the one-step live-price apply control", () => {
  assert.match(panelSource, /Save Draft/);
  assert.match(panelSource, /Save Ratings & Apply Price/);
  assert.match(panelSource, /Reset to Unrated/);
  assert.doesNotMatch(panelSource, /Apply to live|Publish price|Rebase|Commit new quote/);
});

test("preview wording distinguishes base fair value and signed fair-value difference", () => {
  assert.match(panelSource, /Base fair value drives movement and simulation previews/);
  assert.match(
    panelSource,
    /post-catalyst price is the\s+final valuation used by Save Ratings & Apply Price/,
  );
  assert.match(panelSource, /Final price difference from fair value/);
  assert.match(panelSource, /negative means below fair value, positive means above fair value/);
});

test("ratings functions are used and preview-only inputs are omitted from save payloads", () => {
  assert.match(panelSource, /getCharacterPricingRatings/);
  assert.match(panelSource, /listCharacterPricingRatings/);
  assert.match(panelSource, /saveCharacterPricingDraft/);
  assert.match(panelSource, /saveAndApplyCharacterPricing/);
  assert.match(panelSource, /resetCharacterPricingRatings/);
  assert.match(panelSource, /validatePersistentPricingDraft\(draft\)/);
  assert.match(ratingsHelperSource, /validatePersistentPricingDraft/);
  assert.doesNotMatch(
    functionBlock(panelSource, "saveDraft"),
    /currentMomentumPct|approvedEventImpactPct|isMajorEvent|marketIndexEffectPct|simulationEvents/,
  );
});

test("status, stale, and dirty-state workflow are represented", () => {
  for (const phrase of [
    "Unrated",
    "Draft",
    "Approved",
    "Stale draft",
    "Stale approved",
    "Save current ratings before applying",
    "Save Ratings & Apply Price",
    "beforeunload",
    "Discard unsaved persistent rating changes",
  ]) {
    assert.match(panelSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("wording states draft saves are safe while the apply action updates live price", () => {
  assert.match(panelSource, /Draft saved\. The live market was not changed\./);
  assert.match(panelSource, /Save Draft stores ratings without changing the market/);
  assert.match(
    panelSource,
    /Save Ratings & Apply Price[\s\S]*updates the character&apos;s live price/,
  );
  assert.match(
    panelSource,
    /Share quantities, wallet balances, average costs, and transaction history will not change/,
  );
  assert.match(panelSource, /Movement and simulation inputs/);
  assert.match(panelSource, /Save Draft stores only persistent ratings and IPO inputs/);
});

test("ratings load failure is distinct from unrated and blocks mutations", () => {
  assert.match(panelSource, /loadFailed\) return "Load failed"/);
  assert.match(panelSource, /Retry Load/);
  assert.match(panelSource, /ratingsQuery\.refetch\(\)/);
  assert.match(
    panelSource,
    /const ratingsReady = ratingsQuery\.isSuccess && Boolean\(ratingsQuery\.data\)/,
  );
  assert.match(panelSource, /const persistentInputsDisabled = isBusy \|\| ratingsLoadBlocked/);
  assert.match(functionBlock(panelSource, "saveDraft"), /!ratingsReady \|\| !ratingsQuery\.data/);
  assert.match(
    functionBlock(panelSource, "resetToUnrated"),
    /!ratingsReady \|\| !ratingsQuery\.data/,
  );
  assert.match(
    functionBlock(panelSource, "saveAndApplyPrice"),
    /!ratingsReady \|\| !ratingsQuery\.data/,
  );
  assert.doesNotMatch(panelSource, /isError[\s\S]{0,160}Unrated/);
  assert.equal(countMatches(panelSource, /disabled=\{persistentInputsDisabled\}/g), 4);
});

test("mutations lock character switching and persistent inputs", () => {
  assert.match(functionBlock(panelSource, "handleCharacterChange"), /if \(operation\)/);
  assert.match(panelSource, /disabled=\{isBusy\}/);
  assert.match(panelSource, /<fieldset disabled=\{persistentInputsDisabled\}/);
  assert.match(functionBlock(panelSource, "resetCurrentDraft"), /if \(operation\)/);
  assert.match(
    functionBlock(panelSource, "saveDraft"),
    /const operationCharacterId = selectedCharacter\.id/,
  );
  assert.match(
    functionBlock(panelSource, "saveAndApplyPrice"),
    /const operationCharacterId = selectedCharacter\.id/,
  );
  assert.match(
    functionBlock(panelSource, "resetToUnrated"),
    /const operationCharacterId = selectedCharacter\.id/,
  );
});

test("mutation completions are guarded against cross-character updates", () => {
  assert.match(panelSource, /selectedCharacterIdRef/);
  assert.match(
    functionBlock(panelSource, "saveDraft"),
    /selectedCharacterIdRef\.current !== operationCharacterId/,
  );
  assert.match(
    functionBlock(panelSource, "saveAndApplyPrice"),
    /selectedCharacterIdRef\.current !== operationCharacterId/,
  );
  assert.match(
    functionBlock(panelSource, "resetToUnrated"),
    /selectedCharacterIdRef\.current !== operationCharacterId/,
  );
  assert.match(
    functionBlock(panelSource, "refreshRatingsState"),
    /selectedCharacterIdRef\.current !== characterId/,
  );
  assert.doesNotMatch(functionBlock(panelSource, "saveDraft"), /setDraft\(/);
  assert.doesNotMatch(functionBlock(panelSource, "saveAndApplyPrice"), /setDraft\(/);
});

test("hydration preserves temporary preview work unless character switch or reset explicitly replaces it", () => {
  const hydrationEffect = sourceBetween(
    panelSource,
    "const alreadyProcessed",
    "useEffect(() => {\n    if (!persistentDirty)",
  );

  assert.match(hydrationEffect, /setDraft\(\(currentDraft\) =>/);
  assert.match(
    hydrationEffect,
    /isInitialCharacterLoad\s+\?\s+createDefaultPricingPreviewDraft\(selectedCharacter\)\s+:\s+currentDraft/,
  );
  assert.match(hydrationEffect, /unsaved persistent edits were kept/);
  assert.match(hydrationEffect, /if \(!isInitialCharacterLoad && persistentDirty\)/);
  assert.match(
    functionBlock(panelSource, "resetForCharacter"),
    /createDefaultPricingPreviewDraft\(character\)/,
  );
  assert.match(
    functionBlock(panelSource, "resetToUnrated"),
    /createDefaultPricingPreviewDraft\(selectedCharacter\)/,
  );
  assert.match(
    functionBlock(panelSource, "resetCurrentDraft"),
    /Movement and simulation inputs were kept/,
  );
});

test("admin console no longer exposes manual stock-price controls", () => {
  assert.doesNotMatch(adminSource, /adminUpdatePrice/);
  assert.doesNotMatch(adminSource, /Set Stock Price|Commit new quote|New price/);
  assert.match(adminSource, /CharacterManagementPanel/);
  assert.match(adminSource, /Post to The Wire/);
});

test("character editor is metadata-only and sends new characters to pricing preview", () => {
  for (const forbidden of [
    /Initial stock price/,
    /Stock category/,
    /Momentum/,
    /initialPrice/,
    /parsePrice/,
    /parseMomentum/,
    /STOCK_CATEGORIES/,
    /current_price/,
    /previous_price/,
  ]) {
    assert.doesNotMatch(characterPanelSource, forbidden);
  }
  assert.match(characterPanelSource, /Complete the official valuation in Market Pricing Preview/);
  assert.match(characterPanelSource, /to="\/pricing-admin"/);
});

test("admin character server functions rely on database market defaults and do not write price history", () => {
  assert.doesNotMatch(marketFunctionsSource, /adminUpdatePrice/);
  assert.match(marketFunctionsSource, /const adminCreateCharacterInput = z[\s\S]*\.strict\(\);/);
  assert.match(marketFunctionsSource, /const adminUpdateCharacterInput = z[\s\S]*\.strict\(\);/);

  const createInput = sourceBetween(
    marketFunctionsSource,
    "const adminCreateCharacterInput",
    "const adminUpdateCharacterInput",
  );
  const updateInput = sourceBetween(
    marketFunctionsSource,
    "const adminUpdateCharacterInput",
    "export const adminCreateCharacter",
  );
  const createFunction = sourceBetween(
    marketFunctionsSource,
    "export const adminCreateCharacter",
    "export const adminUpdateCharacter",
  );
  const updateFunction = sourceBetween(
    marketFunctionsSource,
    "export const adminUpdateCharacter",
    "export const adminPostNews",
  );

  for (const forbidden of [
    /initialPrice/,
    /current_price/,
    /previous_price/,
    /category/,
    /momentum/,
  ]) {
    assert.doesNotMatch(createInput, forbidden);
    assert.doesNotMatch(updateInput, forbidden);
    assert.doesNotMatch(createFunction, forbidden);
    assert.doesNotMatch(updateFunction, forbidden);
  }
  assert.doesNotMatch(createFunction, /price_history/);
});

function functionBlock(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const openBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} block did not close`);
}

function sourceBetween(source: string, startPattern: string, endPattern: string): string {
  const start = source.indexOf(startPattern);
  if (start < 0) throw new Error(`${startPattern} not found`);
  const end = source.indexOf(endPattern, start + startPattern.length);
  if (end < 0) throw new Error(`${endPattern} not found`);
  return source.slice(start, end);
}

function countMatches(source: string, pattern: RegExp): number {
  return Array.from(source.matchAll(pattern)).length;
}
