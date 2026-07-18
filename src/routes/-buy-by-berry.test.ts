/// <reference types="node" />

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const characterSource = readFileSync(join(process.cwd(), "src/routes/character.$slug.tsx"), "utf8");
const portfolioSource = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/portfolio.tsx"),
  "utf8",
);
const buyByBerrySource = readFileSync(
  join(process.cwd(), "src/lib/trading/buy-by-berry.ts"),
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return source.slice(start, end);
}

test("character trade desk imports and uses the pure Buy by Berry quote helper", () => {
  assert.match(characterSource, /from "@\/lib\/trading\/buy-by-berry"/);
  assert.match(characterSource, /quoteBuyByBerryText\(/);
  assert.match(characterSource, /quoteBuyByBerryBudget\(/);
  assert.match(characterSource, /calculateWalletPercentageBerryBudget\(/);
  assert.doesNotMatch(buyByBerrySource, /createServerFn|use[A-Z]|supabase|buyShares|sellShares/);
});

test("custom Berry amount state and input apply to qtyText without submitting", () => {
  const buyByBerrySection = sourceBetween(
    characterSource,
    "Buy by Berries",
    '<div className="flex items-center gap-2 pt-2">',
  );

  assert.match(characterSource, /const \[berryAmountText, setBerryAmountText\] = useState\(""\)/);
  assert.match(
    characterSource,
    /const \[appliedBerryQuote, setAppliedBerryQuote\] = useState<BuyByBerryQuoteSuccess \| null>\(null\)/,
  );
  assert.match(buyByBerrySection, /aria-label="Berry amount"/);
  assert.match(buyByBerrySection, /inputMode="decimal"/);
  assert.match(buyByBerrySection, /onKeyDown=\{handleCustomBerryAmountKeyDown\}/);
  assert.match(buyByBerrySection, />\s*Apply\s*<\/button>/);
  assert.match(characterSource, /setQtyText\(normalizeShareQuantityText\(quote\.shares\)\)/);
  assert.doesNotMatch(buyByBerrySection, /buyShares\(/);
});

test("fixed, percentage, and max presets exist and do not directly buy shares", () => {
  const buyByBerrySection = sourceBetween(
    characterSource,
    "Buy by Berries",
    '<div className="flex items-center gap-2 pt-2">',
  );

  assert.match(buyByBerrySource, /BUY_BY_BERRY_PRESET_AMOUNTS = \[100, 500, 1000\]/);
  assert.match(characterSource, /BUY_BY_BERRY_PRESET_AMOUNTS\.map/);
  assert.match(characterSource, /BUY_BY_BERRY_PERCENT_PRESET/);
  assert.match(characterSource, />\s*25%\s*<\/button>/);
  assert.match(characterSource, />\s*MAX\s*<\/button>/);
  assert.match(buyByBerrySection, /formatBerryAmount\(amount\)/);
  assert.match(buyByBerrySection, /applyBuyByBerryBudget\(amount\)/);
  assert.doesNotMatch(buyByBerrySection, /buyShares\(/);
});

test("old Max Buy shortcut is removed while Max Sell is preserved", () => {
  assert.doesNotMatch(characterSource, />\s*Max Buy\s*<\/button>/);
  assert.match(characterSource, />\s*Max Sell\s*<\/button>/);
  assert.match(characterSource, /setQtyText\(normalizeShareQuantityText\(maxSellQuantity\)\)/);
});

test("manual quantity changes and stale quote triggers clear the applied quote", () => {
  const manualQuantitySource = sourceBetween(
    characterSource,
    "function setManualQuantityText",
    "function adjustQuantity",
  );
  const adjustQuantitySource = sourceBetween(
    characterSource,
    "function adjustQuantity",
    "function applyBuyByBerryQuote",
  );

  assert.match(manualQuantitySource, /clearAppliedBuyByBerryQuote\(\)/);
  assert.match(manualQuantitySource, /setQtyText\(value\)/);
  assert.match(adjustQuantitySource, /clearAppliedBuyByBerryQuote\(\)/);
  assert.match(
    characterSource,
    /onClick=\{\(\) => \{\s*clearAppliedBuyByBerryQuote\(\);\s*setQtyText\(normalizeShareQuantityText\(maxSellQuantity\)\);/,
  );
  assert.match(characterSource, /setAppliedBerryQuote\(null\)/);
  assert.match(characterSource, /Math\.abs\(appliedBerryQuote\.quotePrice - price\) >= 0\.01/);
});

test("quote summary shows target shares estimated spend unused amount and authority note", () => {
  assert.match(characterSource, /appliedBerryQuote\.requestedBudget\)\} target/);
  assert.match(characterSource, /formatShares\(appliedBerryQuote\.shares\)\} shares/);
  assert.match(characterSource, /Estimated spend/);
  assert.match(characterSource, /appliedBerryQuote\.unusedBudget\)\} unused/);
  assert.match(
    characterSource,
    /Sets share quantity from the current quote\. Final price and cost are\s+confirmed by the server\./,
  );
});

test("buy execution remains share-based and displays server authoritative cost and price", () => {
  const handleBuySource = sourceBetween(
    characterSource,
    "async function handleBuy()",
    "async function handleSell()",
  );
  const tradeRequestSource = sourceBetween(
    characterSource,
    "function tradeRequest",
    "function clearAppliedBuyByBerryQuote",
  );

  assert.match(
    handleBuySource,
    /const result = await buyShares\(\{ data: \{ slug, shares: parsedQty, requestId \} \}\)/,
  );
  assert.match(handleBuySource, /formatBerryAmount\(result\.cost\)/);
  assert.match(handleBuySource, /formatBerryAmount\(result\.price\)/);
  assert.doesNotMatch(handleBuySource, /requestedBudget|amountText|budget/i);
  assert.match(tradeRequestSource, /const intent = \{ userId: user\.id, slug, side, shares \}/);
  assert.match(tradeRequestSource, /const requestId = getOrCreateTradeRequestId\(intent\)/);
});

test("portfolio stays sell-only and no database or migration code was added", () => {
  const migrationNames = readdirSync(join(process.cwd(), "supabase/migrations"));

  assert.doesNotMatch(portfolioSource, /Buy by Berries|quoteBuyByBerry|Max Buy/);
  assert.doesNotMatch(buyByBerrySource, /createServerFn|rpc\(|from\("|\.from\(/);
  assert.equal(
    migrationNames.some((name) => /buy.by.berry|berry.amount|buy_by_berry/i.test(name)),
    false,
  );
});
