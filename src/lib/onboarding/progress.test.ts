/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  createSoftOnboardingState,
  FIRST_LOGIN_ONBOARDING_RECOVERY_WINDOW_MS,
  dismissPageTip,
  ONBOARDING_SESSION_BYPASS_KEY,
  recoverMissingOnboardingProgressState,
  resetPageTips,
  restartStockTutorial,
  saveStockTutorialStep,
  shouldAutoOpenOnboarding,
  skipAllPageTips,
  skipStockTutorial,
  startStockTutorial,
  completeStockTutorial,
} from "./progress.ts";

const now = "2026-07-25T12:00:00.000Z";
const nowMs = Date.parse(now);

test("stock tutorial transitions cover start, resume, restart, skip, and complete", () => {
  const soft = createSoftOnboardingState();
  assert.equal(soft.stockTutorialOffer, "soft");

  const started = startStockTutorial(soft, now);
  assert.equal(started.stockTutorialStatus, "in_progress");
  assert.equal(started.stockTutorialLastStep, 1);
  assert.equal(started.startedAt, now);
  assert.equal(started.stockTutorialOffer, "none");

  const saved = saveStockTutorialStep(started, 4);
  assert.equal(saved.stockTutorialLastStep, 4);
  assert.equal(saved.startedAt, now);

  const restarted = restartStockTutorial(saved, "2026-07-25T12:05:00.000Z");
  assert.equal(restarted.stockTutorialLastStep, 1);
  assert.equal(restarted.startedAt, now);

  const skipped = skipStockTutorial(restarted, "2026-07-25T12:10:00.000Z");
  assert.equal(skipped.stockTutorialStatus, "skipped");
  assert.equal(skipped.skippedAt, "2026-07-25T12:10:00.000Z");
  assert.equal(skipped.stockTutorialOffer, "none");

  const restartedFromSkipped = restartStockTutorial(skipped, "2026-07-25T12:12:00.000Z");
  assert.equal(restartedFromSkipped.stockTutorialStatus, "in_progress");
  assert.equal(restartedFromSkipped.startedAt, "2026-07-25T12:12:00.000Z");
  assert.equal(restartedFromSkipped.skippedAt, null);

  const completed = completeStockTutorial(started, "2026-07-25T12:15:00.000Z");
  assert.equal(completed.stockTutorialStatus, "completed");
  assert.equal(completed.stockTutorialLastStep, 5);
  assert.equal(completed.completedAt, "2026-07-25T12:15:00.000Z");
  assert.equal(completed.skippedAt, null);
});

test("replay after completion preserves completed status and timestamp in pure transitions", () => {
  const completed = completeStockTutorial(
    startStockTutorial(createSoftOnboardingState(), now),
    now,
  );
  const replayStart = saveStockTutorialStep(completed, 1);

  assert.equal(replayStart.stockTutorialStatus, "completed");
  assert.equal(replayStart.completedAt, now);
  assert.equal(replayStart.stockTutorialOffer, "none");
});

test("first-login gate fails open and respects current-session bypass", () => {
  const firstLogin = {
    ...createSoftOnboardingState(),
    stockTutorialOffer: "first_login" as const,
  };
  assert.equal(
    shouldAutoOpenOnboarding(firstLogin, { pathname: "/", hasSessionBypass: false }),
    true,
  );
  assert.equal(
    shouldAutoOpenOnboarding(
      { ...firstLogin, stockTutorialOffer: "soft" },
      { pathname: "/portfolio", hasSessionBypass: false },
    ),
    false,
  );
  assert.equal(
    shouldAutoOpenOnboarding(
      { ...firstLogin, stockTutorialOffer: "none" },
      { pathname: "/", hasSessionBypass: false },
    ),
    false,
  );
  assert.equal(
    shouldAutoOpenOnboarding(
      { ...firstLogin, stockTutorialStatus: "in_progress" },
      { pathname: "/portfolio", hasSessionBypass: false },
    ),
    true,
  );
  assert.equal(
    shouldAutoOpenOnboarding(
      { ...firstLogin, stockTutorialStatus: "in_progress" },
      { pathname: "/portfolio", hasSessionBypass: true },
    ),
    false,
  );
  assert.equal(
    shouldAutoOpenOnboarding(firstLogin, { pathname: "/onboarding", hasSessionBypass: false }),
    false,
  );
  assert.equal(ONBOARDING_SESSION_BYPASS_KEY, "berry-street:stock-tutorial-exit:v1");
});

test("missing onboarding row recovery classifies genuinely new accounts as first login", () => {
  const state = recoverMissingOnboardingProgressState({
    profileCreatedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(),
    hasTransactions: false,
    nowMs,
  });

  assert.equal(FIRST_LOGIN_ONBOARDING_RECOVERY_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.equal(state.stockTutorialStatus, "not_started");
  assert.equal(state.stockTutorialOffer, "first_login");
  assert.equal(state.stockTutorialLastStep, 0);
  assert.equal(state.pageTipsDisabled, false);
  assert.equal(shouldAutoOpenOnboarding(state, { pathname: "/", hasSessionBypass: false }), true);
});

test("missing onboarding row recovery preserves soft offer for older inactive profiles", () => {
  const state = recoverMissingOnboardingProgressState({
    profileCreatedAt: new Date(nowMs - FIRST_LOGIN_ONBOARDING_RECOVERY_WINDOW_MS - 1).toISOString(),
    hasTransactions: false,
    nowMs,
  });

  assert.equal(state.stockTutorialStatus, "not_started");
  assert.equal(state.stockTutorialOffer, "soft");
  assert.equal(state.stockTutorialLastStep, 0);
  assert.equal(state.pageTipsDisabled, false);
  assert.equal(shouldAutoOpenOnboarding(state, { pathname: "/", hasSessionBypass: false }), false);
});

test("missing onboarding row recovery disables prompts for users with existing transactions", () => {
  const state = recoverMissingOnboardingProgressState({
    profileCreatedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(),
    hasTransactions: true,
    nowMs,
  });

  assert.equal(state.stockTutorialStatus, "not_started");
  assert.equal(state.stockTutorialOffer, "none");
  assert.equal(state.stockTutorialLastStep, 0);
  assert.equal(state.pageTipsDisabled, true);
  assert.equal(shouldAutoOpenOnboarding(state, { pathname: "/", hasSessionBypass: false }), false);
});

test("missing onboarding row recovery fails open to soft when classification is unavailable", () => {
  for (const classification of [
    null,
    { profileCreatedAt: null, hasTransactions: false, nowMs },
    { profileCreatedAt: "not-a-date", hasTransactions: false, nowMs },
  ]) {
    const state = recoverMissingOnboardingProgressState(classification);

    assert.equal(state.stockTutorialStatus, "not_started");
    assert.equal(state.stockTutorialOffer, "soft");
    assert.equal(state.pageTipsDisabled, false);
    assert.equal(
      shouldAutoOpenOnboarding(state, { pathname: "/", hasSessionBypass: false }),
      false,
    );
  }
});

test("existing onboarding rows remain unchanged by normal tutorial states", () => {
  const firstLogin = recoverMissingOnboardingProgressState({
    profileCreatedAt: now,
    hasTransactions: false,
    nowMs,
  });
  const soft = createSoftOnboardingState();
  const inProgress = startStockTutorial(soft, now);
  const completed = completeStockTutorial(inProgress, now);
  const skipped = skipStockTutorial(soft, now);

  assert.deepEqual(
    firstLogin,
    recoverMissingOnboardingProgressState({
      profileCreatedAt: now,
      hasTransactions: false,
      nowMs,
    }),
  );
  assert.equal(soft.stockTutorialOffer, "soft");
  assert.equal(inProgress.stockTutorialStatus, "in_progress");
  assert.equal(completed.stockTutorialStatus, "completed");
  assert.equal(skipped.stockTutorialStatus, "skipped");
});

test("page-tip transitions are versioned and replayable", () => {
  const state = createSoftOnboardingState();
  const dismissed = dismissPageTip(state, "portfolio.overview", 1);
  assert.deepEqual(dismissed.pageTipVersions, { "portfolio.overview": 1 });

  const skipped = skipAllPageTips(dismissed);
  assert.equal(skipped.pageTipsDisabled, true);

  const replayed = resetPageTips(skipped);
  assert.equal(replayed.pageTipsDisabled, false);
  assert.deepEqual(replayed.pageTipVersions, {});
});
