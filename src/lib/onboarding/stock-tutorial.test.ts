/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  BERRY_SYMBOL,
  PRACTICE_STEPS,
  STOCK_TUTORIAL_PRACTICE,
  finalPracticeState,
  formatPracticeBerries,
  reconstructPracticeState,
} from "./stock-tutorial.ts";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("practice constants match the approved deterministic sandbox trade", () => {
  assert.equal(BERRY_SYMBOL, "\u0e3f");
  assert.deepEqual(STOCK_TUTORIAL_PRACTICE, {
    name: "Practice Listing",
    symbol: "DEMO",
    initialWallet: 5000,
    investment: 1000,
    buyPrice: 100,
    shares: 10,
    newPrice: 105,
    saleProceeds: 1050,
    profit: 50,
  });
  assert.equal(formatPracticeBerries(1000), "\u0e3f1,000");
});

test("practice state reconstructs deterministically from each saved step", () => {
  assert.equal(reconstructPracticeState(1).cash, 5000);
  assert.equal(reconstructPracticeState(2).shares, 0);
  assert.equal(reconstructPracticeState(3).positionValue, 0);
  assert.equal(reconstructPracticeState(4).shares, 10);
  assert.equal(reconstructPracticeState(4).cash, 4000);
  assert.equal(reconstructPracticeState(4).positionValue, 1050);
  assert.equal(reconstructPracticeState(4).unrealizedPnl, 50);

  const finalState = finalPracticeState();
  assert.equal(finalState.cash, 5050);
  assert.equal(finalState.shares, 0);
  assert.equal(finalState.realizedPnl, 50);
});

test("practice steps require interaction and cover all five approved actions", () => {
  assert.deepEqual(
    PRACTICE_STEPS.map((step) => step.key),
    ["step_1", "step_2", "step_3", "step_4", "step_5"],
  );
  assert.match(PRACTICE_STEPS[0].action, /Select the practice stock/);
  assert.match(PRACTICE_STEPS[4].action, /Confirm practice sale/);
});

test("practice source cannot reach real economy mutations", () => {
  const source = read("src/lib/onboarding/stock-tutorial.ts");
  assert.doesNotMatch(source, /buyShares|sellShares|execute_trade|execute_trade_authenticated/);
  assert.doesNotMatch(source, /Supabase|wallet|transaction|achievement|reputation|leaderboard/);
});
