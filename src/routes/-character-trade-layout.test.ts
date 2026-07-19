/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const characterSource = readFileSync(join(process.cwd(), "src/routes/character.$slug.tsx"), "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return source.slice(start, end);
}

const tradeDeskSource = sourceBetween(
  characterSource,
  "const tradeDeskPanel = (",
  "  async function handleBuy()",
);
const renderedSource = sourceBetween(characterSource, "  return (", "\nfunction Row");

test("character page renders Trade Desk between Price History and movement intel", () => {
  const priceHistoryIndex = renderedSource.indexOf("Price History");
  const tradeDeskMountIndex = renderedSource.indexOf("{tradeDeskPanel}");
  const movementIndex = renderedSource.indexOf("Why Is This Stock Moving?");

  assert.ok(priceHistoryIndex >= 0, "Price History section is missing");
  assert.ok(tradeDeskMountIndex >= 0, "Trade Desk mount point is missing");
  assert.ok(movementIndex >= 0, "movement-intel section is missing");
  assert.ok(priceHistoryIndex < tradeDeskMountIndex);
  assert.ok(tradeDeskMountIndex < movementIndex);
});

test("character page renders exactly one Trade Desk before the sidebar", () => {
  assert.equal((characterSource.match(/terminal-header">Trade Desk/g) ?? []).length, 1);

  const tradeDeskMountIndex = renderedSource.indexOf("{tradeDeskPanel}");
  const asideIndex = renderedSource.indexOf('<aside className="space-y-4">');
  assert.ok(tradeDeskMountIndex >= 0);
  assert.ok(asideIndex >= 0);
  assert.ok(tradeDeskMountIndex < asideIndex);
});

test("character sidebar begins with Key Stats after the aside marker", () => {
  const sidebarSource = sourceBetween(
    renderedSource,
    '<aside className="space-y-4">',
    '<div className="terminal-header">Investor Intelligence</div>',
  );

  assert.match(sidebarSource, /<div className="terminal-header">Key Stats<\/div>/);
  assert.doesNotMatch(sidebarSource, /Trade Desk/);
});

test("Trade Desk keeps buy-by-Berry and manual trading controls", () => {
  assert.match(tradeDeskSource, /Buy by Berries/);
  assert.match(tradeDeskSource, /BUY_BY_BERRY_PRESET_AMOUNTS\.map/);
  assert.match(tradeDeskSource, />\s*25%\s*<\/button>/);
  assert.match(tradeDeskSource, />\s*MAX\s*<\/button>/);
  assert.match(tradeDeskSource, /appliedBerryQuote/);
  assert.match(tradeDeskSource, /type="number"/);
  assert.match(tradeDeskSource, /setManualQuantityText/);
  assert.match(tradeDeskSource, />\s*Max Sell\s*<\/button>/);
  assert.match(tradeDeskSource, /handleBuy/);
  assert.match(tradeDeskSource, /handleSell/);
  assert.match(tradeDeskSource, />\s*Refresh quote\s*<\/button>/);
});

test("signed-in Trade Desk uses a wide-only responsive interior", () => {
  assert.match(tradeDeskSource, /grid gap-4 xl:grid-cols-2 xl:items-start/);
  assert.match(tradeDeskSource, /mx-auto max-w-sm space-y-3 text-center/);
  assert.doesNotMatch(tradeDeskSource, /lg:grid-cols-2/);
});

test("character intelligence displays non-price-moving Market Speculation", () => {
  const intelligenceSource = sourceBetween(
    renderedSource,
    '<div className="terminal-header">Investor Intelligence</div>',
    '<div className="terminal-header">Catalysts</div>',
  );

  assert.match(intelligenceSource, /Market Speculation/);
  assert.match(intelligenceSource, /Unconfirmed community discussion/);
  assert.match(intelligenceSource, /Speculation does not affect stock prices/);
  assert.doesNotMatch(intelligenceSource, /Active Rumors|market_rumors|pct_change|toFixed\(2\)%/);
});

test("character Catalysts panel uses catalyst empty-state language", () => {
  const catalystsSource = sourceBetween(
    renderedSource,
    '<div className="terminal-header">Catalysts</div>',
    '<div className="terminal-header">Top {c.name} Investors</div>',
  );

  assert.match(catalystsSource, /No catalysts yet\./);
  assert.doesNotMatch(catalystsSource, /No events yet\./);
});

test("character page does not add quick trade or new API surface", () => {
  assert.doesNotMatch(characterSource, /Quick Trade|quickTrade|createServerFn|rpc\(/);
  assert.doesNotMatch(characterSource, /newTrade|quickBuy|quickSell/);
});
