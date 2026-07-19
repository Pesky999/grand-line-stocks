import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

const intelligenceSource = read("src/lib/api/intelligence.functions.ts");
const characterSource = read("src/routes/character.$slug.tsx");
const getCharacterIntelSource = sourceBetween(
  intelligenceSource,
  "export const getCharacterIntel",
  "export const listRecentExplanations",
);
const speculationQuerySource = sourceBetween(
  getCharacterIntelSource,
  '.from("market_rumor_impacts")',
  '.from("daily_market_reports")',
);
const scoreSource = sourceBetween(getCharacterIntelSource, "const bullish", "return {");

test("character intelligence returns speculation and not rumors", () => {
  assert.match(getCharacterIntelSource, /speculationRows/);
  assert.match(getCharacterIntelSource, /const speculation = /);
  assert.match(getCharacterIntelSource, /speculation,/);
  assert.doesNotMatch(getCharacterIntelSource, /\brumors:/);
  assert.doesNotMatch(getCharacterIntelSource, /\brumors\b/);
});

test("character speculation query does not select legacy movement fields", () => {
  assert.match(
    speculationQuerySource,
    /market_rumors!inner\(id,title,description,status,created_at,expires_at\)/,
  );
  assert.doesNotMatch(speculationQuerySource, /pct_change|price_before|price_after/);
});

test("speculation does not add bullish or bearish signals", () => {
  assert.doesNotMatch(scoreSource, /Active bullish rumor in circulation/);
  assert.doesNotMatch(scoreSource, /Active bearish rumor in circulation/);
  assert.doesNotMatch(scoreSource, /speculation.*bullish|speculation.*bearish/i);
});

test("speculation does not affect confidence or risk scores", () => {
  assert.doesNotMatch(scoreSource, /rumorMoves|totalRumorMove|avgRumorAbsMove/);
  assert.doesNotMatch(scoreSource, /speculationRows|speculation\./);

  const confidenceSource = sourceBetween(scoreSource, "const confidence", "const categoryBaseRisk");
  const riskSource = sourceBetween(getCharacterIntelSource, "const risk", "return {");

  assert.doesNotMatch(confidenceSource, /rumor|speculation/i);
  assert.doesNotMatch(riskSource, /rumor|speculation/i);
});

test("character speculation remains publicly displayable without percentages", () => {
  const speculationDisplaySource = sourceBetween(
    characterSource,
    "{intel.speculation.length > 0 && (",
    '<div className="terminal-panel">',
  );

  assert.match(speculationDisplaySource, /Market Speculation/);
  assert.match(speculationDisplaySource, /Unconfirmed community discussion/);
  assert.match(speculationDisplaySource, /Speculation does not affect stock prices/);
  assert.match(speculationDisplaySource, /item\.title/);
  assert.match(speculationDisplaySource, /item\.description/);
  assert.doesNotMatch(
    speculationDisplaySource,
    /pct_change|toFixed\(2\)|UP|DOWN|text-bull|text-bear|%/,
  );
});
