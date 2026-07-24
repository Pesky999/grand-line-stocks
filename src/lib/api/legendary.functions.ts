import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicSupabaseClient } from "@/integrations/supabase/public.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const LEGACY_LOG_QUERY_KEY = ["legacy-log"] as const;

const progressionResultSchema = z
  .object({
    userId: z.string().uuid(),
    newAchievements: z.coerce.number().int().min(0),
    reputationScore: z.coerce.number().int().min(0).max(1000),
    title: z.string(),
    iterations: z.coerce.number().int().min(0).max(4),
  })
  .strict();

const recordMyDailyActivityResultSchema = z
  .object({
    streak: z.coerce.number().int().min(0),
    progression: progressionResultSchema,
  })
  .strict();

type PublicLeaderboardRow = {
  rank: number;
  prev_rank: number | null;
  value: number | string;
  username: string | null;
  display_name: string | null;
  title: string | null;
};

type PublicProfileHoldingRow = {
  shares: number | string;
  avg_cost: number | string;
  characters: {
    slug: string;
    name: string;
    current_price: number | string;
  };
};

type PublicCharacterTopHolderRow = {
  rank: number;
  shares: number | string;
  value: number | string;
  username: string | null;
  display_name: string | null;
};

export const BOARD_KEYS = [
  "net_worth_all_time",
  "return_all_time",
  "return_30d",
  "return_7d",
  "most_active",
  "most_profitable",
  "most_accurate",
] as const;
export type BoardKey = (typeof BOARD_KEYS)[number] | string;

export const listLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        board: z.enum(BOARD_KEYS),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).max(10000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    const { data: rows, error } = await db.rpc("get_public_leaderboard", {
      _board_key: data.board,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (error) throw error;
    return ((rows ?? []) as PublicLeaderboardRow[]).map((r) => ({
      rank: r.rank,
      prev_rank: r.prev_rank,
      value: Number(r.value),
      username: r.username ?? "anon",
      display_name: r.display_name ?? null,
      title: r.title ?? "rookie_pirate",
    }));
  });

export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ username: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("id,username,display_name,created_at")
      .eq("username", data.username)
      .maybeSingle();
    if (!profile) throw new Error("Investor not found");
    const [
      { data: stats },
      { data: wallet },
      { data: achievements },
      { data: snapshots },
      { data: holdings },
      { data: rankRow },
    ] = await Promise.all([
      db.from("user_stats").select("*").eq("user_id", profile.id).maybeSingle(),
      db.from("user_wallets").select("berries").eq("user_id", profile.id).maybeSingle(),
      db
        .from("user_achievements")
        .select("unlocked_at,achievements(code,name,description,tier,icon)")
        .eq("user_id", profile.id)
        .order("unlocked_at", { ascending: false }),
      db
        .from("net_worth_snapshots")
        .select("snapshot_date,net_worth,return_pct")
        .eq("user_id", profile.id)
        .order("snapshot_date", { ascending: true })
        .limit(120),
      db
        .from("user_holdings")
        .select("shares,avg_cost,characters(slug,name,current_price)")
        .eq("user_id", profile.id),
      db
        .from("leaderboard_cache")
        .select("rank,prev_rank")
        .eq("board_key", "net_worth_all_time")
        .eq("user_id", profile.id)
        .maybeSingle(),
    ]);

    const profileHoldings = (holdings ?? []) as PublicProfileHoldingRow[];
    const equity = profileHoldings.reduce(
      (s, h) => s + Number(h.shares) * Number(h.characters.current_price),
      0,
    );
    const cash = Number(wallet?.berries ?? 0);
    return {
      profile,
      stats,
      cash,
      equity,
      net_worth: cash + equity,
      achievements: achievements ?? [],
      snapshots: snapshots ?? [],
      holdings: profileHoldings.map((h) => ({
        slug: h.characters.slug,
        name: h.characters.name,
        shares: Number(h.shares),
        avgCost: Number(h.avg_cost),
        currentPrice: Number(h.characters.current_price),
      })),
      rank: rankRow?.rank ?? null,
      prev_rank: rankRow?.prev_rank ?? null,
    };
  });

export const listLegacy = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        username: z.string().min(1).max(64).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(10000).default(0),
      })
      .optional()
      .default({})
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    const { data: rows, error } = await db.rpc("get_public_legacy_records", {
      _username: data.username ?? undefined,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (error) throw error;
    return rows ?? [];
  });

export const listAchievementsCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("achievements")
    .select("code,name,description,tier,category,icon,reputation_reward")
    .order("tier");
  if (error) throw error;
  return data ?? [];
});

export const recordMyDailyActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("record_my_daily_activity");
    if (error) throw new Error(error.message);
    return recordMyDailyActivityResultSchema.parse(data);
  });

export const getMyLegacyLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const userId = context.userId;

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id,username,display_name,created_at")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const [
      { data: stats, error: statsError },
      { data: rank, error: rankError },
      { data: catalog, error: catalogError },
      { data: unlocked, error: unlockedError },
      { data: legacyRecords, error: legacyError },
      { data: holdings, error: holdingsError },
      { data: firstEvent, error: firstEventError },
      { data: glgStats, error: glgStatsError },
      { count: glgHintsFreeCount, error: glgHintsFreeError },
      { data: dailyCrewSubmissions, error: dailyCrewError },
      { count: triviaCorrectCount, error: triviaCorrectError },
    ] = await Promise.all([
      db.from("user_stats").select("*").eq("user_id", userId).maybeSingle(),
      db
        .from("leaderboard_cache")
        .select("rank,prev_rank,value")
        .eq("board_key", "net_worth_all_time")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("achievements")
        .select("code,name,description,tier,category,icon,reputation_reward")
        .order("tier", { ascending: true })
        .order("code", { ascending: true }),
      db
        .from("user_achievements")
        .select("unlocked_at,achievements(code,reputation_reward)")
        .eq("user_id", userId)
        .order("unlocked_at", { ascending: false }),
      db
        .from("legacy_records")
        .select("code,title,description,value,achieved_at,character_id,characters(slug,name)")
        .eq("user_id", userId)
        .order("achieved_at", { ascending: false }),
      db
        .from("user_holdings")
        .select("character_id,shares,created_at,characters(slug,name,current_price,category)")
        .eq("user_id", userId)
        .gt("shares", 0),
      profile?.created_at
        ? db
            .from("market_events")
            .select("id")
            .eq("status", "published")
            .not("published_at", "is", null)
            .gte("published_at", profile.created_at)
            .lte("published_at", new Date().toISOString())
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
      db
        .from("grand_line_guess_stats")
        .select("games_won,one_shot_wins,best_streak")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("grand_line_guess_results")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("solved", true)
        .eq("hints_used", 0),
      db
        .from("daily_crew_submissions")
        .select("score,rank,daily_crew_missions(max_score)")
        .eq("user_id", userId),
      db
        .from("trivia_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("correct", true),
    ]);

    for (const error of [
      statsError,
      rankError,
      catalogError,
      unlockedError,
      legacyError,
      holdingsError,
      firstEventError,
      glgStatsError,
      glgHintsFreeError,
      dailyCrewError,
      triviaCorrectError,
    ]) {
      if (error) throw error;
    }

    const positiveHoldings = (holdings ?? []) as {
      character_id: string;
      shares: number | string;
      created_at: string;
      characters: {
        category: string;
      } | null;
    }[];
    const characterIds = [...new Set(positiveHoldings.map((holding) => holding.character_id))];
    const heldCategories = new Set(
      positiveHoldings
        .map((holding) => holding.characters?.category)
        .filter((category): category is string => !!category),
    );
    let largestHolderEligible = false;

    if (characterIds.length > 0) {
      const { data: holderRows, error } = await db
        .from("user_holdings")
        .select("character_id,user_id,shares")
        .in("character_id", characterIds)
        .gt("shares", 0);
      if (error) throw error;

      largestHolderEligible = positiveHoldings.some((holding) => {
        const userShares = Number(holding.shares);
        const maxShares = Math.max(
          ...(holderRows ?? [])
            .filter((row) => row.character_id === holding.character_id)
            .map((row) => Number(row.shares)),
          0,
        );
        return userShares > 0 && userShares >= maxShares;
      });
    }

    const dailyCrewRows = (dailyCrewSubmissions ?? []) as {
      score: number | string;
      rank: string;
      daily_crew_missions: { max_score: number | string } | null;
    }[];
    const dailyCrewBestScore = dailyCrewRows.reduce(
      (max, submission) => Math.max(max, Number(submission.score)),
      0,
    );
    const dailyCrewBestRank =
      dailyCrewRows.find((submission) => submission.rank === "s")?.rank ??
      dailyCrewRows.find((submission) => submission.rank === "a")?.rank ??
      dailyCrewRows.find((submission) => submission.rank === "b")?.rank ??
      dailyCrewRows.find((submission) => submission.rank === "c")?.rank ??
      dailyCrewRows.find((submission) => submission.rank === "fail")?.rank ??
      null;
    const dailyCrewPerfectEligible = dailyCrewRows.some(
      (submission) =>
        Number(submission.score) >= Number(submission.daily_crew_missions?.max_score ?? 100),
    );

    const now = Date.now();
    const maxOpenHoldingAgeDays = positiveHoldings.reduce((max, holding) => {
      const openedAt = new Date(holding.created_at).getTime();
      if (!Number.isFinite(openedAt)) return max;
      return Math.max(max, Math.floor((now - openedAt) / 86_400_000));
    }, 0);

    const unlockedAchievements = (
      (unlocked ?? []) as {
        unlocked_at: string;
        achievements: { code: string; reputation_reward: number } | null;
      }[]
    )
      .filter((entry) => entry.achievements?.code)
      .map((entry) => ({
        code: entry.achievements!.code,
        unlockedAt: entry.unlocked_at,
        reputationReward: Number(entry.achievements!.reputation_reward ?? 0),
      }));

    return {
      profile,
      stats,
      rank,
      catalog: catalog ?? [],
      unlocked: unlockedAchievements,
      legacyRecords: legacyRecords ?? [],
      metrics: {
        totalTrades: Number(stats?.total_trades ?? 0),
        totalBuys: Number(stats?.total_buys ?? 0),
        totalSells: Number(stats?.total_sells ?? 0),
        totalVolume: Number(stats?.total_volume ?? 0),
        bestTradePnl: Number(stats?.best_trade_pnl ?? 0),
        realizedPnl: Number(stats?.realized_pnl ?? 0),
        loginStreak: Number(stats?.login_streak ?? 0),
        daysActive: Number(stats?.days_active ?? 0),
        currentNetWorth: Number(stats?.current_net_worth ?? 0),
        currentRank: rank?.rank ?? stats?.current_rank ?? null,
        wins: Number(stats?.wins ?? 0),
        losses: Number(stats?.losses ?? 0),
        largestPositionValue: Number(stats?.largest_position_value ?? 0),
        holdingCharacterCount: positiveHoldings.length,
        holdingCategoryCount: heldCategories.size,
        glgWins: Number(glgStats?.games_won ?? 0),
        glgOneShotWins: Number(glgStats?.one_shot_wins ?? 0),
        glgBestStreak: Number(glgStats?.best_streak ?? 0),
        glgHintsFreeSolved: Number(glgHintsFreeCount ?? 0) > 0,
        dailyCrewSubmissionCount: dailyCrewRows.length,
        dailyCrewBestScore,
        dailyCrewBestRank,
        dailyCrewPerfectEligible,
        triviaCorrectCount: Number(triviaCorrectCount ?? 0),
        maxOpenHoldingAgeDays,
        largestHolderEligible,
        firstEventEligible: (firstEvent ?? []).length > 0,
        reputationScore: Number(stats?.reputation_score ?? 0),
      },
      achievementCount: unlockedAchievements.length,
      achievementReputationRewardTotal: unlockedAchievements.reduce(
        (sum, achievement) => sum + achievement.reputationReward,
        0,
      ),
      currentTitle: stats?.title ?? "rookie_pirate",
      currentSpecialization: stats?.specialization ?? "generalist",
    };
  });

export const listCharacterTopHolders = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        slug: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(5),
        offset: z.number().int().min(0).max(10000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    const { data: rows, error } = await db.rpc("get_public_character_top_holders", {
      _slug: data.slug,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (error) throw error;
    return ((rows ?? []) as PublicCharacterTopHolderRow[]).map((r) => ({
      rank: r.rank,
      shares: Number(r.shares),
      value: Number(r.value),
      username: r.username ?? "anon",
      display_name: r.display_name ?? null,
    }));
  });

export const listClimbersAndFallers = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
  const { data: rows, error } = await db.rpc("get_public_leaderboard_movers", { _limit: 5 });
  if (error) throw error;
  const climbers = (rows ?? []).filter((r) => r.direction === "climber");
  const fallers = (rows ?? []).filter((r) => r.direction === "faller");
  return {
    climbers: climbers.map((r) => ({
      username: r.username ?? "anon",
      rank: r.rank,
      delta: r.delta,
    })),
    fallers: fallers.map((r) => ({ username: r.username ?? "anon", rank: r.rank, delta: r.delta })),
  };
});
