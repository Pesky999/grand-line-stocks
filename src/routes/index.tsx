import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  listCharacters,
  listNews,
  listMarketCharacters,
  listFeaturedCharacters,
  listMarketFilterOptions,
  FEATURED_SLUGS,
} from "@/lib/api/market.functions";
import { listRecentEvents } from "@/lib/api/events.functions";
import { getLatestReport, listActiveRumors } from "@/lib/api/living-market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { Ticker } from "@/components/Ticker";
import { formatBounty } from "@/lib/wallet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";

const MARKET_SORTS = ["price_desc", "price_asc", "gainers", "losers", "name_asc"] as const;
const MARKET_CATEGORIES = ["blue_chip", "growth", "speculative", "meme"] as const;
const SORT_LABEL: Record<(typeof MARKET_SORTS)[number], string> = {
  price_desc: "Price: high to low",
  price_asc: "Price: low to high",
  gainers: "Biggest gainers",
  losers: "Biggest losers",
  name_asc: "Name: A–Z",
};
const CATEGORY_LABEL: Record<(typeof MARKET_CATEGORIES)[number], string> = {
  blue_chip: "Blue chip",
  growth: "Growth",
  speculative: "Speculative",
  meme: "Meme",
};

const ALL = "__all__";

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
  q: z.string().max(80).catch("").default(""),
  aff: z.string().max(80).catch("").default(""),
  cat: z.enum([...MARKET_CATEGORIES, ""] as const).catch("").default(""),
  sort: z.enum(MARKET_SORTS).catch("price_desc").default("price_desc"),
});
type MarketSearch = z.infer<typeof searchSchema>;

const charsQO = queryOptions({ queryKey: ["characters"], queryFn: () => listCharacters() });
const newsQO = queryOptions({ queryKey: ["news"], queryFn: () => listNews() });
const eventsQO = queryOptions({ queryKey: ["events", "recent", 6], queryFn: () => listRecentEvents({ data: { limit: 6 } }) });
const reportQO = queryOptions({ queryKey: ["report", "latest"], queryFn: () => getLatestReport() });
const rumorsQO = queryOptions({ queryKey: ["rumors", "active", 5], queryFn: () => listActiveRumors({ data: { limit: 5 } }) });
const featuredQO = queryOptions({ queryKey: ["market", "featured"], queryFn: () => listFeaturedCharacters() });
const filterOptsQO = queryOptions({
  queryKey: ["market", "filter-options"],
  queryFn: () => listMarketFilterOptions(),
  staleTime: 5 * 60_000,
});

function marketGridQO(args: { page: number; q: string; aff: string; cat: string; sort: (typeof MARKET_SORTS)[number] }) {
  return queryOptions({
    queryKey: ["market", "grid", args.page, args.q, args.aff, args.cat, args.sort],
    queryFn: () =>
      listMarketCharacters({
        data: {
          page: args.page,
          pageSize: 24,
          q: args.q || undefined,
          affiliation: args.aff || undefined,
          category: (args.cat || undefined) as (typeof MARKET_CATEGORIES)[number] | undefined,
          sort: args.sort,
        },
      }),
  });
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Berry Street — The One Piece Stock Market" },
      { name: "description", content: "Track live stock prices for every One Piece character. Buy, sell, and play to earn Berries." },
      { property: "og:title", content: "Berry Street — The One Piece Stock Market" },
      { property: "og:description", content: "Track live stock prices for every One Piece character." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({
    page: search.page,
    q: search.q,
    aff: search.aff,
    cat: search.cat,
    sort: search.sort,
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(charsQO),
      context.queryClient.ensureQueryData(newsQO),
      context.queryClient.ensureQueryData(eventsQO),
      context.queryClient.ensureQueryData(reportQO),
      context.queryClient.ensureQueryData(rumorsQO),
      context.queryClient.ensureQueryData(featuredQO),
      context.queryClient.ensureQueryData(filterOptsQO),
      context.queryClient.ensureQueryData(marketGridQO(deps)),
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
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });

  const { data: characters } = useSuspenseQuery(charsQO);
  const { data: news } = useSuspenseQuery(newsQO);
  const { data: events } = useSuspenseQuery(eventsQO);
  const { data: report } = useSuspenseQuery(reportQO);
  const { data: rumors } = useSuspenseQuery(rumorsQO);
  const { data: featured } = useSuspenseQuery(featuredQO);
  const { data: filterOpts } = useSuspenseQuery(filterOptsQO);
  const { data: grid, isFetching: gridFetching } = useQuery(marketGridQO(search));

  // Ticker is intentionally limited to the featured pool so it stays readable.
  const tickerItems = characters.filter((c) => FEATURED_SLUGS.includes(c.slug));

  // Overview stats use the FULL market (all 142 rows), not just the current page.
  const movers = [...characters].sort((a, b) => {
    const da = (a.current_price - a.previous_price) / a.previous_price;
    const db = (b.current_price - b.previous_price) / b.previous_price;
    return db - da;
  });
  const topGainers = movers.slice(0, 3);
  const topLosers = movers.slice(-3).reverse();
  const totalMcap = characters.reduce((s, c) => s + Number(c.current_price), 0);

  const allCharsRef = useRef<HTMLDivElement>(null);
  // Whenever page changes, scroll the All Characters section into view.
  const prevPage = useRef(search.page);
  useEffect(() => {
    if (prevPage.current !== search.page) {
      allCharsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      prevPage.current = search.page;
    }
  }, [search.page]);

  function updateSearch(patch: Partial<typeof search>, resetPage = true) {
    navigate({
      search: (prev) => ({ ...prev, ...patch, ...(resetPage ? { page: 1 } : {}) }),
      replace: false,
    });
  }

  const totalPages = grid?.totalPages ?? 1;
  const currentPage = grid?.page ?? search.page;

  return (
    <TerminalShell>
      <Ticker items={tickerItems} />

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

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
        <Stat label="MKT INDEX" value={(totalMcap / characters.length).toFixed(2)} sub="avg price" />
        <Stat label="LISTED" value={characters.length.toString()} sub="characters" />
        <Stat label="TOP GAINER" value={topGainers[0]?.name.split(" ")[0] ?? "—"} sub={pct(topGainers[0])} tone="bull" />
        <Stat label="TOP LOSER" value={topLosers[0]?.name.split(" ")[0] ?? "—"} sub={pct(topLosers[0])} tone="bear" />
      </div>

      {/* Featured Stocks */}
      <section className="border-b border-border bg-card/40 px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-accent">★ Featured Stocks</h2>
          <span className="text-[10px] uppercase text-muted-foreground">Top 8 by price · original 29 pool</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible xl:grid-cols-8">
          {featured.map((c) => (
            <MarketCard key={c.id} c={c} compact />
          ))}
        </div>
      </section>

      {/* All Characters */}
      <section ref={allCharsRef} className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-accent">All Characters</h2>
          <span className="text-[10px] uppercase text-muted-foreground tabular">
            {grid?.total ?? 0} symbols · page {currentPage} of {totalPages}
          </span>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
          <Input
            placeholder="Search name or affiliation"
            value={search.q}
            maxLength={80}
            onChange={(e) => updateSearch({ q: e.target.value })}
            className="h-9 text-xs"
          />
          <Select
            value={search.aff || ALL}
            onValueChange={(v) => updateSearch({ aff: v === ALL ? "" : v })}
          >
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Affiliation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All affiliations</SelectItem>
              {filterOpts.affiliations.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={search.cat || ALL}
            onValueChange={(v) => updateSearch({ cat: v === ALL ? "" : (v as (typeof MARKET_CATEGORIES)[number]) })}
          >
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {filterOpts.categories.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABEL[c as (typeof MARKET_CATEGORIES)[number]] ?? c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={search.sort}
            onValueChange={(v) => updateSearch({ sort: v as (typeof MARKET_SORTS)[number] })}
          >
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MARKET_SORTS.map((s) => (
                <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {grid && grid.rows.length === 0 ? (
          <div className="rounded border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No market characters match these filters.
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate({ search: { page: 1, q: "", aff: "", cat: "", sort: "price_desc" } })
                }
              >
                Clear filters
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 ${gridFetching ? "opacity-70" : ""}`}
          >
            {grid?.rows.map((c) => <MarketCard key={c.id} c={c} />)}
          </div>
        )}

        <PaginationBar
          page={currentPage}
          totalPages={totalPages}
          onChange={(p) => navigate({ search: (prev) => ({ ...prev, page: p }) })}
        />
      </section>

      <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-[1fr_320px]">
        <section className="terminal-panel overflow-hidden">
          <div className="terminal-header flex items-center justify-between">
            <span>● Top Gainers (full market)</span>
            <span className="text-muted-foreground">{characters.length} symbols</span>
          </div>
          <ul className="divide-y divide-border text-xs">
            {topGainers.map((c) => <MoverRow key={c.id} c={c} />)}
          </ul>
          <div className="terminal-header">Top Losers</div>
          <ul className="divide-y divide-border text-xs">
            {topLosers.map((c) => <MoverRow key={c.id} c={c} />)}
          </ul>
        </section>
        <aside className="space-y-4">
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
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="terminal-panel">
            <div className="terminal-header flex items-center justify-between">
              <span className="text-warn">◆ Rumors</span>
              <Link to="/market-report" className="text-muted-foreground hover:text-primary">all →</Link>
            </div>
            <ul className="divide-y divide-border text-xs">
              {rumors.length === 0 && <li className="px-3 py-2 text-muted-foreground">Quiet on the wire.</li>}
              {rumors.slice(0, 4).map((r: any) => {
                const i = r.market_rumor_impacts?.[0];
                const up = Number(i?.pct_change ?? 0) >= 0;
                return (
                  <li key={r.id} className="px-3 py-2">
                    <div className="text-foreground truncate">{r.title}</div>
                    {i?.characters && (
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] tabular">
                        <span className="text-accent">{i.characters.slug.toUpperCase()}</span>
                        <span className={up ? "text-bull" : "text-bear"}>{up ? "+" : ""}{Number(i.pct_change).toFixed(2)}%</span>
                      </div>
                    )}
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

type GridRow = {
  id: string;
  slug: string;
  name: string;
  crew: string | null;
  current_price: number;
  previous_price: number;
  category: string;
  momentum: number;
  bounty: number | null;
  change_pct?: number;
};

function MarketCard({ c, compact }: { c: GridRow; compact?: boolean }) {
  const diff = Number(c.current_price) - Number(c.previous_price);
  const pct = c.change_pct ?? (Number(c.previous_price) > 0 ? (diff / Number(c.previous_price)) * 100 : 0);
  const up = diff >= 0;
  return (
    <Link
      to="/character/$slug"
      params={{ slug: c.slug }}
      className={`terminal-panel block ${compact ? "min-w-[160px]" : ""} hover:border-primary`}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-accent">{c.slug.toUpperCase().slice(0, 5)}</span>
          <span className="text-[9px] uppercase text-muted-foreground">{c.category.replace("_", " ")}</span>
        </div>
        <div className="mt-1 truncate text-sm text-foreground">{c.name}</div>
        <div className="truncate text-[10px] text-muted-foreground">{c.crew ?? "—"}</div>
        <div className="mt-2 flex items-end justify-between tabular">
          <span className="text-base font-bold">{Number(c.current_price).toFixed(2)}</span>
          <span className={`text-xs ${up ? "text-bull" : "text-bear"}`}>
            {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
          </span>
        </div>
        {!compact && (
          <div className="mt-1 text-[10px] text-muted-foreground tabular">
            {c.bounty != null ? formatBounty(Number(c.bounty)) : "—"}
          </div>
        )}
      </div>
    </Link>
  );
}

function PaginationBar({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = pageRange(page, totalPages);
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-xs">
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        <ChevronLeft className="h-3 w-3" /> Previous
      </Button>

      {/* Desktop: numbered */}
      <div className="hidden flex-wrap items-center gap-1 md:flex">
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-2 text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              size="sm"
              variant={p === page ? "default" : "ghost"}
              onClick={() => onChange(p)}
              className="h-7 min-w-7 px-2"
            >
              {p}
            </Button>
          ),
        )}
      </div>

      {/* Mobile: page X of N */}
      <span className="tabular text-muted-foreground md:hidden">
        Page {page} of {totalPages}
      </span>

      <Button
        size="sm"
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
      >
        Next <ChevronRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

function pageRange(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

function pct(c: { current_price: number; previous_price: number } | undefined) {
  if (!c) return "—";
  const d = ((Number(c.current_price) - Number(c.previous_price)) / Number(c.previous_price)) * 100;
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

function MoverRow({ c }: { c: { id?: string; slug: string; name: string; current_price: number; previous_price: number } }) {
  const d = ((Number(c.current_price) - Number(c.previous_price)) / Number(c.previous_price)) * 100;
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
