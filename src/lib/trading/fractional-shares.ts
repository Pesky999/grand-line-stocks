export const MIN_SHARE_QUANTITY = 0.01;
export const MAX_SHARE_QUANTITY = 10_000;
export const MIN_TRADE_TOTAL = 1;
const SHARE_SCALE = 100;
const SHARE_EPSILON = 1e-9;

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundShares(value: number) {
  return Math.round((value + Number.EPSILON) * SHARE_SCALE) / SHARE_SCALE;
}

export function isValidShareQuantity(value: number) {
  if (!Number.isFinite(value)) return false;
  if (value < MIN_SHARE_QUANTITY || value > MAX_SHARE_QUANTITY) return false;

  const scaled = value * SHARE_SCALE;
  return Math.abs(scaled - Math.round(scaled)) <= SHARE_EPSILON;
}

export function parseShareQuantity(value: string) {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.endsWith(".")) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return isValidShareQuantity(parsed) ? parsed : null;
}

export function normalizeShareQuantityText(value: number | string) {
  const parsed = typeof value === "number" ? value : parseShareQuantity(value);
  if (parsed == null || !isValidShareQuantity(parsed)) return "";

  return roundShares(parsed).toString();
}

export function formatShares(value: number) {
  const normalized = roundShares(value);
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(normalized);
}

export function calculateRoundedTradeTotal(price: number, shares: number) {
  if (!Number.isFinite(price) || !Number.isFinite(shares)) return 0;
  return roundCurrency(price * shares);
}

export function calculateMaxAffordableShares(balance: number, price: number) {
  if (!Number.isFinite(balance) || !Number.isFinite(price)) return 0;
  if (balance < MIN_TRADE_TOTAL || price <= 0) return 0;

  let candidate = Math.min(
    MAX_SHARE_QUANTITY,
    Math.floor((balance / price + SHARE_EPSILON) * SHARE_SCALE) / SHARE_SCALE,
  );
  candidate = roundShares(candidate);

  while (
    candidate >= MIN_SHARE_QUANTITY &&
    (calculateRoundedTradeTotal(price, candidate) > balance + SHARE_EPSILON ||
      calculateRoundedTradeTotal(price, candidate) < MIN_TRADE_TOTAL)
  ) {
    candidate = roundShares(candidate - MIN_SHARE_QUANTITY);
  }

  return isValidShareQuantity(candidate) ? candidate : 0;
}

export function calculateMaxSellQuantity(holdingShares: number) {
  if (!Number.isFinite(holdingShares) || holdingShares <= 0) return 0;
  return roundShares(Math.min(holdingShares, MAX_SHARE_QUANTITY));
}
