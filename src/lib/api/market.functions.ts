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

type CharacterRow = {
  id: string;
  slug: string;
  name: string;
  epithet: string | null;
  crew: string | null;
  role: string | null;
  bounty: number | null;
  image_url: string | null;
  description: string | null;
  current_price: number;
  previous_price: number;
  category: "blue_chip" | "growth" | "speculative" | "meme";
  momentum: number;
  updated_at: string;
  display_order: number | null;
};

type MarketPageRow = Pick<
  CharacterRow,
  "id" | "slug" | "name" | "crew" | "bounty" | "current_price" | "previous_price" | "category" | "momentum" | "display_order"
>;

export const listCharacters = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
  const { data, error } = await db
    .from("characters")
    .select(
      "id,slug,name,epithet,crew,role,bounty,image_url,description,current_price,previous_price,category,momentum,updated_at,display_order",
    )
    .order("current_price", { ascending: false })
    .returns<CharacterRow[]>();
  if (error) throw error;
  return data ?? [];
});

const marketPageInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(29),
  q: z.string().max(80).optional().default(""),
});

export const listMarketPage = createServerFn({ method: "GET" })
  .inputValidator((d) => marketPageInput.parse(d))
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    const { data: rows, error } = await db
      .from("characters")
      .select("id,slug,name,crew,bounty,current_price,previous_price,category,momentum,display_order")
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .returns<MarketPageRow[]>();
    if (error) throw error;
    const all: MarketPageRow[] = rows ?? [];
    const q = data.q.trim().toLowerCase();
    const filtered = q
      ? all.filter((c) => {
          const hay = `${c.name} ${c.slug} ${c.crew ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : all;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / data.pageSize));
    const page = Math.min(Math.max(1, data.page), totalPages);
    const start = (page - 1) * data.pageSize;
    return {
      rows: filtered.slice(start, start + data.pageSize),
      page,
      pageSize: data.pageSize,
      total,
      totalPages,
    };
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

const stockCategorySchema = z.enum(["blue_chip", "growth", "speculative", "meme"]);

function normalizeOptionalText(value: unknown, options?: { stripQuotes?: boolean }) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  let text = value.trim();
  if (options?.stripQuotes) {
    text = text.replace(/^[\u201c\u201d"']+|[\u201c\u201d"']+$/g, "").trim();
  }
  return text === "" ? null : text;
}

const optionalTextSchema = (max: number, options?: { stripQuotes?: boolean }) =>
  z.preprocess((value) => normalizeOptionalText(value, options), z.string().max(max).nullable());

const adminUpdateCharacterInfoInput = z
  .object({
    slug: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().min(1).max(80),
    ),
    name: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().min(1).max(120),
    ),
    epithet: optionalTextSchema(120, { stripQuotes: true }),
    crew: optionalTextSchema(120),
    role: optionalTextSchema(120),
    bounty: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    description: optionalTextSchema(2000),
    category: stockCategorySchema,
  })
  .strict();

export const adminUpdateCharacterInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => adminUpdateCharacterInfoInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const db = await admin();
    const { data: existing, error: lookupError } = await db
      .from("characters")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) throw new Error("Character not found");

    const { data: updated, error } = await db
      .from("characters")
      .update({
        name: data.name,
        epithet: data.epithet,
        crew: data.crew,
        role: data.role,
        bounty: data.bounty,
        description: data.description,
        category: data.category,
      })
      .eq("id", existing.id)
      .select("name,epithet,crew,role,bounty,description,category")
      .single();
    if (error) throw error;
    return updated;
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
