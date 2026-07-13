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

function timestampMicroseconds(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i,
  );

  if (!match) {
    throw new RangeError(`Invalid trade-history timestamp: ${value}`);
  }

  const [, year, month, day, hour, minute, second, fraction = "", offset] = match;
  const offsetMinutes =
    offset.toUpperCase() === "Z"
      ? 0
      : (offset.startsWith("-") ? -1 : 1) *
        (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  const utcMilliseconds = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute) - offsetMinutes,
    Number(second),
  );
  const fractionalMicroseconds = BigInt(fraction.padEnd(6, "0").slice(0, 6));

  return BigInt(utcMilliseconds) * 1000n + fractionalMicroseconds;
}

export function compareTradeHistoryNewestFirst(
  a: TradeHistoryCursorSource,
  b: TradeHistoryCursorSource,
) {
  const aTimestamp = timestampMicroseconds(a.created_at);
  const bTimestamp = timestampMicroseconds(b.created_at);
  if (aTimestamp !== bTimestamp) return aTimestamp > bTimestamp ? -1 : 1;
  return b.id.localeCompare(a.id);
}

export function isTradeHistoryOlderThanCursor(
  row: TradeHistoryCursorSource,
  cursor: TradeHistoryCursor,
) {
  const rowTime = timestampMicroseconds(row.created_at);
  const cursorTime = timestampMicroseconds(cursor.createdAt);
  if (rowTime !== cursorTime) return rowTime < cursorTime;
  return row.id.localeCompare(cursor.id) < 0;
}

export function getTradeHistoryCursorFilter(cursor: TradeHistoryCursor) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
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
