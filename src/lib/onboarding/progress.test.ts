/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  completeStockTutorial,
  createFirstLoginOnboardingState,
  createSoftOnboardingState,
  dismissPageTip,
  isUntouchedOnboardingState,
  ONBOARDING_SESSION_BYPASS_KEY,
  promoteUntouchedOnboardingState,
  resetPageTips,
  restartStockTutorial,
  saveStockTutorialStep,
  shouldAutoOpenOnboarding,
  skipAllPageTips,
  skipStockTutorial,
  startStockTutorial,
} from "./progress.ts";

const now = "2026-07-25T12:00:00.000Z";

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

test("missing onboarding row recovery creates first-login tutorial state for every account", () => {
  const state = createFirstLoginOnboardingState();

  assert.equal(state.stockTutorialStatus, "not_started");
  assert.equal(state.stockTutorialOffer, "first_login");
  assert.equal(state.stockTutorialLastStep, 0);
  assert.equal(state.pageTipsDisabled, false);
  assert.deepEqual(state.pageTipVersions, {});
  assert.equal(state.startedAt, null);
  assert.equal(state.completedAt, null);
  assert.equal(state.skippedAt, null);
  assert.equal(shouldAutoOpenOnboarding(state, { pathname: "/", hasSessionBypass: false }), true);
});

test("untouched soft and none rows are promoted to first-login once", () => {
  for (const offer of ["soft", "none"] as const) {
    const state = {
      ...createSoftOnboardingState(),
      stockTutorialOffer: offer,
      pageTipsDisabled: true,
    };
    const promoted = promoteUntouchedOnboardingState(state);

    assert.equal(isUntouchedOnboardingState(state), true);
    assert.equal(promoted.stockTutorialStatus, "not_started");
    assert.equal(promoted.stockTutorialOffer, "first_login");
    assert.equal(promoted.pageTipsDisabled, false);
    assert.equal(promoted.stockTutorialLastStep, 0);
    assert.equal(promoted.startedAt, null);
    assert.equal(promoted.completedAt, null);
    assert.equal(promoted.skippedAt, null);
    assert.equal(
      shouldAutoOpenOnboarding(promoted, { pathname: "/", hasSessionBypass: false }),
      true,
    );
  }
});

test("existing first-login and decided onboarding rows remain unchanged", () => {
  const firstLogin = createFirstLoginOnboardingState();
  const soft = createSoftOnboardingState();
  const inProgress = startStockTutorial(soft, now);
  const completed = completeStockTutorial(inProgress, now);
  const skipped = skipStockTutorial(soft, now);
  const withLastStep = { ...soft, stockTutorialLastStep: 1 };
  const withStartedAt = { ...soft, startedAt: now };
  const withCompletedAt = { ...soft, completedAt: now };
  const withSkippedAt = { ...soft, skippedAt: now };

  for (const state of [
    firstLogin,
    inProgress,
    completed,
    skipped,
    withLastStep,
    withStartedAt,
    withCompletedAt,
    withSkippedAt,
  ]) {
    assert.strictEqual(promoteUntouchedOnboardingState(state), state);
  }

  assert.equal(
    shouldAutoOpenOnboarding(firstLogin, { pathname: "/", hasSessionBypass: false }),
    true,
  );
  assert.equal(
    shouldAutoOpenOnboarding(inProgress, { pathname: "/", hasSessionBypass: false }),
    true,
  );
  assert.equal(
    shouldAutoOpenOnboarding(completed, { pathname: "/", hasSessionBypass: false }),
    false,
  );
  assert.equal(
    shouldAutoOpenOnboarding(skipped, { pathname: "/", hasSessionBypass: false }),
    false,
  );
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
