const CENT_SCALE = 100n;
const SHARE_SCALE = 100n;
const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/;

type DecimalRational = {
  numerator: bigint;
  scale: bigint;
};

export type WeightedAveragePosition = {
  shares: number;
  totalCostBasis: number;
};

export type BuyAccounting = {
  holdingSharesBefore: number;
  holdingSharesAfter: number;
  holdingCostBasisBefore: number;
  holdingCostBasisAfter: number;
  holdingAvgCostBefore: number;
  holdingAvgCostAfter: number;
};

export type SellAccounting = BuyAccounting & {
  costBasis: number;
  realizedPnl: number;
};

function parsePositiveDecimal(value: number): DecimalRational {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Value must be a finite nonnegative decimal");
  }

  const match = value.toString().toLowerCase().match(DECIMAL_PATTERN);
  if (!match) throw new RangeError(`Unsupported decimal value: ${value}`);

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

function roundPositiveCentsRatio(numeratorInCents: bigint, denominator: bigint) {
  const quotient = numeratorInCents / denominator;
  const remainder = numeratorInCents % denominator;
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

function allocatePartialSoldBasis(
  beforeBasis: bigint,
  soldHundredths: bigint,
  beforeShares: bigint,
) {
  const soldBasis = roundPositiveCentsRatio(beforeBasis * soldHundredths, beforeShares);
  return soldBasis >= beforeBasis ? beforeBasis - 1n : soldBasis;
}

function moneyToCents(value: number) {
  const decimal = parsePositiveDecimal(value);
  return roundPositiveRationalToCents(decimal.numerator, decimal.scale);
}

function sharesToHundredths(value: number) {
  const decimal = parsePositiveDecimal(value);
  const scaled = decimal.numerator * SHARE_SCALE;
  if (scaled % decimal.scale !== 0n) {
    throw new RangeError("Shares must use at most two decimal places");
  }
  return scaled / decimal.scale;
}

function centsToNumber(cents: bigint) {
  return Number(cents) / Number(CENT_SCALE);
}

function hundredthsToNumber(hundredths: bigint) {
  return Number(hundredths) / Number(SHARE_SCALE);
}

function averageCost(totalCostBasisCents: bigint, sharesHundredths: bigint) {
  if (sharesHundredths === 0n) return 0;
  return centsToNumber(totalCostBasisCents) / hundredthsToNumber(sharesHundredths);
}

function assertOpenPosition(position: WeightedAveragePosition) {
  const shares = sharesToHundredths(position.shares);
  const basis = moneyToCents(position.totalCostBasis);
  if (shares <= 0n || basis <= 0n) {
    throw new RangeError("Position must be open with positive basis");
  }
  return { shares, basis };
}

export function calculateBuyAccounting(
  position: WeightedAveragePosition,
  purchasedShares: number,
  roundedTradeTotal: number,
): BuyAccounting {
  const beforeShares = sharesToHundredths(position.shares);
  const beforeBasis = moneyToCents(position.totalCostBasis);
  const purchaseShares = sharesToHundredths(purchasedShares);
  const purchaseBasis = moneyToCents(roundedTradeTotal);
  if (purchaseShares <= 0n || purchaseBasis < CENT_SCALE) {
    throw new RangeError("Buy must add a positive position with at least one Berry of basis");
  }

  const afterShares = beforeShares + purchaseShares;
  const afterBasis = beforeBasis + purchaseBasis;

  return {
    holdingSharesBefore: hundredthsToNumber(beforeShares),
    holdingSharesAfter: hundredthsToNumber(afterShares),
    holdingCostBasisBefore: centsToNumber(beforeBasis),
    holdingCostBasisAfter: centsToNumber(afterBasis),
    holdingAvgCostBefore: averageCost(beforeBasis, beforeShares),
    holdingAvgCostAfter: averageCost(afterBasis, afterShares),
  };
}

export function calculatePartialSellAccounting(
  position: WeightedAveragePosition,
  soldShares: number,
  roundedSaleProceeds: number,
): SellAccounting {
  const { shares: beforeShares, basis: beforeBasis } = assertOpenPosition(position);
  const soldHundredths = sharesToHundredths(soldShares);
  const proceedsCents = moneyToCents(roundedSaleProceeds);
  if (soldHundredths <= 0n || soldHundredths >= beforeShares) {
    throw new RangeError("Partial sale must sell less than the open position");
  }

  const soldBasis = allocatePartialSoldBasis(beforeBasis, soldHundredths, beforeShares);
  const afterShares = beforeShares - soldHundredths;
  const afterBasis = beforeBasis - soldBasis;
  if (afterShares < 1n || afterBasis <= 0n) {
    throw new RangeError("Partial sale produced invalid remaining position");
  }

  return {
    holdingSharesBefore: hundredthsToNumber(beforeShares),
    holdingSharesAfter: hundredthsToNumber(afterShares),
    holdingCostBasisBefore: centsToNumber(beforeBasis),
    holdingCostBasisAfter: centsToNumber(afterBasis),
    holdingAvgCostBefore: averageCost(beforeBasis, beforeShares),
    holdingAvgCostAfter: averageCost(afterBasis, afterShares),
    costBasis: centsToNumber(soldBasis),
    realizedPnl: centsToNumber(proceedsCents - soldBasis),
  };
}

export function calculateFullSellAccounting(
  position: WeightedAveragePosition,
  roundedSaleProceeds: number,
): SellAccounting {
  const { shares: beforeShares, basis: beforeBasis } = assertOpenPosition(position);
  const proceedsCents = moneyToCents(roundedSaleProceeds);

  return {
    holdingSharesBefore: hundredthsToNumber(beforeShares),
    holdingSharesAfter: 0,
    holdingCostBasisBefore: centsToNumber(beforeBasis),
    holdingCostBasisAfter: 0,
    holdingAvgCostBefore: averageCost(beforeBasis, beforeShares),
    holdingAvgCostAfter: 0,
    costBasis: centsToNumber(beforeBasis),
    realizedPnl: centsToNumber(proceedsCents - beforeBasis),
  };
}

export function formatRealizedPnl(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}฿${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
