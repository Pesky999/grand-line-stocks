/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMaxAffordableShares,
  calculateMaxSellQuantity,
  calculateRoundedTradeTotal,
  formatShares,
  MAX_SHARE_QUANTITY,
  MIN_TRADE_TOTAL,
  isValidShareQuantity,
  normalizeShareQuantityText,
  parseShareQuantity,
} from "./fractional-shares.ts";

test("valid share quantities accept hundredths through the transaction cap", () => {
  for (const value of [0.01, 0.25, 0.5, 1, 1.75, 9999.99, 10000]) {
    assert.equal(isValidShareQuantity(value), true, `${value} should be valid`);
  }
});

test("invalid share quantities reject missing, malformed, overprecise, and non-finite values", () => {
  for (const value of [0, -0.01, 0.001, 1.001, 1.234, 10000.01, NaN, Infinity]) {
    assert.equal(isValidShareQuantity(value), false, `${value} should be invalid`);
  }

  for (const value of ["", "abc", "1..2", "1e2", "0", "-0.01", "0.001", "1.001"]) {
    assert.equal(parseShareQuantity(value), null, `${value} should not parse`);
  }
});

test("share parsing permits edit-friendly decimals without silently rounding invalid precision", () => {
  assert.equal(parseShareQuantity("0."), null);
  assert.equal(parseShareQuantity("1."), null);
  assert.equal(parseShareQuantity("1.2"), 1.2);
  assert.equal(parseShareQuantity("0.50"), 0.5);
  assert.equal(normalizeShareQuantityText("0.50"), "0.5");
  assert.equal(normalizeShareQuantityText(1.75), "1.75");
});

test("share formatting uses separators, trims empty decimals, and avoids floating-point noise", () => {
  assert.equal(formatShares(1), "1");
  assert.equal(formatShares(1.5), "1.5");
  assert.equal(formatShares(1.25), "1.25");
  assert.equal(formatShares(0.01), "0.01");
  assert.equal(formatShares(1000.5), "1,000.5");
  assert.equal(formatShares(0.1 + 0.2), "0.3");
});

test("rounded trade totals expose exactly two Berry decimals", () => {
  assert.equal(calculateRoundedTradeTotal(123.45, 1.25), 154.31);
  assert.equal(calculateRoundedTradeTotal(1.004, 1), 1);
  assert.equal(calculateRoundedTradeTotal(1.005, 1), 1.01);
  assert.equal(calculateRoundedTradeTotal(1.006, 1), 1.01);
  assert.equal(calculateRoundedTradeTotal(0.1 + 0.2, 3.35), 1.01);
  assert.equal(calculateRoundedTradeTotal(0.7, 3.35), 2.35);
  assert.equal(calculateRoundedTradeTotal(100.05, 0.3), 30.02);
  assert.equal(calculateRoundedTradeTotal(100.07, 1.5), 150.11);
  assert.equal(calculateRoundedTradeTotal(100.49, 0.01), 1);
  assert.equal(calculateRoundedTradeTotal(100.5, 0.01), 1.01);
  assert.equal(calculateRoundedTradeTotal(1.23e2, 0.01), 1.23);
  assert.equal(calculateRoundedTradeTotal(0.99, 1), 0.99);
});

function assertMaxAffordableShares(balance: number, price: number, expected: number) {
  const actual = calculateMaxAffordableShares(balance, price);
  assert.equal(actual, expected);

  if (actual >= MAX_SHARE_QUANTITY) return;

  const actualHundredths = Math.round(actual * 100);
  const nextCandidate = (actualHundredths + 1) / 100;
  const nextTotal = calculateRoundedTradeTotal(price, nextCandidate);

  assert.equal(
    nextTotal > balance || nextTotal < MIN_TRADE_TOTAL,
    true,
    `expected ${nextCandidate} shares at ${price} to be unaffordable for ${balance}; total was ${nextTotal}`,
  );
}

test("max buy chooses the largest affordable valid hundredth-share quantity", () => {
  assertMaxAffordableShares(100, 25, 4);
  assertMaxAffordableShares(99.99, 25, 3.99);
  assertMaxAffordableShares(0.99, 25, 0);
  assertMaxAffordableShares(50, 10_000, 0);
  assertMaxAffordableShares(1, 100, 0.01);
  assertMaxAffordableShares(2, 100, 0.02);
  assert.equal(calculateMaxAffordableShares(1_000_000, 1), 10000);
  assertMaxAffordableShares(0.3, 0.1 + 0.2, 0);
  assertMaxAffordableShares(1, 100.49, 0.01);
  assertMaxAffordableShares(1, 100.5, 0);
});

test("max buy uses rounded trade totals instead of raw floating-point products", () => {
  assert.equal(calculateRoundedTradeTotal(0.7, 3.35), 2.35);
  assertMaxAffordableShares(2.34, 0.7, 3.34);
  assertMaxAffordableShares(2.35, 0.7, 3.36);
  assertMaxAffordableShares(30.01, 100.05, 0.29);
  assertMaxAffordableShares(30.02, 100.05, 0.3);
});

test("max sell respects the per-transaction cap without capping total holdings", () => {
  assert.equal(calculateMaxSellQuantity(0), 0);
  assert.equal(calculateMaxSellQuantity(12.34), 12.34);
  assert.equal(calculateMaxSellQuantity(10000), 10000);
  assert.equal(calculateMaxSellQuantity(10000.25), 10000);
});
