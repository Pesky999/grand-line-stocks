import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listCharacters, listNews } from "@/lib/api/market.functions";
import { listRecentEvents } from "@/lib/api/events.functions";
import { getLatestReport, listActiveRumors } from "@/lib/api/living-market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { Ticker } from "@/components/Ticker";
import { formatBounty } from "@/lib/wallet";

const charsQO = queryOptions({ queryKey: ["characters"], queryFn: () => listCharacters() });
const newsQO = queryOptions({ queryKey: ["news"], queryFn: () => listNews() });
const eventsQO = queryOptions({ queryKey: ["events", "recent", 6], queryFn: () => listRecentEvents({ data: { limit: 6 } }) });
const reportQO = queryOptions({ queryKey: ["report", "latest"], queryFn: () => getLatestReport() });
const rumorsQO = queryOptions({ queryKey: ["rumors", "active", 5], queryFn: () => listActiveRumors({ data: { limit: 5 } }) });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Berry Street — The One Piece Stock Market" },
      { name: "description", content: "Track live stock prices for every One Piece character. Buy, sell, and play to earn Berries." },
      { property: "og:title", content: "Berry Street — The One Piece Stock Market" },
      { property: "og:description", content: "Track live stock prices for every One Piece character." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(charsQO),
      context.queryClient.ensureQueryData(newsQO),
      context.queryClient.ensureQueryData(eventsQO),
      context.queryClient.ensureQueryData(reportQO),
      context.queryClient.ensureQueryData(rumorsQO),
    ]),
  component: Market,
  errorComponent: ({ error }) => <div className="p-8 text-bear">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

const SENT_TONE: Record<string, string> = {
  extremely_bullish: "text-bull",
  bullish: "text-bull",
  neutral: "text-muted-foreground",
  bearish: "text-bear",
  extremely_bearish: "text-bear",
};

function Market() {
  const { data: characters } = useSuspenseQuery(charsQO);
  const { data: news } = useSuspenseQuery(newsQO);
  const { data: events } = useSuspenseQuery(eventsQO);
  const { data: report } = useSuspenseQuery(reportQO);
  const { data: rumors } = useSuspenseQuery(rumorsQO);

  const movers = [...characters].sort((a, b) => {
    const da = (a.current_price - a.previous_price) / a.previous_price;
    const db = (b.current_price - b.previous_price) / b.previous_price;
    return db - da;
  });
  const topGainers = movers.slice(0, 3);
  const topLosers = movers.slice(-3).reverse();

  const totalMcap = characters.reduce((s, c) => s + Number(c.current_price), 0);

  return (
    <TerminalShell>
      <Ticker items={characters} />

      {report && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">SENTIMENT</span>
            <span className={`font-bold uppercase tracking-widest ${SENT_TONE[report.sentiment] ?? ""}`}>
              {report.sentiment.replace(/_/g, " ")}
            </span>
            <span className="text-muted-foreground hidden sm:inline">·</span>
            <span className="text-foreground hidden sm:inline truncate max-w-[60ch]">{report.headline}</span>
          </div>
          <Link to="/market-report" className="text-accent hover:text-primary">Daily Report →</Link>
        </div>
      )}

      {/* Top stats strip */}
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
        <Stat label="MKT INDEX" value={(totalMcap / characters.length).toFixed(2)} sub="avg price" />
        <Stat label="LISTED" value={characters.length.toString()} sub="characters" />
        <Stat label="TOP GAINER" value={topGainers[0]?.name.split(" ")[0] ?? "—"} sub={pct(topGainers[0])} tone="bull" />
        <Stat label="TOP LOSER" value={topLosers[0]?.name.split(" ")[0] ?? "—"} sub={pct(topLosers[0])} tone="bear" />
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
        {/* Market table */}
        <section className="terminal-panel overflow-hidden">
          <div className="terminal-header flex items-center justify-between">
            <span>● Live Quotes</span>
            <span className="text-muted-foreground">{characters.length} symbols</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium">SYM</th>
                  <th className="px-3 py-2 text-left font-medium">NAME</th>
                  <th className="px-3 py-2 text-left font-medium hidden md:table-cell">CREW</th>
                  <th className="px-3 py-2 text-right font-medium">LAST</th>
                  <th className="px-3 py-2 text-right font-medium">CHG</th>
                  <th className="px-3 py-2 text-right font-medium">CHG%</th>
                  <th className="px-3 py-2 text-right font-medium hidden lg:table-cell">BOUNTY</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((c) => {
                  const diff = Number(c.current_price) - Number(c.previous_price);
                  const p = (diff / Number(c.previous_price)) * 100;
                  const up = diff >= 0;
                  return (
                    <tr key={c.id} className="border-b border-border/40 hover:bg-secondary/50">
                      <td className="px-3 py-2 font-bold text-accent">
                        <Link to="/character/$slug" params={{ slug: c.slug }}>{c.slug.toUpperCase().slice(0, 4)}</Link>
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        <Link to="/character/$slug" params={{ slug: c.slug }} className="hover:text-primary">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{c.crew ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{Number(c.current_price).toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right ${up ? "text-bull" : "text-bear"}`}>
                        {up ? "+" : ""}{diff.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2 text-right ${up ? "text-bull" : "text-bear"}`}>
                        {up ? "▲" : "▼"} {Math.abs(p).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground hidden lg:table-cell">{formatBounty(Number(c.bounty))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="terminal-panel">
            <div className="terminal-header">Top Gainers</div>
            <ul className="divide-y divide-border text-xs">
              {topGainers.map((c) => (
                <MoverRow key={c.id} c={c} />
              ))}
            </ul>
          </div>
          <div className="terminal-panel">
            <div className="terminal-header">Top Losers</div>
            <ul className="divide-y divide-border text-xs">
              {topLosers.map((c) => (
                <MoverRow key={c.id} c={c} />
              ))}
            </ul>
          </div>
          <div className="terminal-panel">
            <div className="terminal-header flex items-center justify-between">
              <span>Recent Events</span>
              <Link to="/events" className="text-muted-foreground hover:text-primary">all →</Link>
            </div>
            <ul className="divide-y divide-border text-xs">
              {events.length === 0 && <li className="px-3 py-2 text-muted-foreground">No events yet.</li>}
              {events.map((e: any) => {
                const impacts = e.market_event_impacts ?? [];
                const avg = impacts.length ? impacts.reduce((s: number, i: any) => s + Number(i.pct_change), 0) / impacts.length : 0;
                const up = avg >= 0;
                return (
                  <li key={e.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase text-accent">{e.event_type.replace("_", " ")}</span>
                      <span className={`text-[10px] tabular ${up ? "text-bull" : "text-bear"}`}>{up ? "+" : ""}{avg.toFixed(1)}%</span>
                    </div>
                    <div className="text-foreground">{e.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground tabular">
                      {impacts.slice(0, 3).map((i: any) => i.characters?.slug?.toUpperCase()).join(" · ")}
                      {impacts.length > 3 ? ` +${impacts.length - 3}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="terminal-panel">
            <div className="terminal-header">Wire</div>
            <ul className="divide-y divide-border text-xs">
              {news.slice(0, 5).map((n) => (
                <li key={n.id} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase ${n.impact === "bullish" ? "text-bull" : n.impact === "bearish" ? "text-bear" : "text-muted-foreground"}`}>
                      {n.impact}
                    </span>
                    <span className="text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-foreground">{n.title}</div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </TerminalShell>
  );
}

function pct(c: { current_price: number; previous_price: number } | undefined) {
  if (!c) return "—";
  const d = (Number(c.current_price) - Number(c.previous_price)) / Number(c.previous_price) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(2)}%`;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bull" | "bear" }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground tabular">{sub}</div>}
    </div>
  );
}

function MoverRow({ c }: { c: { slug: string; name: string; current_price: number; previous_price: number } }) {
  const d = (Number(c.current_price) - Number(c.previous_price)) / Number(c.previous_price) * 100;
  const up = d >= 0;
  return (
    <li className="flex items-center justify-between px-3 py-2 tabular">
      <Link to="/character/$slug" params={{ slug: c.slug }} className="flex items-center gap-2">
        <span className="font-bold text-accent">{c.slug.toUpperCase().slice(0, 4)}</span>
        <span className="text-foreground">{c.name.split(" ").slice(0, 2).join(" ")}</span>
      </Link>
      <span className={up ? "text-bull" : "text-bear"}>{up ? "+" : ""}{d.toFixed(2)}%</span>
    </li>
  );
}
