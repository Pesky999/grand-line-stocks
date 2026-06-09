import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ADMIN_FALLBACK = "strawhat";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function checkPasscode(passcode: string) {
  const expected = process.env.ADMIN_PASSCODE || ADMIN_FALLBACK;
  if (passcode !== expected) throw new Error("Invalid admin passcode");
}

export const listCharacters = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("characters")
    .select("id,slug,name,crew,role,bounty,image_url,description,current_price,previous_price,updated_at")
    .order("current_price", { ascending: false });
  if (error) throw error;
  return data ?? [];
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
  const db = await admin();
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
  const { data, error } = await db.from("trivia_questions").select("*");
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
  .inputValidator((d) =>
    z
      .object({
        passcode: z.string(),
        slug: z.string(),
        newPrice: z.number().positive().max(99999),
        note: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
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
  .inputValidator((d) =>
    z
      .object({
        passcode: z.string(),
        title: z.string().min(2),
        body: z.string().min(2),
        impact: z.enum(["bullish", "bearish", "neutral"]).default("neutral"),
        characterSlug: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
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
