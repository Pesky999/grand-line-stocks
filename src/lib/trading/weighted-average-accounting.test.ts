/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBuyAccounting,
  calculateFullSellAccounting,
  calculatePartialSellAccounting,
  formatRealizedPnl,
} from "./weighted-average-accounting.ts";

test("single buy records basis and weighted average cost", () => {
  const result = calculateBuyAccounting({ shares: 0, totalCostBasis: 0 }, 1, 100);

  assert.equal(result.holdingSharesBefore, 0);
  assert.equal(result.holdingCostBasisBefore, 0);
  assert.equal(result.holdingAvgCostBefore, 0);
  assert.equal(result.holdingSharesAfter, 1);
  assert.equal(result.holdingCostBasisAfter, 100);
  assert.equal(result.holdingAvgCostAfter, 100);
});

test("blended buys preserve total basis and weighted average cost", () => {
  const first = calculateBuyAccounting({ shares: 0, totalCostBasis: 0 }, 1, 100);
  const second = calculateBuyAccounting(
    { shares: first.holdingSharesAfter, totalCostBasis: first.holdingCostBasisAfter },
    1,
    200,
  );

  assert.equal(second.holdingSharesAfter, 2);
  assert.equal(second.holdingCostBasisAfter, 300);
  assert.equal(second.holdingAvgCostAfter, 150);
});

test("profitable partial sale allocates weighted average basis", () => {
  const result = calculatePartialSellAccounting({ shares: 2, totalCostBasis: 300 }, 1, 180);

  assert.equal(result.costBasis, 150);
  assert.equal(result.realizedPnl, 30);
  assert.equal(result.holdingSharesAfter, 1);
  assert.equal(result.holdingCostBasisAfter, 150);
  assert.equal(result.holdingAvgCostAfter, 150);
});

test("losing partial sale records a negative realized result", () => {
  const result = calculatePartialSellAccounting({ shares: 2, totalCostBasis: 200 }, 1, 80);

  assert.equal(result.costBasis, 100);
  assert.equal(result.realizedPnl, -20);
  assert.equal(formatRealizedPnl(result.realizedPnl), "-฿20.00");
});

test("break-even sale is neither profit nor loss", () => {
  const result = calculatePartialSellAccounting({ shares: 2, totalCostBasis: 200 }, 1, 100);

  assert.equal(result.costBasis, 100);
  assert.equal(result.realizedPnl, 0);
  assert.equal(formatRealizedPnl(result.realizedPnl), "฿0.00");
});

test("fractional buys and sells use hundredth-share precision", () => {
  const buy = calculateBuyAccounting({ shares: 0, totalCostBasis: 0 }, 1.5, 150);
  const sale = calculatePartialSellAccounting(
    { shares: buy.holdingSharesAfter, totalCostBasis: buy.holdingCostBasisAfter },
    0.5,
    60,
  );

  assert.equal(sale.costBasis, 50);
  assert.equal(sale.realizedPnl, 10);
  assert.equal(sale.holdingSharesAfter, 1);
  assert.equal(sale.holdingCostBasisAfter, 100);
});

test("multiple partial sells conserve cent-denominated basis until final close", () => {
  const firstSale = calculatePartialSellAccounting({ shares: 3, totalCostBasis: 100 }, 1, 50);
  const secondSale = calculatePartialSellAccounting(
    { shares: firstSale.holdingSharesAfter, totalCostBasis: firstSale.holdingCostBasisAfter },
    1,
    50,
  );
  const finalSale = calculateFullSellAccounting(
    { shares: secondSale.holdingSharesAfter, totalCostBasis: secondSale.holdingCostBasisAfter },
    50,
  );

  assert.equal(firstSale.costBasis, 33.33);
  assert.equal(secondSale.costBasis, 33.34);
  assert.equal(finalSale.costBasis, 33.33);
  assert.equal(firstSale.costBasis + secondSale.costBasis + finalSale.costBasis, 100);
  assert.equal(finalSale.holdingSharesAfter, 0);
  assert.equal(finalSale.holdingCostBasisAfter, 0);
  assert.equal(finalSale.holdingAvgCostAfter, 0);
});

test("near-total partial sale preserves the final basis cent for open shares", () => {
  const partialSale = calculatePartialSellAccounting(
    { shares: 100, totalCostBasis: 0.01 },
    99.99,
    1,
  );
  const finalSale = calculateFullSellAccounting(
    {
      shares: partialSale.holdingSharesAfter,
      totalCostBasis: partialSale.holdingCostBasisAfter,
    },
    0,
  );

  assert.equal(partialSale.costBasis, 0);
  assert.equal(partialSale.holdingSharesAfter, 0.01);
  assert.equal(partialSale.holdingCostBasisAfter, 0.01);
  assert.equal(finalSale.costBasis, 0.01);
  assert.equal(partialSale.costBasis + finalSale.costBasis, 0.01);
  assert.equal(finalSale.holdingCostBasisAfter, 0);
});

test("completed position cycles do not carry basis into later positions", () => {
  const firstBuy = calculateBuyAccounting({ shares: 0, totalCostBasis: 0 }, 1, 100);
  const firstClose = calculateFullSellAccounting(
    { shares: firstBuy.holdingSharesAfter, totalCostBasis: firstBuy.holdingCostBasisAfter },
    120,
  );
  const secondBuy = calculateBuyAccounting(
    { shares: firstClose.holdingSharesAfter, totalCostBasis: firstClose.holdingCostBasisAfter },
    2,
    300,
  );
  const secondPartial = calculatePartialSellAccounting(
    {
      shares: secondBuy.holdingSharesAfter,
      totalCostBasis: secondBuy.holdingCostBasisAfter,
    },
    1,
    180,
  );
  const secondClose = calculateFullSellAccounting(
    {
      shares: secondPartial.holdingSharesAfter,
      totalCostBasis: secondPartial.holdingCostBasisAfter,
    },
    160,
  );

  assert.equal(firstClose.costBasis, 100);
  assert.equal(secondBuy.holdingCostBasisBefore, 0);
  assert.equal(secondPartial.costBasis, 150);
  assert.equal(secondClose.costBasis, 150);
  assert.equal(secondPartial.costBasis + secondClose.costBasis, 300);
});

test("basis replay reconciles to production average-cost behavior", () => {
  const firstBuy = calculateBuyAccounting({ shares: 0, totalCostBasis: 0 }, 3, 100);
  const firstSell = calculatePartialSellAccounting(
    {
      shares: firstBuy.holdingSharesAfter,
      totalCostBasis: firstBuy.holdingCostBasisAfter,
    },
    1,
    40,
  );
  const secondSell = calculatePartialSellAccounting(
    {
      shares: firstSell.holdingSharesAfter,
      totalCostBasis: firstSell.holdingCostBasisAfter,
    },
    0.5,
    20,
  );
  const secondBuy = calculateBuyAccounting(
    {
      shares: secondSell.holdingSharesAfter,
      totalCostBasis: secondSell.holdingCostBasisAfter,
    },
    2.25,
    125,
  );

  assert.equal(firstSell.costBasis, 33.33);
  assert.equal(firstSell.holdingCostBasisAfter, 66.67);
  assert.equal(secondSell.costBasis, 16.67);
  assert.equal(secondSell.holdingCostBasisAfter, 50);
  assert.equal(secondBuy.holdingSharesAfter, 3.75);
  assert.equal(secondBuy.holdingCostBasisAfter, 175);
  assert.equal(Number(secondBuy.holdingAvgCostAfter.toFixed(8)), 46.66666667);
  assert.equal(
    Math.round(secondBuy.holdingAvgCostAfter * secondBuy.holdingSharesAfter * 100) / 100,
    175,
  );
});

test("full sale consumes all remaining basis", () => {
  const result = calculateFullSellAccounting({ shares: 1.25, totalCostBasis: 123.45 }, 150);

  assert.equal(result.costBasis, 123.45);
  assert.equal(result.realizedPnl, 26.55);
  assert.equal(result.holdingSharesAfter, 0);
  assert.equal(result.holdingCostBasisAfter, 0);
});

test("invalid accounting inputs cannot create negative basis, shares, or fractional dust", () => {
  assert.throws(
    () => calculatePartialSellAccounting({ shares: 1, totalCostBasis: 100 }, 1, 120),
    /Partial sale must sell less than the open position/,
  );
  assert.throws(
    () => calculatePartialSellAccounting({ shares: 1, totalCostBasis: 100 }, 0.995, 120),
    /Shares must use at most two decimal places/,
  );
  assert.throws(
    () => calculateFullSellAccounting({ shares: 0, totalCostBasis: 0 }, 0),
    /Position must be open with positive basis/,
  );
  assert.throws(
    () => calculatePartialSellAccounting({ shares: 1, totalCostBasis: 0 }, 0.5, 1),
    /Position must be open with positive basis/,
  );
});
