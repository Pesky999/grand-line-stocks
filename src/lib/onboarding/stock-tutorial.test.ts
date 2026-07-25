/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  BERRY_SYMBOL,
  PRACTICE_STEPS,
  STOCK_TUTORIAL_PRACTICE,
  applyPracticeInteraction,
  createInitialPracticeInteractionState,
  finalPracticeState,
  formatPracticeBerries,
  reconstructPracticeInteractionState,
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

test("practice interaction model gates every valid step behind the approved action", () => {
  let state = createInitialPracticeInteractionState();

  state = applyPracticeInteraction(state, { type: "select_listing" });
  assert.equal(state.currentStep, 2);
  assert.equal(state.listingSelected, true);

  state = applyPracticeInteraction(state, { type: "enter_berry_amount", value: "1000" });
  assert.equal(state.currentStep, 2);
  assert.equal(state.berryAmountApplied, false);

  state = applyPracticeInteraction(state, { type: "apply_berry_amount" });
  assert.equal(state.currentStep, 3);
  assert.equal(state.berryAmountApplied, true);

  state = applyPracticeInteraction(state, { type: "confirm_practice_buy" });
  assert.equal(state.currentStep, 4);
  assert.equal(state.practiceBuyConfirmed, true);

  state = applyPracticeInteraction(state, { type: "acknowledge_price_movement" });
  assert.equal(state.currentStep, 5);
  assert.equal(state.movementAcknowledged, true);

  state = applyPracticeInteraction(state, { type: "select_all_shares" });
  assert.equal(state.selectedSellShares, 10);
  state = applyPracticeInteraction(state, { type: "confirm_practice_sale" });
  assert.equal(state.practiceSaleConfirmed, true);
});

test("practice interaction model rejects invalid or out-of-order advancement", () => {
  const initial = createInitialPracticeInteractionState();

  assert.equal(applyPracticeInteraction(initial, { type: "apply_berry_amount" }).currentStep, 1);
  assert.equal(applyPracticeInteraction(initial, { type: "confirm_practice_buy" }).currentStep, 1);
  assert.equal(
    applyPracticeInteraction(initial, { type: "acknowledge_price_movement" }).currentStep,
    1,
  );
  assert.equal(
    applyPracticeInteraction(initial, { type: "confirm_practice_sale" }).practiceSaleConfirmed,
    false,
  );

  let stepTwo = applyPracticeInteraction(initial, { type: "select_listing" });
  stepTwo = applyPracticeInteraction(stepTwo, { type: "enter_berry_amount", value: "999" });
  assert.equal(applyPracticeInteraction(stepTwo, { type: "apply_berry_amount" }).currentStep, 2);

  const stepFive = reconstructPracticeInteractionState(5);
  const wrongSell = applyPracticeInteraction(stepFive, { type: "select_sell_shares", shares: 9 });
  assert.equal(wrongSell.selectedSellShares, 9);
  assert.equal(
    applyPracticeInteraction(wrongSell, { type: "confirm_practice_sale" }).practiceSaleConfirmed,
    false,
  );
});

test("saved server step reconstruction restores prior interactions only", () => {
  assert.deepEqual(reconstructPracticeInteractionState(1), createInitialPracticeInteractionState());

  const stepThree = reconstructPracticeInteractionState(3);
  assert.equal(stepThree.listingSelected, true);
  assert.equal(stepThree.berryAmountText, "1000");
  assert.equal(stepThree.berryAmountApplied, true);
  assert.equal(stepThree.practiceBuyConfirmed, false);

  const stepFive = reconstructPracticeInteractionState(5);
  assert.equal(stepFive.practiceBuyConfirmed, true);
  assert.equal(stepFive.movementAcknowledged, true);
  assert.equal(stepFive.selectedSellShares, null);
  assert.equal(stepFive.practiceSaleConfirmed, false);
});

test("practice restart restores the initial local interaction state", () => {
  const stepFive = reconstructPracticeInteractionState(5);
  const selected = applyPracticeInteraction(stepFive, { type: "select_all_shares" });
  assert.notDeepEqual(selected, createInitialPracticeInteractionState());
  assert.deepEqual(
    applyPracticeInteraction(selected, { type: "restart" }),
    createInitialPracticeInteractionState(),
  );
});

test("practice source cannot reach real economy mutations", () => {
  const source = read("src/lib/onboarding/stock-tutorial.ts");
  assert.doesNotMatch(source, /buyShares|sellShares|execute_trade|execute_trade_authenticated/);
  assert.doesNotMatch(source, /Supabase|wallet|transaction|achievement|reputation|leaderboard/);
});
