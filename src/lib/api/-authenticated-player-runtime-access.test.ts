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

const migration = read(
  "supabase/migrations/20260728030000_authenticated_player_runtime_access.sql",
);
const onboardingSource = read("src/lib/api/onboarding.functions.ts");
const legacySource = read("src/lib/api/legendary.functions.ts");
const typesSource = read("src/integrations/supabase/types.ts");
const rankMigration = read("supabase/migrations/20260728020000_get_my_legacy_rank.sql");

const signatures = [
  "public.get_my_onboarding_progress()",
  "public.mutate_my_onboarding_progress(text, integer, text, integer)",
  "public.record_my_onboarding_event(text, jsonb)",
  "public.get_my_legacy_log_snapshot()",
] as const;

test("authenticated player runtime migration is transactional and reloads PostgREST", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema';/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("every runtime RPC derives the caller from auth.uid and accepts no user id", () => {
  for (const functionName of [
    "get_my_onboarding_progress",
    "mutate_my_onboarding_progress",
    "record_my_onboarding_event",
    "get_my_legacy_log_snapshot",
  ]) {
    const block = sourceBetween(
      migration,
      `CREATE OR REPLACE FUNCTION public.${functionName}`,
      "$$;",
    );
    const header = block.slice(0, block.indexOf("AS $$"));

    assert.match(block, /auth\.uid\(\)/, `${functionName} must derive the caller`);
    assert.match(header, /SECURITY DEFINER/, `${functionName} must be security definer`);
    assert.match(
      header,
      /SET search_path = pg_catalog, public, pg_temp/,
      `${functionName} must use the fixed search path`,
    );
    assert.doesNotMatch(header, /_user_id|user_id uuid/, `${functionName} must accept no user ID`);
  }
});

test("runtime RPC execution is limited to authenticated and service roles", () => {
  for (const signature of signatures) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION ${escaped}\\s+FROM PUBLIC;`));
    assert.match(migration, new RegExp(`REVOKE EXECUTE ON FUNCTION ${escaped}\\s+FROM anon;`));
    assert.match(
      migration,
      new RegExp(`GRANT EXECUTE ON FUNCTION ${escaped}\\s+TO authenticated, service_role;`),
    );
  }

  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+(?:TABLE\s+)?public\./i,
  );
  assert.doesNotMatch(migration, /CREATE POLICY|ALTER POLICY|DISABLE ROW LEVEL SECURITY/i);
});

test("onboarding RPCs preserve creation, promotion, transitions, and bounded analytics", () => {
  const getProgress = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.get_my_onboarding_progress()",
    "$$;",
  );
  const mutateProgress = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.mutate_my_onboarding_progress",
    "$$;",
  );
  const recordEvent = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.record_my_onboarding_event",
    "$$;",
  );

  assert.match(getProgress, /INSERT INTO public\.user_onboarding_progress \(user_id\)/);
  assert.match(getProgress, /VALUES \(v_user_id\)\s+ON CONFLICT \(user_id\) DO NOTHING/);
  assert.match(getProgress, /stock_tutorial_offer = 'first_login'/);
  assert.match(getProgress, /stock_tutorial_status = 'not_started'/);
  assert.match(getProgress, /stock_tutorial_offer IN \('soft', 'none'\)/);

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
    assert.match(mutateProgress, new RegExp(`WHEN '${action}' THEN`));
  }
  assert.match(mutateProgress, /FOR UPDATE/);
  assert.match(mutateProgress, /stock_tutorial_last_step = 5/);
  assert.match(mutateProgress, /completed_at = COALESCE\(v_progress\.completed_at, v_now\)/);
  assert.match(mutateProgress, /page_tip_versions = pg_catalog\.jsonb_set/);

  for (const eventName of [
    "onboarding_offer_seen",
    "stock_tutorial_started",
    "stock_tutorial_step_completed",
    "stock_tutorial_skipped",
    "stock_tutorial_completed",
    "stock_tutorial_replayed",
    "first_live_trade_started",
    "first_live_trade_completed",
    "page_tip_seen",
    "page_tip_completed",
    "page_tips_skipped",
  ]) {
    assert.match(recordEvent, new RegExp(`'${eventName}'`));
  }
  assert.match(recordEvent, /FROM pg_catalog\.jsonb_object_keys\(v_data\)/);
  assert.match(recordEvent, /v_data_key_count <> [012]/);
  assert.doesNotMatch(recordEvent, /jsonb_object_length/);
  assert.match(recordEvent, /ON CONFLICT \(user_id, dedupe_key\) DO NOTHING/);
  assert.doesNotMatch(
    recordEvent.slice(0, recordEvent.indexOf("AS $$")),
    /_dedupe_key|_metadata|_page_key|_step_key/,
  );
});

test("Legacy Log snapshot reads only the authenticated player's private data", () => {
  const snapshot = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.get_my_legacy_log_snapshot()",
    "$$;",
  );

  for (const ownerScopedPredicate of [
    /profiles\.id = v_user_id/,
    /stats\.user_id = v_user_id/,
    /user_achievements\.user_id = v_user_id/,
    /legacy_records\.user_id = v_user_id/,
    /holdings\.user_id = v_user_id/,
    /stats\.user_id = v_user_id/,
    /results\.user_id = v_user_id/,
    /submissions\.user_id = v_user_id/,
    /my_holdings\.user_id = v_user_id/,
  ]) {
    assert.match(snapshot, ownerScopedPredicate);
  }
  assert.match(snapshot, /FROM public\.get_my_legacy_rank\(\) AS rank_row/);
  assert.doesNotMatch(snapshot, /\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/i);
  assert.doesNotMatch(snapshot, /auth\.users|_username|_slug/);
  assert.doesNotMatch(snapshot.slice(0, snapshot.indexOf("AS $$")), /_user_id/);
});

test("application code uses only the new caller-scoped runtime RPCs", () => {
  assert.doesNotMatch(onboardingSource, /supabaseAdmin|client\.server|async function admin\(/);
  assert.doesNotMatch(
    onboardingSource,
    /\.from\("user_onboarding_progress"\)|\.from\("user_onboarding_events"\)/,
  );
  assert.match(onboardingSource, /\.rpc\("get_my_onboarding_progress"\)/);
  assert.match(onboardingSource, /\.rpc\("mutate_my_onboarding_progress"/);
  assert.match(onboardingSource, /\.rpc\("record_my_onboarding_event"/);

  const legacyHandler = sourceBetween(
    legacySource,
    "export const getMyLegacyLog",
    "export const listCharacterTopHolders",
  );
  assert.match(legacyHandler, /\.rpc\("get_my_legacy_log_snapshot"\)/);
  assert.doesNotMatch(legacyHandler, /\.from\(/);
  assert.doesNotMatch(legacyHandler, /supabaseAdmin|client\.server|context\.userId/);
});

test("generated types expose each new RPC without a caller-provided user ID", () => {
  for (const functionName of [
    "get_my_onboarding_progress",
    "mutate_my_onboarding_progress",
    "record_my_onboarding_event",
    "get_my_legacy_log_snapshot",
  ]) {
    assert.match(typesSource, new RegExp(`${functionName}:\\s*\\{`));
  }

  const functions = sourceBetween(typesSource, "    Functions: {", "    Enums: {");
  for (const functionName of [
    "get_my_onboarding_progress",
    "mutate_my_onboarding_progress",
    "record_my_onboarding_event",
    "get_my_legacy_log_snapshot",
  ]) {
    const block = sourceBetween(functions, `${functionName}:`, "\n      }");
    assert.doesNotMatch(block, /_user_id|userId/);
  }
});

test("existing caller-only Legacy rank protections remain unchanged", () => {
  assert.match(rankMigration, /CREATE OR REPLACE FUNCTION public\.get_my_legacy_rank\(\)/);
  assert.match(rankMigration, /leaderboard\.user_id = auth\.uid\(\)/);
  assert.match(
    rankMigration,
    /GRANT EXECUTE ON FUNCTION public\.get_my_legacy_rank\(\) TO authenticated, service_role;/,
  );
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.get_my_legacy_rank\(\)/);
});

test("runtime migration does not change economy, gameplay, privacy, or account lifecycle data", () => {
  assert.doesNotMatch(
    migration,
    /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.(?:user_wallets|user_holdings|transactions|wallet_ledger_entries|price_history|characters|daily_crew_submissions|grand_line_guess_results|profiles|user_stats|user_achievements|legacy_records|market_events)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.(?:handle_new_user|execute_trade|award_|delete_|evaluate_public_identity)/i,
  );
});
