import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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

function pub(): SupabaseClient<Database> {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function requireAdmin(db: SupabaseClient<Database>, userId: string) {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

type SupabaseQueryError = {
  message: string;
  code?: string;
};

function throwPublicEventQueryError(label: string, error: SupabaseQueryError): never {
  throw new Error(`${label}: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}

const numeric = z.coerce.number();
const nullableNumeric = numeric.nullable();
const linkedCharacterSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
  })
  .nullable();

const eventImpactSchema = z.object({
  character_id: z.string().uuid().nullable().optional(),
  pct_change: numeric,
  price_before: nullableNumeric.optional(),
  price_after: nullableNumeric.optional(),
  characters: linkedCharacterSchema.optional(),
});

const recentMarketEventRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable().optional(),
    event_type: z.string(),
    status: z.literal("published"),
    default_pct_change: numeric,
    published_at: z.string().nullable(),
    created_at: z.string(),
    market_event_impacts: z.array(eventImpactSchema).nullable().optional(),
  }),
);

const characterLookupSchema = z.object({ id: z.string().uuid() }).nullable();

const characterEventRowsSchema = z.array(
  z.object({
    pct_change: numeric,
    price_before: nullableNumeric.optional(),
    price_after: nullableNumeric.optional(),
    created_at: z.string(),
    market_events: z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string().nullable().optional(),
      event_type: z.string(),
      status: z.literal("published"),
      published_at: z.string().nullable(),
    }),
  }),
);

const sentimentEventRowsSchema = z.array(
  z.object({
    event_type: z.string(),
    market_event_impacts: z.array(eventImpactSchema).nullable().optional(),
  }),
);

// ---------- Public ----------

export const listRecentEvents = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ limit: z.number().int().min(1).max(50).default(15) }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const db = pub();
    const { data: rows, error } = await db
      .from("market_events")
      .select(
        "id,title,description,event_type,status,default_pct_change,published_at,created_at,market_event_impacts(character_id,pct_change,price_before,price_after,characters(slug,name))",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (error) throwPublicEventQueryError("Could not load published market events", error);
    return recentMarketEventRowsSchema.parse(rows ?? []);
  });

export const getCharacterEvents = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = pub();
    const { data: characterRow, error: characterError } = await db
      .from("characters")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (characterError)
      throwPublicEventQueryError("Could not load character for market events", characterError);
    const ch = characterLookupSchema.parse(characterRow);
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
    if (error) throwPublicEventQueryError("Could not load character market events", error);
    return characterEventRowsSchema.parse(rows ?? []);
  });

export const getMarketSentiment = createServerFn({ method: "GET" }).handler(async () => {
  const db = pub();
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();
  const { data: events, error } = await db
    .from("market_events")
    .select("event_type,market_event_impacts(pct_change,characters(slug,name))")
    .eq("status", "published")
    .gte("published_at", since);
  if (error) throwPublicEventQueryError("Could not load market sentiment events", error);

  let totalPct = 0;
  let count = 0;
  const moves: { slug: string; name: string; pct: number }[] = [];
  const parsedEvents = sentimentEventRowsSchema.parse(events ?? []);
  for (const e of parsedEvents) {
    for (const i of e.market_event_impacts ?? []) {
      totalPct += Number(i.pct_change);
      count++;
      if (i.characters)
        moves.push({ slug: i.characters.slug, name: i.characters.name, pct: Number(i.pct_change) });
    }
  }
  const avg = count ? totalPct / count : 0;
  moves.sort((a, b) => b.pct - a.pct);
  const sentiment = avg > 1.5 ? "bullish" : avg < -1.5 ? "bearish" : "neutral";
  return {
    sentiment,
    avgPct: avg,
    events7d: parsedEvents.length,
    moves7d: count,
    topGainers: moves.slice(0, 5),
    topLosers: moves.slice(-5).reverse(),
  };
});

// ---------- Admin ----------

export const listAllEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
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
    await requireAdmin(context.supabase, context.userId);
    const db = context.supabase;

    const status: "draft" | "scheduled" | "published" = data.publish
      ? "draft"
      : data.scheduled_for
        ? "scheduled"
        : "draft";

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

    const slugs = data.impacts.map((i) => i.slug);
    const { data: chars } = await db.from("characters").select("id,slug").in("slug", slugs);
    const idBySlug = new Map((chars ?? []).map((c) => [c.slug, c.id]));
    const rows = data.impacts
      .filter((i) => idBySlug.has(i.slug))
      .map((i) => ({
        event_id: ev.id,
        character_id: idBySlug.get(i.slug)!,
        pct_change: i.pct_change,
      }));
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
    await requireAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("preview_market_event", {
      _event_id: data.id,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const publishEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("apply_market_event", { _event_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("market_events").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
