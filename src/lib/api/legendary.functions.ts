import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  .inputValidator((d) => z.object({ board: z.string(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("leaderboard_cache")
      .select("rank,prev_rank,value,meta,user_id,profiles:profiles!leaderboard_cache_user_id_fkey(username,display_name)")
      .eq("board_key", data.board)
      .order("rank", { ascending: true })
      .limit(data.limit);
    if (error) {
      // fallback without join (FK name may differ)
      const r2 = await db
        .from("leaderboard_cache")
        .select("rank,prev_rank,value,meta,user_id")
        .eq("board_key", data.board)
        .order("rank", { ascending: true })
        .limit(data.limit);
      if (r2.error) throw r2.error;
      const ids = (r2.data ?? []).map((r) => r.user_id);
      const { data: profs } = await db.from("profiles").select("id,username,display_name").in("id", ids);
      const stats = await db.from("user_stats").select("user_id,title,specialization").in("user_id", ids);
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const statMap = new Map((stats.data ?? []).map((s: any) => [s.user_id, s]));
      return (r2.data ?? []).map((r: any) => ({
        rank: r.rank,
        prev_rank: r.prev_rank,
        value: Number(r.value),
        meta: r.meta ?? {},
        username: profMap.get(r.user_id)?.username ?? "anon",
        display_name: profMap.get(r.user_id)?.display_name ?? null,
        title: statMap.get(r.user_id)?.title ?? "rookie_pirate",
        specialization: statMap.get(r.user_id)?.specialization ?? "generalist",
      }));
    }
    return (rows ?? []).map((r: any) => ({
      rank: r.rank,
      prev_rank: r.prev_rank,
      value: Number(r.value),
      meta: r.meta ?? {},
      username: r.profiles?.username ?? "anon",
      display_name: r.profiles?.display_name ?? null,
      title: "rookie_pirate",
      specialization: "generalist",
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

export const listLegacy = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("legacy_records")
    .select("code,title,description,value,achieved_at,user_id,character_id")
    .order("achieved_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.user_id).filter(Boolean) as string[];
  const { data: profs } = ids.length
    ? await db.from("profiles").select("id,username").in("id", ids)
    : { data: [] as any[] };
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.username]));
  return (data ?? []).map((r: any) => ({ ...r, username: profMap.get(r.user_id) ?? null }));
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
  .inputValidator((d) => z.object({ slug: z.string(), limit: z.number().int().min(1).max(20).default(5) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("leaderboard_cache")
      .select("rank,value,meta,user_id")
      .eq("board_key", `holder_${data.slug}`)
      .order("rank", { ascending: true })
      .limit(data.limit);
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.user_id);
    const { data: profs } = ids.length
      ? await db.from("profiles").select("id,username,display_name").in("id", ids)
      : { data: [] as any[] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return (rows ?? []).map((r: any) => ({
      rank: r.rank,
      shares: Number(r.value),
      value: Number(r.meta?.value ?? 0),
      username: profMap.get(r.user_id)?.username ?? "anon",
      display_name: profMap.get(r.user_id)?.display_name ?? null,
    }));
  });

export const listClimbersAndFallers = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data: rows, error } = await db
    .from("leaderboard_cache")
    .select("rank,prev_rank,value,user_id")
    .eq("board_key", "net_worth_all_time")
    .not("prev_rank", "is", null)
    .limit(500);
  if (error) throw error;
  const enriched = (rows ?? [])
    .map((r: any) => ({ ...r, delta: (r.prev_rank ?? r.rank) - r.rank }))
    .filter((r: any) => r.delta !== 0);
  const ids = enriched.map((r) => r.user_id);
  const { data: profs } = ids.length
    ? await db.from("profiles").select("id,username").in("id", ids)
    : { data: [] as any[] };
  const map = new Map((profs ?? []).map((p: any) => [p.id, p.username]));
  const climbers = [...enriched].sort((a, b) => b.delta - a.delta).slice(0, 5);
  const fallers = [...enriched].sort((a, b) => a.delta - b.delta).slice(0, 5);
  return {
    climbers: climbers.map((r) => ({ username: map.get(r.user_id) ?? "anon", rank: r.rank, delta: r.delta, value: Number(r.value) })),
    fallers: fallers.map((r) => ({ username: map.get(r.user_id) ?? "anon", rank: r.rank, delta: r.delta, value: Number(r.value) })),
  };
});
