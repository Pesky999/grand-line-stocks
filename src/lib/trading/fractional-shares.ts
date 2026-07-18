export const MIN_SHARE_QUANTITY = 0.01;
export const MAX_SHARE_QUANTITY = 10_000;
export const MIN_TRADE_TOTAL = 1;
const SHARE_SCALE = 100;
const SHARE_EPSILON = 1e-9;
const CENT_SCALE = 100n;
const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/;

type DecimalRational = {
  numerator: bigint;
  scale: bigint;
};

function roundShares(value: number) {
  return Math.round((value + Number.EPSILON) * SHARE_SCALE) / SHARE_SCALE;
}

function parsePositiveDecimal(value: number): DecimalRational | null {
  if (!Number.isFinite(value) || value < 0) return null;

  const match = value.toString().toLowerCase().match(DECIMAL_PATTERN);
  if (!match) return null;

  const integerPart = match[1];
  const fractionalPart = match[2] ?? "";
  const exponent = Number(match[3] ?? 0);
  let digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "");
  if (digits === "") digits = "0";

  let scaleDigits = fractionalPart.length - exponent;
  if (scaleDigits < 0) {
    digits += "0".repeat(-scaleDigits);
    scaleDigits = 0;
  }

  return {
    numerator: BigInt(digits),
    scale: 10n ** BigInt(scaleDigits),
  };
}

function roundPositiveRationalToCents(numerator: bigint, denominator: bigint) {
  const scaled = numerator * CENT_SCALE;
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;

  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

function calculateRoundedTradeTotalCents(price: number, shares: number) {
  const priceDecimal = parsePositiveDecimal(price);
  const sharesDecimal = parsePositiveDecimal(shares);
  if (!priceDecimal || !sharesDecimal) return 0n;

  return roundPositiveRationalToCents(
    priceDecimal.numerator * sharesDecimal.numerator,
    priceDecimal.scale * sharesDecimal.scale,
  );
}

function isRoundedTotalAffordable(totalCents: bigint, balance: DecimalRational) {
  return totalCents * balance.scale <= balance.numerator * CENT_SCALE;
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
  return Number(calculateRoundedTradeTotalCents(price, shares)) / Number(CENT_SCALE);
}

export function calculateMaxAffordableShares(balance: number, price: number) {
  if (!Number.isFinite(balance) || !Number.isFinite(price)) return 0;
  if (balance < MIN_TRADE_TOTAL || price <= 0) return 0;

  const balanceDecimal = parsePositiveDecimal(balance);
  if (!balanceDecimal) return 0;

  let bestHundredths = 0;
  let low = 1;
  let high = MAX_SHARE_QUANTITY * SHARE_SCALE;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = mid / SHARE_SCALE;
    const totalCents = calculateRoundedTradeTotalCents(price, candidate);

    if (totalCents < CENT_SCALE) {
      low = mid + 1;
    } else if (isRoundedTotalAffordable(totalCents, balanceDecimal)) {
      bestHundredths = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const candidate = bestHundredths / SHARE_SCALE;
  return isValidShareQuantity(candidate) ? candidate : 0;
}

export function calculateMaxSellQuantity(holdingShares: number) {
  if (!Number.isFinite(holdingShares) || holdingShares <= 0) return 0;
  return roundShares(Math.min(holdingShares, MAX_SHARE_QUANTITY));
}
