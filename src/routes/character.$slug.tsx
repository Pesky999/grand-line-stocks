import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { getCharacter } from "@/lib/api/market.functions";
import { getCharacterEvents } from "@/lib/api/events.functions";
import { getCharacterIntel } from "@/lib/api/intelligence.functions";
import { listCharacterTopHolders } from "@/lib/api/legendary.functions";
import { buyShares, sellShares } from "@/lib/api/wallet.functions";
import {
  MIN_TRADE_TOTAL,
  calculateMaxAffordableShares,
  calculateMaxSellQuantity,
  calculateRoundedTradeTotal,
  formatShares,
  normalizeShareQuantityText,
  parseShareQuantity,
} from "@/lib/trading/fractional-shares";
import {
  clearTradeRequestId,
  clearTradeRequestIdForPayloadConflict,
  getOrCreateTradeRequestId,
  type TradeSide,
} from "@/lib/trading/trade-request-id";
import { TerminalShell } from "@/components/TerminalShell";
import { formatBerries, formatBounty } from "@/lib/wallet";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { toast } from "sonner";

const qo = (slug: string) =>
  queryOptions({ queryKey: ["character", slug], queryFn: () => getCharacter({ data: { slug } }) });
const eventsQO = (slug: string) =>
  queryOptions({
    queryKey: ["character", slug, "events"],
    queryFn: () => getCharacterEvents({ data: { slug } }),
  });
const intelQO = (slug: string) =>
  queryOptions({
    queryKey: ["character", slug, "intel"],
    queryFn: () => getCharacterIntel({ data: { slug } }),
  });

export const Route = createFileRoute("/character/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.toUpperCase()} — Berry Street` },
      { name: "description", content: `Live stock quote for ${params.slug} on Berry Street.` },
    ],
  }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(qo(params.slug)),
      context.queryClient.ensureQueryData(eventsQO(params.slug)),
      context.queryClient.ensureQueryData(intelQO(params.slug)),
    ]),
  component: CharacterPage,
  errorComponent: ({ error }) => (
    <TerminalShell>
      <div className="p-8 text-bear">Error: {error.message}</div>
    </TerminalShell>
  ),
  notFoundComponent: () => (
    <TerminalShell>
      <div className="p-8">Character not found</div>
    </TerminalShell>
  ),
});

const REASON_LABEL: Record<string, string> = {
  story_momentum: "Story Momentum",
  speculation: "Speculation",
  investor_optimism: "Investor Optimism",
  investor_fear: "Investor Fear",
  market_correction: "Market Correction",
  hype_surge: "Hype Surge",
  meme_activity: "Meme Activity",
  whale_buying: "Whale Buying",
  whale_selling: "Whale Selling",
  event_reaction: "Event Reaction",
  long_term_growth: "Long-Term Growth",
  normal_volatility: "Normal Volatility",
};

type MovementExplanation = {
  id: string;
  pct_change: number | string;
  reason_codes?: string[] | null;
  source: string;
  summary: string;
  created_at: string;
};

type RumorImpact = {
  pct_change: number | string;
  market_rumors: {
    title: string;
  };
};

type CharacterEventImpact = {
  pct_change: number | string;
  price_before: number | string | null;
  price_after: number | string | null;
  created_at: string;
  market_events: {
    event_type: string;
    title: string;
  };
};

type TopHolder = {
  rank: number;
  username: string;
  shares: number;
  value: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Trade failed.";
}

function CharacterPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(qo(slug));
  const { data: charEvents } = useSuspenseQuery(eventsQO(slug));
  const { data: intel } = useSuspenseQuery(intelQO(slug));
  const topHolders = useQuery({
    queryKey: ["top-holders", slug],
    queryFn: () => listCharacterTopHolders({ data: { slug, limit: 5 } }),
    staleTime: 60_000,
  });
  const { character: c, history } = data;
  const { data: me, user } = useMe();
  const invalidateMe = useInvalidateMe();
  const router = useRouter();
  const [qtyText, setQtyText] = useState("1");
  const [busy, setBusy] = useState(false);

  const price = Number(c.current_price);
  const prev = Number(c.previous_price);
  const diff = price - prev;
  const pct = (diff / prev) * 100;
  const up = diff >= 0;
  const held = me?.holdings.find((h) => h.slug === slug);
  const parsedQty = parseShareQuantity(qtyText);
  const tradeTotal = parsedQty == null ? 0 : calculateRoundedTradeTotal(price, parsedQty);
  const maxBuyQuantity = calculateMaxAffordableShares(me?.berries ?? 0, price);
  const maxSellQuantity = calculateMaxSellQuantity(held?.shares ?? 0);
  const buyDisabled =
    busy || parsedQty == null || tradeTotal < MIN_TRADE_TOTAL || tradeTotal > (me?.berries ?? 0);
  const sellDisabled =
    busy || parsedQty == null || tradeTotal < MIN_TRADE_TOTAL || !held || parsedQty > held.shares;
  const tradeHint =
    parsedQty == null
      ? "Enter a share quantity from 0.01 to 10,000 with up to two decimals."
      : tradeTotal < MIN_TRADE_TOTAL
        ? "Trade value must be at least ฿1.00."
        : tradeTotal > (me?.berries ?? 0)
          ? "Not enough Berries for this buy."
          : held && parsedQty > held.shares
            ? "You cannot sell more shares than you hold."
            : null;

  const chartData = history.map((h) => ({
    t: new Date(h.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    price: Number(h.price),
    note: h.note,
  }));

  const max = Math.max(...chartData.map((d) => d.price), price);
  const min = Math.min(...chartData.map((d) => d.price), price);

  function tradeRequest(side: TradeSide, shares: number) {
    if (!user?.id) {
      throw new Error("Sign in to trade.");
    }

    const intent = { userId: user.id, slug, side, shares };
    const requestId = getOrCreateTradeRequestId(intent);
    return { intent, requestId };
  }

  function adjustQuantity(delta: number) {
    const base = parsedQty ?? 1;
    const next = Math.min(10000, Math.max(0.01, base + delta));
    setQtyText(normalizeShareQuantityText(next));
  }

  async function handleBuy() {
    if (parsedQty == null || buyDisabled) return;
    const { intent, requestId } = tradeRequest("buy", parsedQty);
    setBusy(true);
    try {
      await buyShares({ data: { slug, shares: parsedQty, requestId } });
      await invalidateMe();
      await router.invalidate();
      clearTradeRequestId(intent);
      toast.success(
        `Bought ${formatShares(parsedQty)} ${slug.toUpperCase()} @ ฿${price.toFixed(2)}`,
      );
    } catch (e: unknown) {
      clearTradeRequestIdForPayloadConflict(e, intent);
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function handleSell() {
    if (parsedQty == null || sellDisabled) return;
    const { intent, requestId } = tradeRequest("sell", parsedQty);
    setBusy(true);
    try {
      await sellShares({ data: { slug, shares: parsedQty, requestId } });
      await invalidateMe();
      await router.invalidate();
      clearTradeRequestId(intent);
      toast.success(`Sold ${formatShares(parsedQty)} ${slug.toUpperCase()} @ ฿${price.toFixed(2)}`);
    } catch (e: unknown) {
      clearTradeRequestIdForPayloadConflict(e, intent);
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TerminalShell>
      <div className="border-b border-border bg-card/60 px-4 py-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link to="/" search={{ page: 1, q: "" }} className="hover:text-primary">
            MARKET
          </Link>
          <span>/</span>
          <span className="text-accent">{slug.toUpperCase()}</span>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="terminal-panel">
            <div className="terminal-header flex items-center justify-between">
              <span>Quote</span>
              <span className="text-muted-foreground">
                Updated {new Date(c.updated_at).toLocaleString()}
              </span>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {c.crew ?? "Independent"} · {c.role ?? ""}
                </div>
                <h1 className="mt-1 text-2xl font-bold text-foreground">{c.name}</h1>
                <div className="mt-1 text-xs text-muted-foreground">
                  SYM <span className="text-accent">{slug.toUpperCase()}</span> · BOUNTY{" "}
                  <span className="text-foreground">{formatBounty(Number(c.bounty))}</span>
                </div>
                {c.description && (
                  <p className="mt-3 max-w-prose text-sm text-muted-foreground">{c.description}</p>
                )}
              </div>
              <div className="text-right">
                <div
                  className={`text-4xl font-bold tabular ${up ? "text-bull glow-green" : "text-bear"}`}
                >
                  ฿{price.toFixed(2)}
                </div>
                <div className={`mt-1 text-sm tabular ${up ? "text-bull" : "text-bear"}`}>
                  {up ? "▲" : "▼"} {diff.toFixed(2)} ({up ? "+" : ""}
                  {pct.toFixed(2)}%)
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular">
                  prev {prev.toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          <section className="terminal-panel">
            <div className="terminal-header flex items-center justify-between">
              <span>Price History</span>
              <span className="text-muted-foreground">
                H {max.toFixed(2)} · L {min.toFixed(2)}
              </span>
            </div>
            <div className="h-[320px] p-4">
              {chartData.length < 2 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No history yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      stroke="var(--border)"
                    />
                    <YAxis
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      stroke="var(--border)"
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                      }}
                      labelStyle={{ color: "var(--accent)" }}
                    />
                    <ReferenceLine
                      y={prev}
                      stroke="var(--muted-foreground)"
                      strokeDasharray="3 3"
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={up ? "var(--bull)" : "var(--bear)"}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="terminal-panel">
            <div className="terminal-header flex items-center justify-between">
              <span>Why Is This Stock Moving?</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Sentiment ·{" "}
                <span className={Number(intel.avg_change_pct) >= 0 ? "text-bull" : "text-bear"}>
                  {String(intel.sentiment).replace(/_/g, " ")}
                </span>
              </span>
            </div>
            {intel.explanations.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                No significant moves logged yet. Quiet trading session.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(intel.explanations as MovementExplanation[]).slice(0, 6).map((e) => {
                  const up = Number(e.pct_change) >= 0;
                  return (
                    <li key={e.id} className="px-4 py-3">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                        <div className="flex flex-wrap gap-1">
                          {(e.reason_codes ?? []).map((rc: string) => (
                            <span key={rc} className="bg-secondary px-1.5 py-0.5 text-accent">
                              {REASON_LABEL[rc] ?? rc}
                            </span>
                          ))}
                          <span className="text-muted-foreground">via {e.source}</span>
                        </div>
                        <span className={`tabular ${up ? "text-bull" : "text-bear"}`}>
                          {up ? "▲" : "▼"} {Math.abs(Number(e.pct_change)).toFixed(2)}%
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-foreground">{e.summary}</p>
                      <div className="mt-1 text-[10px] text-muted-foreground tabular">
                        {new Date(e.created_at).toLocaleString()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="terminal-panel">
            <div className="terminal-header">Trade Desk</div>
            <div className="space-y-3 p-4 text-sm">
              {!user ? (
                <div className="space-y-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    Sign in to trade {slug.toUpperCase()}.
                  </p>
                  <Link
                    to="/auth"
                    className="block bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground"
                  >
                    Sign in to trade
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground tabular">
                    <span>Balance</span>
                    <span className="text-accent">฿{formatBerries(me?.berries ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground tabular">
                    <span>Position</span>
                    <span className="text-foreground">
                      {held
                        ? `${formatShares(held.shares)} @ avg ฿${held.avgCost.toFixed(2)}`
                        : "—"}
                    </span>
                  </div>
                  {held && (
                    <div className="flex justify-between text-xs tabular">
                      <span className="text-muted-foreground">Unrealized P/L</span>
                      <span className={price >= held.avgCost ? "text-bull" : "text-bear"}>
                        {((price - held.avgCost) * held.shares).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => adjustQuantity(-1)}
                      className="size-7 border border-border text-muted-foreground hover:text-primary"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0.01"
                      max="10000"
                      step="0.01"
                      inputMode="decimal"
                      value={qtyText}
                      onChange={(e) => setQtyText(e.target.value)}
                      className="w-full border border-border bg-input px-2 py-1.5 text-center tabular focus:border-primary outline-none"
                    />
                    <button
                      onClick={() => adjustQuantity(1)}
                      className="size-7 border border-border text-muted-foreground hover:text-primary"
                    >
                      +
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setQtyText(normalizeShareQuantityText(maxBuyQuantity))}
                      disabled={maxBuyQuantity <= 0 || busy}
                      className="border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest text-bull hover:bg-bull hover:text-primary-foreground disabled:opacity-40"
                    >
                      Max Buy
                    </button>
                    <button
                      onClick={() => setQtyText(normalizeShareQuantityText(maxSellQuantity))}
                      disabled={maxSellQuantity <= 0 || busy}
                      className="border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground disabled:opacity-40"
                    >
                      Max Sell
                    </button>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground tabular">
                    <span>Est. value</span>
                    <span>฿{formatBerries(tradeTotal)}</span>
                  </div>
                  {tradeHint && (
                    <div className="text-[11px] text-muted-foreground">{tradeHint}</div>
                  )}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={handleBuy}
                      disabled={buyDisabled}
                      className="bg-bull px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    >
                      ▲ Buy
                    </button>
                    <button
                      onClick={handleSell}
                      disabled={sellDisabled}
                      className="bg-bear px-3 py-2 text-xs font-bold uppercase tracking-widest text-destructive-foreground hover:opacity-90 disabled:opacity-40"
                    >
                      ▼ Sell
                    </button>
                  </div>
                  <button
                    onClick={() => router.invalidate()}
                    className="w-full border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                  >
                    Refresh quote
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="terminal-panel">
            <div className="terminal-header">Key Stats</div>
            <dl className="divide-y divide-border text-xs tabular">
              <Row label="Crew" value={c.crew ?? "—"} />
              <Row label="Role" value={c.role ?? "—"} />
              <Row label="Bounty" value={formatBounty(Number(c.bounty))} />
              <Row label="Symbol" value={slug.toUpperCase()} />
            </dl>
          </div>

          <div className="terminal-panel">
            <div className="terminal-header">Investor Intelligence</div>
            <div className="space-y-3 p-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <Meter label="Confidence" value={intel.intel.confidence} tone="bull" />
                <Meter label="Risk" value={intel.intel.risk} tone="bear" />
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-bull">
                  ▲ Bullish Signals
                </div>
                {intel.intel.bullish.length === 0 ? (
                  <div className="text-muted-foreground">None detected.</div>
                ) : (
                  <ul className="ml-3 list-disc space-y-0.5 text-foreground">
                    {intel.intel.bullish.map((s: string) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-bear">
                  ▼ Bearish Signals
                </div>
                {intel.intel.bearish.length === 0 ? (
                  <div className="text-muted-foreground">None detected.</div>
                ) : (
                  <ul className="ml-3 list-disc space-y-0.5 text-foreground">
                    {intel.intel.bearish.map((s: string) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
              {intel.rumors.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-warn">
                    ◆ Active Rumors
                  </div>
                  <ul className="space-y-1">
                    {(intel.rumors as RumorImpact[]).map((r, i) => (
                      <li key={i} className="text-foreground">
                        <span className={Number(r.pct_change) >= 0 ? "text-bull" : "text-bear"}>
                          {Number(r.pct_change) >= 0 ? "+" : ""}
                          {Number(r.pct_change).toFixed(2)}%
                        </span>{" "}
                        {r.market_rumors.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="terminal-panel">
            <div className="terminal-header">Catalysts</div>
            <ul className="divide-y divide-border text-xs">
              {charEvents.length === 0 && (
                <li className="px-3 py-3 text-muted-foreground">No events yet.</li>
              )}
              {(charEvents as CharacterEventImpact[]).map((row, idx) => {
                const e = row.market_events;
                const pct = Number(row.pct_change);
                const up = pct >= 0;
                return (
                  <li key={idx} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase text-accent">
                        {e.event_type.replace("_", " ")}
                      </span>
                      <span className={`tabular ${up ? "text-bull" : "text-bear"}`}>
                        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-foreground">{e.title}</div>
                    {row.price_before != null && row.price_after != null && (
                      <div className="text-[10px] text-muted-foreground tabular">
                        ฿{Number(row.price_before).toFixed(2)} → ฿
                        {Number(row.price_after).toFixed(2)} ·{" "}
                        {new Date(row.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="terminal-panel">
            <div className="terminal-header">Top {c.name} Investors</div>
            {(topHolders.data ?? []).length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">No holders yet.</div>
            ) : (
              <ol className="divide-y divide-border text-xs">
                {((topHolders.data ?? []) as TopHolder[]).map((h) => (
                  <li key={h.username} className="flex items-center justify-between px-3 py-2">
                    <span>
                      <span className="font-bold text-accent mr-2">#{h.rank}</span>
                      <Link
                        to="/u/$username"
                        params={{ username: h.username }}
                        className="text-primary hover:underline"
                      >
                        @{h.username}
                      </Link>
                    </span>
                    <span className="tabular text-muted-foreground">
                      {formatShares(h.shares)} sh · ฿{formatBerries(h.value)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </TerminalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: "bull" | "bear" }) {
  const color = tone === "bull" ? "var(--bull)" : "var(--bear)";
  return (
    <div className="border border-border bg-card/40 p-2">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span className="tabular text-foreground">{value}/100</span>
      </div>
      <div className="mt-1 h-1 w-full bg-border">
        <div className="h-1" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
