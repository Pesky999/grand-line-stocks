import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getCharacterIntel = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: ch, error } = await db
      .from("characters")
      .select("id,slug,name,category,momentum,current_price,previous_price,character_attributes(narrative_potential,hype_rating,investor_confidence,volatility_rating)")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw error;
    if (!ch) throw new Error("Character not found");

    const [explanations, rumors, latestReport] = await Promise.all([
      db
        .from("price_movement_explanations")
        .select("id,pct_change,price_before,price_after,summary,reason_codes,source,created_at")
        .eq("character_id", ch.id)
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("market_rumor_impacts")
        .select("pct_change,market_rumors!inner(id,title,description,status,created_at,expires_at)")
        .eq("character_id", ch.id)
        .eq("market_rumors.status", "active")
        .order("created_at", { ascending: false, foreignTable: "market_rumors" })
        .limit(5),
      db
        .from("daily_market_reports")
        .select("sentiment,avg_change_pct,report_date")
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Investor intelligence — derived from REAL factors only
    const a: any = (ch as any).character_attributes ?? { narrative_potential: 50, hype_rating: 50, investor_confidence: 50, volatility_rating: 50 };
    const momentum = Number((ch as any).momentum ?? 0);
    const bullish: string[] = [];
    const bearish: string[] = [];

    if (a.investor_confidence >= 65) bullish.push(`Investor confidence elevated (${a.investor_confidence}/100)`);
    if (a.investor_confidence <= 35) bearish.push(`Investor confidence weak (${a.investor_confidence}/100)`);
    if (a.hype_rating >= 65) bullish.push(`Community hype trending up (${a.hype_rating}/100)`);
    if (a.hype_rating <= 30) bearish.push(`Community attention fading (${a.hype_rating}/100)`);
    if (a.narrative_potential >= 65) bullish.push(`Strong narrative potential (${a.narrative_potential}/100)`);
    if (momentum > 0.5) bullish.push(`Positive momentum (+${momentum.toFixed(2)})`);
    if (momentum < -0.5) bearish.push(`Negative momentum (${momentum.toFixed(2)})`);
    if ((rumors.data ?? []).some((r: any) => Number(r.pct_change) > 0)) bullish.push("Active bullish rumor in circulation");
    if ((rumors.data ?? []).some((r: any) => Number(r.pct_change) < 0)) bearish.push("Active bearish rumor in circulation");

    const confidence = Math.round(a.investor_confidence * 0.6 + a.narrative_potential * 0.4);
    const risk = Math.round(a.volatility_rating * 0.7 + (ch.category === "meme" ? 30 : ch.category === "speculative" ? 18 : ch.category === "growth" ? 8 : 2));

    return {
      character: ch,
      explanations: explanations.data ?? [],
      rumors: rumors.data ?? [],
      sentiment: latestReport.data?.sentiment ?? "neutral",
      avg_change_pct: latestReport.data?.avg_change_pct ?? 0,
      intel: {
        bullish,
        bearish,
        confidence: Math.min(100, Math.max(0, confidence)),
        risk: Math.min(100, Math.max(0, risk)),
      },
    };
  });

export const listRecentExplanations = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(50).default(15) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("price_movement_explanations")
      .select("id,pct_change,summary,reason_codes,source,created_at,characters(slug,name)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });
