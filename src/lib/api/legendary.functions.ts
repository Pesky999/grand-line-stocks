import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicSupabaseClient } from "@/integrations/supabase/public.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const LEGACY_LOG_QUERY_KEY = ["legacy-log"] as const;

const PUBLIC_PROFILE_USERNAME_MAX_LENGTH = 64;

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
  value: number | string | null;
  is_public: boolean;
  username: string | null;
  display_name: string | null;
  title: string | null;
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

type PublicCharacterTopHolderRow = {
  rank: number;
  shares: number | string;
  value: number | string;
  username: string | null;
  display_name: string | null;
};

const publicProfileStatsSchema = z
  .object({
    title: z.string().nullable().optional(),
    specialization: z.string().nullable().optional(),
    days_active: z.coerce.number().nullable().optional(),
    reputation_score: z.coerce.number().nullable().optional(),
    wins: z.coerce.number().nullable().optional(),
    losses: z.coerce.number().nullable().optional(),
    total_trades: z.coerce.number().nullable().optional(),
    total_buys: z.coerce.number().nullable().optional(),
    total_sells: z.coerce.number().nullable().optional(),
    total_volume: z.coerce.number().nullable().optional(),
    realized_pnl: z.coerce.number().nullable().optional(),
    avg_holding_days: z.coerce.number().nullable().optional(),
    best_trade_slug: z.string().nullable().optional(),
    best_trade_pnl: z.coerce.number().nullable().optional(),
    worst_trade_slug: z.string().nullable().optional(),
    worst_trade_pnl: z.coerce.number().nullable().optional(),
    largest_position_slug: z.string().nullable().optional(),
    largest_position_value: z.coerce.number().nullable().optional(),
    highest_rank: z.coerce.number().nullable().optional(),
    current_rank: z.coerce.number().nullable().optional(),
  })
  .strict();

const publicProfileAchievementSchema = z
  .object({
    unlocked_at: z.string(),
    achievements: z
      .object({
        code: z.string(),
        name: z.string(),
        description: z.string(),
        tier: z.string(),
        icon: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

const publicProfileSnapshotSchema = z
  .object({
    snapshot_date: z.string(),
    net_worth: z.coerce.number().nullable(),
    return_pct: z.coerce.number().nullable(),
  })
  .strict();

const publicProfileHoldingSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    shares: z.coerce.number(),
    avgCost: z.coerce.number(),
    currentPrice: z.coerce.number(),
    value: z.coerce.number(),
  })
  .strict();

const publicInvestorProfileResultSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }).strict(),
  z
    .object({
      found: z.literal(true),
      is_public: z.boolean(),
      profile: z
        .object({
          username: z.string(),
          display_name: z.string().nullable(),
          created_at: z.string(),
        })
        .strict(),
      title: z.string().nullable(),
      specialization: z.string().nullable(),
      rank: z.coerce.number().nullable(),
      prev_rank: z.coerce.number().nullable(),
      stats: publicProfileStatsSchema.nullable(),
      cash: z.coerce.number().nullable(),
      equity: z.coerce.number().nullable(),
      net_worth: z.coerce.number().nullable(),
      holdings: z.array(publicProfileHoldingSchema),
      achievements: z.array(publicProfileAchievementSchema),
      snapshots: z.array(publicProfileSnapshotSchema),
    })
    .strict(),
]);

export function isPublicPlayerUsername(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= PUBLIC_PROFILE_USERNAME_MAX_LENGTH &&
    value.trim().length > 0
  );
}

function hasPublicPlayerUsername<T extends { username: string | null }>(
  row: T,
): row is T & { username: string } {
  return isPublicPlayerUsername(row.username);
}

function logPublicProfileReadFailure(stage: string, error: { code?: string | null } | null) {
  console.warn("[Public profile]", {
    stage,
    code: error?.code ?? "PUBLIC_PROFILE_READ_FAILED",
  });
}

async function filterRowsWithExistingPublicProfiles<T extends { username: string | null }>(
  db: ReturnType<typeof getPublicSupabaseClient>,
  rows: T[],
  stage: string,
): Promise<(T & { username: string })[]> {
  const candidateRows = rows.filter(hasPublicPlayerUsername);
  const usernames = [...new Set(candidateRows.map((row) => row.username))];

  if (usernames.length === 0) return [];

  const { data, error } = await db.from("profiles").select("username").in("username", usernames);

  if (error) {
    logPublicProfileReadFailure(stage, error);
    return [];
  }

  const existingUsernames = new Set(
    (data ?? [])
      .map((profile) => profile.username)
      .filter((username): username is string => isPublicPlayerUsername(username)),
  );

  return candidateRows.filter((row) => existingUsernames.has(row.username));
}

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
    const publicRows = await filterRowsWithExistingPublicProfiles(
      db,
      (rows ?? []) as PublicLeaderboardRow[],
      "leaderboard_profile_filter",
    );
    return publicRows.map((r) => ({
      rank: r.rank,
      prev_rank: r.prev_rank,
      value: r.value == null ? null : Number(r.value),
      is_public: r.is_public,
      username: r.username,
      display_name: r.display_name ?? null,
      title: r.title ?? "rookie_pirate",
    }));
  });

export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ username: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    if (!isPublicPlayerUsername(data.username)) return { found: false } as const;

    const { data: profile, error } = await db.rpc("get_public_investor_profile", {
      _username: data.username,
    });

    if (error) {
      logPublicProfileReadFailure("profile_read", error);
      return { found: false } as const;
    }

    return publicInvestorProfileResultSchema.parse(profile);
  });

export const setMyPublicTradingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        isPublic: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: setting, error } = await context.supabase.rpc("set_my_public_trading_profile", {
      _is_public: data.isPublic,
    });
    if (error) throw new Error(error.message);
    return { publicTradingProfile: Boolean(setting) } as const;
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
    return filterRowsWithExistingPublicProfiles(db, rows ?? [], "legacy_profile_filter");
  });

export const listAchievementsCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
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
    const db = context.supabase;
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
    ]) {
      if (error) throw error;
    }

    const positiveHoldings = (holdings ?? []) as {
      character_id: string;
      shares: number | string;
      created_at: string;
      characters: {
        slug: string;
        category: string;
      } | null;
    }[];
    const characterSlugs = [
      ...new Set(
        positiveHoldings
          .map((holding) => holding.characters?.slug)
          .filter((slug): slug is string => Boolean(slug)),
      ),
    ];
    const heldCategories = new Set(
      positiveHoldings
        .map((holding) => holding.characters?.category)
        .filter((category): category is string => !!category),
    );
    let largestHolderEligible = false;

    if (characterSlugs.length > 0) {
      const largestHolderResults = await Promise.all(
        characterSlugs.map((slug) =>
          db.rpc("is_my_character_largest_holder", {
            _slug: slug,
          }),
        ),
      );

      for (const { error } of largestHolderResults) {
        if (error) throw error;
      }

      largestHolderEligible = largestHolderResults.some(({ data }) => data === true);
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
    const dailyCrewHighRankCount = dailyCrewRows.filter((submission) =>
      ["a", "s"].includes(submission.rank),
    ).length;
    const dailyCrewPerfectCount = dailyCrewRows.filter(
      (submission) =>
        Number(submission.score) === Number(submission.daily_crew_missions?.max_score ?? 100),
    ).length;

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
        dailyCrewHighRankCount,
        dailyCrewPerfectCount,
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
    const publicRows = await filterRowsWithExistingPublicProfiles(
      db,
      (rows ?? []) as PublicCharacterTopHolderRow[],
      "character_top_holders_profile_filter",
    );
    return publicRows.map((r) => ({
      rank: r.rank,
      shares: Number(r.shares),
      value: Number(r.value),
      username: r.username,
      display_name: r.display_name ?? null,
    }));
  });

export const listClimbersAndFallers = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
  const { data: rows, error } = await db.rpc("get_public_leaderboard_movers", { _limit: 5 });
  if (error) throw error;
  const publicRows = await filterRowsWithExistingPublicProfiles(
    db,
    rows ?? [],
    "leaderboard_movers_profile_filter",
  );
  const climbers = publicRows.filter((r) => r.direction === "climber");
  const fallers = publicRows.filter((r) => r.direction === "faller");
  return {
    climbers: climbers.map((r) => ({
      username: r.username,
      rank: r.rank,
      delta: r.delta,
    })),
    fallers: fallers.map((r) => ({ username: r.username, rank: r.rank, delta: r.delta })),
  };
});
