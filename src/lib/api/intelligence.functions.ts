import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicSupabaseClient } from "@/integrations/supabase/public.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function clampScore(value: number): number {
  const finite = Number.isFinite(value) ? value : 50;
  return Math.min(100, Math.max(0, Math.round(finite)));
}

function clamp(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.min(max, Math.max(min, finite));
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sentimentScore(sentiment: string): number {
  if (sentiment === "extremely_bullish") return 14;
  if (sentiment === "bullish") return 8;
  if (sentiment === "bearish") return -8;
  if (sentiment === "extremely_bearish") return -14;
  return 0;
}

type PriceMovementRow = {
  pct_change: number | string | null;
};

type SpeculationRelationRow = {
  market_rumors: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    created_at: string;
    expires_at: string | null;
  } | null;
};

type SpeculationRumorRow = NonNullable<SpeculationRelationRow["market_rumors"]>;

function isSpeculationRumorRow(
  row: SpeculationRelationRow["market_rumors"],
): row is SpeculationRumorRow {
  return row !== null;
}

export const getCharacterIntel = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const db = getPublicSupabaseClient();
    const { data: ch, error } = await db
      .from("characters")
      .select("id,slug,name,category,momentum,current_price,previous_price")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw error;
    if (!ch) throw new Error("Character not found");

    const [explanations, speculationRows, latestReport] = await Promise.all([
      db
        .from("price_movement_explanations")
        .select("id,pct_change,price_before,price_after,summary,reason_codes,source,created_at")
        .eq("character_id", ch.id)
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("market_rumor_impacts")
        .select("market_rumors!inner(id,title,description,status,created_at,expires_at)")
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

    const momentum = Number(ch.momentum ?? 0);
    const currentPrice = Number(ch.current_price ?? 0);
    const previousPrice = Number(ch.previous_price ?? 0);
    const priceMovePct =
      previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;
    const recentMoveRows = (explanations.data ?? []) as PriceMovementRow[];
    const recentMoves = recentMoveRows.map((row) => Number(row.pct_change)).filter(Number.isFinite);
    const avgRecentMove = average(recentMoves);
    const avgRecentAbsMove = average(recentMoves.map(Math.abs));
    const reportSentiment = latestReport.data?.sentiment ?? "neutral";
    const reportAvgChange = Number(latestReport.data?.avg_change_pct ?? 0);
    const speculation = [
      ...new Map(
        ((speculationRows.data ?? []) as SpeculationRelationRow[])
          .map((row) => row.market_rumors)
          .filter(isSpeculationRumorRow)
          .map((row) => [
            row.id,
            {
              id: row.id,
              title: row.title,
              description: row.description,
              status: row.status,
              created_at: row.created_at,
              expires_at: row.expires_at,
            },
          ]),
      ).values(),
    ];

    const bullish: string[] = [];
    const bearish: string[] = [];

    if (momentum > 0.5) bullish.push(`Positive momentum (+${momentum.toFixed(2)})`);
    if (momentum < -0.5) bearish.push(`Negative momentum (${momentum.toFixed(2)})`);
    if (priceMovePct >= 2) bullish.push(`Observable price strength (+${priceMovePct.toFixed(2)}%)`);
    if (priceMovePct <= -2) bearish.push(`Observable price weakness (${priceMovePct.toFixed(2)}%)`);
    if (avgRecentMove >= 2)
      bullish.push(`Recent public moves trending positive (+${avgRecentMove.toFixed(2)}%)`);
    if (avgRecentMove <= -2)
      bearish.push(`Recent public moves trending negative (${avgRecentMove.toFixed(2)}%)`);
    if (reportSentiment === "bullish" || reportSentiment === "extremely_bullish")
      bullish.push(`Market report sentiment ${String(reportSentiment).replace(/_/g, " ")}`);
    if (reportSentiment === "bearish" || reportSentiment === "extremely_bearish")
      bearish.push(`Market report sentiment ${String(reportSentiment).replace(/_/g, " ")}`);

    // Deterministic public scores combine visible trend, verified movement, report, and category data.
    const confidence = clampScore(
      50 +
        clamp(momentum * 8, -20, 20) +
        clamp(priceMovePct * 2, -15, 15) +
        clamp(avgRecentMove, -10, 10) +
        clamp(reportAvgChange, -10, 10) +
        sentimentScore(String(reportSentiment)),
    );
    const categoryBaseRisk =
      ch.category === "meme"
        ? 70
        : ch.category === "speculative"
          ? 55
          : ch.category === "growth"
            ? 35
            : 22;
    const risk = clampScore(
      categoryBaseRisk +
        clamp(Math.abs(momentum) * 6, 0, 20) +
        clamp(Math.abs(priceMovePct) * 2, 0, 18) +
        clamp(avgRecentAbsMove, 0, 20) +
        clamp(Math.abs(reportAvgChange), 0, 10),
    );

    return {
      character: ch,
      explanations: explanations.data ?? [],
      speculation,
      sentiment: reportSentiment,
      avg_change_pct: reportAvgChange,
      intel: {
        bullish,
        bearish,
        confidence,
        risk,
      },
    };
  });

export const listRecentExplanations = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ limit: z.number().int().min(1).max(50).default(15) }).parse(d ?? {}),
  )
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
