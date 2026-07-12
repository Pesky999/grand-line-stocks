/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/lib/api/grand-line-guess.functions.ts"), "utf8");
const routeSource = readFileSync(join(process.cwd(), "src/routes/games.grand-line-guess.tsx"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260711230000_add_grand_line_guess_wallet_ledger.sql"),
  "utf8",
);
const migrationWithoutComments = migration.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

function between(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return text.slice(startIndex, endIndex);
}

test("Grand Line Guess server uses shared bounty and reward rules", () => {
  assert.match(source, /import \{ compareGuessBounty, rewardForAttempt \}/);
  assert.match(source, /return compareGuessBounty\(guess, target\)/);
  assert.doesNotMatch(source, /const REWARDS = \[750, 600, 500, 400, 300, 200, 100\]/);
});

test("wrong guesses do not deduct wallet funds or call the reward path", () => {
  const submitBranch = source.slice(source.indexOf("export const submitGrandLineGuess"));
  const correctBranchStart = submitBranch.indexOf("if (isCorrect) {");
  assert.notEqual(correctBranchStart, -1, "correct branch should exist");
  const wrongBranchStart = submitBranch.indexOf("} else {", correctBranchStart);
  assert.notEqual(wrongBranchStart, -1, "wrong branch should exist");
  const wrongBranchEnd = submitBranch.indexOf("\n    return loadState(userId);", wrongBranchStart);
  assert.notEqual(wrongBranchEnd, -1, "wrong branch should return state after result upsert");
  const wrongGuessBranch = submitBranch.slice(wrongBranchStart, wrongBranchEnd);

  assert.match(wrongGuessBranch, /grand_line_guess_results/);
  assert.doesNotMatch(wrongGuessBranch, /awardGrandLineGuessReward|awardGrandLineGuessRewardSafely|ensureGrandLineGuessRewardWallet|user_wallets|berries\s*[-=]/);
});

test("correct guesses use the award path and payout failures return contained state", () => {
  const submitFn = source.slice(source.indexOf("export const submitGrandLineGuess"));
  const correctGuessBranch = between(submitFn, "if (isCorrect) {", "} else {");

  assert.match(correctGuessBranch, /const reward = rewardForAttempt\(attemptNumber\)/);
  assert.match(correctGuessBranch, /awardGrandLineGuessRewardSafely\(db/);
  assert.match(correctGuessBranch, /applyPayoutFailure\(state, rewardError\)/);
  assert.match(source, /async function awardGrandLineGuessRewardSafely/);
  assert.match(source, /type PayoutFailure = \{[\s\S]*payout_error_code: string[\s\S]*payout_error_step: PayoutErrorStep/);
  assert.match(routeSource, /role="alert"/);
  assert.match(routeSource, /Diagnostic code: \{rewardDiagnosticCode\}/);
  assert.match(routeSource, /setSubmissionError/);
});

test("loadState exposes persistent unpaid solved payout state", () => {
  const loadStateBlock = between(source, "async function loadState", "export const getTodayGrandLineGuessState");

  assert.match(loadStateBlock, /const correctAttempt = attempts\.find\(\(attempt: \{ is_correct: boolean \}\) => attempt\.is_correct\) \?\? null/);
  assert.match(loadStateBlock, /const effectivelySolved = Boolean\(result\?\.solved \|\| correctAttempt\)/);
  assert.match(loadStateBlock, /const rewardPayoutPending = Boolean\(\(result\?\.solved && !rewardPaid\) \|\| \(correctAttempt && !rewardPaid\)\)/);
  assert.match(loadStateBlock, /const pendingRewardAmount = rewardPayoutPending && correctAttemptNumber != null[\s\S]*rewardForAttempt\(correctAttemptNumber\)/);
  assert.match(loadStateBlock, /if \(effectivelySolved \|\| puzzle\.status === "expired"\)/);
  assert.match(loadStateBlock, /solved: effectivelySolved/);
  assert.match(loadStateBlock, /reward_payout_pending: rewardPayoutPending/);
  assert.match(loadStateBlock, /pending_reward_amount: pendingRewardAmount/);
  assert.match(loadStateBlock, /payout_error_code: null as string \| null/);
  assert.match(loadStateBlock, /payout_error_step: null as PayoutErrorStep \| null/);
});

test("reward payout prepares a missing wallet row without touching balances", () => {
  const helper = between(
    source,
    "async function ensureGrandLineGuessRewardWallet",
    "async function awardGrandLineGuessReward(",
  );

  assert.match(helper, /\.from\("user_wallets"\)[\s\S]*\.select\("user_id"\)[\s\S]*\.eq\("user_id", userId\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(helper, /if \(existing\.data\) return/);
  assert.match(helper, /\.insert\(\{ user_id: userId \}\)/);
  assert.match(helper, /created\.error\.code === "23505"/);
  assert.match(helper, /const raced = await db[\s\S]*\.from\("user_wallets"\)[\s\S]*\.select\("user_id"\)/);
  assert.doesNotMatch(helper, /\.update\(|\.upsert\(|berries/);
  assert.match(source, /await ensureGrandLineGuessRewardWallet\(db, args\.userId\);\s+await awardGrandLineGuessReward\(db, args\);/);
});

test("wallet precondition failures map to safe diagnostic codes", () => {
  const helper = between(
    source,
    "async function ensureGrandLineGuessRewardWallet",
    "async function awardGrandLineGuessReward(",
  );

  assert.match(source, /class GrandLineGuessPayoutError extends Error/);
  assert.match(source, /function safePayoutErrorCode/);
  assert.match(helper, /GrandLineGuessPayoutError\("WALLET_PRECHECK_SELECT_FAILED", existing\.error\.code\)/);
  assert.match(helper, /GrandLineGuessPayoutError\("WALLET_PRECHECK_RACE_RECHECK_FAILED", raced\.error\.code\)/);
  assert.match(helper, /GrandLineGuessPayoutError\("WALLET_PRECHECK_INSERT_FAILED", created\.error\.code\)/);
});

test("reward RPC keeps compatibility arguments and logs safe diagnostics on failure", () => {
  const awardFn = between(source, "async function awardGrandLineGuessReward(", "async function awardGrandLineGuessRewardSafely");

  assert.match(awardFn, /\.rpc\("award_grand_line_guess_reward", \{/);
  assert.match(awardFn, /_puzzle_id: args\.puzzleId/);
  assert.match(awardFn, /_user_id: args\.userId/);
  assert.match(awardFn, /_attempt_number: args\.attemptNumber/);
  assert.match(awardFn, /_reward_amount: args\.rewardAmount/);
  assert.match(awardFn, /logGrandLineGuessSupabaseError\("Grand Line Guess reward RPC failed", error\)/);
  assert.match(awardFn, /GrandLineGuessPayoutError\("REWARD_RPC_FAILED", error\.code\)/);
  assert.match(source, /code: error\.code/);
  assert.match(source, /message: error\.message/);
  assert.match(source, /details: error\.details/);
  assert.match(source, /hint: error\.hint/);
  assert.match(source, /return safeCode \? `\$\{step\}_\$\{safeCode\}` : step/);
  assert.match(source, /REWARD_PAYOUT_ERROR_MESSAGE/);
});

test("server RPC argument names match the restored migration signature", () => {
  const awardFn = between(source, "async function awardGrandLineGuessReward(", "async function awardGrandLineGuessRewardSafely");

  for (const argumentName of ["_puzzle_id", "_user_id", "_attempt_number", "_reward_amount"]) {
    assert.match(awardFn, new RegExp(`${argumentName}:`), `${argumentName} is passed by the server`);
    assert.match(migration, new RegExp(`${argumentName} (?:uuid|integer)`), `${argumentName} exists in the RPC signature`);
  }
});

test("retry payout uses existing correct attempt and never records a new guess", () => {
  const retryFn = between(source, "export const retryGrandLineGuessReward", "export const submitGrandLineGuess");

  assert.match(retryFn, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(retryFn, /\.from\("grand_line_guess_attempts"\)[\s\S]*\.eq\("is_correct", true\)[\s\S]*\.order\("attempt_number", \{ ascending: true \}\)[\s\S]*\.limit\(1\)/);
  assert.match(retryFn, /if \(!correctAttempt\) \{[\s\S]*reward_error: "No unpaid Grand Line Guess reward is available to retry\."/);
  assert.match(retryFn, /\.from\("grand_line_guess_results"\)[\s\S]*\.select\("reward_paid"\)/);
  assert.match(retryFn, /if \(resultR\.data\?\.reward_paid\) \{[\s\S]*return loadState\(userId\)/);
  assert.match(retryFn, /awardGrandLineGuessRewardSafely\(db, \{[\s\S]*attemptNumber: correctAttempt\.attempt_number[\s\S]*rewardAmount: rewardForAttempt\(correctAttempt\.attempt_number\)/);
  assert.match(retryFn, /return rewardError \? applyPayoutFailure\(state, rewardError\) : state/);
  assert.match(source, /await ensureGrandLineGuessRewardWallet\(db, args\.userId\);\s+await awardGrandLineGuessReward\(db, args\);/);
  assert.doesNotMatch(retryFn, /grand_line_guess_attempts"\)[\s\S]*\.(?:insert|upsert)\(/);
  assert.doesNotMatch(retryFn, /user_wallets"\)[\s\S]*\.update\(|berries\s*=/);
});

test("UI shows a generic payout failure diagnostic without manual retry controls", () => {
  assert.doesNotMatch(routeSource, /retryGrandLineGuessReward/);
  assert.match(routeSource, /const showRewardFailure = Boolean\(rewardError\)/);
  assert.match(routeSource, /Reward payout needs attention/);
  assert.match(routeSource, /Diagnostic code: \{rewardDiagnosticCode\}/);
  assert.doesNotMatch(routeSource, /Your correct answer was recorded, but the reward has not been paid yet\./);
  assert.doesNotMatch(routeSource, /state\?\.can_retry_payout/);
  assert.doesNotMatch(routeSource, /retryPayoutM|Retrying payout|Retry reward payout/);
  assert.match(routeSource, /!state\?\.solved && state\?\.status === "active"/);
  assert.match(routeSource, /state\.reward_paid \? "earned" : "pending payout"/);
  assert.doesNotMatch(routeSource, /unpaidCorrectAttempt|submitM\.mutate\(unpaidCorrectAttempt/);
});

test("duplicate correct submissions retry the idempotent award path without trusting the client", () => {
  const duplicateBranch = between(source, "if (duplicateAttempt) {", "const attemptNumber =");

  assert.match(duplicateBranch, /duplicateAttempt\.is_correct/);
  assert.match(duplicateBranch, /awardGrandLineGuessRewardSafely\(db/);
  assert.match(duplicateBranch, /rewardForAttempt\(duplicateAttempt\.attempt_number\)/);
  assert.match(duplicateBranch, /applyPayoutFailure\(state, rewardError\)/);
  assert.match(duplicateBranch, /throw new Error\("You already guessed that character\."\)/);
});

test("new migration replaces the authoritative RPC formula and accepts reward 0", () => {
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.award_grand_line_guess_reward\(uuid, uuid, integer, integer\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.award_grand_line_guess_reward\(\s*_puzzle_id uuid,\s*_user_id uuid,\s*_attempt_number integer,\s*_reward_amount integer\s*\)/);
  assert.match(migration, /RETURNS void/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/);
  assert.doesNotMatch(migration, /pg_catalog\.GREATEST/);
  assert.match(migration, /v_wrong_guesses := CASE\s+WHEN v_attempt_number > 1 THEN v_attempt_number - 1\s+ELSE 0\s+END/);
  assert.match(migration, /v_computed_reward := CASE\s+WHEN 1000 - \(100 \* v_wrong_guesses\) > 0 THEN 1000 - \(100 \* v_wrong_guesses\)\s+ELSE 0\s+END/);
  assert.doesNotMatch(migration, /WHEN v_attempt_number = 1 THEN 750|WHEN v_attempt_number = 2 THEN 600|WHEN v_attempt_number = 3 THEN 500/);
  assert.doesNotMatch(migration, /_reward_amount\s*(?:<=|<)\s*0|v_computed_reward\s*(?:<=|<)\s*0/);
});

test("new migration keeps attempt six and later rewards nonnegative", () => {
  const rewardForAttemptShape = (attemptNumber: number) => {
    const wrongGuesses = attemptNumber > 1 ? attemptNumber - 1 : 0;
    const reward = 1000 - 100 * wrongGuesses;
    return reward > 0 ? reward : 0;
  };

  assert.equal(rewardForAttemptShape(6), 500);
  assert.equal(rewardForAttemptShape(10), 100);
  assert.equal(rewardForAttemptShape(11), 0);
  assert.equal(rewardForAttemptShape(20), 0);
});

test("new migration ignores client reward amounts and pays the database-calculated reward", () => {
  assert.doesNotMatch(migration, /_reward_amount\s+IS\s+DISTINCT\s+FROM/);
  assert.doesNotMatch(migration, /reward_amount\s*=\s*_reward_amount/);
  assert.doesNotMatch(migration, /berries\s*=\s*berries\s*\+\s*_reward_amount/);
  assert.doesNotMatch(migration, /total_rewards_earned\s*[,=][\s\S]*_reward_amount/);
  assert.match(migration, /INSERT INTO public\.user_wallets \(user_id\)[\s\S]*ON CONFLICT \(user_id\) DO NOTHING/);
  assert.match(migration, /FROM public\.user_wallets[\s\S]*WHERE user_id = _user_id[\s\S]*FOR UPDATE/);
  assert.match(migration, /SET berries = berries \+ v_computed_reward/);
  assert.match(migration, /reward_amount = v_computed_reward/);
  assert.match(migration, /total_rewards_earned,[\s\S]*v_computed_reward/);
});

test("new migration keeps duplicate-payout protection and service-role-only execution", () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /IF v_reward_paid THEN\s+RETURN;\s+END IF;/);
  assert.match(migration, /UPDATE public\.user_wallets\s+SET berries = berries \+ v_computed_reward/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.award_grand_line_guess_reward\(uuid, uuid, integer, integer\) FROM PUBLIC/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.award_grand_line_guess_reward\(uuid, uuid, integer, integer\) FROM anon/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.award_grand_line_guess_reward\(uuid, uuid, integer, integer\) FROM authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.award_grand_line_guess_reward\(uuid, uuid, integer, integer\) TO service_role/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
});

test("new migration writes one positive Grand Line Guess reward ledger entry", () => {
  const positiveRewardBlock = between(
    migration,
    "IF v_computed_reward > 0 THEN",
    "  UPDATE public.grand_line_guess_results",
  );
  const outsidePositiveRewardBlock = migration.replace(positiveRewardBlock, "");

  assert.match(positiveRewardBlock, /INSERT INTO public\.wallet_ledger_entries/i);
  assert.match(positiveRewardBlock, /'reward'/i);
  assert.match(positiveRewardBlock, /v_computed_reward/);
  assert.match(positiveRewardBlock, /v_wallet_balance/);
  assert.match(positiveRewardBlock, /'grand_line_guess'/i);
  assert.match(positiveRewardBlock, /v_result_id/);
  assert.match(positiveRewardBlock, /'grand_line_guess:' \|\| v_result_id::text/i);
  assert.match(positiveRewardBlock, /'Grand Line Guess reward'/i);
  assert.match(positiveRewardBlock, /'puzzleId', _puzzle_id/i);
  assert.match(positiveRewardBlock, /'resultId', v_result_id/i);
  assert.match(positiveRewardBlock, /'attemptNumber', v_attempt_number/i);
  assert.match(positiveRewardBlock, /'rewardAmount', v_computed_reward/i);
  assert.match(positiveRewardBlock, /ON CONFLICT \(idempotency_key\) DO NOTHING/i);
  assert.doesNotMatch(outsidePositiveRewardBlock, /INSERT INTO public\.wallet_ledger_entries/i);
});

test("new migration avoids unsafe reward-history writes and invalid special expressions", () => {
  assert.doesNotMatch(migrationWithoutComments, /pg_catalog\.GREATEST|pg_catalog\.LEAST/i);
  assert.doesNotMatch(migrationWithoutComments, /\bpublic\.transactions\b|\btransactions\b/i);
  assert.doesNotMatch(migrationWithoutComments, /\buser_holdings\b|\bprice_history\b|\bdaily_crew\b/i);
  assert.doesNotMatch(migrationWithoutComments, /entry_type\s*=\s*'trivia'|'trivia'/i);
});
