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

export type CharacterRow = {
  id: string;
  slug: string;
  name: string;
  crew: string | null;
  role: string | null;
  bounty: number | null;
  image_url: string | null;
  description: string | null;
  current_price: number;
  previous_price: number;
  category: "blue_chip" | "growth" | "speculative" | "meme";
  momentum: number;
  created_at: string;
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
      "id,slug,name,crew,role,bounty,image_url,description,current_price,previous_price,category,momentum,created_at,updated_at,display_order",
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
const nullableText = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }, z.string().max(max).nullable());

const nullableHttpUrl = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  },
  z
    .string()
    .max(1000)
    .url()
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "Image URL must use http or https")
    .nullable(),
);

const nullableSafeInteger = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
  }, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable()
);

const nullableDisplayOrder = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
  }, z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable()
);

const slugSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase().replace(/-+/g, "-") : value),
  z
    .string()
    .min(1)
    .max(60)
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/,
      "Slug must use lowercase letters, numbers, and hyphens",
    ),
);

const nameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1).max(120),
);

const priceSchema = z
  .number()
  .finite()
  .min(0.01)
  .max(99999)
  .refine((value) => {
    const cents = Math.round(value * 100);
    return Math.abs(value - cents / 100) < 1e-9;
  }, "Price may use at most two decimals");

const momentumSchema = z.number().finite().min(-5).max(5);

const characterSelect =
  "id,slug,name,crew,role,bounty,image_url,description,current_price,previous_price,category,momentum,updated_at,created_at,display_order";

const adminCreateCharacterInput = z
  .object({
    slug: slugSchema,
    name: nameSchema,
    crew: nullableText(120),
    role: nullableText(120),
    bounty: nullableSafeInteger,
    image_url: nullableHttpUrl,
    description: nullableText(2000),
    initialPrice: priceSchema,
    category: stockCategorySchema,
    display_order: nullableDisplayOrder,
  })
  .strict();

const adminUpdateCharacterInput = z
  .object({
    slug: slugSchema,
    name: nameSchema,
    crew: nullableText(120),
    role: nullableText(120),
    bounty: nullableSafeInteger,
    image_url: nullableHttpUrl,
    description: nullableText(2000),
    category: stockCategorySchema,
    momentum: momentumSchema,
    display_order: nullableDisplayOrder,
  })
  .strict();

export const adminCreateCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => adminCreateCharacterInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.userId);
    const db = await admin();
    const { data: duplicate, error: duplicateError } = await db
      .from("characters")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new Error("Character slug already exists");

    const initialPrice = data.initialPrice;
    const { data: created, error: createError } = await db
      .from("characters")
      .insert({
        slug: data.slug,
        name: data.name,
        crew: data.crew,
        role: data.role,
        bounty: data.bounty,
        image_url: data.image_url,
        description: data.description,
        current_price: initialPrice,
        previous_price: initialPrice,
        category: data.category,
        momentum: 0,
        display_order: data.display_order,
      })
      .select(characterSelect)
      .single();
    if (createError) {
      if (createError.code === "23505") throw new Error("Character slug already exists");
      throw createError;
    }
    if (!created) throw new Error("Character creation failed");

    const { error: historyError } = await db.from("price_history").insert({
      character_id: created.id,
      price: initialPrice,
      note: "IPO",
      source: "seed",
    });

    if (historyError) {
      const { error: cleanupError } = await db.from("characters").delete().eq("id", created.id);
      if (cleanupError) {
        throw new Error(
          "Character creation failed while writing IPO price history, and cleanup failed. No existing character was deleted.",
        );
      }
      throw new Error(
        "Character creation failed while writing IPO price history. The new character was removed.",
      );
    }

    return created as CharacterRow;
  });

export const adminUpdateCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => adminUpdateCharacterInput.parse(d))
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
        crew: data.crew,
        role: data.role,
        bounty: data.bounty,
        image_url: data.image_url,
        description: data.description,
        category: data.category,
        momentum: data.momentum,
        display_order: data.display_order,
      })
      .eq("id", existing.id)
      .select(characterSelect)
      .single();
    if (error) throw error;
    return updated as CharacterRow;
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
