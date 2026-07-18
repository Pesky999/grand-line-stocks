import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabaseClient } from "@/integrations/supabase/public.server";
import {
  CHARACTER_PRICE_HISTORY_WINDOW,
  selectLatestPriceHistoryWindowForChart,
  type CharacterPriceHistoryPoint,
} from "@/lib/price-history/window";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const numeric = z.coerce.number();

const characterSelect =
  "id,slug,name,crew,role,bounty,image_url,description,current_price,previous_price,category,momentum,updated_at,created_at,display_order";

const characterRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  crew: z.string().nullable(),
  role: z.string().nullable(),
  bounty: numeric.nullable(),
  image_url: z.string().nullable(),
  description: z.string().nullable(),
  current_price: numeric,
  previous_price: numeric,
  category: z.enum(["blue_chip", "growth", "speculative", "meme"]),
  momentum: numeric,
  created_at: z.string(),
  updated_at: z.string(),
  display_order: z.coerce.number().int().nullable(),
});

const priceHistoryRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    price: numeric,
    note: z.string().nullable(),
    created_at: z.string(),
  }),
);

export type CharacterRow = z.infer<typeof characterRowSchema>;

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
    .select(
      "id,slug,name,crew,role,bounty,image_url,description,current_price,previous_price,category,momentum,created_at,updated_at,display_order",
    )
    .order("current_price", { ascending: false })
    .returns<CharacterRow[]>();
  if (error) throw error;
  return data ?? [];
});

export const getCharacter = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    const { data: row, error } = await db
      .from("characters")
      .select(characterSelect)
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Not found");
    const character = characterRowSchema.parse(row);
    const { data: historyRows, error: historyError } = await db
      .from("price_history")
      .select("id,price,note,created_at")
      .eq("character_id", character.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CHARACTER_PRICE_HISTORY_WINDOW)
      .returns<CharacterPriceHistoryPoint[]>();
    if (historyError) throw historyError;
    const history = priceHistoryRowsSchema.parse(historyRows ?? []);
    return { character, history: selectLatestPriceHistoryWindowForChart(history) };
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

const nullableSafeInteger = z.preprocess((value) => {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
}, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable());

const nullableDisplayOrder = z.preprocess((value) => {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
}, z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable());

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

const adminCreateCharacterInput = z
  .object({
    slug: slugSchema,
    name: nameSchema,
    crew: nullableText(120),
    role: nullableText(120),
    bounty: nullableSafeInteger,
    image_url: nullableHttpUrl,
    description: nullableText(2000),
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
        display_order: data.display_order,
      })
      .select(characterSelect)
      .single();
    if (createError) {
      if (createError.code === "23505") throw new Error("Character slug already exists");
      throw createError;
    }
    if (!created) throw new Error("Character creation failed");

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
      const { data: c } = await db
        .from("characters")
        .select("id")
        .eq("slug", data.characterSlug)
        .maybeSingle();
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
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!data };
  });
