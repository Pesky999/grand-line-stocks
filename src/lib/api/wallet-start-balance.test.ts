/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260708020000_start_wallet_25000.sql"),
  "utf8",
);
const profileRoute = readFileSync(join(process.cwd(), "src/routes/u.$username.tsx"), "utf8");
const grandLineGuessApi = readFileSync(join(process.cwd(), "src/lib/api/grand-line-guess.functions.ts"), "utf8");

function between(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return text.slice(startIndex, endIndex);
}

test("new wallet default is set to Berry 25,000", () => {
  assert.match(
    migration,
    /ALTER TABLE public\.user_wallets\s+ALTER COLUMN berries SET DEFAULT 25000;/,
  );
});

test("signup wallet creation uses the database default balance", () => {
  const signupFunction = between(
    migration,
    "CREATE OR REPLACE FUNCTION public.handle_new_user()",
    "REVOKE EXECUTE ON FUNCTION public.handle_new_user()",
  );

  assert.match(signupFunction, /INSERT INTO public\.user_wallets \(user_id\) VALUES \(NEW\.id\);/);
  assert.doesNotMatch(signupFunction, /INSERT INTO public\.user_wallets \(user_id,\s*berries\)/);
  assert.doesNotMatch(signupFunction, /VALUES \(NEW\.id,\s*10000\)/);
});

test("migration does not backfill or overwrite existing wallet balances", () => {
  assert.doesNotMatch(migration, /UPDATE public\.user_wallets/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.user_wallets\s+SELECT/i);
});

test("leaderboard return baselines use the new starting balance", () => {
  const refreshFunction = between(
    migration,
    "CREATE OR REPLACE FUNCTION public.refresh_leaderboards()",
    "COMMIT;",
  );

  assert.match(refreshFunction, /v_starting_balance numeric := 25000;/);
  assert.match(
    refreshFunction,
    /\(\(w\.berries \+ public\.user_equity\(w\.user_id\)\) - v_starting_balance\) \* 100\.0 \/ v_starting_balance/,
  );
  assert.match(
    refreshFunction,
    /\(\(s\.current_net_worth - v_starting_balance\)\*100\.0\/v_starting_balance\)/,
  );
  assert.doesNotMatch(refreshFunction, /current_net_worth - 10000/);
  assert.doesNotMatch(refreshFunction, /10000\)\*100\.0\/10000/);
});

test("public profile total return uses the new starting balance constant", () => {
  assert.match(profileRoute, /const STARTING_WALLET_BALANCE = 25_000;/);
  assert.match(profileRoute, /d\.net_worth - STARTING_WALLET_BALANCE/);
  assert.match(profileRoute, /\* 100\) \/ STARTING_WALLET_BALANCE/);
  assert.doesNotMatch(profileRoute, /d\.net_worth - 10000/);
});

test("Grand Line Guess wallet precondition still relies on the wallet default", () => {
  const helper = between(
    grandLineGuessApi,
    "async function ensureGrandLineGuessRewardWallet",
    "async function awardGrandLineGuessReward(",
  );

  assert.match(helper, /\.insert\(\{ user_id: userId \}\)/);
  assert.doesNotMatch(helper, /berries/);
});
