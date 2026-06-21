import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabaseClient } from "@/integrations/supabase/public.server";

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

const CATEGORIES = ["blue_chip", "growth", "speculative", "meme"] as const;

// ---------- Public reads ----------

export const getLatestReport = createServerFn({ method: "GET" }).handler(async () => {
  const db = getPublicSupabaseClient();
  const { data } = await db
    .from("daily_market_reports")
    .select(
      "*,gainer:characters!daily_market_reports_biggest_gainer_id_fkey(slug,name),loser:characters!daily_market_reports_biggest_loser_id_fkey(slug,name),trending:characters!daily_market_reports_trending_id_fkey(slug,name),discussed:characters!daily_market_reports_most_discussed_id_fkey(slug,name)",
    )
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
});

export const listReports = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(60).default(30) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("daily_market_reports")
      .select(
        "id,report_date,sentiment,avg_change_pct,headline,summary,biggest_gainer_pct,biggest_loser_pct,gainer:characters!daily_market_reports_biggest_gainer_id_fkey(slug,name),loser:characters!daily_market_reports_biggest_loser_id_fkey(slug,name)",
      )
      .order("report_date", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

export const listActiveRumors = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(50).default(20) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    const { data: rows, error } = await db
      .from("market_rumors")
      .select(
        "id,title,description,status,created_at,expires_at,market_rumor_impacts(pct_change,price_before,price_after,characters(slug,name))",
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Admin actions ----------

export const adminRunDailyCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const db = await admin();
    const { data, error } = await db.rpc("run_daily_market_cycle");
    if (error) throw new Error(error.message);
    return data;
  });

export const adminGenerateRumor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const db = await admin();
    const { data, error } = await db.rpc("generate_market_rumor");
    if (error) throw new Error(error.message);
    return data;
  });

export const adminListAttributes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const db = await admin();
    const { data, error } = await db
      .from("characters")
      .select("id,slug,name,category,momentum,character_attributes(narrative_potential,hype_rating,investor_confidence,volatility_rating)")
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const adminUpdateAttributes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        slug: z.string(),
        category: z.enum(CATEGORIES).optional(),
        narrative_potential: z.number().int().min(0).max(100).optional(),
        hype_rating: z.number().int().min(0).max(100).optional(),
        investor_confidence: z.number().int().min(0).max(100).optional(),
        volatility_rating: z.number().int().min(0).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const db = await admin();
    const { data: ch, error: e1 } = await db.from("characters").select("id").eq("slug", data.slug).maybeSingle();
    if (e1 || !ch) throw new Error("Character not found");

    if (data.category) {
      const { error } = await db.from("characters").update({ category: data.category }).eq("id", ch.id);
      if (error) throw error;
    }

    const attrPatch: Record<string, number> = {};
    if (data.narrative_potential !== undefined) attrPatch.narrative_potential = data.narrative_potential;
    if (data.hype_rating !== undefined) attrPatch.hype_rating = data.hype_rating;
    if (data.investor_confidence !== undefined) attrPatch.investor_confidence = data.investor_confidence;
    if (data.volatility_rating !== undefined) attrPatch.volatility_rating = data.volatility_rating;

    if (Object.keys(attrPatch).length > 0) {
      const { error } = await db
        .from("character_attributes")
        .upsert({ character_id: ch.id, ...attrPatch }, { onConflict: "character_id" });
      if (error) throw error;
    }
    return { ok: true };
  });
