/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const portfolioSource = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/portfolio.tsx"),
  "utf8",
);
const characterSource = readFileSync(join(process.cwd(), "src/routes/character.$slug.tsx"), "utf8");
const publicProfileSource = readFileSync(join(process.cwd(), "src/routes/u.$username.tsx"), "utf8");
const leaderboardsSource = readFileSync(join(process.cwd(), "src/routes/leaderboards.tsx"), "utf8");

function tradeHistoryRowSource() {
  const start = portfolioSource.indexOf("function TradeHistoryRow");
  assert.notEqual(start, -1, "TradeHistoryRow should exist");
  const end = portfolioSource.indexOf("function formatTradeDate", start);
  assert.notEqual(end, -1, "formatTradeDate should follow TradeHistoryRow");
  return portfolioSource.slice(start, end);
}

function characterHandleSellSource() {
  const start = characterSource.indexOf("async function handleSell()");
  assert.notEqual(start, -1, "character handleSell should exist");
  const end = characterSource.indexOf("return (", start);
  assert.notEqual(end, -1, "character render should follow handleSell");
  return characterSource.slice(start, end);
}

test("portfolio clearly separates unrealized and realized performance", () => {
  assert.match(
    portfolioSource,
    /const costBasis = holdings\.reduce\(\(s, h\) => s \+ h\.totalCostBasis, 0\)/,
  );
  assert.match(portfolioSource, /const unrealizedPnl = marketValue - costBasis/);
  assert.match(portfolioSource, /label="Unrealized P\/L"/);
  assert.match(portfolioSource, /UNREALIZED P\/L/);
  assert.match(portfolioSource, /Realized Performance/);
  assert.match(portfolioSource, /label="Realized P\/L"/);
  assert.match(portfolioSource, /const realizedPnl = data\.realizedPnl/);
  assert.match(portfolioSource, /formatRealizedPnl\(realizedPnl\)/);
});

test("portfolio win rate excludes break-even sales from the denominator", () => {
  assert.match(portfolioSource, /const closedTrades = data\.wins \+ data\.losses/);
  assert.match(
    portfolioSource,
    /const breakEvenSales = Math\.max\(0, data\.totalSells - closedTrades\)/,
  );
  assert.match(
    portfolioSource,
    /const winRate = closedTrades > 0 \? \(data\.wins \/ closedTrades\) \* 100 : 0/,
  );
  assert.match(portfolioSource, /Break-even sales are excluded from win rate/);
});

test("portfolio sell toast uses authoritative realized P/L returned from the server", () => {
  assert.match(
    portfolioSource,
    /const result = await sellShares\(\{ data: \{ slug, shares: sellSharesQuantity, requestId \} \}\)/,
  );
  assert.match(portfolioSource, /formatRealizedPnl\(result\.realizedPnl\)/);
  assert.doesNotMatch(
    portfolioSource,
    /result\.price[\s\S]*h\.avgCost|currentPrice[\s\S]*result\.proceeds/,
  );
});

test("character trade desk uses holding basis for unrealized P/L", () => {
  assert.match(
    characterSource,
    /const tradeDeskUnrealizedPnl = held \? price \* held\.shares - held\.totalCostBasis : 0/,
  );
  assert.match(characterSource, /formatRealizedPnl\(tradeDeskUnrealizedPnl\)/);
  assert.doesNotMatch(characterSource, /\(price - held\.avgCost\) \* held\.shares/);
});

test("character sell toast uses authoritative realized P/L returned from the server", () => {
  const handleSell = characterHandleSellSource();

  assert.match(
    handleSell,
    /const result = await sellShares\(\{ data: \{ slug, shares: parsedQty, requestId \} \}\)/,
  );
  assert.match(handleSell, /formatRealizedPnl\(result\.realizedPnl\)/);
  assert.doesNotMatch(
    handleSell,
    /avgCost|currentPrice|tradeDeskUnrealizedPnl|price\s*[-+*/]\s*held|held\.shares\s*[-+*/]\s*price/,
  );
});

test("trade-history sell rows display proceeds, cost basis, and exact realized P/L", () => {
  const row = tradeHistoryRowSource();

  assert.match(row, /const isSell = entry\.side === "sell"/);
  assert.match(row, /const realizedPnl = entry\.realized_pnl \?\? 0/);
  assert.match(
    row,
    /realizedPnl > 0 \? "text-bull" : realizedPnl < 0 \? "text-bear" : "text-muted-foreground"/,
  );
  assert.match(row, /\{isSell \? "Proceeds" : "Cost"\}/);
  assert.match(row, /Basis/);
  assert.match(row, /formatBerries\(entry\.cost_basis \?\? 0\)/);
  assert.match(row, /Realized/);
  assert.match(row, /formatRealizedPnl\(realizedPnl\)/);
});

test("trade-history buy rows keep purchase-cost behavior without fake realized P/L", () => {
  const row = tradeHistoryRowSource();

  assert.match(row, /\{isSell \? "\+" : "-"\}/);
  assert.match(row, /Basis -/);
  assert.match(row, /Realized -/);
  assert.match(row, /formatShares\(entry\.shares\)/);
});

test("public profile and leaderboards continue using aggregate statistics only", () => {
  assert.match(publicProfileSource, /label="Realized P\/L"/);
  assert.match(publicProfileSource, /s\.realized_pnl/);
  assert.match(publicProfileSource, /s\.best_trade_pnl/);
  assert.match(publicProfileSource, /s\.worst_trade_pnl/);
  assert.match(publicProfileSource, /Win Rate/);
  assert.match(leaderboardsSource, /key: "most_profitable"/);
  assert.match(leaderboardsSource, /key: "most_accurate"/);
  assert.doesNotMatch(publicProfileSource, /transactions/);
});
