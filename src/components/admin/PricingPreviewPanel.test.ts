import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const panelSource = readSource("src/components/admin/PricingPreviewPanel.tsx");
const routeSource = readSource("src/routes/_authenticated/pricing-admin.tsx");
const adminSource = readSource("src/routes/_authenticated/admin.tsx");
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

test("preview exposes ratings persistence controls but no live-price application controls", () => {
  assert.match(panelSource, /Save Draft/);
  assert.match(panelSource, /Approve/);
  assert.match(panelSource, /Reset to Unrated/);
  assert.doesNotMatch(panelSource, /Apply to live|Publish price|Rebase|Commit new quote/);
});

test("preview wording distinguishes base fair value and signed fair-value difference", () => {
  assert.match(panelSource, /Base fair value drives movement and simulation previews/);
  assert.match(panelSource, /separate hypothetical launch values/);
  assert.match(panelSource, /Final price difference from fair value/);
  assert.match(panelSource, /negative means below fair value, positive means above fair value/);
});

test("ratings functions are used and preview-only inputs are omitted from save payloads", () => {
  assert.match(panelSource, /getCharacterPricingRatings/);
  assert.match(panelSource, /listCharacterPricingRatings/);
  assert.match(panelSource, /saveCharacterPricingDraft/);
  assert.match(panelSource, /approveCharacterPricingRatings/);
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
    "Save a new draft before approval",
    "Save persistent rating changes before approving",
    "beforeunload",
    "Discard unsaved persistent rating changes",
  ]) {
    assert.match(panelSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("wording states ratings persistence does not update live prices", () => {
  assert.match(panelSource, /Saving or approving ratings never\s+changes live market prices/);
  assert.match(panelSource, /movement or simulation inputs stay temporary/);
  assert.match(panelSource, /This page saves only persistent ratings and IPO inputs/);
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
    functionBlock(panelSource, "approveDraft"),
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
    functionBlock(panelSource, "approveDraft"),
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
    functionBlock(panelSource, "approveDraft"),
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
  assert.doesNotMatch(functionBlock(panelSource, "approveDraft"), /setDraft\(/);
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
