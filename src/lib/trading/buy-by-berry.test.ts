/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWalletPercentageBerryBudget,
  parseBerryAmountText,
  quoteBuyByBerryBudget,
  quoteBuyByBerryText,
  type BuyByBerryQuoteResult,
  type BuyByBerryQuoteSuccess,
} from "./buy-by-berry.ts";
import { MAX_SHARE_QUANTITY, calculateRoundedTradeTotal } from "./fractional-shares.ts";

function assertQuoteSuccess(value: BuyByBerryQuoteResult): BuyByBerryQuoteSuccess {
  assert.equal(value.ok, true);
  return value;
}

function assertQuoteFailure(value: BuyByBerryQuoteResult, reason: string) {
  assert.equal(value.ok, false);
  assert.equal(value.reason, reason);
}

function roundShares(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertLargestAffordableShareQuantity(quote: BuyByBerryQuoteSuccess) {
  assert.ok(quote.shares <= MAX_SHARE_QUANTITY);
  assert.ok(quote.estimatedTotal <= quote.requestedBudget);

  const nextShares = roundShares(quote.shares + 0.01);
  if (nextShares > MAX_SHARE_QUANTITY) {
    assert.equal(quote.shares, MAX_SHARE_QUANTITY);
    return;
  }

  const nextTotal = calculateRoundedTradeTotal(quote.quotePrice, nextShares);
  assert.ok(
    nextTotal > quote.requestedBudget || nextTotal < 1,
    `expected next increment ${nextShares} to be unavailable for ${quote.requestedBudget}`,
  );
}

test("parses whole Berry amounts and one or two decimal places", () => {
  assert.deepEqual(parseBerryAmountText("100"), {
    ok: true,
    amount: 100,
    cents: 10000,
    normalizedText: "100.00",
  });
  assert.deepEqual(parseBerryAmountText("100.5"), {
    ok: true,
    amount: 100.5,
    cents: 10050,
    normalizedText: "100.50",
  });
  assert.deepEqual(parseBerryAmountText("100.50"), {
    ok: true,
    amount: 100.5,
    cents: 10050,
    normalizedText: "100.50",
  });
});

test("rejects blank, negative, exponent, malformed, and overprecise amounts", () => {
  assert.deepEqual(parseBerryAmountText(""), { ok: false, reason: "empty_amount" });
  assert.deepEqual(parseBerryAmountText("   "), { ok: false, reason: "empty_amount" });
  assert.deepEqual(parseBerryAmountText("-1"), { ok: false, reason: "invalid_amount" });
  assert.deepEqual(parseBerryAmountText("1e3"), { ok: false, reason: "invalid_amount" });
  assert.deepEqual(parseBerryAmountText("1."), { ok: false, reason: "invalid_amount" });
  assert.deepEqual(parseBerryAmountText(".50"), { ok: false, reason: "invalid_amount" });
  assert.deepEqual(parseBerryAmountText("abc"), { ok: false, reason: "invalid_amount" });
  assert.deepEqual(parseBerryAmountText("1.234"), { ok: false, reason: "too_many_decimals" });
});

test("rejects amounts below the minimum trade total", () => {
  assertQuoteFailure(
    quoteBuyByBerryText({ amountText: "0.99", walletBalance: 100, price: 10 }),
    "below_minimum",
  );
  assertQuoteFailure(
    quoteBuyByBerryText({ amountText: "0", walletBalance: 100, price: 10 }),
    "below_minimum",
  );
});

test("rejects budgets above the wallet balance without clamping", () => {
  const quote = quoteBuyByBerryText({ amountText: "500", walletBalance: 499.99, price: 10 });

  assertQuoteFailure(quote, "exceeds_balance");
  assert.equal(quote.requestedBudget, 500);
});

test("returns the largest affordable hundredth-share quantity for a normal budget", () => {
  const quote = assertQuoteSuccess(
    quoteBuyByBerryBudget({ requestedBudget: 30.02, walletBalance: 30.02, price: 100.05 }),
  );

  assert.equal(quote.shares, 0.3);
  assert.equal(quote.estimatedTotal, 30.02);
  assert.equal(quote.unusedBudget, 0);
  assertLargestAffordableShareQuantity(quote);
});

test("preserves exact two-decimal wallet balances when quoting text budgets", () => {
  const quote = assertQuoteSuccess(
    quoteBuyByBerryText({
      amountText: "2.30",
      walletBalance: 2.3,
      price: 100,
    }),
  );

  assert.equal(quote.requestedBudgetCents, 230);
  assert.equal(quote.requestedBudget, 2.3);
  assert.equal(quote.shares, 0.02);
  assert.equal(quote.estimatedTotalCents, 200);
  assert.equal(quote.unusedBudgetCents, 30);
});

test("preserves exact numeric budget cents when explicit cents are absent", () => {
  const quote = assertQuoteSuccess(
    quoteBuyByBerryBudget({
      requestedBudget: 2.3,
      walletBalance: 2.3,
      price: 100,
    }),
  );

  assert.equal(quote.requestedBudgetCents, 230);
  assert.equal(quote.requestedBudget, 2.3);
  assert.equal(quote.shares, 0.02);
  assert.equal(quote.unusedBudgetCents, 30);
});

test("returned estimated total never exceeds the requested budget", () => {
  const quotes = [
    quoteBuyByBerryBudget({ requestedBudget: 30.01, walletBalance: 30.01, price: 100.05 }),
    quoteBuyByBerryBudget({ requestedBudget: 2.35, walletBalance: 2.35, price: 0.7 }),
    quoteBuyByBerryBudget({ requestedBudget: 500, walletBalance: 500, price: 362.64 }),
  ].map(assertQuoteSuccess);

  for (const quote of quotes) {
    assert.ok(quote.estimatedTotalCents <= quote.requestedBudgetCents);
    assertLargestAffordableShareQuantity(quote);
  }
});

test("respects rounded trade totals rather than raw multiplication", () => {
  const quote = assertQuoteSuccess(
    quoteBuyByBerryBudget({ requestedBudget: 2.35, walletBalance: 2.35, price: 0.7 }),
  );

  assert.equal(quote.shares, 3.36);
  assert.equal(quote.estimatedTotal, 2.35);
  assert.equal(calculateRoundedTradeTotal(0.7, 3.37), 2.36);
});

test("returns unused budget in whole Berry cents", () => {
  const quote = assertQuoteSuccess(
    quoteBuyByBerryBudget({ requestedBudget: 30.01, walletBalance: 30.01, price: 100.05 }),
  );

  assert.equal(quote.shares, 0.29);
  assert.equal(quote.estimatedTotal, 29.01);
  assert.equal(quote.unusedBudgetCents, 100);
  assert.equal(quote.unusedBudget, 1);
});

test("returns a failure when no valid minimum share purchase fits the budget", () => {
  assertQuoteFailure(
    quoteBuyByBerryBudget({ requestedBudget: 1, walletBalance: 1, price: 100.5 }),
    "no_affordable_quantity",
  );
});

test("preserves the ten-thousand-share transaction cap", () => {
  const quote = assertQuoteSuccess(
    quoteBuyByBerryBudget({ requestedBudget: 1_000_000, walletBalance: 1_000_000, price: 1 }),
  );

  assert.equal(quote.shares, 10_000);
  assert.equal(quote.estimatedTotal, 10_000);
  assert.equal(quote.unusedBudget, 990_000);
  assertLargestAffordableShareQuantity(quote);
});

test("wallet percentage budget floors to cents and never exceeds the selected share", () => {
  assert.equal(calculateWalletPercentageBerryBudget(100.03, 25), 25);
  assert.equal(calculateWalletPercentageBerryBudget(1.16, 25), 0.29);
  assert.equal(calculateWalletPercentageBerryBudget(2.28, 25), 0.57);

  const budget = calculateWalletPercentageBerryBudget(100.01, 25);
  assert.equal(budget, 25);
  assert.ok(budget <= 100.01 * 0.25);
});

test("wallet percentage budget floors genuine sub-cent balances", () => {
  assert.equal(calculateWalletPercentageBerryBudget(1.159, 100), 1.15);
  assert.equal(calculateWalletPercentageBerryBudget(2.309, 100), 2.3);
});

test("invalid balances and percentages produce a zero percentage budget", () => {
  assert.equal(calculateWalletPercentageBerryBudget(Number.NaN, 25), 0);
  assert.equal(calculateWalletPercentageBerryBudget(-10, 25), 0);
  assert.equal(calculateWalletPercentageBerryBudget(100, Number.POSITIVE_INFINITY), 0);
  assert.equal(calculateWalletPercentageBerryBudget(100, 0), 0);
  assert.equal(calculateWalletPercentageBerryBudget(100, -25), 0);
  assert.equal(calculateWalletPercentageBerryBudget(100, 101), 0);
});

test("floating-point edge cases remain deterministic", () => {
  assert.equal(calculateWalletPercentageBerryBudget(0.1 + 0.2, 25), 0.07);

  const quote = assertQuoteSuccess(
    quoteBuyByBerryBudget({ requestedBudget: 2.35, walletBalance: 2.35, price: 0.7 }),
  );
  assert.equal(quote.estimatedTotalCents, 235);
  assert.equal(quote.unusedBudgetCents, 0);
});

test("rejects invalid explicit requested budget cents", () => {
  for (const requestedBudgetCents of [
    -1,
    1.5,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assertQuoteFailure(
      quoteBuyByBerryBudget({
        requestedBudget: 10,
        requestedBudgetCents,
        walletBalance: 100,
        price: 10,
      }),
      "invalid_amount",
    );
  }
});

test("quote inputs are not mutated", () => {
  const input = Object.freeze({
    requestedBudget: 500,
    walletBalance: 500,
    price: 362.64,
  });

  assertQuoteSuccess(quoteBuyByBerryBudget(input));
  assert.deepEqual(input, {
    requestedBudget: 500,
    walletBalance: 500,
    price: 362.64,
  });
});
