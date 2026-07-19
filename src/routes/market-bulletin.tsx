import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { getMarketSentiment, listRecentEvents } from "@/lib/api/events.functions";
import { getLatestReport, listActiveSpeculation } from "@/lib/api/living-market.functions";
import { amIAdmin, listNews } from "@/lib/api/market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { useMe } from "@/hooks/useMe";
import {
  createMarketBulletinWireItems,
  filterWireItems,
  normalizeWireFeed,
  type CatalystWireItem,
  type NewsWireItem,
  type ReportWireItem,
  type SpeculationWireItem,
  type WireFeed,
  type WireItem,
  type WireCharacter,
} from "@/lib/market-bulletin/wire";

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

const FEED_LABELS: Array<{ feed: WireFeed; label: string }> = [
  { feed: "all", label: "All" },
  { feed: "news", label: "News" },
  { feed: "catalysts", label: "Catalysts" },
  { feed: "speculation", label: "Speculation" },
  { feed: "reports", label: "Reports" },
];

const SENT_TONE: Record<string, string> = {
  extremely_bullish: "text-bull",
  bullish: "text-bull",
  neutral: "text-muted-foreground",
  bearish: "text-bear",
  extremely_bearish: "text-bear",
};

type BulletinSearch = {
  feed?: WireFeed;
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
  gainer?: WireCharacter | null;
  loser?: WireCharacter | null;
  trending?: WireCharacter | null;
  discussed?: WireCharacter | null;
  gainer_explanation?: string | null;
  loser_explanation?: string | null;
  trending_explanation?: string | null;
  discussed_explanation?: string | null;
};

const newsQO = queryOptions({ queryKey: ["news"], queryFn: () => listNews() });
const catalystsQO = queryOptions({
  queryKey: ["catalysts", "recent"],
  queryFn: () => listRecentEvents({ data: { limit: 30 } }),
});
const sentimentQO = queryOptions({ queryKey: ["sentiment"], queryFn: () => getMarketSentiment() });
const latestQO = queryOptions({ queryKey: ["report", "latest"], queryFn: () => getLatestReport() });
const speculationQO = queryOptions({
  queryKey: ["speculation", "active"],
  queryFn: () => listActiveSpeculation({ data: { limit: 20 } }),
});

export const Route = createFileRoute("/market-bulletin")({
  validateSearch: (raw: Record<string, unknown>): BulletinSearch => ({
    feed: normalizeWireFeed(raw.feed),
  }),
  head: () => ({
    meta: [
      { title: "Market Bulletin - Berry Street" },
      {
        name: "description",
        content:
          "Market snapshot and chronological Wire feed for verified catalysts, news, speculation, and reports.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(newsQO),
      context.queryClient.ensureQueryData(catalystsQO),
      context.queryClient.ensureQueryData(sentimentQO),
      context.queryClient.ensureQueryData(latestQO),
      context.queryClient.ensureQueryData(speculationQO),
    ]),
  component: MarketBulletin,
  errorComponent: ({ error }) => (
    <TerminalShell>
      <div className="p-8 text-bear">{error.message}</div>
    </TerminalShell>
  ),
  notFoundComponent: () => null,
});

function MarketBulletin() {
  const search = Route.useSearch();
  const feed = normalizeWireFeed(search.feed);
  const news = useSuspenseQuery(newsQO).data;
  const catalysts = useSuspenseQuery(catalystsQO).data;
  const sentiment = useSuspenseQuery(sentimentQO).data as MarketSentiment;
  const latest = useSuspenseQuery(latestQO).data as MarketReport | null;
  const speculation = useSuspenseQuery(speculationQO).data;
  const wireItems = createMarketBulletinWireItems({
    news,
    catalysts,
    speculation,
    latestReport: latest,
  });
  const filteredWireItems = filterWireItems(wireItems, feed);

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
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <header className="terminal-panel p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Berry Street Wire
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Market Bulletin</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            A market snapshot and chronological feed of verified catalysts, official news,
            unconfirmed speculation, and daily reports.
          </p>
          {isAdmin && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              <AdminTool to="/admin" label="Post News" />
              <AdminTool to="/events-admin" label="Manage Catalysts" />
              <AdminTool to="/market-admin" label="Market Console" />
            </div>
          )}
        </header>

        <MarketSnapshot sentiment={sentiment} latest={latest} />
        <FeaturedDailyBrief latest={latest} />
        <WireSection feed={feed} items={filteredWireItems} />
      </div>
    </TerminalShell>
  );
}

function AdminTool({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-accent hover:text-accent"
    >
      {label}
    </Link>
  );
}

function MarketSnapshot({
  sentiment,
  latest,
}: {
  sentiment: MarketSentiment;
  latest: MarketReport | null;
}) {
  const topGainer = sentiment.topGainers[0] ?? null;
  const topLoser = sentiment.topLosers[0] ?? null;
  const trending = latest?.trending ?? null;
  const tone = SENT_TONE[sentiment.sentiment] ?? "text-muted-foreground";

  return (
    <section className="terminal-panel">
      <div className="terminal-header">Market Snapshot</div>
      <div className="grid gap-px bg-border p-px sm:grid-cols-2 lg:grid-cols-4">
        <SnapshotCell label="Market sentiment" value={fmtSent(sentiment.sentiment)} tone={tone} />
        <SnapshotCell
          label="Seven-day avg movement"
          value={formatSignedPct(sentiment.avgPct)}
          tone={sentiment.avgPct >= 0 ? "text-bull" : "text-bear"}
        />
        <SnapshotCell label="Recent catalyst count" value={String(sentiment.events7d)} />
        <SnapshotCell label="Recent impact count" value={String(sentiment.moves7d)} />
        <SnapshotMover label="Top gainer" row={topGainer} bull />
        <SnapshotMover label="Top loser" row={topLoser} />
        <SnapshotCharacter label="Trending character" character={trending} />
        <SnapshotCharacter label="Latest brief" character={latest?.discussed ?? null} />
      </div>
    </section>
  );
}

function SnapshotCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-bold tabular ${tone ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function SnapshotMover({
  label,
  row,
  bull,
}: {
  label: string;
  row: { slug: string; name: string; pct: number } | null;
  bull?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      {row ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold">
          <CharacterLink character={row} />
          <span className={`tabular ${bull || row.pct >= 0 ? "text-bull" : "text-bear"}`}>
            {formatSignedPct(row.pct)}
          </span>
        </div>
      ) : (
        <EmptyDash />
      )}
    </div>
  );
}

function SnapshotCharacter({
  label,
  character,
}: {
  label: string;
  character: WireCharacter | null;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      {character?.slug ? (
        <div className="mt-1 text-sm font-bold">
          <CharacterLink character={character} />
        </div>
      ) : (
        <EmptyDash />
      )}
    </div>
  );
}

function FeaturedDailyBrief({ latest }: { latest: MarketReport | null }) {
  return (
    <section className="terminal-panel">
      <div className="terminal-header">Featured Daily Brief</div>
      {!latest ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No daily brief is available yet.
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest">
            <span className="text-muted-foreground">{latest.report_date}</span>
            <span className={SENT_TONE[latest.sentiment] ?? "text-muted-foreground"}>
              {fmtSent(latest.sentiment)}
            </span>
            <span
              className={`tabular ${Number(latest.avg_change_pct) >= 0 ? "text-bull" : "text-bear"}`}
            >
              AVG {formatSignedPct(Number(latest.avg_change_pct))}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{latest.headline}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{latest.summary}</p>
          </div>
          <div className="grid gap-px bg-border md:grid-cols-4">
            <ReportCell
              label="Biggest gainer"
              character={latest.gainer ?? null}
              pct={latest.biggest_gainer_pct}
              explanation={latest.gainer_explanation}
              bull
            />
            <ReportCell
              label="Biggest loser"
              character={latest.loser ?? null}
              pct={latest.biggest_loser_pct}
              explanation={latest.loser_explanation}
            />
            <ReportCell
              label="Trending character"
              character={latest.trending ?? null}
              explanation={latest.trending_explanation}
            />
            <ReportCell
              label="Most discussed"
              character={latest.discussed ?? null}
              explanation={latest.discussed_explanation}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ReportCell({
  label,
  character,
  pct,
  explanation,
  bull,
}: {
  label: string;
  character: WireCharacter | null;
  pct?: number | string | null;
  explanation?: string | null;
  bull?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-bold text-foreground">
        {character?.slug ? <CharacterLink character={character} /> : <EmptyDash />}
      </div>
      {pct != null && (
        <div
          className={`text-[10px] tabular ${bull || Number(pct) >= 0 ? "text-bull" : "text-bear"}`}
        >
          {formatSignedPct(Number(pct))}
        </div>
      )}
      {explanation && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{explanation}</p>
      )}
    </div>
  );
}

function WireSection({ feed, items }: { feed: WireFeed; items: WireItem[] }) {
  return (
    <section id="wire" className="terminal-panel scroll-mt-24">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">The Wire</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              News, verified catalysts, speculation, and reports in newest-first order.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FEED_LABELS.map((option) => (
              <Link
                key={option.feed}
                to="/market-bulletin"
                search={{ feed: option.feed }}
                hash="wire"
                aria-pressed={feed === option.feed}
                className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${
                  feed === option.feed
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent hover:text-accent"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No matching Wire entries.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <WireEntry key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function WireEntry({ item }: { item: WireItem }) {
  if (item.kind === "news") return <NewsWireEntry item={item} />;
  if (item.kind === "catalyst") return <CatalystWireEntry item={item} />;
  if (item.kind === "speculation") return <SpeculationWireEntry item={item} />;
  return <ReportWireEntry item={item} />;
}

function WireMeta({ label, timestamp }: { label: string; timestamp: string }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
      <span className="text-accent">{label}</span>
      <span className="tabular">{formatTimestamp(timestamp)}</span>
    </div>
  );
}

function NewsWireEntry({ item }: { item: NewsWireItem }) {
  return (
    <li className="p-4">
      <WireMeta label={item.label} timestamp={item.timestamp} />
      <h3 className="text-base font-bold text-foreground">{item.title}</h3>
      {item.body && <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
        {item.impact && <span className="text-muted-foreground">{item.impact}</span>}
        {item.character && <CharacterLink character={item.character} />}
      </div>
    </li>
  );
}

function CatalystWireEntry({ item }: { item: CatalystWireItem }) {
  return (
    <li className="p-4">
      <WireMeta label={item.label} timestamp={item.timestamp} />
      <div className="mb-1">
        <span className="bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest text-accent">
          {EVENT_LABEL[item.eventType] ?? item.eventType}
        </span>
      </div>
      <h3 className="text-base font-bold text-foreground">{item.title}</h3>
      {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
      <ul className="mt-3 flex flex-wrap gap-2 text-xs tabular">
        {item.impacts.map((impact, index) => {
          const up = impact.pctChange >= 0;
          return (
            <li
              key={`${impact.character?.slug ?? "impact"}-${index}`}
              className="flex items-center gap-1 border border-border px-2 py-1"
            >
              {impact.character ? (
                <CharacterLink character={impact.character} />
              ) : (
                <span className="text-muted-foreground">UNKNOWN</span>
              )}
              <span className={up ? "text-bull" : "text-bear"}>
                {up ? "UP" : "DOWN"} {Math.abs(impact.pctChange).toFixed(2)}%
              </span>
              {impact.priceBefore != null && impact.priceAfter != null && (
                <span className="text-muted-foreground">
                  {impact.priceBefore.toFixed(2)} -&gt; {impact.priceAfter.toFixed(2)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function SpeculationWireEntry({ item }: { item: SpeculationWireItem }) {
  return (
    <li className="p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
        <span className="text-warn">{item.label}</span>
        <span className="border border-warn/50 px-1.5 py-0.5 text-warn">UNCONFIRMED</span>
        <span className="border border-border px-1.5 py-0.5 text-muted-foreground">
          NO PRICE EFFECT
        </span>
        <span className="text-muted-foreground tabular">{formatTimestamp(item.timestamp)}</span>
      </div>
      <h3 className="text-base font-bold text-foreground">{item.title}</h3>
      {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Community speculation. This entry does not affect stock prices.
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
        {item.characters.map((character) => (
          <CharacterLink key={character.slug} character={character} />
        ))}
        {item.expiresAt && (
          <span className="text-muted-foreground">Expires {formatTimestamp(item.expiresAt)}</span>
        )}
      </div>
    </li>
  );
}

function ReportWireEntry({ item }: { item: ReportWireItem }) {
  return (
    <li className="p-4">
      <WireMeta label={item.label} timestamp={item.reportDate} />
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
        <span className={SENT_TONE[item.sentiment] ?? "text-muted-foreground"}>
          {fmtSent(item.sentiment)}
        </span>
        <span className={`tabular ${item.avgChangePct >= 0 ? "text-bull" : "text-bear"}`}>
          AVG {formatSignedPct(item.avgChangePct)}
        </span>
      </div>
      <h3 className="text-base font-bold text-foreground">{item.title}</h3>
      {item.summary && <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>}
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
        {item.characters.map((character) => (
          <CharacterLink key={character.slug} character={character} />
        ))}
      </div>
    </li>
  );
}

function CharacterLink({ character }: { character: WireCharacter }) {
  return (
    <Link
      to="/character/$slug"
      params={{ slug: character.slug }}
      className="text-accent hover:text-primary"
    >
      {character.name || character.slug}
    </Link>
  );
}

function EmptyDash() {
  return <div className="mt-1 text-sm text-muted-foreground">{"\u2014"}</div>;
}

function formatSignedPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatTimestamp(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "\u2014" : date.toLocaleString();
}

function fmtSent(sentiment: string) {
  return sentiment.replace(/_/g, " ").toUpperCase();
}
