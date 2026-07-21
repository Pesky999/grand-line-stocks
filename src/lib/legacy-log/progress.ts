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
  realizedPnl?: number | null;
  loginStreak?: number | null;
  currentNetWorth?: number | null;
  currentRank?: number | null;
  wins?: number | null;
  losses?: number | null;
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
] as const;

function value(input: number | null | undefined) {
  return Number.isFinite(Number(input)) ? Number(input) : 0;
}

function clampPercent(current: number, target: number) {
  if (target <= 0) return null;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

function formatBerries(value: number) {
  if (value > 0 && value < 0.01) return "à¸¿<0.01";
  const fractionDigits = Math.abs(value) > 0 && Math.abs(value) < 1 ? 2 : 0;
  return `à¸¿${value.toLocaleString("en-US", {
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
