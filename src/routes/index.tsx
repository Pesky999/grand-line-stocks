import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
// URL search state validated inline in validateSearch below

import { listCharacters, listNews } from "@/lib/api/market.functions";
import { listRecentEvents } from "@/lib/api/events.functions";
import { getLatestReport, listActiveSpeculation } from "@/lib/api/living-market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { Ticker } from "@/components/Ticker";
import { formatBounty } from "@/lib/wallet";
import { useMe } from "@/hooks/useMe";
import { formatShares } from "@/lib/trading/fractional-shares";
import {
  calculatePriceChangePercent,
  MARKET_SCREENER_CATEGORIES,
  MARKET_SCREENER_SORTS,
  normalizeMarketScreenerCategory,
  normalizeMarketScreenerSort,
  selectMarketScreenerPage,
  type MarketScreenerCategory,
  type MarketScreenerSort,
} from "@/lib/market-screener/screener";

const PAGE_SIZE = 29;

const charsQO = queryOptions({ queryKey: ["characters"], queryFn: () => listCharacters() });
const newsQO = queryOptions({ queryKey: ["news"], queryFn: () => listNews() });
const eventsQO = queryOptions({
  queryKey: ["events", "recent", 6],
  queryFn: () => listRecentEvents({ data: { limit: 6 } }),
});
const reportQO = queryOptions({ queryKey: ["report", "latest"], queryFn: () => getLatestReport() });
const speculationQO = queryOptions({
  queryKey: ["speculation", "active", 5],
  queryFn: () => listActiveSpeculation({ data: { limit: 5 } }),
});

type MarketSearch = {
  page?: number;
  q?: string;
  sort?: MarketScreenerSort;
  category?: MarketScreenerCategory;
  owned?: boolean;
};

export const Route = createFileRoute("/")({
  validateSearch: (raw: Record<string, unknown>): MarketSearch => {
    const rawPage = Number(raw.page);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const rawQ = typeof raw.q === "string" ? raw.q : "";
    const q = rawQ.slice(0, 80);
    const sort = normalizeMarketScreenerSort(raw.sort);
    const category = normalizeMarketScreenerCategory(raw.category);
    const owned = raw.owned === true || raw.owned === "true";
    return { page, q, sort, category, owned };
  },

  loaderDeps: ({ search }) => ({
    page: search.page,
    q: search.q,
    sort: search.sort,
    category: search.category,
    owned: search.owned,
  }),
  head: () => ({
    meta: [
      { title: "Berry Street — The One Piece Stock Market" },
      {
        name: "description",
        content:
          "Track live stock prices for every One Piece character. Buy, sell, and play to earn Berries.",
      },
      { property: "og:title", content: "Berry Street — The One Piece Stock Market" },
      {
        property: "og:description",
        content: "Track live stock prices for every One Piece character.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(charsQO),
      context.queryClient.ensureQueryData(newsQO),
      context.queryClient.ensureQueryData(eventsQO),
      context.queryClient.ensureQueryData(reportQO),
      context.queryClient.ensureQueryData(speculationQO),
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

const SORT_LABELS: Record<MarketScreenerSort, string> = {
  featured: "Featured",
  gainers: "Top Gainers",
  losers: "Top Losers",
  price_desc: "Price: High to Low",
  price_asc: "Price: Low to High",
  momentum_desc: "Momentum: High to Low",
  momentum_asc: "Momentum: Low to High",
  name_asc: "Name: A to Z",
  name_desc: "Name: Z to A",
  category_asc: "Category: Stable to Volatile",
  category_desc: "Category: Volatile to Stable",
};

const CATEGORY_LABELS: Record<MarketScreenerCategory, string> = {
  all: "All Categories",
  blue_chip: "Blue Chip",
  growth: "Growth",
  speculative: "Speculative",
  meme: "Meme",
};

const CATEGORY_BADGES: Record<Exclude<MarketScreenerCategory, "all">, string> = {
  blue_chip: "BLUE CHIP",
  growth: "GROWTH",
  speculative: "SPECULATIVE",
  meme: "MEME",
};

function Market() {
  const { data: characters } = useSuspenseQuery(charsQO);
  const { data: news } = useSuspenseQuery(newsQO);
  const { data: events } = useSuspenseQuery(eventsQO);
  const { data: report } = useSuspenseQuery(reportQO);
  const { data: speculation } = useSuspenseQuery(speculationQO);
  const { data: me, user, authLoading, isLoading: meLoading } = useMe();

  const {
    page = 1,
    q = "",
    sort = "featured",
    category = "all",
    owned = false,
  } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [qInput, setQInput] = useState(q);
  const tableTopRef = useRef<HTMLDivElement>(null);

  // Debounce search input → URL
  useEffect(() => {
    setQInput(q);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = qInput.trim().slice(0, 80);
      if (trimmed === q) return;
      navigate({
        search: (prev: MarketSearch) => ({ ...prev, q: trimmed, page: 1 }),
        replace: true,
      });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  useEffect(() => {
    if (!authLoading && !user && owned) {
      navigate({
        search: (prev: MarketSearch) => ({ ...prev, owned: false, page: 1 }),
        replace: true,
      });
    }
  }, [authLoading, navigate, owned, user]);

  const holdingsBySlug = useMemo(() => {
    return new Map(
      (me?.holdings ?? []).map((holding) => [holding.slug.toLowerCase(), holding.shares]),
    );
  }, [me?.holdings]);

  const ownedSlugs = useMemo(() => new Set(holdingsBySlug.keys()), [holdingsBySlug]);
  const ownedDataPending = owned && (authLoading || (!!user && meLoading));

  const pageData = useMemo(() => {
    if (ownedDataPending) return null;
    return selectMarketScreenerPage({
      characters,
      page,
      pageSize: PAGE_SIZE,
      q,
      sort,
      category,
      owned,
      ownedSlugs,
    });
  }, [category, characters, owned, ownedDataPending, ownedSlugs, page, q, sort]);

  // Clamp page beyond total
  useEffect(() => {
    if (pageData && pageData.page !== page) {
      navigate({
        search: (prev: MarketSearch) => ({ ...prev, page: pageData.page }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData?.page, page]);

  const movers = [...characters].sort((a, b) => {
    const percent = calculatePriceChangePercent(b) - calculatePriceChangePercent(a);
    if (percent !== 0) return percent;
    const name = a.name.localeCompare(b.name);
    if (name !== 0) return name;
    return a.id.localeCompare(b.id);
  });
  const topGainers = movers.slice(0, 3);
  const topLosers = movers.slice(-3).reverse();

  const totalMcap = characters.reduce((s, c) => s + Number(c.current_price), 0);

  // Ticker: first 29 by display_order (fall back to price order if display_order null)
  const tickerItems = [...characters]
    .sort((a, b) => {
      const ao = a.display_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.display_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    })
    .slice(0, PAGE_SIZE);

  const goToPage = (p: number) => {
    navigate({ search: (prev: MarketSearch) => ({ ...prev, page: p }) });
    setTimeout(
      () => tableTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  };

  const rows = pageData?.rows ?? [];
  const totalPages = pageData?.totalPages ?? 1;
  const rangeStart = !pageData || pageData.total === 0 ? 0 : (pageData.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = pageData ? Math.min(pageData.page * PAGE_SIZE, pageData.total) : 0;
  const hasActiveFilters = q !== "" || sort !== "featured" || category !== "all" || owned;
  const emptyMessage = ownedDataPending
    ? "Loading your holdings..."
    : owned && user && ownedSlugs.size === 0
      ? "You do not own any stocks yet."
      : hasActiveFilters
        ? "No symbols match the current search and filters."
        : "No symbols available.";

  return (
    <TerminalShell>
      <Ticker items={tickerItems} />

      {report && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">SENTIMENT</span>
            <span
              className={`font-bold uppercase tracking-widest ${SENT_TONE[report.sentiment] ?? ""}`}
            >
              {report.sentiment.replace(/_/g, " ")}
            </span>
            <span className="text-muted-foreground hidden sm:inline">·</span>
            <span className="text-foreground hidden sm:inline truncate max-w-[60ch]">
              {report.headline}
            </span>
          </div>
          <Link to="/market-report" className="text-accent hover:text-primary">
            Daily Report →
          </Link>
        </div>
      )}

      {/* Top stats strip — uses all characters, not paginated */}
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
        <Stat
          label="MKT INDEX"
          value={(totalMcap / characters.length).toFixed(2)}
          sub="avg price"
        />
        <Stat label="LISTED" value={characters.length.toString()} sub="characters" />
        <Stat
          label="TOP GAINER"
          value={topGainers[0]?.name.split(" ")[0] ?? "—"}
          sub={pct(topGainers[0])}
          tone="bull"
        />
        <Stat
          label="TOP LOSER"
          value={topLosers[0]?.name.split(" ")[0] ?? "—"}
          sub={pct(topLosers[0])}
          tone="bear"
        />
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
        {/* Market table */}
        <section ref={tableTopRef} className="terminal-panel overflow-hidden">
          <div className="terminal-header flex items-center justify-between gap-2">
            <span>● Live Quotes</span>
            <span className="text-muted-foreground tabular">
              {hasActiveFilters && pageData
                ? `${pageData.total} match${pageData.total === 1 ? "" : "es"}`
                : `${characters.length} symbols`}
            </span>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-border bg-card/40 px-3 py-2">
            <input
              type="text"
              value={qInput}
              onChange={(e) => setQInput(e.target.value.slice(0, 80))}
              placeholder="Search character, symbol, or crew..."
              maxLength={80}
              className="flex-1 bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent border border-border rounded-none"
              aria-label="Search characters"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQInput("");
                  navigate({
                    search: (prev: MarketSearch) => ({ ...prev, q: "", page: 1 }),
                    replace: true,
                  });
                }}
                className="text-xs text-muted-foreground hover:text-primary px-2 py-1 border border-border"
              >
                CLEAR ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 border-b border-border bg-card/30 px-3 py-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Sort
              </span>
              <select
                value={sort}
                onChange={(event) =>
                  navigate({
                    search: (prev: MarketSearch) => ({
                      ...prev,
                      sort: event.target.value as MarketScreenerSort,
                      page: 1,
                    }),
                  })
                }
                className="min-w-44 border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                aria-label="Sort market list"
              >
                {MARKET_SCREENER_SORTS.map((value) => (
                  <option key={value} value={value}>
                    {SORT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Category
              </span>
              <select
                value={category}
                onChange={(event) =>
                  navigate({
                    search: (prev: MarketSearch) => ({
                      ...prev,
                      category: event.target.value as MarketScreenerCategory,
                      page: 1,
                    }),
                  })
                }
                className="min-w-36 border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                aria-label="Filter market list by category"
              >
                {MARKET_SCREENER_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Portfolio
              </span>
              <label className="flex min-h-8 items-center gap-2 border border-border px-2 py-1 text-foreground">
                <input
                  type="checkbox"
                  checked={owned && !!user}
                  disabled={authLoading || !user}
                  onChange={(event) =>
                    navigate({
                      search: (prev: MarketSearch) => ({
                        ...prev,
                        owned: event.target.checked,
                        page: 1,
                      }),
                    })
                  }
                  className="accent-primary"
                  aria-label="Show owned stocks only"
                />
                <span>Owned Only</span>
              </label>
              {!authLoading && !user && (
                <span className="text-[10px] text-muted-foreground">
                  Sign in to filter holdings.
                </span>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setQInput("");
                  navigate({
                    search: () => ({
                      page: 1,
                      q: "",
                      sort: "featured",
                      category: "all",
                      owned: false,
                    }),
                    replace: true,
                  });
                }}
                className="border border-border px-3 py-1 text-xs text-muted-foreground hover:text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                Reset Filters
              </button>
            )}
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
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      {emptyMessage}
                    </td>
                  </tr>
                )}
                {rows.map((c) => {
                  const diff = Number(c.current_price) - Number(c.previous_price);
                  const p = calculatePriceChangePercent(c);
                  const up = diff >= 0;
                  const momentum = Number(c.momentum);
                  const heldShares = holdingsBySlug.get(c.slug.toLowerCase());
                  return (
                    <tr key={c.id} className="border-b border-border/40 hover:bg-secondary/50">
                      <td className="px-3 py-2 font-bold text-accent">
                        <Link to="/character/$slug" params={{ slug: c.slug }}>
                          {c.slug.toUpperCase().slice(0, 4)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        <Link
                          to="/character/$slug"
                          params={{ slug: c.slug }}
                          className="hover:text-primary"
                        >
                          {c.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wide">
                          <span className="text-muted-foreground">
                            {CATEGORY_BADGES[c.category]}
                          </span>
                          <span className={momentumTone(momentum)}>
                            MOM {formatSignedPercent(momentum)}
                          </span>
                          {heldShares != null && heldShares > 0 && (
                            <span className="border border-accent/40 px-1 text-accent">
                              OWNED {formatShares(heldShares)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                        {c.crew ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{Number(c.current_price).toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right ${up ? "text-bull" : "text-bear"}`}>
                        {up ? "+" : ""}
                        {diff.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2 text-right ${up ? "text-bull" : "text-bear"}`}>
                        {up ? "▲" : "▼"} {Math.abs(p).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground hidden lg:table-cell">
                        {c.bounty == null ? "—" : formatBounty(Number(c.bounty))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground tabular">
              Showing {rangeStart}–{rangeEnd} of {pageData?.total ?? 0} symbols
            </span>
            <Pagination page={pageData?.page ?? 1} totalPages={totalPages} onGo={goToPage} />
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
              <span>Recent Catalysts</span>
              <Link to="/events" className="text-muted-foreground hover:text-primary">
                all →
              </Link>
            </div>
            <ul className="divide-y divide-border text-xs">
              {events.length === 0 && (
                <li className="px-3 py-2 text-muted-foreground">No catalysts yet.</li>
              )}
              {events.map((e) => {
                const impacts = e.market_event_impacts ?? [];
                const avg = impacts.length
                  ? impacts.reduce((s, i) => s + Number(i.pct_change), 0) / impacts.length
                  : 0;
                const up = avg >= 0;
                return (
                  <li key={e.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase text-accent">
                        {e.event_type.replace("_", " ")}
                      </span>
                      <span className={`text-[10px] tabular ${up ? "text-bull" : "text-bear"}`}>
                        {up ? "+" : ""}
                        {avg.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-foreground">{e.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground tabular">
                      {impacts
                        .slice(0, 3)
                        .map((i) => i.characters?.slug?.toUpperCase())
                        .join(" · ")}
                      {impacts.length > 3 ? ` +${impacts.length - 3}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="terminal-panel">
            <div className="terminal-header flex items-center justify-between">
              <span className="text-warn">{"\u25c6"} Speculation</span>
              <Link
                to="/market-bulletin"
                search={{ feed: "speculation" }}
                hash="wire"
                className="text-muted-foreground hover:text-primary"
              >
                all →
              </Link>
            </div>
            <ul className="divide-y divide-border text-xs">
              {speculation.length === 0 && (
                <li className="px-3 py-2 text-muted-foreground">Quiet on the wire.</li>
              )}
              {speculation.slice(0, 4).map((item) => (
                <li key={item.id} className="px-3 py-2">
                  <div className="truncate text-foreground">{item.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span className="text-warn">Unconfirmed</span>
                    <span>No price effect</span>
                    {item.characters.slice(0, 2).map((character) => (
                      <span key={character.slug} className="text-accent">
                        {character.slug.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="terminal-panel">
            <div className="terminal-header">Wire</div>
            <ul className="divide-y divide-border text-xs">
              {news.slice(0, 5).map((n) => (
                <li key={n.id} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase ${n.impact === "bullish" ? "text-bull" : n.impact === "bearish" ? "text-bear" : "text-muted-foreground"}`}
                    >
                      {n.impact}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString()}
                    </span>
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

function Pagination({
  page,
  totalPages,
  onGo,
}: {
  page: number;
  totalPages: number;
  onGo: (p: number) => void;
}) {
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const btn =
    "px-2 py-1 border border-border tabular text-xs hover:bg-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed";
  const active = "bg-accent/20 text-accent border-accent";
  const pages: number[] = [];
  for (let i = 1; i <= totalPages; i++) pages.push(i);
  return (
    <div className="flex items-center gap-1">
      <button className={btn} disabled={prevDisabled} onClick={() => onGo(page - 1)}>
        ← PREV
      </button>
      {/* Desktop numbered pages */}
      <div className="hidden sm:flex items-center gap-1">
        {pages.map((p) => (
          <button
            key={p}
            className={`${btn} ${p === page ? active : ""}`}
            onClick={() => onGo(p)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ))}
      </div>
      {/* Mobile compact indicator */}
      <span className="sm:hidden px-2 text-muted-foreground tabular">
        PAGE {page} OF {totalPages}
      </span>
      <button className={btn} disabled={nextDisabled} onClick={() => onGo(page + 1)}>
        NEXT →
      </button>
    </div>
  );
}

function pct(c: { current_price: number; previous_price: number } | undefined) {
  if (!c) return "—";
  return formatSignedPercent(calculatePriceChangePercent(c));
}

function formatSignedPercent(value: number) {
  const finite = Number.isFinite(value) ? value : 0;
  return `${finite > 0 ? "+" : ""}${finite.toFixed(2)}%`;
}

function momentumTone(value: number) {
  if (value > 0) return "text-bull";
  if (value < 0) return "text-bear";
  return "text-muted-foreground";
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bull" | "bear";
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-xl font-bold tabular ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground"}`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground tabular">{sub}</div>}
    </div>
  );
}

function MoverRow({
  c,
}: {
  c: { slug: string; name: string; current_price: number; previous_price: number };
}) {
  const d = calculatePriceChangePercent(c);
  const up = d >= 0;
  return (
    <li className="flex items-center justify-between px-3 py-2 tabular">
      <Link to="/character/$slug" params={{ slug: c.slug }} className="flex items-center gap-2">
        <span className="font-bold text-accent">{c.slug.toUpperCase().slice(0, 4)}</span>
        <span className="text-foreground">{c.name.split(" ").slice(0, 2).join(" ")}</span>
      </Link>
      <span className={up ? "text-bull" : "text-bear"}>
        {up ? "+" : ""}
        {d.toFixed(2)}%
      </span>
    </li>
  );
}
