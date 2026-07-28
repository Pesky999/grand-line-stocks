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
const runtimeMigration = read(
  "supabase/migrations/20260728030000_authenticated_player_runtime_access.sql",
);

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

test("core onboarding uses authenticated caller-scoped RPCs without the service-role client", () => {
  assert.doesNotMatch(apiSource, /async function admin\(\)|supabaseAdmin|client\.server/);
  assert.match(apiSource, /\.rpc\("get_my_onboarding_progress"\)/);
  assert.match(apiSource, /\.rpc\("mutate_my_onboarding_progress"/);
  assert.match(apiSource, /\.rpc\("record_my_onboarding_event"/);
  assert.match(apiSource, /readMyOnboardingProgress\(context\.supabase\)/);
  assert.match(apiSource, /mutateMyOnboardingProgress\(context\.supabase/);
  assert.match(apiSource, /recordOnboardingEventBestEffort\(context\.supabase/);
  assert.doesNotMatch(apiSource, /\.from\("user_onboarding_(?:progress|events)"\)|context\.userId/);
});

test("onboarding actions preserve the existing transition contract", () => {
  assert.match(apiSource, /input\.restart \? "restart" : "start"/);
  assert.match(apiSource, /mutateMyOnboardingProgress\(context\.supabase, "save_step"/);
  assert.match(apiSource, /mutateMyOnboardingProgress\(context\.supabase, "complete"\)/);
  assert.match(apiSource, /mutateMyOnboardingProgress\(context\.supabase, "skip"\)/);
  assert.match(apiSource, /mutateMyOnboardingProgress\(context\.supabase, "dismiss_tip"/);
  assert.match(apiSource, /mutateMyOnboardingProgress\(context\.supabase, "skip_tips"\)/);
  assert.match(apiSource, /mutateMyOnboardingProgress\(context\.supabase, "reset_tips"\)/);

  for (const action of [
    "start",
    "restart",
    "save_step",
    "complete",
    "skip",
    "dismiss_tip",
    "skip_tips",
    "reset_tips",
  ]) {
    assert.match(runtimeMigration, new RegExp(`WHEN '${action}' THEN`));
  }
});

test("onboarding state failures are contained with a soft non-redirecting fallback", () => {
  const stateEndpoint = exportedFunction(apiSource, "getMyOnboardingState");

  assert.match(stateEndpoint, /try \{/);
  assert.match(stateEndpoint, /logOnboardingFailure\(\s*"read_progress"/);
  assert.match(stateEndpoint, /return createSoftOnboardingState\(\)/);
  assert.doesNotMatch(stateEndpoint, /throw new Error|throw error/);
});

test("analytics schema is bounded and best-effort", () => {
  const schema = sourceBetween(
    apiSource,
    "const emptyMetadataSchema",
    "const startTutorialInputSchema",
  );
  assert.match(schema, /z\.discriminatedUnion\("eventName"/);
  assert.match(
    schema,
    /const tutorialStepKeySchema = z\.enum\(\["step_1", "step_2", "step_3", "step_4", "step_5"\]\)/,
  );
  assert.match(schema, /const pageTipIdSchema = z\.enum\(\[/);
  assert.match(schema, /eventName: z\.literal\("onboarding_offer_seen"\)/);
  assert.match(schema, /offer: z\.enum\(\["first_login", "soft"\]\)/);
  assert.match(schema, /eventName: z\.literal\("stock_tutorial_started"\)/);
  assert.match(schema, /restart: z\.boolean\(\)/);
  assert.match(schema, /tutorialStartSourceSchema/);
  assert.match(schema, /eventName: z\.literal\("stock_tutorial_step_completed"\)/);
  assert.match(schema, /step: tutorialStepKeySchema/);
  assert.match(schema, /eventName: z\.literal\("stock_tutorial_replayed"\)/);
  assert.match(schema, /tutorialReplaySourceSchema/);
  assert.match(schema, /tipId: pageTipIdSchema/);
  assert.match(schema, /version: pageTipVersionSchema\.default\(PAGE_TIP_VERSION\)/);
  assert.match(schema, /side: z\.enum\(\["buy", "sell"\]\)/);
  assert.doesNotMatch(schema, /z\.record/);

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

test("public analytics endpoint accepts only browser-originated observation events", () => {
  const publicSchema = sourceBetween(
    apiSource,
    "const publicRecordOnboardingEventInputSchema",
    "const startTutorialInputSchema",
  );
  const endpoint = exportedFunction(apiSource, "recordMyOnboardingEvent");

  assert.match(endpoint, /publicRecordOnboardingEventInputSchema\.parse/);
  assert.match(endpoint, /if \(data\.eventName === "onboarding_offer_seen"\)/);
  assert.match(endpoint, /eventName: "onboarding_offer_seen",\s+offer: data\.offer/);
  assert.match(
    endpoint,
    /eventName: "page_tip_seen",\s+tipId: data\.tipId,\s+version: data\.version/,
  );
  assert.match(publicSchema, /eventName: z\.literal\("onboarding_offer_seen"\)/);
  assert.match(publicSchema, /eventName: z\.literal\("page_tip_seen"\)/);
  assert.match(publicSchema, /offer: z\.enum\(\["first_login", "soft"\]\)/);
  assert.match(publicSchema, /tipId: pageTipIdSchema/);
  assert.match(publicSchema, /version: pageTipVersionSchema\.default\(PAGE_TIP_VERSION\)/);

  for (const rejected of [
    "stock_tutorial_started",
    "stock_tutorial_step_completed",
    "stock_tutorial_skipped",
    "stock_tutorial_completed",
    "stock_tutorial_replayed",
    "first_live_trade_started",
    "first_live_trade_completed",
    "page_tip_completed",
    "page_tips_skipped",
  ]) {
    assert.doesNotMatch(publicSchema, new RegExp(`eventName: z\\.literal\\("${rejected}"\\)`));
  }
  assert.doesNotMatch(publicSchema, /stepKey|pageKey|dedupeKey|metadata/);
});

test("trusted analytics send bounded event data while SQL derives persisted columns", () => {
  const trustedSchema = sourceBetween(
    apiSource,
    "const recordOnboardingEventInputSchema",
    "const startTutorialInputSchema",
  );
  const mapper = sourceBetween(
    apiSource,
    "function toRpcEventData",
    "function logOnboardingFailure",
  );

  assert.match(mapper, /eventName\) \{\s+case "onboarding_offer_seen"/);
  assert.match(mapper, /return \{ offer: event\.offer \}/);
  assert.match(mapper, /restart: event\.restart,\s+source: event\.source \?\? "welcome"/);
  assert.match(mapper, /return \{ step: event\.step \}/);
  assert.match(mapper, /return \{ source: event\.source \}/);
  assert.match(mapper, /return \{ side: event\.side \}/);
  assert.match(mapper, /tipId: event\.tipId,\s+version: event\.version/);
  assert.doesNotMatch(mapper, /user_id|dedupe_key|event_name|tutorial_version/);
  assert.match(runtimeMigration, /ON CONFLICT \(user_id, dedupe_key\) DO NOTHING/);
  assert.match(runtimeMigration, /v_dedupe_key := 'first_live_trade_started'/);
  assert.match(runtimeMigration, /v_dedupe_key := 'first_live_trade_completed'/);

  for (const forbidden of [
    "stepKey",
    "pageKey",
    "dedupeKey",
    "email",
    "username",
    "display_name",
    "user_id",
    "slug",
    "character",
    "shares",
    "quantity",
    "price",
    "total",
    "balance",
    "storage",
    "account_deletion",
  ]) {
    assert.doesNotMatch(trustedSchema, new RegExp(`${forbidden}:`));
  }
  assert.match(trustedSchema, /\.strict\(\)/);
});

test("tutorial replay records an event without rewriting completed progress", () => {
  const start = exportedFunction(apiSource, "startMyStockTutorial");
  const complete = exportedFunction(apiSource, "completeMyStockTutorial");

  assert.match(start, /input\.replay && current\.stockTutorialStatus === "completed"/);
  assert.match(start, /eventName: "stock_tutorial_replayed"/);
  assert.match(start, /source: "profile"/);
  assert.match(start, /return current/);
  assert.match(complete, /if \(input\.replay\)/);
  assert.doesNotMatch(sourceBetween(complete, "if (input.replay)", "const updated"), /eventName/);
  assert.doesNotMatch(
    sourceBetween(complete, "if (input.replay)", "const updated"),
    /mutateMyOnboardingProgress/,
  );
});

test("trade functions record first live trade analytics without changing trade payloads", () => {
  assert.match(walletSource, /recordOnboardingEventBestEffort/);
  assert.match(walletSource, /eventName: "first_live_trade_started"/);
  assert.match(walletSource, /eventName: "first_live_trade_completed"/);
  assert.match(
    walletSource,
    /await recordOnboardingEventBestEffort\(context\.supabase, \{\s+eventName: "first_live_trade_started",\s+side: "buy"/,
  );
  assert.match(
    walletSource,
    /await recordOnboardingEventBestEffort\(context\.supabase, \{\s+eventName: "first_live_trade_completed",\s+side: "buy"/,
  );
  assert.match(
    walletSource,
    /await recordOnboardingEventBestEffort\(context\.supabase, \{\s+eventName: "first_live_trade_started",\s+side: "sell"/,
  );
  assert.match(
    walletSource,
    /executeTrade\(context\.supabase, data\.slug, "buy", data\.shares, data\.requestId\)/,
  );
  assert.match(
    walletSource,
    /executeTrade\(context\.supabase, data\.slug, "sell", data\.shares, data\.requestId\)/,
  );
  assert.match(
    walletSource,
    /if \(tx\.cost_basis === null \|\| tx\.realized_pnl === null\)[\s\S]*eventName: "first_live_trade_completed",\s+side: "sell"/,
  );
  assert.doesNotMatch(walletSource, /void recordOnboardingEventBestEffort/);
  assert.doesNotMatch(walletSource, /metadata: \{ side|dedupeKey: "first_live_trade/);
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
