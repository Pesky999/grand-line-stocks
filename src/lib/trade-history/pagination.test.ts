/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  TRADE_HISTORY_DEFAULT_PAGE_SIZE,
  TRADE_HISTORY_MAX_PAGE_SIZE,
  getTradeHistoryCursorFilter,
  selectTradeHistoryPageForTest,
  type TradeHistoryItem,
} from "./pagination.ts";

const walletFunctionsSource = readFileSync(
  join(process.cwd(), "src/lib/api/wallet.functions.ts"),
  "utf8",
);
const portfolioSource = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/portfolio.tsx"),
  "utf8",
);
const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260712120000_add_transactions_history_cursor_index.sql",
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

function trade(index: number, overrides: Partial<TradeHistoryItem> = {}): TradeHistoryItem {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    side: index % 2 === 0 ? "buy" : "sell",
    shares: index + 1,
    price: 100 + index,
    total: (index + 1) * (100 + index),
    balance_after: 25_000 - index,
    cost_basis: index % 2 === 0 ? null : 100 + index,
    realized_pnl: index % 2 === 0 ? null : 10,
    holding_shares_before: index + 1,
    holding_shares_after: index % 2 === 0 ? index + 2 : index,
    holding_cost_basis_before: (index + 1) * 100,
    holding_cost_basis_after: index % 2 === 0 ? (index + 2) * 100 : index * 100,
    holding_avg_cost_before: 100,
    holding_avg_cost_after: index === 0 ? 100 : 100,
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    characterName: `Character ${index}`,
    characterSlug: `character-${index}`,
    ...overrides,
  };
}

test("first trade-history page returns newest records and requested size", () => {
  const rows = Array.from({ length: TRADE_HISTORY_DEFAULT_PAGE_SIZE + 5 }, (_, index) =>
    trade(index),
  );

  const page = selectTradeHistoryPageForTest(rows, TRADE_HISTORY_DEFAULT_PAGE_SIZE);

  assert.equal(page.items.length, TRADE_HISTORY_DEFAULT_PAGE_SIZE);
  assert.equal(page.items[0].id, trade(TRADE_HISTORY_DEFAULT_PAGE_SIZE + 4).id);
  assert.equal(page.items.at(-1)?.id, trade(5).id);
});

test("trade-history page uses an extra row for hasMore and cursor comes from last returned item", () => {
  const rows = Array.from({ length: 4 }, (_, index) => trade(index));

  const page = selectTradeHistoryPageForTest(rows, 3);

  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextCursor, {
    createdAt: trade(1).created_at,
    id: trade(1).id,
  });
  assert.notDeepEqual(page.nextCursor, {
    createdAt: trade(0).created_at,
    id: trade(0).id,
  });
});

test("final trade-history page has no cursor and empty history returns empty result", () => {
  const finalPage = selectTradeHistoryPageForTest([trade(0), trade(1)], 3);
  const emptyPage = selectTradeHistoryPageForTest([], 3);

  assert.equal(finalPage.hasMore, false);
  assert.equal(finalPage.nextCursor, null);
  assert.deepEqual(emptyPage, { items: [], hasMore: false, nextCursor: null });
});

test("trade-history pagination handles tied timestamps deterministically by id", () => {
  const created_at = "2026-07-12T00:00:00.000Z";
  const rows = [
    trade(1, { id: "00000000-0000-4000-8000-000000000001", created_at }),
    trade(3, { id: "00000000-0000-4000-8000-000000000003", created_at }),
    trade(2, { id: "00000000-0000-4000-8000-000000000002", created_at }),
  ];

  const firstPage = selectTradeHistoryPageForTest(rows, 2);
  const secondPage = selectTradeHistoryPageForTest(rows, 2, firstPage.nextCursor);

  assert.deepEqual(
    firstPage.items.map((row) => row.id),
    ["00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000002"],
  );
  assert.deepEqual(
    secondPage.items.map((row) => row.id),
    ["00000000-0000-4000-8000-000000000001"],
  );
});

test("consecutive trade-history pages do not duplicate or skip records", () => {
  const rows = Array.from({ length: 7 }, (_, index) => trade(index));
  const firstPage = selectTradeHistoryPageForTest(rows, 3);
  const secondPage = selectTradeHistoryPageForTest(rows, 3, firstPage.nextCursor);
  const thirdPage = selectTradeHistoryPageForTest(rows, 3, secondPage.nextCursor);
  const combinedIds = [...firstPage.items, ...secondPage.items, ...thirdPage.items].map(
    (row) => row.id,
  );

  assert.equal(new Set(combinedIds).size, 7);
  assert.deepEqual(
    combinedIds,
    rows
      .slice()
      .reverse()
      .map((row) => row.id),
  );
});

test("trade-history pagination preserves microsecond ordering across page boundaries", () => {
  const rows = [
    trade(1, {
      id: "00000000-0000-4000-8000-000000000001",
      created_at: "2026-07-12T00:00:00.123456+00:00",
    }),
    trade(3, {
      id: "00000000-0000-4000-8000-000000000003",
      created_at: "2026-07-12T00:00:00.123455+00:00",
    }),
    trade(2, {
      id: "00000000-0000-4000-8000-000000000002",
      created_at: "2026-07-12T00:00:00.123454+00:00",
    }),
  ];

  const firstPage = selectTradeHistoryPageForTest(rows, 1);
  const secondPage = selectTradeHistoryPageForTest(rows, 1, firstPage.nextCursor);
  const thirdPage = selectTradeHistoryPageForTest(rows, 1, secondPage.nextCursor);

  assert.equal(firstPage.items[0].created_at, "2026-07-12T00:00:00.123456+00:00");
  assert.equal(secondPage.items[0].created_at, "2026-07-12T00:00:00.123455+00:00");
  assert.equal(thirdPage.items[0].created_at, "2026-07-12T00:00:00.123454+00:00");
  assert.equal(thirdPage.hasMore, false);
  assert.equal(thirdPage.nextCursor, null);
});

test("trade-history cursor filter selects rows strictly older than the cursor", () => {
  const filter = getTradeHistoryCursorFilter({
    createdAt: "2026-07-12T00:00:00.123456+00:00",
    id: "00000000-0000-4000-8000-000000000123",
  });

  assert.equal(
    filter,
    "created_at.lt.2026-07-12T00:00:00.123456+00:00,and(created_at.eq.2026-07-12T00:00:00.123456+00:00,id.lt.00000000-0000-4000-8000-000000000123)",
  );
});

test("wallet API validates input, removes hard-coded limit, and uses authenticated keyset query", () => {
  const listFunction = walletFunctionsSource.slice(
    walletFunctionsSource.indexOf("export const listMyTransactions"),
    walletFunctionsSource.indexOf("export const listMyWalletLedgerEntries"),
  );

  assert.match(listFunction, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(listFunction, /tradeHistoryInputSchema\.parse\(d \?\? \{\}\)/);
  assert.match(
    walletFunctionsSource,
    /pageSize: z[\s\S]*?\.number\(\)[\s\S]*?\.int\(\)[\s\S]*?\.min\(1\)[\s\S]*?\.max\(TRADE_HISTORY_MAX_PAGE_SIZE\)/,
  );
  assert.match(
    walletFunctionsSource,
    /cursor: tradeHistoryCursorSchema\.nullable\(\)\.optional\(\)/,
  );
  assert.match(walletFunctionsSource, /createdAt: z\.string\(\)\.datetime\(\{ offset: true \}\)/);
  assert.doesNotMatch(walletFunctionsSource, /toISOString|canonicalizeTradeHistoryCreatedAt/);
  assert.match(listFunction, /\.from\("transactions"\)/);
  assert.match(listFunction, /\.eq\("user_id", context\.userId\)/);
  assert.match(listFunction, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(listFunction, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(listFunction, /\.limit\(data\.pageSize \+ 1\)/);
  assert.match(listFunction, /query = query\.or\(getTradeHistoryCursorFilter\(data\.cursor\)\)/);
  assert.match(listFunction, /buildTradeHistoryPage\(items, data\.pageSize\)/);
  assert.doesNotMatch(listFunction, /\.limit\(100\)/);
  assert.doesNotMatch(listFunction, /supabaseAdmin|admin\(\)/);
});

test("portfolio accumulates stock trade pages and shows load more only when available", () => {
  assert.match(portfolioSource, /useInfiniteQuery/);
  assert.match(portfolioSource, /TRADE_HISTORY_QUERY_KEY/);
  assert.match(portfolioSource, /listMyTransactions/);
  assert.match(portfolioSource, /pages\.flatMap\(\(page\) => page\.items\)/);
  assert.match(portfolioSource, /seenTransactionIds/);
  assert.match(portfolioSource, /Trade History/);
  assert.match(portfolioSource, /Load more trades/);
  assert.match(portfolioSource, /Loading more\.\.\./);
  assert.match(portfolioSource, /tradeHistoryQ\.hasNextPage/);
  assert.match(portfolioSource, /handleLoadMoreTrades/);
  assert.match(
    portfolioSource,
    /if \(!tradeHistoryQ\.hasNextPage \|\| tradeHistoryQ\.isFetchingNextPage\) return;/,
  );
  assert.match(portfolioSource, /await tradeHistoryQ\.fetchNextPage\(\)/);
  assert.match(portfolioSource, /tradeHistoryQ\.isFetchNextPageError/);
  assert.match(portfolioSource, /Could not load more stock trades/);
  assert.match(
    portfolioSource,
    /queryClient\.invalidateQueries\(\{ queryKey: TRADE_HISTORY_QUERY_KEY \}\)/,
  );
});

test("transaction history has a composite index for authenticated cursor paging", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_transactions_user_created_id\s+ON public\.transactions \(user_id, created_at DESC, id DESC\)/i,
  );
});

test("trade-history page-size bounds are intentionally small", () => {
  assert.equal(TRADE_HISTORY_DEFAULT_PAGE_SIZE, 25);
  assert.equal(TRADE_HISTORY_MAX_PAGE_SIZE, 50);
});
