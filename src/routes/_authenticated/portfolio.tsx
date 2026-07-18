import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import {
  TRADE_HISTORY_QUERY_KEY,
  listMyTransactions,
  listMyWalletLedgerEntries,
  sellShares,
  type WalletLedgerEntry,
} from "@/lib/api/wallet.functions";
import {
  TRADE_HISTORY_DEFAULT_PAGE_SIZE,
  type TradeHistoryCursor,
  type TradeHistoryItem,
  type TradeHistoryPage,
} from "@/lib/trade-history/pagination";
import { TerminalShell } from "@/components/TerminalShell";
import { formatBerries } from "@/lib/wallet";
import {
  calculateMaxSellQuantity,
  formatShares,
  normalizeShareQuantityText,
} from "@/lib/trading/fractional-shares";
import {
  clearTradeRequestId,
  clearTradeRequestIdForPayloadConflict,
  getOrCreateTradeRequestId,
} from "@/lib/trading/trade-request-id";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — Berry Street" }] }),
  component: Portfolio,
});

function Portfolio() {
  const { data, isLoading, user } = useMe();
  const invalidate = useInvalidateMe();
  const queryClient = useQueryClient();
  const [busySellRequests, setBusySellRequests] = useState<Record<string, boolean>>({});
  const walletLedgerQ = useQuery({
    queryKey: ["wallet-ledger-entries"],
    queryFn: () => listMyWalletLedgerEntries(),
    enabled: Boolean(data),
    staleTime: 10_000,
  });
  const tradeHistoryQ = useInfiniteQuery({
    queryKey: TRADE_HISTORY_QUERY_KEY,
    queryFn: ({ pageParam }: { pageParam: TradeHistoryCursor | null }) =>
      listMyTransactions({
        data: {
          cursor: pageParam,
          pageSize: TRADE_HISTORY_DEFAULT_PAGE_SIZE,
        },
      }),
    initialPageParam: null as TradeHistoryCursor | null,
    getNextPageParam: (lastPage: TradeHistoryPage) => lastPage.nextCursor,
    enabled: Boolean(data),
    staleTime: 10_000,
  });
  const tradeHistoryEntries = useMemo(() => {
    const seenTransactionIds = new Set<string>();
    return (tradeHistoryQ.data?.pages.flatMap((page) => page.items) ?? []).filter((transaction) => {
      if (seenTransactionIds.has(transaction.id)) return false;
      seenTransactionIds.add(transaction.id);
      return true;
    });
  }, [tradeHistoryQ.data]);

  if (isLoading || !data) {
    return (
      <TerminalShell>
        <div className="p-8 text-sm text-muted-foreground">Loading account…</div>
      </TerminalShell>
    );
  }

  const holdings = data.holdings;
  const walletLedgerEntries = (walletLedgerQ.data ?? []) as WalletLedgerEntry[];
  const marketValue = holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
  const costBasis = holdings.reduce((s, h) => s + h.shares * h.avgCost, 0);
  const pnl = marketValue - costBasis;
  const netWorth = data.berries + marketValue;

  async function handleSellAll(slug: string, shares: number) {
    if (!user?.id) {
      toast.error("Sign in to sell shares.");
      return;
    }

    const sellSharesQuantity = calculateMaxSellQuantity(shares);
    if (sellSharesQuantity <= 0) return;

    const requestKey = `${user.id}:sell:${slug}:${normalizeShareQuantityText(sellSharesQuantity)}`;
    if (busySellRequests[requestKey]) return;
    const intent = {
      userId: user.id,
      slug,
      side: "sell" as const,
      shares: sellSharesQuantity,
    };
    const requestId = getOrCreateTradeRequestId(intent);

    setBusySellRequests((current) => ({ ...current, [requestKey]: true }));

    try {
      await sellShares({ data: { slug, shares: sellSharesQuantity, requestId } });
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: TRADE_HISTORY_QUERY_KEY });
      clearTradeRequestId(intent);
      toast.success(`Sold ${formatShares(sellSharesQuantity)} ${slug.toUpperCase()}`);
    } catch (e: unknown) {
      clearTradeRequestIdForPayloadConflict(e, intent);
      toast.error(e instanceof Error ? e.message : "Could not sell shares.");
    } finally {
      setBusySellRequests((current) => {
        const next = { ...current };
        delete next[requestKey];
        return next;
      });
    }
  }

  async function handleLoadMoreTrades() {
    if (!tradeHistoryQ.hasNextPage || tradeHistoryQ.isFetchingNextPage) return;
    await tradeHistoryQ.fetchNextPage();
  }

  return (
    <TerminalShell>
      <div className="grid gap-px border-b border-border bg-border md:grid-cols-4">
        <Stat label="Cash" value={`฿${formatBerries(data.berries)}`} />
        <Stat label="Equity" value={`฿${formatBerries(marketValue)}`} />
        <Stat label="Net Worth" value={`฿${formatBerries(netWorth)}`} tone="accent" />
        <Stat
          label="P/L"
          value={`${pnl >= 0 ? "+" : ""}฿${formatBerries(pnl)}`}
          tone={pnl >= 0 ? "bull" : "bear"}
        />
      </div>

      <div className="p-4">
        <div className="terminal-panel overflow-hidden">
          <div className="terminal-header">
            <span>Holdings</span>
          </div>

          {holdings.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No positions.{" "}
              <Link to="/" search={{ page: 1, q: "" }} className="text-primary underline">
                Open the market
              </Link>
              .
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
                  const mv = h.shares * h.currentPrice;
                  const pl = (h.currentPrice - h.avgCost) * h.shares;
                  const sellQuantity = calculateMaxSellQuantity(h.shares);
                  const sellKey = `${user?.id ?? "anonymous"}:sell:${h.slug}:${normalizeShareQuantityText(sellQuantity)}`;
                  const sellLabel = h.shares > 10000 ? "Sell max" : "Sell all";
                  return (
                    <tr key={h.slug} className="border-b border-border/40 hover:bg-secondary/50">
                      <td className="px-3 py-2">
                        <Link
                          to="/character/$slug"
                          params={{ slug: h.slug }}
                          className="font-bold text-accent"
                        >
                          {h.slug.toUpperCase().slice(0, 4)}
                        </Link>
                        <span className="ml-2 text-muted-foreground">{h.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{formatShares(h.shares)}</td>
                      <td className="px-3 py-2 text-right">{h.avgCost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{h.currentPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{mv.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right ${pl >= 0 ? "text-bull" : "text-bear"}`}>
                        {pl >= 0 ? "+" : ""}
                        {pl.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleSellAll(h.slug, h.shares)}
                          disabled={busySellRequests[sellKey] || sellQuantity <= 0}
                          className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground disabled:opacity-40"
                        >
                          {sellLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="terminal-panel mt-4 overflow-hidden">
          <div className="terminal-header">
            <span>Trade History</span>
          </div>

          {tradeHistoryQ.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading stock trades...</div>
          ) : tradeHistoryQ.isError ? (
            <div className="p-6 text-sm text-bear">Could not load stock trade history.</div>
          ) : tradeHistoryEntries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No stock trades yet. Berry reward activity appears separately below.
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/40">
                {tradeHistoryEntries.map((entry) => (
                  <TradeHistoryRow key={entry.id} entry={entry} />
                ))}
              </div>
              {tradeHistoryQ.hasNextPage ? (
                <div className="border-t border-border/40 p-3 text-center">
                  <button
                    onClick={handleLoadMoreTrades}
                    disabled={tradeHistoryQ.isFetchingNextPage}
                    className="border border-border px-3 py-2 text-[10px] uppercase tracking-widest text-accent hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tradeHistoryQ.isFetchingNextPage ? "Loading more..." : "Load more trades"}
                  </button>
                </div>
              ) : null}
              {tradeHistoryQ.isFetchNextPageError ? (
                <div className="border-t border-border/40 p-3 text-center text-xs text-bear">
                  Could not load more stock trades. Please try again.
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="terminal-panel mt-4 overflow-hidden">
          <div className="terminal-header">
            <span>Berry History</span>
          </div>

          {walletLedgerQ.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading Berry activity...</div>
          ) : walletLedgerQ.isError ? (
            <div className="p-6 text-sm text-bear">Could not load Berry history.</div>
          ) : walletLedgerEntries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No Berry reward activity yet. Stock trades still appear separately from this history.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {walletLedgerEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-2 px-3 py-3 text-xs md:grid-cols-[7rem_1fr_auto_auto] md:items-center"
                >
                  <div className="text-muted-foreground">{formatLedgerDate(entry.created_at)}</div>
                  <div>
                    <div className="font-medium">{entry.description}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {entry.source_type.replaceAll("_", " ")}
                    </div>
                  </div>
                  <div
                    className={`tabular md:text-right ${entry.amount >= 0 ? "text-bull" : "text-bear"}`}
                  >
                    {entry.amount >= 0 ? "+" : "-"}฿{formatBerries(Math.abs(entry.amount))}
                  </div>
                  <div className="tabular text-muted-foreground md:text-right">
                    Balance ฿{formatBerries(entry.balance_after)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TerminalShell>
  );
}

function TradeHistoryRow({ entry }: { entry: TradeHistoryItem }) {
  return (
    <div className="grid gap-2 px-3 py-3 text-xs md:grid-cols-[8rem_4rem_1fr_auto_auto_auto_auto] md:items-center">
      <div className="text-muted-foreground">{formatTradeDate(entry.created_at)}</div>
      <div className={`font-bold uppercase ${entry.side === "buy" ? "text-bull" : "text-bear"}`}>
        {entry.side === "buy" ? "Buy" : "Sell"}
      </div>
      <div>
        <Link
          to="/character/$slug"
          params={{ slug: entry.characterSlug }}
          className="font-bold text-accent"
        >
          {entry.characterSlug.toUpperCase().slice(0, 4)}
        </Link>
        <span className="ml-2 text-muted-foreground">{entry.characterName}</span>
      </div>
      <div className="tabular md:text-right">{formatShares(entry.shares)} shares</div>
      <div className="tabular text-muted-foreground md:text-right">
        @ {"\u0e3f"}
        {formatBerries(entry.price)}
      </div>
      <div className="tabular md:text-right">
        {entry.side === "buy" ? "-" : "+"}
        {"\u0e3f"}
        {formatBerries(entry.total)}
      </div>
      <div className="tabular text-muted-foreground md:text-right">
        Balance {"\u0e3f"}
        {formatBerries(entry.balance_after)}
      </div>
    </div>
  );
}

function formatTradeDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatLedgerDate(value: string) {
  return value.slice(0, 10);
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "accent";
}) {
  const color =
    tone === "bull"
      ? "text-bull"
      : tone === "bear"
        ? "text-bear"
        : tone === "accent"
          ? "text-accent"
          : "text-foreground";
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular ${color}`}>{value}</div>
    </div>
  );
}
