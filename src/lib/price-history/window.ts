export const CHARACTER_PRICE_HISTORY_WINDOW = 365;

export type CharacterPriceHistoryPoint = {
  id: string;
  price: number;
  note: string | null;
  created_at: string;
};

function timestampValue(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNewestFirst(a: CharacterPriceHistoryPoint, b: CharacterPriceHistoryPoint) {
  const timeDiff = timestampValue(b.created_at) - timestampValue(a.created_at);
  if (timeDiff !== 0) return timeDiff;
  return b.id.localeCompare(a.id);
}

function compareOldestFirst(a: CharacterPriceHistoryPoint, b: CharacterPriceHistoryPoint) {
  const timeDiff = timestampValue(a.created_at) - timestampValue(b.created_at);
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id);
}

export function selectLatestPriceHistoryWindowForChart(
  rows: CharacterPriceHistoryPoint[],
  limit = CHARACTER_PRICE_HISTORY_WINDOW,
) {
  if (limit <= 0) return [];

  return [...rows]
    .sort(compareNewestFirst)
    .slice(0, limit)
    .sort(compareOldestFirst);
}
