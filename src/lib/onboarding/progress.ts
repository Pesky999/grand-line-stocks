export const STOCK_TUTORIAL_VERSION = 1;
export const STOCK_TUTORIAL_FINAL_STEP = 5;
export const ONBOARDING_SESSION_BYPASS_KEY = `berry-street:stock-tutorial-exit:v${STOCK_TUTORIAL_VERSION}`;

export const STOCK_TUTORIAL_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "skipped",
] as const;
export type StockTutorialStatus = (typeof STOCK_TUTORIAL_STATUSES)[number];

export const STOCK_TUTORIAL_OFFERS = ["first_login", "soft", "none"] as const;
export type StockTutorialOffer = (typeof STOCK_TUTORIAL_OFFERS)[number];

export type OnboardingProgressState = {
  stockTutorialVersion: number;
  stockTutorialStatus: StockTutorialStatus;
  stockTutorialOffer: StockTutorialOffer;
  stockTutorialLastStep: number;
  pageTipsDisabled: boolean;
  pageTipVersions: Record<string, number>;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
};

export function createSoftOnboardingState(): OnboardingProgressState {
  return {
    stockTutorialVersion: STOCK_TUTORIAL_VERSION,
    stockTutorialStatus: "not_started",
    stockTutorialOffer: "soft",
    stockTutorialLastStep: 0,
    pageTipsDisabled: false,
    pageTipVersions: {},
    startedAt: null,
    completedAt: null,
    skippedAt: null,
  };
}

export function shouldAutoOpenOnboarding(
  state: Pick<
    OnboardingProgressState,
    "stockTutorialStatus" | "stockTutorialOffer" | "stockTutorialVersion"
  > | null,
  options: { pathname: string; hasSessionBypass: boolean },
) {
  if (!state) return false;
  if (isExcludedOnboardingPath(options.pathname)) return false;
  if (state.stockTutorialVersion !== STOCK_TUTORIAL_VERSION) return false;
  if (state.stockTutorialStatus === "not_started") {
    return state.stockTutorialOffer === "first_login";
  }
  if (state.stockTutorialStatus === "in_progress") {
    return !options.hasSessionBypass;
  }
  return false;
}

export function isExcludedOnboardingPath(pathname: string) {
  return (
    pathname === "/auth" ||
    pathname === "/reset-password" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/admin") ||
    pathname.endsWith("-admin")
  );
}

export function normalizeTutorialStep(step: number) {
  if (!Number.isFinite(step)) return 1;
  return Math.min(STOCK_TUTORIAL_FINAL_STEP, Math.max(1, Math.trunc(step)));
}

export function startStockTutorial(
  state: OnboardingProgressState,
  nowIso: string,
): OnboardingProgressState {
  return {
    ...state,
    stockTutorialStatus: "in_progress",
    stockTutorialOffer: "none",
    stockTutorialLastStep: 1,
    startedAt: state.stockTutorialStatus === "skipped" ? nowIso : (state.startedAt ?? nowIso),
    skippedAt: null,
  };
}

export function restartStockTutorial(
  state: OnboardingProgressState,
  nowIso: string,
): OnboardingProgressState {
  return {
    ...state,
    stockTutorialStatus: "in_progress",
    stockTutorialOffer: "none",
    stockTutorialLastStep: 1,
    startedAt: state.stockTutorialStatus === "skipped" ? nowIso : (state.startedAt ?? nowIso),
    skippedAt: null,
  };
}

export function saveStockTutorialStep(
  state: OnboardingProgressState,
  step: number,
): OnboardingProgressState {
  return {
    ...state,
    stockTutorialStatus: state.stockTutorialStatus === "completed" ? "completed" : "in_progress",
    stockTutorialOffer: "none",
    stockTutorialLastStep: normalizeTutorialStep(step),
  };
}

export function completeStockTutorial(
  state: OnboardingProgressState,
  nowIso: string,
): OnboardingProgressState {
  return {
    ...state,
    stockTutorialStatus: "completed",
    stockTutorialOffer: "none",
    stockTutorialLastStep: STOCK_TUTORIAL_FINAL_STEP,
    completedAt: state.completedAt ?? nowIso,
    skippedAt: null,
  };
}

export function skipStockTutorial(
  state: OnboardingProgressState,
  nowIso: string,
): OnboardingProgressState {
  return {
    ...state,
    stockTutorialStatus: "skipped",
    stockTutorialOffer: "none",
    skippedAt: nowIso,
  };
}

export function dismissPageTip(
  state: OnboardingProgressState,
  tipId: string,
  version: number,
): OnboardingProgressState {
  return {
    ...state,
    pageTipVersions: {
      ...state.pageTipVersions,
      [tipId]: version,
    },
  };
}

export function skipAllPageTips(state: OnboardingProgressState): OnboardingProgressState {
  return {
    ...state,
    pageTipsDisabled: true,
  };
}

export function resetPageTips(state: OnboardingProgressState): OnboardingProgressState {
  return {
    ...state,
    pageTipsDisabled: false,
    pageTipVersions: {},
  };
}
