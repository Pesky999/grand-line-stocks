/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260711220000_add_wallet_ledger_daily_crew_rewards.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const migrationWithoutComments = migration.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const walletFunctionsSource = readFileSync(join(process.cwd(), "src/lib/api/wallet.functions.ts"), "utf8");
const portfolioSource = readFileSync(join(process.cwd(), "src/routes/_authenticated/portfolio.tsx"), "utf8");
const typesSource = readFileSync(join(process.cwd(), "src/integrations/supabase/types.ts"), "utf8");

function between(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return text.slice(startIndex, endIndex);
}

test("wallet ledger Daily Crew migration exists and creates the ledger table", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.wallet_ledger_entries/i);
  assert.match(migration, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
  assert.match(migration, /user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
  assert.match(migration, /entry_type text NOT NULL/i);
  assert.match(migration, /amount numeric NOT NULL/i);
  assert.match(migration, /balance_after numeric NOT NULL/i);
  assert.match(migration, /source_type text NOT NULL/i);
  assert.match(migration, /source_id uuid/i);
  assert.match(migration, /idempotency_key text NOT NULL UNIQUE/i);
  assert.match(migration, /description text NOT NULL/i);
  assert.match(migration, /metadata jsonb NOT NULL DEFAULT '\{\}'::jsonb/i);
  assert.match(migration, /created_at timestamptz NOT NULL DEFAULT now\(\)/i);
  assert.match(migration, /CHECK \(amount <> 0\)/i);
  assert.match(migration, /entry_type IN \('reward', 'bonus', 'grant', 'adjustment'\)/i);
  assert.match(
    migration,
    /source_type IN \(\s*'daily_crew_builder',\s*'grand_line_guess',\s*'trivia',\s*'admin_bonus',\s*'launch_grant',\s*'reset_grant'\s*\)/i,
  );
});

test("wallet ledger table is owner-readable and not browser-writable", () => {
  assert.match(migration, /ALTER TABLE public\.wallet_ledger_entries ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.wallet_ledger_entries FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT ON TABLE public\.wallet_ledger_entries TO authenticated/i);
  assert.match(migration, /GRANT ALL ON TABLE public\.wallet_ledger_entries TO service_role/i);
  assert.match(
    migration,
    /CREATE POLICY "Users read own wallet ledger entries"[\s\S]*FOR SELECT[\s\S]*TO authenticated[\s\S]*USING \(auth\.uid\(\) = user_id\)/i,
  );
  assert.doesNotMatch(
    migrationWithoutComments,
    /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\.wallet_ledger_entries TO authenticated/i,
  );
});

test("Daily Crew payout RPC inserts a positive reward ledger entry idempotently", () => {
  const positiveRewardBlock = between(
    migration,
    "IF v_submission.reward_amount > 0 THEN",
    "  UPDATE public.daily_crew_submissions",
  );
  const outsidePositiveRewardBlock = migration.replace(positiveRewardBlock, "");

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.award_daily_crew_builder_reward\(\s*_submission_id uuid,\s*_user_id uuid\s*\)\s*RETURNS jsonb/i,
  );
  assert.match(migration, /SECURITY DEFINER/i);
  assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/i);
  assert.match(migration, /FROM public\.daily_crew_submissions[\s\S]*WHERE id = _submission_id[\s\S]*FOR UPDATE/i);
  assert.match(migration, /v_submission\.user_id <> _user_id/i);
  assert.match(migration, /IF v_submission\.reward_paid THEN[\s\S]*'alreadyPaid', true/i);
  assert.match(migration, /INSERT INTO public\.user_wallets \(user_id\)[\s\S]*ON CONFLICT \(user_id\) DO NOTHING/i);
  assert.match(migration, /FROM public\.user_wallets[\s\S]*WHERE user_id = _user_id[\s\S]*FOR UPDATE/i);
  assert.match(positiveRewardBlock, /UPDATE public\.user_wallets[\s\S]*berries = berries \+ v_submission\.reward_amount/i);
  assert.match(positiveRewardBlock, /INSERT INTO public\.wallet_ledger_entries/i);
  assert.match(positiveRewardBlock, /'reward'/i);
  assert.match(positiveRewardBlock, /v_submission\.reward_amount/);
  assert.match(positiveRewardBlock, /v_wallet_balance/);
  assert.match(positiveRewardBlock, /'daily_crew_builder'/i);
  assert.match(positiveRewardBlock, /'daily_crew_builder:' \|\| v_submission\.id::text/i);
  assert.match(positiveRewardBlock, /'Daily Crew Builder reward'/i);
  assert.match(positiveRewardBlock, /'score', v_submission\.score/i);
  assert.match(positiveRewardBlock, /'rank', v_submission\.rank/i);
  assert.match(positiveRewardBlock, /'rewardAmount', v_submission\.reward_amount/i);
  assert.match(positiveRewardBlock, /ON CONFLICT \(idempotency_key\) DO NOTHING/i);
  assert.doesNotMatch(outsidePositiveRewardBlock, /INSERT INTO public\.wallet_ledger_entries/i);
  assert.match(migration, /UPDATE public\.daily_crew_submissions[\s\S]*reward_paid = true/i);
  assert.match(migration, /'walletBalance', v_wallet_balance/i);
});

test("Daily Crew payout RPC keeps service-role-only execution and avoids unsafe history writes", () => {
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.award_daily_crew_builder_reward\(uuid, uuid\) FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.award_daily_crew_builder_reward\(uuid, uuid\) TO service_role/i,
  );
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/i);
  assert.doesNotMatch(migrationWithoutComments, /\bpublic\.transactions\b|\btransactions\b/i);
  assert.doesNotMatch(migrationWithoutComments, /pg_catalog\.GREATEST|pg_catalog\.LEAST/i);
  assert.doesNotMatch(migrationWithoutComments, /\bpublic\.grand_line_guess/i);
  assert.doesNotMatch(migrationWithoutComments, /\buser_holdings\b/i);
  assert.doesNotMatch(migrationWithoutComments, /\bprice_history\b/i);
});

test("wallet API lists only the authenticated user's recent ledger entries", () => {
  const listFunction = between(
    walletFunctionsSource,
    "export const listMyWalletLedgerEntries",
    "// NOTE: A self-serve account reset",
  );

  assert.match(listFunction, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(listFunction, /\.from\("wallet_ledger_entries"\)/);
  assert.match(
    listFunction,
    /\.select\("id,entry_type,amount,balance_after,source_type,source_id,description,created_at"\)/,
  );
  assert.match(listFunction, /\.eq\("user_id", context\.userId\)/);
  assert.match(listFunction, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(listFunction, /\.limit\(25\)/);
  assert.match(listFunction, /z\.array\(walletLedgerEntrySchema\)\.parse\(data \?\? \[\]\)/);
  assert.doesNotMatch(listFunction, /supabaseAdmin|admin\(\)|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("portfolio displays Berry History separately from stock trades", () => {
  assert.match(portfolioSource, /listMyWalletLedgerEntries/);
  assert.match(portfolioSource, /queryKey: \["wallet-ledger-entries"\]/);
  assert.match(portfolioSource, /Berry History/);
  assert.match(portfolioSource, /No Berry reward activity yet/);
  assert.match(portfolioSource, /Stock trades still appear separately/);
  assert.match(portfolioSource, /formatBerries\(entry\.balance_after\)/);
  assert.doesNotMatch(portfolioSource, /listMyTransactions/);
});

test("generated Supabase types include wallet ledger entries", () => {
  assert.match(typesSource, /wallet_ledger_entries: \{/);
  assert.match(typesSource, /amount: number/);
  assert.match(typesSource, /balance_after: number/);
  assert.match(typesSource, /idempotency_key: string/);
  assert.match(typesSource, /metadata: Json/);
  assert.match(typesSource, /source_id: string \| null/);
});
