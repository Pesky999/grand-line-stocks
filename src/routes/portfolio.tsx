import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listCharacters } from "@/lib/api/market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { useWallet, formatBerries } from "@/lib/wallet";

const qo = queryOptions({ queryKey: ["characters"], queryFn: () => listCharacters() });

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — Berry Street" }, { name: "description", content: "Your One Piece stock holdings." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  component: Portfolio,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">{error.message}</div></TerminalShell>,
  notFoundComponent: () => null,
});

function Portfolio() {
  const { data: characters } = useSuspenseQuery(qo);
  const { state, sell, reset } = useWallet();
  const bySlug = Object.fromEntries(characters.map((c) => [c.slug, c] as const));
  const holdings = Object.values(state.holdings);

  const marketValue = holdings.reduce((s, h) => s + h.shares * Number(bySlug[h.slug]?.current_price ?? 0), 0);
  const costBasis = holdings.reduce((s, h) => s + h.shares * h.avgCost, 0);
  const pnl = marketValue - costBasis;
  const netWorth = state.berries + marketValue;

  return (
    <TerminalShell>
      <div className="grid gap-px border-b border-border bg-border md:grid-cols-4">
        <Stat label="Cash" value={`฿${formatBerries(state.berries)}`} />
        <Stat label="Equity" value={`฿${formatBerries(marketValue)}`} />
        <Stat label="Net Worth" value={`฿${formatBerries(netWorth)}`} tone="accent" />
        <Stat label="P/L" value={`${pnl >= 0 ? "+" : ""}฿${formatBerries(pnl)}`} tone={pnl >= 0 ? "bull" : "bear"} />
      </div>

      <div className="p-4">
        <div className="terminal-panel overflow-hidden">
          <div className="terminal-header flex items-center justify-between">
            <span>Holdings</span>
            <button onClick={() => confirm("Reset portfolio?") && reset()} className="text-[10px] text-muted-foreground hover:text-bear">[reset]</button>
          </div>
          {holdings.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No positions. <Link to="/" className="text-primary underline">Open the market</Link>.
            </div>
          ) : (
            <table className="w-full text-xs tabular">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left">SYM</th>
                  <th className="px-3 py-2 text-right">SHARES</th>
                  <th className="px-3 py-2 text-right">AVG</th>
                  <th className="px-3 py-2 text-right">LAST</th>
                  <th className="px-3 py-2 text-right">MKT VAL</th>
                  <th className="px-3 py-2 text-right">P/L</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const c = bySlug[h.slug];
                  if (!c) return null;
                  const last = Number(c.current_price);
                  const mv = h.shares * last;
                  const pl = (last - h.avgCost) * h.shares;
                  return (
                    <tr key={h.slug} className="border-b border-border/40 hover:bg-secondary/50">
                      <td className="px-3 py-2">
                        <Link to="/character/$slug" params={{ slug: h.slug }} className="font-bold text-accent">{h.slug.toUpperCase().slice(0, 4)}</Link>
                        <span className="ml-2 text-muted-foreground">{c.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{h.shares}</td>
                      <td className="px-3 py-2 text-right">{h.avgCost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{last.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{mv.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right ${pl >= 0 ? "text-bull" : "text-bear"}`}>{pl >= 0 ? "+" : ""}{pl.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => sell(h.slug, h.shares, last)}
                          className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground"
                        >
                          Sell all
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </TerminalShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "accent" }) {
  const color =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "accent" ? "text-accent" : "text-foreground";
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular ${color}`}>{value}</div>
    </div>
  );
}
