/// <reference types="node" />

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

const migration = read("supabase/migrations/20260725020000_add_stock_trading_onboarding.sql");
const typesSource = read("src/integrations/supabase/types.ts");

test("only one stock onboarding migration exists", () => {
  const onboardingMigrations = readdirSync(join(process.cwd(), "supabase/migrations")).filter(
    (name) => name.includes("stock_trading_onboarding") || name.includes("onboarding"),
  );
  assert.deepEqual(onboardingMigrations, ["20260725020000_add_stock_trading_onboarding.sql"]);
});

test("stock onboarding migration creates private progress and event tables", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_onboarding_progress/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_onboarding_events/);
  assert.match(
    migration,
    /user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
  );
  assert.match(migration, /user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /ALTER TABLE public\.user_onboarding_progress ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.user_onboarding_events ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT SELECT ON public\.user_onboarding_progress TO authenticated/);
  assert.match(migration, /GRANT ALL ON public\.user_onboarding_progress TO service_role/);
  assert.match(migration, /GRANT ALL ON public\.user_onboarding_events TO service_role/);
  assert.match(
    migration,
    /REVOKE ALL ON public\.user_onboarding_events FROM PUBLIC, anon, authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT (INSERT|UPDATE|DELETE|ALL) ON public\.user_onboarding_progress TO authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL) ON public\.user_onboarding_events TO authenticated/,
  );
});

test("progress table stores the approved first-login tutorial state only", () => {
  const progressTable = sourceBetween(
    migration,
    "CREATE TABLE IF NOT EXISTS public.user_onboarding_progress",
    "CREATE TRIGGER user_onboarding_progress_updated_at",
  );

  for (const column of [
    "stock_tutorial_version integer NOT NULL DEFAULT 1",
    "stock_tutorial_status text NOT NULL DEFAULT 'not_started'",
    "stock_tutorial_offer text NOT NULL DEFAULT 'first_login'",
    "stock_tutorial_last_step integer NOT NULL DEFAULT 0",
    "page_tips_disabled boolean NOT NULL DEFAULT false",
    "page_tip_versions jsonb NOT NULL DEFAULT '{}'::jsonb",
  ]) {
    assert.match(progressTable, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(progressTable, /stock_tutorial_last_step BETWEEN 0 AND 5/);
  assert.match(
    progressTable,
    /stock_tutorial_status IN \('not_started', 'in_progress', 'completed', 'skipped'\)/,
  );
  assert.match(progressTable, /stock_tutorial_offer IN \('first_login', 'soft', 'none'\)/);
  assert.match(progressTable, /pg_catalog\.jsonb_typeof\(page_tip_versions\) = 'object'/);
});

test("events table supports safe analytics without exposing private details", () => {
  const eventsTable = sourceBetween(
    migration,
    "CREATE TABLE IF NOT EXISTS public.user_onboarding_events",
    "CREATE INDEX IF NOT EXISTS idx_user_onboarding_events_user_created",
  );

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
    assert.match(eventsTable, new RegExp(`'${eventName}'`));
  }

  assert.match(eventsTable, /metadata jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(eventsTable, /pg_catalog\.jsonb_typeof\(metadata\) = 'object'/);
  assert.match(
    migration,
    /ADD CONSTRAINT user_onboarding_events_user_dedupe_key UNIQUE \(user_id, dedupe_key\)/,
  );
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_user_onboarding_events_user_created\s+ON public\.user_onboarding_events \(user_id, created_at DESC\)/,
  );
});

test("new profile trigger creates progress without modifying handle_new_user or wallet defaults", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_onboarding_progress_for_profile/,
  );
  assert.match(migration, /AFTER INSERT ON public\.profiles/);
  assert.match(migration, /INSERT INTO public\.user_onboarding_progress \(user_id\)/);
  assert.match(migration, /ON CONFLICT \(user_id\) DO NOTHING/);
  assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.handle_new_user/);
  assert.doesNotMatch(migration, /INSERT INTO public\.user_wallets/);
  assert.doesNotMatch(migration, /10000|25000/);
});

test("backfill is forward-only and reads trades without mutating financial or gameplay state", () => {
  const backfill = sourceBetween(migration, "DECLARE\n  v_traded_count", "$$;");

  assert.match(backfill, /FROM public\.profiles p/);
  assert.match(backfill, /FROM public\.transactions t/);
  assert.match(backfill, /INSERT INTO public\.user_onboarding_progress/);
  assert.match(backfill, /CASE WHEN has_traded THEN 'none' ELSE 'soft' END/);
  assert.match(
    backfill,
    /RAISE NOTICE\s+'Stock onboarding backfill: traded=%, no_trade=%, total_inserted=%'/,
  );

  for (const forbidden of [
    /UPDATE public\.user_wallets/,
    /UPDATE public\.user_holdings/,
    /UPDATE public\.transactions/,
    /DELETE FROM public\./,
    /INSERT INTO public\.transactions/,
    /INSERT INTO public\.wallet_ledger_entries/,
    /daily_crew/i,
    /grand_line_guess/i,
    /account_deletion/i,
  ]) {
    assert.doesNotMatch(backfill, forbidden);
  }
});

test("generated Supabase types expose only the new onboarding table contracts", () => {
  assert.match(typesSource, /user_onboarding_progress: \{/);
  assert.match(typesSource, /stock_tutorial_status: string/);
  assert.match(typesSource, /stock_tutorial_offer: string/);
  assert.match(typesSource, /page_tip_versions: Json/);
  assert.match(typesSource, /user_onboarding_events: \{/);
  assert.match(typesSource, /event_name: string/);
  assert.match(typesSource, /dedupe_key: string \| null/);
  assert.match(typesSource, /metadata: Json/);
});
