export const TRADE_HISTORY_DEFAULT_PAGE_SIZE = 25;
export const TRADE_HISTORY_MAX_PAGE_SIZE = 50;

export type TradeHistoryCursor = {
  createdAt: string;
  id: string;
};

export type TradeHistoryItem = {
  id: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  balance_after: number;
  created_at: string;
  characterName: string;
  characterSlug: string;
};

export type TradeHistoryCursorSource = {
  id: string;
  created_at: string;
};

export type TradeHistoryPage<T extends TradeHistoryCursorSource = TradeHistoryItem> = {
  items: T[];
  nextCursor: TradeHistoryCursor | null;
  hasMore: boolean;
};

function timestampValue(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function canonicalizeTradeHistoryCreatedAt(value: string) {
  return new Date(value).toISOString();
}

export function compareTradeHistoryNewestFirst(
  a: TradeHistoryCursorSource,
  b: TradeHistoryCursorSource,
) {
  const timeDiff = timestampValue(b.created_at) - timestampValue(a.created_at);
  if (timeDiff !== 0) return timeDiff;
  return b.id.localeCompare(a.id);
}

export function isTradeHistoryOlderThanCursor(
  row: TradeHistoryCursorSource,
  cursor: TradeHistoryCursor,
) {
  const rowTime = timestampValue(row.created_at);
  const cursorTime = timestampValue(cursor.createdAt);
  if (rowTime !== cursorTime) return rowTime < cursorTime;
  return row.id.localeCompare(cursor.id) < 0;
}

export function getTradeHistoryCursorFilter(cursor: TradeHistoryCursor) {
  const createdAt = canonicalizeTradeHistoryCreatedAt(cursor.createdAt);
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${cursor.id})`;
}

export function buildTradeHistoryPage<T extends TradeHistoryCursorSource>(
  rows: T[],
  pageSize: number,
): TradeHistoryPage<T> {
  const items = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;
  const finalItem = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor:
      hasMore && finalItem
        ? {
            createdAt: finalItem.created_at,
            id: finalItem.id,
          }
        : null,
  };
}

export function selectTradeHistoryPageForTest<T extends TradeHistoryCursorSource>(
  rows: T[],
  pageSize: number,
  cursor: TradeHistoryCursor | null = null,
): TradeHistoryPage<T> {
  const filteredRows = cursor
    ? rows.filter((row) => isTradeHistoryOlderThanCursor(row, cursor))
    : rows;

  return buildTradeHistoryPage(
    [...filteredRows].sort(compareTradeHistoryNewestFirst).slice(0, pageSize + 1),
    pageSize,
  );
}
