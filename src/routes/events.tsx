import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listRecentEvents, getMarketSentiment } from "@/lib/api/events.functions";
import { TerminalShell } from "@/components/TerminalShell";

const EVENT_LABEL: Record<string, string> = {
  story_event: "Story",
  battle_result: "Battle",
  character_reveal: "Reveal",
  power_up: "Power-Up",
  political_event: "Political",
  community_event: "Community",
  market_correction: "Correction",
  meme_event: "Meme",
};

const eventsQO = queryOptions({ queryKey: ["events", "recent"], queryFn: () => listRecentEvents({ data: { limit: 30 } }) });
const sentimentQO = queryOptions({ queryKey: ["sentiment"], queryFn: () => getMarketSentiment() });

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events — Berry Street" },
      { name: "description", content: "Catalysts moving One Piece character stock prices." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(eventsQO), context.queryClient.ensureQueryData(sentimentQO)]),
  component: EventsPage,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">{error.message}</div></TerminalShell>,
  notFoundComponent: () => null,
});

function EventsPage() {
  const { data: events } = useSuspenseQuery(eventsQO);
  const { data: s } = useSuspenseQuery(sentimentQO);
  const tone = s.sentiment === "bullish" ? "text-bull" : s.sentiment === "bearish" ? "text-bear" : "text-muted-foreground";

  return (
    <TerminalShell>
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <section className="terminal-panel">
          <div className="terminal-header">Market Sentiment · 7d</div>
          <div className="grid gap-px bg-border p-px md:grid-cols-4">
            <Cell label="Sentiment" value={s.sentiment.toUpperCase()} tone={tone} />
            <Cell label="Avg move" value={`${s.avgPct >= 0 ? "+" : ""}${s.avgPct.toFixed(2)}%`} tone={tone} />
            <Cell label="Events" value={String(s.events7d)} />
            <Cell label="Impacts" value={String(s.moves7d)} />
          </div>
          <div className="grid gap-px bg-border md:grid-cols-2">
            <MoverList title="Top Gainers" rows={s.topGainers} bull />
            <MoverList title="Top Losers" rows={s.topLosers} />
          </div>
        </section>

        <section className="terminal-panel">
          <div className="terminal-header">Event Wire</div>
          <ul className="divide-y divide-border">
            {events.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">No events published yet.</li>}
            {events.map((e: any) => (
              <li key={e.id} className="p-4">
                <div className="mb-1 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest">
                  <span className="bg-secondary px-2 py-0.5 text-accent">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                  <span className="text-muted-foreground tabular">{new Date(e.published_at ?? e.created_at).toLocaleString()}</span>
                </div>
                <h2 className="text-base font-bold text-foreground">{e.title}</h2>
                {e.description && <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>}
                <ul className="mt-2 flex flex-wrap gap-2 text-xs tabular">
                  {(e.market_event_impacts ?? []).map((i: any, idx: number) => {
                    const up = Number(i.pct_change) >= 0;
                    return (
                      <li key={idx} className="flex items-center gap-1 border border-border px-2 py-1">
                        <Link to="/character/$slug" params={{ slug: i.characters?.slug }} className="text-accent">
                          {i.characters?.slug?.toUpperCase()}
                        </Link>
                        <span className={up ? "text-bull" : "text-bear"}>
                          {up ? "▲" : "▼"} {Math.abs(Number(i.pct_change)).toFixed(2)}%
                        </span>
                        {i.price_before != null && i.price_after != null && (
                          <span className="text-muted-foreground">
                            {Number(i.price_before).toFixed(2)}→{Number(i.price_after).toFixed(2)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </TerminalShell>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular ${tone ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function MoverList({ title, rows, bull }: { title: string; rows: { slug: string; name: string; pct: number }[]; bull?: boolean }) {
  return (
    <div className="bg-card">
      <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>
      <ul className="divide-y divide-border text-xs">
        {rows.length === 0 && <li className="px-3 py-2 text-muted-foreground">—</li>}
        {rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between px-3 py-2 tabular">
            <Link to="/character/$slug" params={{ slug: r.slug }} className="text-accent">{r.slug.toUpperCase()}</Link>
            <span className={bull || r.pct >= 0 ? "text-bull" : "text-bear"}>
              {r.pct >= 0 ? "+" : ""}{r.pct.toFixed(2)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
