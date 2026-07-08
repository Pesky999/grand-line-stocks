import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { getMarketSentiment, listRecentEvents } from "@/lib/api/events.functions";
import { getLatestReport, listActiveRumors } from "@/lib/api/living-market.functions";
import { amIAdmin, listNews } from "@/lib/api/market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { useMe } from "@/hooks/useMe";

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

const SENT_TONE: Record<string, string> = {
  extremely_bullish: "text-bull",
  bullish: "text-bull",
  neutral: "text-muted-foreground",
  bearish: "text-bear",
  extremely_bearish: "text-bear",
};

type LinkedCharacter = { slug?: string | null; name?: string | null } | null;
type NewsRow = {
  id: string;
  title: string;
  body: string;
  impact: string | null;
  created_at: string;
  characters?: LinkedCharacter;
};
type EventImpact = {
  pct_change: number | string;
  price_before?: number | string | null;
  price_after?: number | string | null;
  characters?: LinkedCharacter;
};
type MarketEvent = {
  id: string;
  title: string;
  description?: string | null;
  event_type: string;
  published_at?: string | null;
  created_at: string;
  market_event_impacts?: EventImpact[] | null;
};
type MarketSentiment = {
  sentiment: string;
  avgPct: number;
  events7d: number;
  moves7d: number;
  topGainers: { slug: string; name: string; pct: number }[];
  topLosers: { slug: string; name: string; pct: number }[];
};
type MarketReport = {
  id: string;
  report_date: string;
  sentiment: string;
  avg_change_pct: number | string;
  headline: string;
  summary: string;
  biggest_gainer_pct?: number | string | null;
  biggest_loser_pct?: number | string | null;
  gainer?: LinkedCharacter;
  loser?: LinkedCharacter;
  trending?: LinkedCharacter;
  discussed?: LinkedCharacter;
  gainer_explanation?: string | null;
  loser_explanation?: string | null;
  trending_explanation?: string | null;
  discussed_explanation?: string | null;
};
type MarketRumor = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  market_rumor_impacts?: EventImpact[] | null;
};

const newsQO = queryOptions({ queryKey: ["news"], queryFn: () => listNews() });
const eventsQO = queryOptions({ queryKey: ["events", "recent"], queryFn: () => listRecentEvents({ data: { limit: 30 } }) });
const sentimentQO = queryOptions({ queryKey: ["sentiment"], queryFn: () => getMarketSentiment() });
const latestQO = queryOptions({ queryKey: ["report", "latest"], queryFn: () => getLatestReport() });
const rumorsQO = queryOptions({ queryKey: ["rumors", "active"], queryFn: () => listActiveRumors({ data: { limit: 20 } }) });

export const Route = createFileRoute("/market-bulletin")({
  head: () => ({
    meta: [
      { title: "Market Bulletin - Berry Street" },
      {
        name: "description",
        content: "News, events, and reports for the One Piece character market.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(newsQO),
      context.queryClient.ensureQueryData(eventsQO),
      context.queryClient.ensureQueryData(sentimentQO),
      context.queryClient.ensureQueryData(latestQO),
      context.queryClient.ensureQueryData(rumorsQO),
    ]),
  component: MarketBulletin,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">{error.message}</div></TerminalShell>,
  notFoundComponent: () => null,
});

function MarketBulletin() {
  const { user } = useMe();
  const { data: adminInfo } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: () => amIAdmin(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const isAdmin = !!adminInfo?.isAdmin;

  return (
    <TerminalShell>
      <div className="mx-auto max-w-5xl space-y-6 p-4">
        <header className="terminal-panel p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Berry Street Wire</div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Market Bulletin</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Follow the latest market news, published catalysts, and daily reports in one place.
          </p>
        </header>

        <NewsSection isAdmin={isAdmin} />
        <EventsSection isAdmin={isAdmin} />
        <ReportsSection isAdmin={isAdmin} />
      </div>
    </TerminalShell>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="border-b border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {action && (
          <Link
            to={action.to}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-accent hover:text-accent"
          >
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}

function NewsSection({ isAdmin }: { isAdmin: boolean }) {
  const news = useSuspenseQuery(newsQO).data as NewsRow[];

  return (
    <section id="news" className="terminal-panel scroll-mt-24">
      <SectionHeader
        title="News"
        description="Recent published wire items and story notes moving the market."
        action={isAdmin ? { to: "/admin", label: "Post News" } : undefined}
      />
      <ul className="divide-y divide-border">
        {news.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">No news posted yet.</li>}
        {news.map((n) => (
          <li key={n.id} className="p-4">
            <div className="mb-1 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest">
              <span className={n.impact === "bullish" ? "text-bull" : n.impact === "bearish" ? "text-bear" : "text-muted-foreground"}>
                * {n.impact ?? "neutral"}
              </span>
              <span className="text-muted-foreground tabular">{new Date(n.created_at).toLocaleString()}</span>
              {n.characters?.slug && (
                <Link to="/character/$slug" params={{ slug: n.characters.slug }} className="text-accent">
                  {n.characters.name ?? n.characters.slug}
                </Link>
              )}
            </div>
            <h3 className="text-base font-bold text-foreground">{n.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EventsSection({ isAdmin }: { isAdmin: boolean }) {
  const events = useSuspenseQuery(eventsQO).data as MarketEvent[];
  const s = useSuspenseQuery(sentimentQO).data as MarketSentiment;
  const tone = s.sentiment === "bullish" ? "text-bull" : s.sentiment === "bearish" ? "text-bear" : "text-muted-foreground";

  return (
    <section id="events" className="terminal-panel scroll-mt-24">
      <SectionHeader
        title="Events"
        description="Published market catalysts with current event impacts."
        action={isAdmin ? { to: "/events-admin", label: "Manage Events" } : undefined}
      />

      <div className="border-b border-border">
        <div className="terminal-header">Market Sentiment - 7d</div>
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
      </div>

      <div className="terminal-header">Event Wire</div>
      <ul className="divide-y divide-border">
        {events.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">No events published yet.</li>}
        {events.map((e) => (
          <li key={e.id} className="p-4">
            <div className="mb-1 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest">
              <span className="bg-secondary px-2 py-0.5 text-accent">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
              <span className="text-muted-foreground tabular">{new Date(e.published_at ?? e.created_at).toLocaleString()}</span>
            </div>
            <h3 className="text-base font-bold text-foreground">{e.title}</h3>
            {e.description && <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>}
            <ul className="mt-2 flex flex-wrap gap-2 text-xs tabular">
              {(e.market_event_impacts ?? []).map((impact, index) => {
                const up = Number(impact.pct_change) >= 0;
                const slug = impact.characters?.slug;
                return (
                  <li key={`${slug ?? "impact"}-${index}`} className="flex items-center gap-1 border border-border px-2 py-1">
                    {slug ? (
                      <Link to="/character/$slug" params={{ slug }} className="text-accent">
                        {slug.toUpperCase()}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">UNKNOWN</span>
                    )}
                    <span className={up ? "text-bull" : "text-bear"}>
                      {up ? "UP" : "DOWN"} {Math.abs(Number(impact.pct_change)).toFixed(2)}%
                    </span>
                    {impact.price_before != null && impact.price_after != null && (
                      <span className="text-muted-foreground">
                        {Number(impact.price_before).toFixed(2)} -&gt; {Number(impact.price_after).toFixed(2)}
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
  );
}

function ReportsSection({ isAdmin }: { isAdmin: boolean }) {
  const latest = useSuspenseQuery(latestQO).data as MarketReport | null;
  const rumors = useSuspenseQuery(rumorsQO).data as MarketRumor[];

  return (
    <section id="reports" className="terminal-panel scroll-mt-24">
      <SectionHeader
        title="Reports"
        description="Daily reports, active rumors, and recent market summaries."
        action={isAdmin ? { to: "/market-admin", label: "Open Market Console" } : undefined}
      />

      <div className="border-b border-border">
        <div className="terminal-header flex justify-between">
          <span>* Daily Market Report</span>
          <span className="text-muted-foreground">{latest ? new Date(latest.report_date).toDateString() : "-"}</span>
        </div>
        {!latest ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No report yet.</div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className={`text-xs uppercase tracking-widest ${SENT_TONE[latest.sentiment] ?? ""}`}>{fmtSent(latest.sentiment)}</span>
              <span className={`tabular text-sm ${Number(latest.avg_change_pct) >= 0 ? "text-bull" : "text-bear"}`}>
                AVG {Number(latest.avg_change_pct) >= 0 ? "+" : ""}{Number(latest.avg_change_pct).toFixed(2)}%
              </span>
            </div>
            <h3 className="text-xl font-bold text-foreground">{latest.headline}</h3>
            <p className="text-sm text-muted-foreground">{latest.summary}</p>
            <div className="grid gap-px bg-border md:grid-cols-4">
              <ReportCell label="Biggest Gainer" name={latest.gainer?.name} slug={latest.gainer?.slug} pct={latest.biggest_gainer_pct} explanation={latest.gainer_explanation} bull />
              <ReportCell label="Biggest Loser" name={latest.loser?.name} slug={latest.loser?.slug} pct={latest.biggest_loser_pct} explanation={latest.loser_explanation} />
              <ReportCell label="Trending" name={latest.trending?.name} slug={latest.trending?.slug} explanation={latest.trending_explanation} />
              <ReportCell label="Most Discussed" name={latest.discussed?.name} slug={latest.discussed?.slug} explanation={latest.discussed_explanation} />
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-border">
        <div className="terminal-header">Active Rumors - Speculation</div>
        <ul className="divide-y divide-border">
          {rumors.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">No rumors circulating.</li>}
          {rumors.map((r) => {
            const impact = r.market_rumor_impacts?.[0];
            const up = Number(impact?.pct_change ?? 0) >= 0;
            const slug = impact?.characters?.slug;
            return (
              <li key={r.id} className="p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-warn">
                  * Rumor - unverified
                  <span className="text-muted-foreground tabular">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <h3 className="text-sm font-bold text-foreground">{r.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                {slug && impact && (
                  <div className="mt-2 flex items-center gap-2 text-xs tabular">
                    <Link to="/character/$slug" params={{ slug }} className="text-accent">
                      {slug.toUpperCase()}
                    </Link>
                    <span className={up ? "text-bull" : "text-bear"}>{up ? "UP" : "DOWN"} {Math.abs(Number(impact.pct_change)).toFixed(2)}%</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="terminal-header">Report Archive</div>
        <div className="p-4 text-xs text-muted-foreground">
          The public bulletin loads the latest report and active speculation only. Full historical report management remains
          behind the existing admin market console.
        </div>
      </div>
    </section>
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
        {rows.length === 0 && <li className="px-3 py-2 text-muted-foreground">-</li>}
        {rows.map((r) => (
          <li key={r.slug} className="flex items-center justify-between gap-3 px-3 py-2 tabular">
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

function ReportCell({
  label,
  name,
  slug,
  pct,
  explanation,
  bull,
}: {
  label: string;
  name?: string | null;
  slug?: string | null;
  pct?: number | string | null;
  explanation?: string | null;
  bull?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-bold text-foreground">
        {slug ? <Link to="/character/$slug" params={{ slug }} className="hover:text-primary">{name}</Link> : "-"}
      </div>
      {pct != null && (
        <div className={`text-[10px] tabular ${bull || Number(pct) >= 0 ? "text-bull" : "text-bear"}`}>
          {Number(pct) >= 0 ? "+" : ""}{Number(pct).toFixed(2)}%
        </div>
      )}
      {explanation && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{explanation}</p>}
    </div>
  );
}

function fmtSent(sentiment: string) {
  return sentiment.replace(/_/g, " ").toUpperCase();
}
