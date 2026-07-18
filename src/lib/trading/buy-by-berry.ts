import {
  MAX_SHARE_QUANTITY,
  MIN_TRADE_TOTAL,
  calculateMaxAffordableShares,
  calculateRoundedTradeTotal,
  isValidShareQuantity,
} from "./fractional-shares.ts";

const CENTS_PER_BERRY = 100;
const BERRY_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export const BUY_BY_BERRY_PRESET_AMOUNTS = [100, 500, 1000] as const;
export const BUY_BY_BERRY_PERCENT_PRESET = 25;

export type BerryAmountParseFailureReason = "empty_amount" | "invalid_amount" | "too_many_decimals";

export type BuyByBerryFailureReason =
  | BerryAmountParseFailureReason
  | "invalid_price"
  | "invalid_wallet_balance"
  | "below_minimum"
  | "exceeds_balance"
  | "no_affordable_quantity";

export type ParsedBerryAmount =
  | {
      ok: true;
      amount: number;
      cents: number;
      normalizedText: string;
    }
  | {
      ok: false;
      reason: BerryAmountParseFailureReason;
    };

export type BuyByBerryQuoteSuccess = {
  ok: true;
  requestedBudget: number;
  requestedBudgetCents: number;
  shares: number;
  estimatedTotal: number;
  estimatedTotalCents: number;
  unusedBudget: number;
  unusedBudgetCents: number;
  quotePrice: number;
};

export type BuyByBerryQuoteFailure = {
  ok: false;
  reason: BuyByBerryFailureReason;
  requestedBudget?: number;
  requestedBudgetCents?: number;
  quotePrice?: number;
};

export type BuyByBerryQuoteResult = BuyByBerryQuoteSuccess | BuyByBerryQuoteFailure;

export function parseBerryAmountText(value: string): ParsedBerryAmount {
  const text = value.trim();
  if (!text) return { ok: false, reason: "empty_amount" };
  if (/[eE+-]/.test(text)) return { ok: false, reason: "invalid_amount" };

  const [wholePart, fractionalPart] = text.split(".");
  if (text.split(".").length > 2) return { ok: false, reason: "invalid_amount" };
  if ((fractionalPart?.length ?? 0) > 2) {
    return { ok: false, reason: "too_many_decimals" };
  }
  if (!BERRY_AMOUNT_PATTERN.test(text)) return { ok: false, reason: "invalid_amount" };

  const whole = BigInt(wholePart);
  const fractional = BigInt((fractionalPart ?? "").padEnd(2, "0"));
  const cents = whole * BigInt(CENTS_PER_BERRY) + fractional;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: "invalid_amount" };
  }

  const centsNumber = Number(cents);
  return {
    ok: true,
    amount: centsToBerries(centsNumber),
    cents: centsNumber,
    normalizedText: (centsNumber / CENTS_PER_BERRY).toFixed(2),
  };
}

export function calculateWalletPercentageBerryBudget(
  walletBalance: number,
  percentage: number,
): number {
  const walletCents = floorBerryAmountToCents(walletBalance);
  if (walletCents <= 0 || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    return 0;
  }

  const percentageBasisPoints = Math.floor(percentage * 100);
  if (percentageBasisPoints <= 0) return 0;

  const budgetCents = Math.floor((walletCents * percentageBasisPoints) / 10_000);
  return centsToBerries(budgetCents);
}

export function quoteBuyByBerryText(input: {
  amountText: string;
  walletBalance: number;
  price: number;
}): BuyByBerryQuoteResult {
  const parsed = parseBerryAmountText(input.amountText);
  if (!parsed.ok) return parsed;
  return quoteBuyByBerryBudget({
    requestedBudget: parsed.amount,
    walletBalance: input.walletBalance,
    price: input.price,
    requestedBudgetCents: parsed.cents,
  });
}

export function quoteBuyByBerryBudget(input: {
  requestedBudget: number;
  walletBalance: number;
  price: number;
  requestedBudgetCents?: number;
}): BuyByBerryQuoteResult {
  if (!Number.isFinite(input.price) || input.price <= 0) {
    return { ok: false, reason: "invalid_price", quotePrice: input.price };
  }
  if (!Number.isFinite(input.walletBalance) || input.walletBalance < 0) {
    return { ok: false, reason: "invalid_wallet_balance", quotePrice: input.price };
  }
  if (!Number.isFinite(input.requestedBudget) || input.requestedBudget < 0) {
    return { ok: false, reason: "invalid_amount", quotePrice: input.price };
  }

  const walletCents = floorBerryAmountToCents(input.walletBalance);
  const requestedBudgetCents =
    input.requestedBudgetCents ?? floorBerryAmountToCents(input.requestedBudget);
  const requestedBudget = centsToBerries(requestedBudgetCents);

  if (requestedBudgetCents < MIN_TRADE_TOTAL * CENTS_PER_BERRY) {
    return {
      ok: false,
      reason: "below_minimum",
      requestedBudget,
      requestedBudgetCents,
      quotePrice: input.price,
    };
  }
  if (requestedBudgetCents > walletCents) {
    return {
      ok: false,
      reason: "exceeds_balance",
      requestedBudget,
      requestedBudgetCents,
      quotePrice: input.price,
    };
  }

  const shares = calculateMaxAffordableShares(requestedBudget, input.price);
  if (shares <= 0 || shares > MAX_SHARE_QUANTITY || !isValidShareQuantity(shares)) {
    return {
      ok: false,
      reason: "no_affordable_quantity",
      requestedBudget,
      requestedBudgetCents,
      quotePrice: input.price,
    };
  }

  const estimatedTotal = calculateRoundedTradeTotal(input.price, shares);
  const estimatedTotalCents = roundBerryAmountToCents(estimatedTotal);
  if (estimatedTotalCents > requestedBudgetCents) {
    return {
      ok: false,
      reason: "no_affordable_quantity",
      requestedBudget,
      requestedBudgetCents,
      quotePrice: input.price,
    };
  }

  const unusedBudgetCents = requestedBudgetCents - estimatedTotalCents;
  return {
    ok: true,
    requestedBudget,
    requestedBudgetCents,
    shares,
    estimatedTotal,
    estimatedTotalCents,
    unusedBudget: centsToBerries(unusedBudgetCents),
    unusedBudgetCents,
    quotePrice: input.price,
  };
}

function floorBerryAmountToCents(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const cents = Math.floor(value * CENTS_PER_BERRY + Number.EPSILON);
  return Number.isSafeInteger(cents) ? cents : 0;
}

function roundBerryAmountToCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const cents = Math.round((value + Number.EPSILON) * CENTS_PER_BERRY);
  return Number.isSafeInteger(cents) ? cents : 0;
}

function centsToBerries(cents: number): number {
  return cents / CENTS_PER_BERRY;
}
