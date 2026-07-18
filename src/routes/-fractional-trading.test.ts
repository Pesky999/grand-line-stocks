/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const characterSource = readFileSync(join(process.cwd(), "src/routes/character.$slug.tsx"), "utf8");
const portfolioSource = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/portfolio.tsx"),
  "utf8",
);
const privateProfileSource = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/profile.tsx"),
  "utf8",
);
const publicProfileSource = readFileSync(join(process.cwd(), "src/routes/u.$username.tsx"), "utf8");

test("character trade desk uses text quantity state and decimal input controls", () => {
  assert.match(characterSource, /const \[qtyText, setQtyText\] = useState\("1"\)/);
  assert.doesNotMatch(characterSource, /parseInt\(/);
  assert.match(
    characterSource,
    /type="number"[\s\S]*min="0\.01"[\s\S]*max="10000"[\s\S]*step="0\.01"[\s\S]*inputMode="decimal"[\s\S]*value=\{qtyText\}/,
  );
  assert.match(characterSource, /onChange=\{\(e\) => setManualQuantityText\(e\.target\.value\)\}/);
  assert.match(characterSource, /parseShareQuantity\(qtyText\)/);
  assert.match(characterSource, /calculateRoundedTradeTotal\(price, parsedQty\)/);
  assert.match(characterSource, /Trade value must be at least ฿1\.00/);
});

test("character trade desk replaces Max Buy with Buy by Berries and preserves Max Sell", () => {
  assert.match(characterSource, /Buy by Berries/);
  assert.match(characterSource, /quoteBuyByBerryBudget/);
  assert.match(characterSource, /quoteBuyByBerryText/);
  assert.match(characterSource, /calculateMaxSellQuantity\(held\?\.shares \?\? 0\)/);
  assert.doesNotMatch(characterSource, />\s*Max Buy\s*<\/button>/);
  assert.match(characterSource, />\s*Max Sell\s*<\/button>/);
  assert.match(characterSource, /setQtyText\(normalizeShareQuantityText\(maxSellQuantity\)\)/);
});

test("character trade desk manages request IDs per exact payload", () => {
  assert.match(characterSource, /getOrCreateTradeRequestId/);
  assert.match(characterSource, /clearTradeRequestId/);
  assert.match(characterSource, /clearTradeRequestIdForPayloadConflict/);
  assert.match(characterSource, /const intent = \{ userId: user\.id, slug, side, shares \}/);
  assert.match(characterSource, /const requestId = getOrCreateTradeRequestId\(intent\)/);
  assert.doesNotMatch(characterSource, /const \[pendingTrade, setPendingTrade\]/);
  assert.doesNotMatch(characterSource, /crypto\.randomUUID\(\)/);
  assert.match(
    characterSource,
    /buyShares\(\{ data: \{ slug, shares: parsedQty, requestId \} \}\)/,
  );
  assert.match(
    characterSource,
    /sellShares\(\{ data: \{ slug, shares: parsedQty, requestId \} \}\)/,
  );
  assert.match(characterSource, /clearTradeRequestId\(intent\)/);
});

test("character trade desk disables invalid, unaffordable, busy, and unavailable actions", () => {
  assert.match(
    characterSource,
    /const buyDisabled =[\s\S]*tradeTotal < MIN_TRADE_TOTAL[\s\S]*tradeTotal > walletBalance/,
  );
  assert.match(characterSource, /const sellDisabled =[\s\S]*!held[\s\S]*parsedQty > held\.shares/);
  assert.match(characterSource, /disabled=\{buyDisabled\}/);
  assert.match(characterSource, /disabled=\{sellDisabled\}/);
  assert.match(characterSource, /Not enough Berries for this buy\./);
  assert.match(characterSource, /You cannot sell more shares than you hold\./);
});

test("portfolio sells fractional holdings with stable request IDs and cap-aware labels", () => {
  assert.match(portfolioSource, /getOrCreateTradeRequestId/);
  assert.match(portfolioSource, /clearTradeRequestId/);
  assert.match(portfolioSource, /clearTradeRequestIdForPayloadConflict/);
  assert.doesNotMatch(portfolioSource, /const \[pendingSellRequests, setPendingSellRequests\]/);
  assert.match(portfolioSource, /const \[busySellRequests, setBusySellRequests\]/);
  assert.match(portfolioSource, /const sellSharesQuantity = calculateMaxSellQuantity\(shares\)/);
  assert.match(
    portfolioSource,
    /const requestKey = `\$\{user\.id\}:sell:\$\{slug\}:\$\{normalizeShareQuantityText\(sellSharesQuantity\)\}`/,
  );
  assert.match(portfolioSource, /const requestId = getOrCreateTradeRequestId\(intent\)/);
  assert.match(
    portfolioSource,
    /sellShares\(\{ data: \{ slug, shares: sellSharesQuantity, requestId \} \}\)/,
  );
  assert.match(portfolioSource, /const sellLabel = h\.shares > 10000 \? "Sell max" : "Sell all"/);
  assert.match(portfolioSource, /\{sellLabel\}/);
  assert.match(portfolioSource, /disabled=\{busySellRequests\[sellKey\] \|\| sellQuantity <= 0\}/);
});

test("fractional share displays use shared formatting helpers", () => {
  assert.match(characterSource, /formatShares\(held\.shares\)/);
  assert.match(characterSource, /formatShares\(h\.shares\)/);
  assert.match(portfolioSource, /formatShares\(h\.shares\)/);
  assert.match(portfolioSource, /formatShares\(entry\.shares\)/);
  assert.match(privateProfileSource, /formatShares\(h\.shares\)/);
  assert.match(publicProfileSource, /formatShares\(h\.shares\)/);
});
