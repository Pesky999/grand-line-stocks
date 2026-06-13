import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVENT_TYPES = [
  "story_event",
  "battle_result",
  "character_reveal",
  "power_up",
  "political_event",
  "community_event",
  "market_correction",
  "meme_event",
] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireAdmin(userId: string) {
  const db = await admin();
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

// ---------- Public ----------

export const listRecentEvents = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(50).default(15) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("market_events")
      .select(
        "id,title,description,event_type,status,default_pct_change,published_at,created_at,market_event_impacts(character_id,pct_change,price_before,price_after,characters(slug,name))",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

export const getCharacterEvents = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: ch } = await db.from("characters").select("id").eq("slug", data.slug).maybeSingle();
    if (!ch) return [];
    const { data: rows, error } = await db
      .from("market_event_impacts")
      .select(
        "pct_change,price_before,price_after,created_at,market_events!inner(id,title,description,event_type,status,published_at)",
      )
      .eq("character_id", ch.id)
      .eq("market_events.status", "published")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return rows ?? [];
  });

export const getMarketSentiment = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();
  const { data: events } = await db
    .from("market_events")
    .select("event_type,market_event_impacts(pct_change,characters(slug,name))")
    .eq("status", "published")
    .gte("published_at", since);

  let totalPct = 0;
  let count = 0;
  const moves: { slug: string; name: string; pct: number }[] = [];
  for (const e of events ?? []) {
    for (const i of (e as any).market_event_impacts ?? []) {
      totalPct += Number(i.pct_change);
      count++;
      if (i.characters) moves.push({ slug: i.characters.slug, name: i.characters.name, pct: Number(i.pct_change) });
    }
  }
  const avg = count ? totalPct / count : 0;
  moves.sort((a, b) => b.pct - a.pct);
  const sentiment = avg > 1.5 ? "bullish" : avg < -1.5 ? "bearish" : "neutral";
  return {
    sentiment,
    avgPct: avg,
    events7d: events?.length ?? 0,
    moves7d: count,
    topGainers: moves.slice(0, 5),
    topLosers: moves.slice(-5).reverse(),
  };
});

// ---------- Admin ----------

export const listAllEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const db = await admin();
    const { data, error } = await db
      .from("market_events")
      .select("id,title,event_type,status,default_pct_change,scheduled_for,published_at,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

const ImpactInput = z.object({ slug: z.string(), pct_change: z.number().min(-90).max(500) });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(2).max(120),
        description: z.string().max(2000).default(""),
        event_type: z.enum(EVENT_TYPES),
        default_pct_change: z.number().min(-90).max(500).default(0),
        impacts: z.array(ImpactInput).min(1).max(50),
        scheduled_for: z.string().datetime().optional(),
        publish: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const db = await admin();

    const status: "draft" | "scheduled" | "published" =
      data.publish ? "draft" : data.scheduled_for ? "scheduled" : "draft";

    const { data: ev, error: e1 } = await db
      .from("market_events")
      .insert({
        title: data.title,
        description: data.description,
        event_type: data.event_type,
        default_pct_change: data.default_pct_change,
        scheduled_for: data.scheduled_for ?? null,
        status,
        created_by: context.userId,
      })
      .select()
      .single();
    if (e1) throw e1;

    // Resolve slugs to character ids
    const slugs = data.impacts.map((i) => i.slug);
    const { data: chars } = await db.from("characters").select("id,slug").in("slug", slugs);
    const idBySlug = new Map((chars ?? []).map((c) => [c.slug, c.id]));
    const rows = data.impacts
      .filter((i) => idBySlug.has(i.slug))
      .map((i) => ({ event_id: ev.id, character_id: idBySlug.get(i.slug)!, pct_change: i.pct_change }));
    if (rows.length === 0) throw new Error("No valid characters");
    const { error: e2 } = await db.from("market_event_impacts").insert(rows);
    if (e2) throw e2;

    if (data.publish) {
      const { error: e3 } = await db.rpc("apply_market_event", { _event_id: ev.id });
      if (e3) throw new Error(e3.message);
    }
    return { id: ev.id, status: data.publish ? "published" : status };
  });

export const previewEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const db = await admin();
    const { data: rows, error } = await db.rpc("preview_market_event", { _event_id: data.id });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const publishEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const db = await admin();
    const { error } = await db.rpc("apply_market_event", { _event_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const db = await admin();
    const { error } = await db.from("market_events").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
