/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { buildAchievementProgressRows, type AchievementCatalogEntry } from "./progress.ts";

const catalog: AchievementCatalogEntry[] = [
  ["first_trade", "First Trade", "beginner", "trading", 10],
  ["first_profit", "First Profit", "beginner", "trading", 15],
  ["first_event", "First Market Event", "beginner", "market", 10],
  ["hundred_trades", "100 Trades", "intermediate", "trading", 40],
  ["hundred_k_profit", "100,000 Berries Earned", "intermediate", "wealth", 60],
  ["streak_30", "30-Day Login Streak", "intermediate", "engagement", 50],
  ["millionaire", "Millionaire Pirate", "advanced", "wealth", 100],
  ["top_100", "Top 100 Investor", "advanced", "rank", 120],
  ["top_10", "Top 10 Investor", "advanced", "rank", 180],
  ["largest_holder", "Largest Holder", "advanced", "dominance", 150],
  ["yonko_investor", "Yonko Investor", "legendary", "prestige", 250],
  ["pirate_king", "Pirate King Investor", "legendary", "prestige", 500],
  ["market_prophet", "Market Prophet", "legendary", "skill", 300],
  ["diamond_hands", "Diamond Hands", "legendary", "patience", 200],
].map(([code, name, tier, category, reward]) => ({
  code: String(code),
  name: String(name),
  description: `${name} criteria`,
  tier: String(tier),
  category: String(category),
  icon: "*",
  reputation_reward: Number(reward),
}));

function row(code: string) {
  const rows = buildAchievementProgressRows({
    catalog,
    unlocked: [{ code: "first_trade", unlockedAt: "2026-07-20T00:00:00Z" }],
    metrics: {
      totalTrades: 42,
      realizedPnl: 12_345,
      loginStreak: 7,
      currentNetWorth: 900_000,
      currentRank: 245,
      wins: 28,
      losses: 14,
      maxOpenHoldingAgeDays: 55,
      largestHolderEligible: false,
      firstEventEligible: true,
      reputationScore: 640,
    },
  });
  const entry = rows.find((item) => item.code === code);
  assert.ok(entry, `${code} should render`);
  return entry;
}

test("renders all 14 current achievement progress rows in tier order", () => {
  const rows = buildAchievementProgressRows({ catalog, unlocked: [], metrics: {} });

  assert.deepEqual(
    rows.map((entry) => entry.code),
    [
      "first_trade",
      "first_profit",
      "first_event",
      "hundred_trades",
      "hundred_k_profit",
      "streak_30",
      "millionaire",
      "top_100",
      "top_10",
      "largest_holder",
      "yonko_investor",
      "pirate_king",
      "market_prophet",
      "diamond_hands",
    ],
  );
});

test("marks locked and unlocked states without hiding locked criteria", () => {
  const unlocked = row("first_trade");
  const locked = row("hundred_trades");

  assert.equal(unlocked.unlocked, true);
  assert.equal(unlocked.unlockedAt, "2026-07-20T00:00:00Z");
  assert.equal(locked.unlocked, false);
  assert.equal(locked.unlockedAt, null);
  assert.equal(locked.target, 100);
  assert.match(locked.progressLabel, /42 \/ 100/);
});

test("clamps numeric achievement progress to zero through one hundred", () => {
  const rows = buildAchievementProgressRows({
    catalog,
    unlocked: [],
    metrics: { totalTrades: 250, realizedPnl: -500, currentNetWorth: 2_000_000 },
  });
  const firstProfit = rows.find((entry) => entry.code === "first_profit")!;
  const hundredTrades = rows.find((entry) => entry.code === "hundred_trades")!;
  const millionaire = rows.find((entry) => entry.code === "millionaire")!;

  assert.equal(firstProfit.progressPercent, 0);
  assert.equal(hundredTrades.progressPercent, 100);
  assert.equal(millionaire.progressPercent, 100);
});

test("rank progress labels match the public goal language", () => {
  assert.equal(row("top_100").progressLabel, "Current #245 - Goal Top 100");
  assert.equal(row("top_10").progressLabel, "Current #245 - Goal Top 10");

  const unranked = buildAchievementProgressRows({
    catalog,
    unlocked: [],
    metrics: { currentRank: null },
  }).find((entry) => entry.code === "top_100")!;

  assert.equal(unranked.progressLabel, "Unranked - Goal Top 100");
});

test("market prophet tracks closed trade count and win-rate requirements together", () => {
  const prophet = row("market_prophet");

  assert.equal(prophet.current, 42);
  assert.equal(prophet.target, 50);
  assert.equal(prophet.progressPercent, 84);
  assert.equal(prophet.progressLabel, "42 / 50 closed - 66.7% / 70% win rate");
});

test("diamond hands uses current open-position age", () => {
  const diamondHands = row("diamond_hands");

  assert.equal(diamondHands.current, 55);
  assert.equal(diamondHands.target, 60);
  assert.equal(diamondHands.progressLabel, "55 / 60 open holding days");
});

test("event and largest-holder achievements support boolean progress", () => {
  assert.equal(row("first_event").progressPercent, 100);
  assert.equal(row("first_event").current, 1);
  assert.equal(row("largest_holder").progressPercent, 0);
  assert.equal(row("largest_holder").current, 0);
});

test("missing statistics default safely without division by zero output", () => {
  const rows = buildAchievementProgressRows({ catalog, unlocked: [], metrics: null });

  for (const entry of rows) {
    if (entry.progressPercent !== null) {
      assert.ok(
        Number.isFinite(entry.progressPercent),
        `${entry.code} should have finite progress`,
      );
    }
    assert.doesNotMatch(entry.progressLabel, /NaN|Infinity/);
  }
});

test("unknown future achievement codes render safely from the catalog", () => {
  const rows = buildAchievementProgressRows({
    catalog: [
      ...catalog,
      {
        code: "future_voyage",
        name: "Future Voyage",
        description: "Future catalog description",
        tier: "legendary",
        category: "future",
        icon: "?",
        reputation_reward: 1,
      },
    ],
    unlocked: [{ code: "future_voyage", unlockedAt: "2026-07-21T00:00:00Z" }],
    metrics: {},
  });
  const future = rows.find((entry) => entry.code === "future_voyage")!;

  assert.equal(future.description, "Future catalog description");
  assert.equal(future.unlocked, true);
  assert.equal(future.current, null);
  assert.equal(future.target, null);
  assert.equal(future.progressPercent, null);
});
