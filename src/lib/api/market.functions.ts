import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabaseClient } from "@/integrations/supabase/public.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireAdminRole(userId: string) {
  const db = await admin();
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const listCharacters = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
  const { data, error } = await db
    .from("characters")
    .select("id,slug,name,crew,role,bounty,image_url,description,current_price,previous_price,category,momentum,updated_at")
    .order("current_price", { ascending: false });
  if (error) throw error;
  return data ?? [];
});

// ──────────────────────────────────────────────────────────────────────────────
// Market grid: paginated/filtered/sorted character listing.
// All filtering & sorting happens server-side over the full filtered set;
// the browser never receives unfiltered data.
// ──────────────────────────────────────────────────────────────────────────────

export const FEATURED_SLUGS: string[] = [
  "luffy", "zoro", "nami", "usopp", "sanji", "chopper", "robin", "franky",
  "brook", "jinbe", "law", "kid", "shanks", "blackbeard", "kaido", "bigmom",
  "akainu", "aokiji", "kizaru", "garp", "coby", "mihawk", "crocodile", "buggy",
  "boa", "vegapunk", "imu", "saturn", "yamato",
];

const MARKET_SORTS = ["price_desc", "price_asc", "gainers", "losers", "name_asc"] as const;
type MarketSort = (typeof MARKET_SORTS)[number];

const MARKET_CATEGORIES = ["blue_chip", "growth", "speculative", "meme"] as const;

// Escape PostgREST .or() control characters and SQL LIKE wildcards so user
// input is matched literally and cannot break out of the filter expression.
function escapeForOr(raw: string): string {
  // Strip characters that have special meaning inside a PostgREST .or() string
  // (commas separate filters, parentheses group them, asterisks are wildcards).
  // Also escape the LIKE wildcards % and _ so the query matches them literally.
  return raw
    .replace(/[(),*]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .trim();
}

const marketInputSchema = z.object({
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(24).default(24),
  q: z.string().trim().max(80).optional().transform((v) => (v ? v : undefined)),
  affiliation: z.string().trim().max(80).optional().transform((v) => (v ? v : undefined)),
  category: z.enum(MARKET_CATEGORIES).optional(),
  sort: z.enum(MARKET_SORTS).default("price_desc"),
});

type MarketCardRow = {
  id: string;
  slug: string;
  name: string;
  crew: string | null;
  current_price: number;
  previous_price: number;
  category: string;
  momentum: number;
  bounty: number | null;
};

function withChangePct(rows: MarketCardRow[]): (MarketCardRow & { change_pct: number })[] {
  return rows.map((r) => {
    const prev = Number(r.previous_price);
    const curr = Number(r.current_price);
    const pct = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    return { ...r, change_pct: pct };
  });
}

export const listMarketCharacters = createServerFn({ method: "GET" })
  .inputValidator((d) => marketInputSchema.parse(d))
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    const select =
      "id,slug,name,crew,current_price,previous_price,category,momentum,bounty";

    // Sorts the DB can do directly with .order() + .range() in a single round-trip.
    const dbSortable = data.sort === "price_desc" || data.sort === "price_asc" || data.sort === "name_asc";

    let query = db.from("characters").select(select, { count: "exact" });

    if (data.q) {
      const safe = escapeForOr(data.q);
      if (safe.length > 0) {
        // Single grouped OR — matches name OR crew (case-insensitive).
        query = query.or(`name.ilike.%${safe}%,crew.ilike.%${safe}%`);
      }
    }
    if (data.affiliation) query = query.eq("crew", data.affiliation);
    if (data.category) query = query.eq("category", data.category);

    if (dbSortable) {
      if (data.sort === "price_desc") query = query.order("current_price", { ascending: false });
      else if (data.sort === "price_asc") query = query.order("current_price", { ascending: true });
      else query = query.order("name", { ascending: true });
      const from = (data.page - 1) * data.pageSize;
      query = query.range(from, from + data.pageSize - 1);
      const { data: rows, error, count } = await query;
      if (error) throw error;
      const enriched = withChangePct((rows ?? []) as MarketCardRow[]);
      const total = count ?? enriched.length;
      return {
        rows: enriched,
        total,
        totalPages: Math.max(1, Math.ceil(total / data.pageSize)),
        page: data.page,
        pageSize: data.pageSize,
      };
    }

    // gainers / losers: fetch the full filtered set (small in this app), sort by
    // computed change_pct on the server, then paginate.
    const { data: rows, error } = await query.limit(2000);
    if (error) throw error;
    const enriched = withChangePct((rows ?? []) as MarketCardRow[]);
    enriched.sort((a, b) =>
      data.sort === "gainers" ? b.change_pct - a.change_pct : a.change_pct - b.change_pct,
    );
    const total = enriched.length;
    const from = (data.page - 1) * data.pageSize;
    return {
      rows: enriched.slice(from, from + data.pageSize),
      total,
      totalPages: Math.max(1, Math.ceil(total / data.pageSize)),
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const listFeaturedCharacters = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
  const { data, error } = await db
    .from("characters")
    .select("id,slug,name,crew,current_price,previous_price,category,momentum,bounty")
    .in("slug", FEATURED_SLUGS)
    .order("current_price", { ascending: false })
    .limit(8);
  if (error) throw error;
  return withChangePct((data ?? []) as MarketCardRow[]);
});

export const listMarketFilterOptions = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
  const { data, error } = await db
    .from("characters")
    .select("crew")
    .not("crew", "is", null);
  if (error) throw error;
  const affiliations = Array.from(
    new Set((data ?? []).map((r: { crew: string | null }) => r.crew).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b));
  return { affiliations, categories: [...MARKET_CATEGORIES] };
});

export const getCharacter = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row, error } = await db.from("characters").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Not found");
    const { data: history } = await db
      .from("price_history")
      .select("price,note,created_at")
      .eq("character_id", row.id)
      .order("created_at", { ascending: true })
      .limit(200);
    return { character: row, history: history ?? [] };
  });

export const listNews = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
  const { data, error } = await db
    .from("news")
    .select("id,title,body,impact,created_at,character_id,characters(name,slug)")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
});

export const getTriviaBatch = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("trivia_questions")
    .select("id,question,choices,reward,difficulty");
  if (error) throw error;
  // shuffle
  const arr = [...(data ?? [])];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 5);
});


export const adminUpdatePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        slug: z.string(),
        newPrice: z.number().positive().max(99999),
        note: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const db = await admin();
    const { data: existing, error: e1 } = await db
      .from("characters")
      .select("id,current_price")
      .eq("slug", data.slug)
      .maybeSingle();
    if (e1 || !existing) throw new Error("Character not found");
    const { error: e2 } = await db
      .from("characters")
      .update({ previous_price: existing.current_price, current_price: data.newPrice })
      .eq("id", existing.id);
    if (e2) throw e2;
    await db.from("price_history").insert({ character_id: existing.id, price: data.newPrice, note: data.note ?? null });
    return { ok: true };
  });

export const adminPostNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(2),
        body: z.string().min(2),
        impact: z.enum(["bullish", "bearish", "neutral"]).default("neutral"),
        characterSlug: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const db = await admin();
    let character_id: string | null = null;
    if (data.characterSlug) {
      const { data: c } = await db.from("characters").select("id").eq("slug", data.characterSlug).maybeSingle();
      character_id = c?.id ?? null;
    }
    const { error } = await db.from("news").insert({
      title: data.title,
      body: data.body,
      impact: data.impact,
      character_id,
    });
    if (error) throw error;
    return { ok: true };
  });

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { isAdmin: !!data };
  });
