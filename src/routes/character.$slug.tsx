import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { getCharacter } from "@/lib/api/market.functions";
import { getCharacterEvents } from "@/lib/api/events.functions";
import { buyShares, sellShares } from "@/lib/api/wallet.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { formatBerries, formatBounty } from "@/lib/wallet";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { toast } from "sonner";

const qo = (slug: string) => queryOptions({ queryKey: ["character", slug], queryFn: () => getCharacter({ data: { slug } }) });
const eventsQO = (slug: string) => queryOptions({ queryKey: ["character", slug, "events"], queryFn: () => getCharacterEvents({ data: { slug } }) });

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
    ]),
  component: CharacterPage,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">Error: {error.message}</div></TerminalShell>,
  notFoundComponent: () => <TerminalShell><div className="p-8">Character not found</div></TerminalShell>,
});

function CharacterPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(qo(slug));
  const { data: charEvents } = useSuspenseQuery(eventsQO(slug));
  const { character: c, history } = data;
  const { data: me, user } = useMe();
  const invalidateMe = useInvalidateMe();
  const router = useRouter();
  const invalidateMe = useInvalidateMe();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const price = Number(c.current_price);
  const prev = Number(c.previous_price);
  const diff = price - prev;
  const pct = (diff / prev) * 100;
  const up = diff >= 0;
  const held = me?.holdings.find((h) => h.slug === slug);

  const chartData = history.map((h) => ({
    t: new Date(h.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    price: Number(h.price),
    note: h.note,
  }));

  const max = Math.max(...chartData.map((d) => d.price), price);
  const min = Math.min(...chartData.map((d) => d.price), price);

  async function handleBuy() {
    setBusy(true);
    try {
      await buyShares({ data: { slug, shares: qty } });
      await invalidateMe();
      toast.success(`Bought ${qty} ${slug.toUpperCase()} @ ฿${price.toFixed(2)}`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function handleSell() {
    setBusy(true);
    try {
      await sellShares({ data: { slug, shares: qty } });
      await invalidateMe();
      toast.success(`Sold ${qty} ${slug.toUpperCase()} @ ฿${price.toFixed(2)}`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <TerminalShell>
      <div className="border-b border-border bg-card/60 px-4 py-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">MARKET</Link>
          <span>/</span>
          <span className="text-accent">{slug.toUpperCase()}</span>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="terminal-panel">
            <div className="terminal-header flex items-center justify-between">
              <span>Quote</span>
              <span className="text-muted-foreground">Updated {new Date(c.updated_at).toLocaleString()}</span>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.crew ?? "Independent"} · {c.role ?? ""}</div>
                <h1 className="mt-1 text-2xl font-bold text-foreground">{c.name}</h1>
                <div className="mt-1 text-xs text-muted-foreground">SYM <span className="text-accent">{slug.toUpperCase()}</span> · BOUNTY <span className="text-foreground">{formatBounty(Number(c.bounty))}</span></div>
                {c.description && <p className="mt-3 max-w-prose text-sm text-muted-foreground">{c.description}</p>}
              </div>
              <div className="text-right">
                <div className={`text-4xl font-bold tabular ${up ? "text-bull glow-green" : "text-bear"}`}>
                  ฿{price.toFixed(2)}
                </div>
                <div className={`mt-1 text-sm tabular ${up ? "text-bull" : "text-bear"}`}>
                  {up ? "▲" : "▼"} {diff.toFixed(2)} ({up ? "+" : ""}{pct.toFixed(2)}%)
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular">prev {prev.toFixed(2)}</div>
              </div>
            </div>
          </section>

          <section className="terminal-panel">
            <div className="terminal-header flex items-center justify-between">
              <span>Price History</span>
              <span className="text-muted-foreground">H {max.toFixed(2)} · L {min.toFixed(2)}</span>
            </div>
            <div className="h-[320px] p-4">
              {chartData.length < 2 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No history yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
                    <XAxis dataKey="t" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} stroke="var(--border)" />
                    <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} stroke="var(--border)" domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                      labelStyle={{ color: "var(--accent)" }}
                    />
                    <ReferenceLine y={prev} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="price" stroke={up ? "var(--bull)" : "var(--bear)"} strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="terminal-panel">
            <div className="terminal-header">Trade Desk</div>
            <div className="space-y-3 p-4 text-sm">
              {!user ? (
                <div className="space-y-3 text-center">
                  <p className="text-xs text-muted-foreground">Sign in to trade {slug.toUpperCase()}.</p>
                  <Link to="/auth" className="block bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground">
                    Sign in to trade
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground tabular">
                    <span>Balance</span><span className="text-accent">฿{formatBerries(me?.berries ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground tabular">
                    <span>Position</span>
                    <span className="text-foreground">{held ? `${held.shares} @ avg ฿${held.avgCost.toFixed(2)}` : "—"}</span>
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
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="size-7 border border-border text-muted-foreground hover:text-primary">−</button>
                    <input
                      type="number" min={1} value={qty}
                      onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1")))}
                      className="w-full border border-border bg-input px-2 py-1.5 text-center tabular focus:border-primary outline-none"
                    />
                    <button onClick={() => setQty(qty + 1)} className="size-7 border border-border text-muted-foreground hover:text-primary">+</button>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground tabular">
                    <span>Est. cost</span><span>฿{(qty * price).toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button onClick={handleBuy} disabled={busy} className="bg-bull px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40">
                      ▲ Buy
                    </button>
                    <button onClick={handleSell} disabled={busy} className="bg-bear px-3 py-2 text-xs font-bold uppercase tracking-widest text-destructive-foreground hover:opacity-90 disabled:opacity-40">
                      ▼ Sell
                    </button>
                  </div>
                  <button onClick={() => router.invalidate()} className="w-full border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary">
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
