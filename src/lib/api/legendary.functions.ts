import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicSupabaseClient } from "@/integrations/supabase/public.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

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
    const { data: rows, error } = await db
      .rpc("get_public_leaderboard", { _board_key: data.board, _limit: data.limit, _offset: data.offset });
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
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
    const [{ data: stats }, { data: wallet }, { data: achievements }, { data: snapshots }, { data: holdings }, { data: rankRow }] =
      await Promise.all([
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

    const equity = (holdings ?? []).reduce(
      (s: number, h: any) => s + Number(h.shares) * Number(h.characters.current_price),
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
      holdings: (holdings ?? []).map((h: any) => ({
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
      _username: data.username ?? null,
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
    const { data: rows, error } = await db
      .rpc("get_public_character_top_holders", { _slug: data.slug, _limit: data.limit, _offset: data.offset });
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
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
    climbers: climbers.map((r) => ({ username: r.username ?? "anon", rank: r.rank, delta: r.delta })),
    fallers: fallers.map((r) => ({ username: r.username ?? "anon", rank: r.rank, delta: r.delta })),
  };
});
