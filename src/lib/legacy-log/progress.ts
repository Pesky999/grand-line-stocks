import { ACHIEVEMENT_TIER_ORDER } from "../legendary.ts";

export type AchievementCatalogEntry = {
  code: string;
  name: string;
  description: string;
  tier: string;
  category: string;
  icon: string | null;
  reputation_reward: number;
};

export type LegacyLogMetrics = {
  totalTrades?: number | null;
  totalBuys?: number | null;
  totalSells?: number | null;
  totalVolume?: number | null;
  bestTradePnl?: number | null;
  realizedPnl?: number | null;
  loginStreak?: number | null;
  daysActive?: number | null;
  currentNetWorth?: number | null;
  currentRank?: number | null;
  wins?: number | null;
  losses?: number | null;
  largestPositionValue?: number | null;
  holdingCharacterCount?: number | null;
  holdingCategoryCount?: number | null;
  glgWins?: number | null;
  glgOneShotWins?: number | null;
  glgBestStreak?: number | null;
  glgHintsFreeSolved?: boolean | null;
  dailyCrewSubmissionCount?: number | null;
  dailyCrewBestScore?: number | null;
  dailyCrewBestRank?: string | null;
  dailyCrewPerfectEligible?: boolean | null;
  triviaCorrectCount?: number | null;
  maxOpenHoldingAgeDays?: number | null;
  largestHolderEligible?: boolean | null;
  firstEventEligible?: boolean | null;
  reputationScore?: number | null;
};

export type UnlockedAchievement = {
  code: string;
  unlockedAt: string;
};

export type AchievementProgressRow = {
  code: string;
  name: string;
  description: string;
  tier: string;
  category: string;
  icon: string | null;
  reputationReward: number;
  unlocked: boolean;
  unlockedAt: string | null;
  current: number | null;
  target: number | null;
  progressPercent: number | null;
  progressLabel: string;
};

const ACHIEVEMENT_ORDER = [
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
  "deckhand_dealer",
  "balanced_ledger",
  "million_berry_mover",
  "big_score",
  "treasure_haul",
  "storm_trader",
  "first_crew",
  "crew_builder",
  "grand_fleet",
  "four_seas_investor",
  "rising_bounty",
  "supernova_fortune",
  "emperors_treasury",
  "whale_position",
  "seven_day_sail",
  "seasoned_sailor",
  "unbroken_voyage",
  "king_of_exchange",
  "first_sight",
  "observation_haki",
  "clue_free_navigator",
  "winning_route",
  "grand_line_oracle",
  "first_command",
  "a_rank_captain",
  "s_rank_commander",
  "perfect_crew",
  "first_lesson",
  "sea_scholar",
  "ohara_archivist",
] as const;

const BERRY_SYMBOL = "\u0E3F";

function value(input: number | null | undefined) {
  return Number.isFinite(Number(input)) ? Number(input) : 0;
}

function clampPercent(current: number, target: number) {
  if (target <= 0) return null;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

function formatBerries(value: number) {
  if (value > 0 && value < 0.01) return `${BERRY_SYMBOL}<0.01`;
  const fractionDigits = Math.abs(value) > 0 && Math.abs(value) < 1 ? 2 : 0;
  return `${BERRY_SYMBOL}${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: fractionDigits,
  })}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function progress(current: number, target: number, label?: string) {
  return {
    current,
    target,
    progressPercent: clampPercent(current, target),
    progressLabel: label ?? `${formatNumber(current)} / ${formatNumber(target)}`,
  };
}

function booleanProgress(done: boolean, label: string) {
  return {
    current: done ? 1 : 0,
    target: 1,
    progressPercent: done ? 100 : 0,
    progressLabel: label,
  };
}

function dualProgress({
  firstCurrent,
  firstTarget,
  secondCurrent,
  secondTarget,
  label,
}: {
  firstCurrent: number;
  firstTarget: number;
  secondCurrent: number;
  secondTarget: number;
  label: string;
}) {
  const firstPercent = clampPercent(firstCurrent, firstTarget) ?? 0;
  const secondPercent = clampPercent(secondCurrent, secondTarget) ?? 0;
  return {
    current: Math.min(firstCurrent, secondCurrent),
    target: Math.min(firstTarget, secondTarget),
    progressPercent: Math.min(firstPercent, secondPercent),
    progressLabel: label,
  };
}

function rankProgress(rank: number | null | undefined, target: number) {
  const currentRank = rank && rank > 0 ? rank : null;
  const met = currentRank !== null && currentRank <= target;
  const current = met ? 1 : currentRank === null ? 0 : Math.max(0, target / currentRank);
  return {
    current,
    target: 1,
    progressPercent: met ? 100 : currentRank === null ? 0 : clampPercent(current, 1),
    progressLabel: currentRank
      ? `Current #${currentRank.toLocaleString()} - Goal Top ${target}`
      : `Unranked - Goal Top ${target}`,
  };
}

function buildKnownProgress(code: string, metrics: LegacyLogMetrics) {
  switch (code) {
    case "first_trade":
      return progress(value(metrics.totalTrades), 1);
    case "first_profit":
      return progress(
        value(metrics.realizedPnl),
        0.01,
        `${formatBerries(value(metrics.realizedPnl))} realized; any positive realized profit qualifies`,
      );
    case "first_event":
      return booleanProgress(!!metrics.firstEventEligible, "Live through a published market event");
    case "hundred_trades":
      return progress(value(metrics.totalTrades), 100);
    case "hundred_k_profit":
      return progress(
        value(metrics.realizedPnl),
        100_000,
        `${formatBerries(value(metrics.realizedPnl))} / ${formatBerries(100_000)} realized`,
      );
    case "streak_30":
      return progress(value(metrics.loginStreak), 30, `${value(metrics.loginStreak)} / 30 days`);
    case "millionaire":
      return progress(
        value(metrics.currentNetWorth),
        1_000_000,
        `${formatBerries(value(metrics.currentNetWorth))} / ${formatBerries(1_000_000)} net worth`,
      );
    case "top_100":
      return rankProgress(metrics.currentRank, 100);
    case "top_10":
      return rankProgress(metrics.currentRank, 10);
    case "largest_holder":
      return booleanProgress(
        !!metrics.largestHolderEligible,
        "Hold the largest position in any character",
      );
    case "yonko_investor":
      return progress(
        value(metrics.reputationScore),
        850,
        `${value(metrics.reputationScore)} / 850 reputation`,
      );
    case "pirate_king":
      return progress(
        value(metrics.reputationScore),
        950,
        `${value(metrics.reputationScore)} / 950 reputation`,
      );
    case "market_prophet": {
      const wins = value(metrics.wins);
      const losses = value(metrics.losses);
      const closed = wins + losses;
      const winRate = closed > 0 ? (wins * 100) / closed : 0;
      const countPercent = clampPercent(closed, 50) ?? 0;
      const ratePercent = clampPercent(winRate, 70) ?? 0;
      return {
        current: closed,
        target: 50,
        progressPercent: Math.min(countPercent, ratePercent),
        progressLabel: `${closed} / 50 closed - ${winRate.toFixed(1)}% / 70% win rate`,
      };
    }
    case "diamond_hands":
      return progress(
        value(metrics.maxOpenHoldingAgeDays),
        60,
        `${Math.floor(value(metrics.maxOpenHoldingAgeDays))} / 60 open holding days`,
      );
    case "deckhand_dealer":
      return progress(value(metrics.totalTrades), 10, `${value(metrics.totalTrades)} / 10 trades`);
    case "balanced_ledger":
      return dualProgress({
        firstCurrent: value(metrics.totalBuys),
        firstTarget: 25,
        secondCurrent: value(metrics.totalSells),
        secondTarget: 25,
        label: `${value(metrics.totalBuys)} / 25 buys - ${value(metrics.totalSells)} / 25 sells`,
      });
    case "million_berry_mover":
      return progress(
        value(metrics.totalVolume),
        1_000_000,
        `${formatBerries(value(metrics.totalVolume))} / ${formatBerries(1_000_000)} lifetime volume`,
      );
    case "big_score":
      return progress(
        value(metrics.bestTradePnl),
        10_000,
        `${formatBerries(value(metrics.bestTradePnl))} / ${formatBerries(10_000)} best sell profit`,
      );
    case "treasure_haul":
      return progress(
        value(metrics.bestTradePnl),
        50_000,
        `${formatBerries(value(metrics.bestTradePnl))} / ${formatBerries(50_000)} best sell profit`,
      );
    case "storm_trader":
      return progress(
        value(metrics.totalTrades),
        500,
        `${value(metrics.totalTrades)} / 500 trades`,
      );
    case "first_crew":
      return progress(
        value(metrics.holdingCharacterCount),
        3,
        `${value(metrics.holdingCharacterCount)} / 3 open character positions`,
      );
    case "crew_builder":
      return progress(
        value(metrics.holdingCharacterCount),
        10,
        `${value(metrics.holdingCharacterCount)} / 10 open character positions`,
      );
    case "grand_fleet":
      return progress(
        value(metrics.holdingCharacterCount),
        25,
        `${value(metrics.holdingCharacterCount)} / 25 open character positions`,
      );
    case "four_seas_investor":
      return progress(
        value(metrics.holdingCategoryCount),
        4,
        `${value(metrics.holdingCategoryCount)} / 4 stock categories held`,
      );
    case "rising_bounty":
      return progress(
        value(metrics.currentNetWorth),
        50_000,
        `${formatBerries(value(metrics.currentNetWorth))} / ${formatBerries(50_000)} net worth`,
      );
    case "supernova_fortune":
      return progress(
        value(metrics.currentNetWorth),
        250_000,
        `${formatBerries(value(metrics.currentNetWorth))} / ${formatBerries(250_000)} net worth`,
      );
    case "emperors_treasury":
      return progress(
        value(metrics.currentNetWorth),
        5_000_000,
        `${formatBerries(value(metrics.currentNetWorth))} / ${formatBerries(5_000_000)} net worth`,
      );
    case "whale_position":
      return progress(
        value(metrics.largestPositionValue),
        250_000,
        `${formatBerries(value(metrics.largestPositionValue))} / ${formatBerries(250_000)} largest position`,
      );
    case "seven_day_sail":
      return progress(value(metrics.loginStreak), 7, `${value(metrics.loginStreak)} / 7 days`);
    case "seasoned_sailor":
      return progress(
        value(metrics.daysActive),
        100,
        `${value(metrics.daysActive)} / 100 active days`,
      );
    case "unbroken_voyage":
      return progress(value(metrics.loginStreak), 100, `${value(metrics.loginStreak)} / 100 days`);
    case "king_of_exchange":
      return rankProgress(metrics.currentRank, 1);
    case "first_sight":
      return progress(value(metrics.glgWins), 1, `${value(metrics.glgWins)} / 1 puzzle solved`);
    case "observation_haki":
      return progress(
        value(metrics.glgOneShotWins),
        1,
        `${value(metrics.glgOneShotWins)} / 1 first-guess solve`,
      );
    case "clue_free_navigator":
      return booleanProgress(!!metrics.glgHintsFreeSolved, "Solve a puzzle without using a hint");
    case "winning_route":
      return progress(
        value(metrics.glgBestStreak),
        10,
        `${value(metrics.glgBestStreak)} / 10 puzzle win streak`,
      );
    case "grand_line_oracle":
      return progress(value(metrics.glgWins), 50, `${value(metrics.glgWins)} / 50 puzzles solved`);
    case "first_command":
      return progress(
        value(metrics.dailyCrewSubmissionCount),
        1,
        `${value(metrics.dailyCrewSubmissionCount)} / 1 Daily Crew mission submitted`,
      );
    case "a_rank_captain": {
      const rank = metrics.dailyCrewBestRank;
      const done = rank === "a" || rank === "s";
      return booleanProgress(
        done,
        rank ? `Best Daily Crew rank: ${rank.toUpperCase()}` : "Earn A or S rank",
      );
    }
    case "s_rank_commander":
      return booleanProgress(
        metrics.dailyCrewBestRank === "s",
        metrics.dailyCrewBestRank
          ? `Best Daily Crew rank: ${metrics.dailyCrewBestRank.toUpperCase()}`
          : "Earn S rank",
      );
    case "perfect_crew":
      return progress(
        value(metrics.dailyCrewBestScore),
        100,
        metrics.dailyCrewPerfectEligible
          ? "Perfect Daily Crew score achieved"
          : `${value(metrics.dailyCrewBestScore)} / 100 Daily Crew score`,
      );
    case "first_lesson":
      return progress(
        value(metrics.triviaCorrectCount),
        1,
        `${value(metrics.triviaCorrectCount)} / 1 correct trivia answer`,
      );
    case "sea_scholar":
      return progress(
        value(metrics.triviaCorrectCount),
        25,
        `${value(metrics.triviaCorrectCount)} / 25 correct trivia answers`,
      );
    case "ohara_archivist":
      return progress(
        value(metrics.triviaCorrectCount),
        100,
        `${value(metrics.triviaCorrectCount)} / 100 correct trivia answers`,
      );
    default:
      return {
        current: null,
        target: null,
        progressPercent: null,
        progressLabel: "Progress is tracked automatically.",
      };
  }
}

export function buildAchievementProgressRows({
  catalog,
  unlocked,
  metrics,
}: {
  catalog: AchievementCatalogEntry[];
  unlocked: UnlockedAchievement[];
  metrics?: LegacyLogMetrics | null;
}): AchievementProgressRow[] {
  const unlockedByCode = new Map(unlocked.map((entry) => [entry.code, entry.unlockedAt]));
  const tierRank: Record<string, number> = Object.fromEntries(
    ACHIEVEMENT_TIER_ORDER.map((tier, index) => [tier, index]),
  );
  const codeRank: Record<string, number> = Object.fromEntries(
    ACHIEVEMENT_ORDER.map((code, index) => [code, index]),
  );

  return [...catalog]
    .sort((a, b) => {
      const tierDelta = (tierRank[a.tier] ?? 99) - (tierRank[b.tier] ?? 99);
      if (tierDelta !== 0) return tierDelta;
      return (codeRank[a.code] ?? 99) - (codeRank[b.code] ?? 99);
    })
    .map((entry) => {
      const known = buildKnownProgress(entry.code, metrics ?? {});
      const unlockedAt = unlockedByCode.get(entry.code) ?? null;
      const visibleProgress =
        unlockedAt !== null && known.progressPercent !== null
          ? { ...known, progressPercent: 100 }
          : known;
      return {
        code: entry.code,
        name: entry.name,
        description: entry.description,
        tier: entry.tier,
        category: entry.category,
        icon: entry.icon,
        reputationReward: Number(entry.reputation_reward),
        unlocked: unlockedAt !== null,
        unlockedAt,
        ...visibleProgress,
      };
    });
}
