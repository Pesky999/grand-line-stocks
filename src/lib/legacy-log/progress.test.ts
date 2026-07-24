/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { buildAchievementProgressRows, type AchievementCatalogEntry } from "./progress.ts";
import { TITLE_LADDER, getInvestorTitleStatus } from "../legendary.ts";

const originalCatalog: AchievementCatalogEntry[] = [
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

const expansionCatalog: AchievementCatalogEntry[] = [
  ["deckhand_dealer", "Deckhand Dealer", "Complete 10 trades.", "beginner", "Trading", 5],
  [
    "balanced_ledger",
    "Balanced Ledger",
    "Complete 25 buys and 25 sells.",
    "intermediate",
    "Trading",
    10,
  ],
  [
    "million_berry_mover",
    "Million-Berry Mover",
    "Reach \u0E3F1,000,000 in lifetime trade volume.",
    "advanced",
    "Trading",
    20,
  ],
  [
    "big_score",
    "Big Score",
    "Earn at least \u0E3F10,000 profit from one sell.",
    "intermediate",
    "Trading",
    10,
  ],
  [
    "treasure_haul",
    "Treasure Haul",
    "Earn at least \u0E3F50,000 profit from one sell.",
    "advanced",
    "Trading",
    20,
  ],
  ["storm_trader", "Storm Trader", "Complete 500 trades.", "legendary", "Trading", 40],
  [
    "first_crew",
    "First Crew",
    "Own shares in 3 characters simultaneously.",
    "beginner",
    "Portfolio",
    5,
  ],
  [
    "crew_builder",
    "Crew Builder",
    "Own shares in 10 characters simultaneously.",
    "intermediate",
    "Portfolio",
    10,
  ],
  [
    "grand_fleet",
    "Grand Fleet",
    "Own shares in 25 characters simultaneously.",
    "advanced",
    "Portfolio",
    20,
  ],
  [
    "four_seas_investor",
    "Four Seas Investor",
    "Own a Blue Chip, Growth, Speculative, and Meme stock simultaneously.",
    "intermediate",
    "Portfolio",
    10,
  ],
  ["rising_bounty", "Rising Bounty", "Reach \u0E3F50,000 net worth.", "beginner", "Wealth", 5],
  [
    "supernova_fortune",
    "Supernova Fortune",
    "Reach \u0E3F250,000 net worth.",
    "intermediate",
    "Wealth",
    10,
  ],
  [
    "emperors_treasury",
    "Emperor's Treasury",
    "Reach \u0E3F5,000,000 net worth.",
    "legendary",
    "Wealth",
    40,
  ],
  [
    "whale_position",
    "Whale Position",
    "Hold one position worth at least \u0E3F250,000.",
    "advanced",
    "Portfolio",
    20,
  ],
  ["seven_day_sail", "Seven-Day Sail", "Maintain a 7-day login streak.", "beginner", "Activity", 5],
  [
    "seasoned_sailor",
    "Seasoned Sailor",
    "Be active on 100 distinct days.",
    "advanced",
    "Activity",
    20,
  ],
  [
    "unbroken_voyage",
    "Unbroken Voyage",
    "Maintain a 100-day login streak.",
    "legendary",
    "Activity",
    40,
  ],
  [
    "king_of_exchange",
    "King of the Exchange",
    "Reach rank #1 on the all-time net-worth leaderboard.",
    "legendary",
    "Leaderboard",
    40,
  ],
  [
    "first_sight",
    "First Sight",
    "Solve your first daily puzzle.",
    "beginner",
    "Grand Line Guess",
    5,
  ],
  [
    "observation_haki",
    "Observation Haki",
    "Solve a puzzle on the first guess.",
    "intermediate",
    "Grand Line Guess",
    10,
  ],
  [
    "clue_free_navigator",
    "Clue-Free Navigator",
    "Solve a puzzle without using a hint.",
    "intermediate",
    "Grand Line Guess",
    10,
  ],
  [
    "winning_route",
    "Winning Route",
    "Win 10 daily puzzles consecutively.",
    "advanced",
    "Grand Line Guess",
    20,
  ],
  [
    "grand_line_oracle",
    "Grand Line Oracle",
    "Win 50 daily puzzles.",
    "legendary",
    "Grand Line Guess",
    40,
  ],
  [
    "first_command",
    "First Command",
    "Submit your first Daily Crew mission.",
    "beginner",
    "Daily Crew",
    5,
  ],
  ["a_rank_captain", "A-Rank Captain", "Earn an A or S rank.", "intermediate", "Daily Crew", 10],
  ["s_rank_commander", "S-Rank Commander", "Earn an S rank.", "advanced", "Daily Crew", 20],
  [
    "perfect_crew",
    "Perfect Crew",
    "Achieve the maximum possible mission score.",
    "advanced",
    "Daily Crew",
    20,
  ],
  [
    "first_lesson",
    "First Lesson",
    "Answer your first trivia question correctly.",
    "beginner",
    "Trivia",
    5,
  ],
  [
    "sea_scholar",
    "Sea Scholar",
    "Answer 25 trivia questions correctly.",
    "intermediate",
    "Trivia",
    10,
  ],
  [
    "ohara_archivist",
    "Ohara Archivist",
    "Answer 100 trivia questions correctly.",
    "advanced",
    "Trivia",
    20,
  ],
].map(([code, name, description, tier, category, reward]) => ({
  code: String(code),
  name: String(name),
  description: String(description),
  tier: String(tier),
  category: String(category),
  icon: "*",
  reputation_reward: Number(reward),
}));

const catalog = [...originalCatalog, ...expansionCatalog];

function row(code: string) {
  const rows = buildAchievementProgressRows({
    catalog,
    unlocked: [{ code: "first_trade", unlockedAt: "2026-07-20T00:00:00Z" }],
    metrics: {
      totalTrades: 42,
      totalBuys: 20,
      totalSells: 30,
      totalVolume: 750_000,
      bestTradePnl: 12_345,
      realizedPnl: 12_345,
      loginStreak: 7,
      daysActive: 44,
      currentNetWorth: 900_000,
      currentRank: 245,
      largestPositionValue: 100_000,
      holdingCharacterCount: 8,
      holdingCategoryCount: 3,
      glgWins: 12,
      glgOneShotWins: 1,
      glgBestStreak: 6,
      glgHintsFreeSolved: true,
      dailyCrewSubmissionCount: 2,
      dailyCrewBestScore: 85,
      dailyCrewBestRank: "a",
      dailyCrewPerfectEligible: false,
      triviaCorrectCount: 26,
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

test("renders exactly 44 achievement progress rows in tier order", () => {
  const rows = buildAchievementProgressRows({ catalog, unlocked: [], metrics: {} });

  assert.equal(rows.length, 44);
  assert.deepEqual(
    rows.map((entry) => entry.code),
    [
      "first_trade",
      "first_profit",
      "first_event",
      "deckhand_dealer",
      "first_crew",
      "rising_bounty",
      "seven_day_sail",
      "first_sight",
      "first_command",
      "first_lesson",
      "hundred_trades",
      "hundred_k_profit",
      "streak_30",
      "balanced_ledger",
      "big_score",
      "crew_builder",
      "four_seas_investor",
      "supernova_fortune",
      "observation_haki",
      "clue_free_navigator",
      "a_rank_captain",
      "sea_scholar",
      "millionaire",
      "top_100",
      "top_10",
      "largest_holder",
      "million_berry_mover",
      "treasure_haul",
      "grand_fleet",
      "whale_position",
      "seasoned_sailor",
      "winning_route",
      "s_rank_commander",
      "perfect_crew",
      "ohara_archivist",
      "yonko_investor",
      "pirate_king",
      "market_prophet",
      "diamond_hands",
      "storm_trader",
      "emperors_treasury",
      "unbroken_voyage",
      "king_of_exchange",
      "grand_line_oracle",
    ],
  );
});

test("preserves the original 14 achievement catalog entries unchanged", () => {
  assert.deepEqual(
    catalog.filter((entry) => originalCatalog.some((original) => original.code === entry.code)),
    originalCatalog,
  );
});

test("renders every new achievement with progress labels and thresholds", () => {
  const cases: Array<[string, number | null, number | null, RegExp]> = [
    ["deckhand_dealer", 42, 10, /42 \/ 10 trades/],
    ["balanced_ledger", 20, 25, /20 \/ 25 buys - 30 \/ 25 sells/],
    ["million_berry_mover", 750_000, 1_000_000, /\u0E3F750,000 \/ \u0E3F1,000,000 lifetime volume/],
    ["big_score", 12_345, 10_000, /\u0E3F12,345 \/ \u0E3F10,000 best sell profit/],
    ["treasure_haul", 12_345, 50_000, /\u0E3F12,345 \/ \u0E3F50,000 best sell profit/],
    ["storm_trader", 42, 500, /42 \/ 500 trades/],
    ["first_crew", 8, 3, /8 \/ 3 open character positions/],
    ["crew_builder", 8, 10, /8 \/ 10 open character positions/],
    ["grand_fleet", 8, 25, /8 \/ 25 open character positions/],
    ["four_seas_investor", 3, 4, /3 \/ 4 stock categories held/],
    ["rising_bounty", 900_000, 50_000, /\u0E3F900,000 \/ \u0E3F50,000 net worth/],
    ["supernova_fortune", 900_000, 250_000, /\u0E3F900,000 \/ \u0E3F250,000 net worth/],
    ["emperors_treasury", 900_000, 5_000_000, /\u0E3F900,000 \/ \u0E3F5,000,000 net worth/],
    ["whale_position", 100_000, 250_000, /\u0E3F100,000 \/ \u0E3F250,000 largest position/],
    ["seven_day_sail", 7, 7, /7 \/ 7 days/],
    ["seasoned_sailor", 44, 100, /44 \/ 100 active days/],
    ["unbroken_voyage", 7, 100, /7 \/ 100 days/],
    ["king_of_exchange", 0.004081632653061225, 1, /Current #245 - Goal Top 1/],
    ["first_sight", 12, 1, /12 \/ 1 puzzle solved/],
    ["observation_haki", 1, 1, /1 \/ 1 first-guess solve/],
    ["clue_free_navigator", 1, 1, /Solve a puzzle without using a hint/],
    ["winning_route", 6, 10, /6 \/ 10 puzzle win streak/],
    ["grand_line_oracle", 12, 50, /12 \/ 50 puzzles solved/],
    ["first_command", 2, 1, /2 \/ 1 Daily Crew mission submitted/],
    ["a_rank_captain", 1, 1, /Best Daily Crew rank: A/],
    ["s_rank_commander", 0, 1, /Best Daily Crew rank: A/],
    ["perfect_crew", 85, 100, /85 \/ 100 Daily Crew score/],
    ["first_lesson", 26, 1, /26 \/ 1 correct trivia answer/],
    ["sea_scholar", 26, 25, /26 \/ 25 correct trivia answers/],
    ["ohara_archivist", 26, 100, /26 \/ 100 correct trivia answers/],
  ];

  assert.equal(cases.length, 30);
  for (const [code, current, target, label] of cases) {
    const entry = row(code);
    assert.equal(entry.current, current, `${code} current`);
    assert.equal(entry.target, target, `${code} target`);
    assert.match(entry.progressLabel, label, `${code} label`);
  }
});

test("new locked achievements show partial percentages and unlocked achievements stay complete", () => {
  const locked = row("grand_line_oracle");
  assert.equal(locked.unlocked, false);
  assert.equal(locked.progressPercent, 24);

  const unlocked = buildAchievementProgressRows({
    catalog,
    unlocked: [{ code: "ohara_archivist", unlockedAt: "2026-07-22T00:00:00Z" }],
    metrics: { triviaCorrectCount: 26 },
  }).find((entry) => entry.code === "ohara_archivist")!;

  assert.equal(unlocked.current, 26);
  assert.equal(unlocked.target, 100);
  assert.equal(unlocked.progressPercent, 100);
});

test("perfect crew progress shows the completed state when a max score is achieved", () => {
  const perfectCrew = buildAchievementProgressRows({
    catalog,
    unlocked: [],
    metrics: { dailyCrewBestScore: 100, dailyCrewPerfectEligible: true },
  }).find((entry) => entry.code === "perfect_crew")!;

  assert.equal(perfectCrew.progressPercent, 100);
  assert.equal(perfectCrew.progressLabel, "Perfect Daily Crew score achieved");
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

test("first profit tracks the catalog cent threshold without hiding fractional profit", () => {
  const firstProfit = buildAchievementProgressRows({
    catalog,
    unlocked: [],
    metrics: { realizedPnl: 0.005 },
  }).find((entry) => entry.code === "first_profit")!;

  assert.equal(firstProfit.current, 0.005);
  assert.equal(firstProfit.target, 0.01);
  assert.equal(firstProfit.progressPercent, 50);
  assert.match(firstProfit.progressLabel, /\u0E3F<0\.01 realized/);
  assert.match(firstProfit.progressLabel, /any positive realized profit qualifies/);
});

test("Berry progress labels use the Berry symbol consistently", () => {
  assert.match(row("hundred_k_profit").progressLabel, /\u0E3F12,345 \/ \u0E3F100,000 realized/);
  assert.match(row("millionaire").progressLabel, /\u0E3F900,000 \/ \u0E3F1,000,000 net worth/);
});

test("unlocked reputation achievements remain visibly complete if reputation later falls", () => {
  const yonko = buildAchievementProgressRows({
    catalog,
    unlocked: [{ code: "yonko_investor", unlockedAt: "2026-07-20T00:00:00Z" }],
    metrics: { reputationScore: 640 },
  }).find((entry) => entry.code === "yonko_investor")!;

  assert.equal(yonko.unlocked, true);
  assert.equal(yonko.current, 640);
  assert.equal(yonko.target, 850);
  assert.equal(yonko.progressLabel, "640 / 850 reputation");
  assert.equal(yonko.progressPercent, 100);
});

test("unlocked rank achievements remain visibly complete if rank later falls", () => {
  const topTen = buildAchievementProgressRows({
    catalog,
    unlocked: [{ code: "top_10", unlockedAt: "2026-07-20T00:00:00Z" }],
    metrics: { currentRank: 245 },
  }).find((entry) => entry.code === "top_10")!;

  assert.equal(topTen.unlocked, true);
  assert.equal(topTen.progressLabel, "Current #245 - Goal Top 10");
  assert.equal(topTen.progressPercent, 100);
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

test("title ladder labels only the first title above reputation as next", () => {
  const statuses = TITLE_LADDER.map((title) =>
    getInvestorTitleStatus({
      titleCode: title.code,
      currentTitle: "warlord_investor",
      reputationScore: 640,
    }),
  );

  assert.deepEqual(statuses, ["complete", "complete", "complete", "current", "next", "locked"]);
  assert.equal(statuses.filter((status) => status === "next").length, 1);
});

test("pirate king current title has no next title", () => {
  const statuses = TITLE_LADDER.map((title) =>
    getInvestorTitleStatus({
      titleCode: title.code,
      currentTitle: "pirate_king_investor",
      reputationScore: 1_000,
    }),
  );

  assert.deepEqual(statuses, [
    "complete",
    "complete",
    "complete",
    "complete",
    "complete",
    "current",
  ]);
  assert.equal(statuses.filter((status) => status === "next").length, 0);
});
