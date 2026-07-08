/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/lib/api/grand-line-guess.functions.ts"), "utf8");
const routeSource = readFileSync(join(process.cwd(), "src/routes/games.grand-line-guess.tsx"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260708010000_update_grand_line_guess_reward_formula.sql"),
  "utf8",
);

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
  assert.doesNotMatch(wrongGuessBranch, /awardGrandLineGuessReward|awardGrandLineGuessRewardSafely|user_wallets|berries\s*[-=]/);
});

test("correct guesses use the award path and payout failures return contained state", () => {
  const correctGuessBranch = between(source, "if (isCorrect) {", "} else {\n      // ensure result row");

  assert.match(correctGuessBranch, /const reward = rewardForAttempt\(attemptNumber\)/);
  assert.match(correctGuessBranch, /awardGrandLineGuessRewardSafely\(db/);
  assert.match(correctGuessBranch, /reward_error: rewardError/);
  assert.match(source, /async function awardGrandLineGuessRewardSafely/);
  assert.match(routeSource, /role="alert"/);
  assert.match(routeSource, /Retry reward payout/);
  assert.match(routeSource, /setSubmissionError/);
});

test("duplicate correct submissions retry the idempotent award path without trusting the client", () => {
  const duplicateBranch = between(source, "if (duplicateAttempt) {", "const attemptNumber =");

  assert.match(duplicateBranch, /duplicateAttempt\.is_correct/);
  assert.match(duplicateBranch, /awardGrandLineGuessRewardSafely\(db/);
  assert.match(duplicateBranch, /rewardForAttempt\(duplicateAttempt\.attempt_number\)/);
  assert.match(duplicateBranch, /reward_error: rewardError/);
  assert.match(duplicateBranch, /throw new Error\("You already guessed that character\."\)/);
});

test("new migration replaces the authoritative RPC formula and accepts reward 0", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.award_grand_line_guess_reward/);
  assert.match(migration, /_reward_amount integer/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /v_wrong_guesses := pg_catalog\.GREATEST\(v_attempt_number - 1, 0\)/);
  assert.match(migration, /v_computed_reward := pg_catalog\.GREATEST\(0, 1000 - \(100 \* v_wrong_guesses\)\)/);
  assert.doesNotMatch(migration, /WHEN v_attempt_number = 1 THEN 750|WHEN v_attempt_number = 2 THEN 600|WHEN v_attempt_number = 3 THEN 500/);
  assert.doesNotMatch(migration, /_reward_amount\s*(?:<=|<)\s*0|v_computed_reward\s*(?:<=|<)\s*0/);
});

test("new migration ignores client reward amounts and pays the database-calculated reward", () => {
  assert.doesNotMatch(migration, /_reward_amount\s+IS\s+DISTINCT\s+FROM/);
  assert.doesNotMatch(migration, /reward_amount\s*=\s*_reward_amount/);
  assert.doesNotMatch(migration, /berries\s*=\s*berries\s*\+\s*_reward_amount/);
  assert.doesNotMatch(migration, /total_rewards_earned\s*[,=][\s\S]*_reward_amount/);
  assert.match(migration, /SET berries = berries \+ v_computed_reward/);
  assert.match(migration, /reward_amount = v_computed_reward/);
  assert.match(migration, /total_rewards_earned,[\s\S]*v_computed_reward/);
});

test("new migration keeps duplicate-payout protection and service-role-only execution", () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /IF v_reward_paid THEN\s+RETURN true;\s+END IF;/);
  assert.match(migration, /UPDATE public\.user_wallets\s+SET berries = berries \+ v_computed_reward/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.award_grand_line_guess_reward\(uuid, uuid, integer, integer\) FROM anon/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.award_grand_line_guess_reward\(uuid, uuid, integer, integer\) FROM authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.award_grand_line_guess_reward\(uuid, uuid, integer, integer\) TO service_role/);
});
