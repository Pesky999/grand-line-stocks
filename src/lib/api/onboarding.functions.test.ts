/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function exportedFunction(source: string, name: string) {
  const start = `export const ${name}`;
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${name} should exist`);
  const nextExport = source.indexOf("\nexport const ", startIndex + start.length);
  return nextExport === -1 ? source.slice(startIndex) : source.slice(startIndex, nextExport);
}

const apiSource = read("src/lib/api/onboarding.functions.ts");
const walletSource = read("src/lib/api/wallet.functions.ts");

test("onboarding server functions are authenticated and never accept a user id from the browser", () => {
  for (const name of [
    "getMyOnboardingState",
    "startMyStockTutorial",
    "saveMyStockTutorialStep",
    "completeMyStockTutorial",
    "skipMyStockTutorial",
    "dismissMyPageTip",
    "skipMyPageTips",
    "resetMyPageTips",
    "recordMyOnboardingEvent",
  ]) {
    const block = exportedFunction(apiSource, name);
    assert.match(block, /\.middleware\(\[requireSupabaseAuth\]\)/, `${name} requires auth`);
    assert.doesNotMatch(block, /userId:\s*z\./, `${name} must not accept userId input`);
    assert.doesNotMatch(block, /data\.userId/, `${name} must use context.userId only`);
  }
});

test("onboarding writes use the trusted server client and strict state transitions", () => {
  assert.match(apiSource, /async function admin\(\)/);
  assert.match(apiSource, /supabaseAdmin/);
  assert.match(apiSource, /ensureOnboardingProgress/);
  assert.match(apiSource, /defaultProgressForNewUser/);
  assert.match(
    apiSource,
    /function defaultProgressForNewUser\(\): OnboardingProgressState \{\s*return createSoftOnboardingState\(\);\s*\}/,
  );
  assert.doesNotMatch(
    apiSource,
    /defaultProgressForNewUser[\s\S]*stockTutorialOffer: "first_login"/,
  );
  assert.match(apiSource, /startStockTutorial/);
  assert.match(apiSource, /restartStockTutorial/);
  assert.match(apiSource, /saveStockTutorialStep/);
  assert.match(apiSource, /completeStockTutorial/);
  assert.match(apiSource, /skipStockTutorial/);
  assert.match(apiSource, /dismissPageTip/);
  assert.match(apiSource, /skipAllPageTips/);
  assert.match(apiSource, /resetPageTips/);
});

test("analytics schema is bounded and best-effort", () => {
  const schema = sourceBetween(
    apiSource,
    "const recordOnboardingEventInputSchema",
    "const startTutorialInputSchema",
  );
  assert.match(schema, /z\.enum\(onboardingEventNames\)/);
  assert.match(schema, /z\.string\(\)\.max\(120\)/);
  assert.match(schema, /z\.string\(\)\.max\(160\)/);
  assert.match(schema, /z\.record\(z\.string\(\)\.max\(60\), eventMetadataValueSchema\)/);

  const bestEffort = sourceBetween(
    apiSource,
    "export async function recordOnboardingEventBestEffort",
    "export const getMyOnboardingState",
  );
  assert.match(bestEffort, /recordOnboardingEventInputSchema\.parse/);
  assert.match(bestEffort, /catch \(error\)/);
  assert.match(bestEffort, /ONBOARDING_EVENT_BEST_EFFORT_FAILED/);
  assert.doesNotMatch(bestEffort, /throw error|throw new Error/);
});

test("tutorial replay records an event without rewriting completed progress", () => {
  const start = exportedFunction(apiSource, "startMyStockTutorial");
  const complete = exportedFunction(apiSource, "completeMyStockTutorial");

  assert.match(start, /input\.replay && current\.stockTutorialStatus === "completed"/);
  assert.match(start, /eventName: "stock_tutorial_replayed"/);
  assert.match(start, /return current/);
  assert.match(complete, /if \(input\.replay\)/);
  assert.match(complete, /eventName: "stock_tutorial_replayed"/);
  assert.doesNotMatch(
    sourceBetween(complete, "if (input.replay)", "const updated"),
    /updateOnboardingProgress/,
  );
});

test("trade functions record first live trade analytics without changing trade payloads", () => {
  assert.match(walletSource, /recordOnboardingEventBestEffort/);
  assert.match(walletSource, /eventName: "first_live_trade_started"/);
  assert.match(walletSource, /eventName: "first_live_trade_completed"/);
  assert.match(
    walletSource,
    /executeTrade\(context\.supabase, data\.slug, "buy", data\.shares, data\.requestId\)/,
  );
  assert.match(
    walletSource,
    /executeTrade\(context\.supabase, data\.slug, "sell", data\.shares, data\.requestId\)/,
  );
  assert.doesNotMatch(walletSource, /user_onboarding_progress/);
  assert.doesNotMatch(walletSource, /wallet_ledger_entries[\s\S]*first_live_trade/);
});

test("onboarding API does not mutate real economy, games, or account deletion state", () => {
  for (const forbidden of [
    /execute_trade_authenticated/,
    /deleteMyAccount/,
    /auth\.admin\.deleteUser/,
    /user_wallets/,
    /user_holdings/,
    /transactions/,
    /wallet_ledger_entries/,
    /daily_crew/i,
    /grand_line_guess/i,
  ]) {
    assert.doesNotMatch(apiSource, forbidden);
  }
});
