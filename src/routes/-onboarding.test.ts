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

const onboardingRoute = read("src/routes/_authenticated/onboarding.tsx");
const terminalShellSource = read("src/components/TerminalShell.tsx");
const profileSource = read("src/routes/_authenticated/profile.tsx");
const portfolioSource = read("src/routes/_authenticated/portfolio.tsx");
const pageCoachSource = read("src/components/onboarding/PageCoachCard.tsx");
const onboardingExperienceSource = read("src/components/onboarding/OnboardingExperience.tsx");
const sessionBypassSource = read("src/lib/onboarding/session-bypass.ts");
const routeTreeSource = read("src/routeTree.gen.ts");

test("authenticated onboarding route is registered and uses a simulated stock practice flow", () => {
  assert.match(onboardingRoute, /createFileRoute\("\/_authenticated\/onboarding"\)/);
  assert.match(onboardingRoute, /validateSearch/);
  assert.match(onboardingRoute, /replay: raw\.replay === true \|\| raw\.replay === "true"/);
  assert.match(onboardingRoute, /WELCOME TO BERRY STREET/);
  assert.match(onboardingRoute, /Build a portfolio by trading One Piece character stocks/);
  assert.match(onboardingRoute, /START PRACTICE TRADE/);
  assert.match(onboardingRoute, /About 90 seconds/);
  assert.match(onboardingRoute, /EXPLORE ON MY OWN/);
  assert.match(onboardingRoute, /You can replay the tutorial later from your Profile\./);
  assert.match(
    onboardingRoute,
    /PRACTICE MODE — No real Berries, holdings, statistics, or rewards will change\./,
  );
  assert.match(onboardingRoute, /stepTitleRef\.current\?\.focus\(\)/);
  assert.match(onboardingRoute, /Practice Listing/);
  assert.match(onboardingRoute, /No real order is\s+placed/);
  assert.doesNotMatch(
    onboardingRoute,
    /buyShares|sellShares|executeTrade|execute_trade_authenticated/,
  );
  assert.doesNotMatch(onboardingRoute, /user_wallets|transactions|wallet_ledger_entries/);
});

test("tutorial route uses exact resume and completion screens", () => {
  assert.match(onboardingRoute, /PRACTICE TRADE IN PROGRESS/);
  assert.match(onboardingRoute, /Your practice progress was saved\./);
  assert.match(onboardingRoute, /RESUME PRACTICE/);
  assert.match(onboardingRoute, /START OVER/);
  assert.match(onboardingRoute, /SKIP TUTORIAL/);
  assert.match(onboardingRoute, /PRACTICE TRADE COMPLETE/);
  assert.match(onboardingRoute, /You bought 10 shares for/);
  assert.match(onboardingRoute, /Realized practice profit:/);
  assert.match(
    onboardingRoute,
    /No real Berries, holdings, statistics, achievements, or leaderboard values were changed\./,
  );
  assert.match(onboardingRoute, /ENTER THE MARKET/);
  assert.doesNotMatch(onboardingRoute, /You practiced the full buy-and-sell loop/);
  assert.doesNotMatch(onboardingRoute, /Browse market|Practice again|Finish practice/);
});

test("tutorial route gates every practice step behind the required control", () => {
  assert.match(onboardingRoute, /type: "select_listing"/);
  assert.match(onboardingRoute, /Select the practice stock to open its trade panel\./);
  assert.match(onboardingRoute, /type: "enter_berry_amount"/);
  assert.match(onboardingRoute, /type: "apply_berry_amount"/);
  assert.match(onboardingRoute, /For this practice trade, invest/);
  assert.match(onboardingRoute, /Enter exactly 1000 for this practice trade\./);
  assert.match(onboardingRoute, /type: "confirm_practice_buy"/);
  assert.match(onboardingRoute, /CONFIRM PRACTICE BUY/);
  assert.match(onboardingRoute, /type: "acknowledge_price_movement"/);
  assert.match(onboardingRoute, /type: "select_all_shares"/);
  assert.match(onboardingRoute, /type: "confirm_practice_sale"/);
  assert.match(onboardingRoute, /CONFIRM PRACTICE SALE/);
  assert.match(onboardingRoute, /disabled=\{busy \|\| interaction\.selectedSellShares !== 10\}/);
  assert.doesNotMatch(onboardingRoute, /nextStep\(/);
});

test("tutorial route saves progress, supports skip, and replays without rewriting completion", () => {
  assert.match(onboardingRoute, /startMyStockTutorial/);
  assert.match(onboardingRoute, /saveMyStockTutorialStep/);
  assert.match(onboardingRoute, /completeMyStockTutorial/);
  assert.match(onboardingRoute, /skipMyStockTutorial/);
  assert.match(onboardingRoute, /setOnboardingSessionBypass/);
  assert.match(onboardingRoute, /clearOnboardingSessionBypass/);
  assert.match(onboardingRoute, /isReplay/);
  assert.match(
    onboardingRoute,
    /if \(isReplay\) \{\s*setInteraction\(next\);\s*setFinishedPractice\(true\);\s*return;\s*\}/,
  );
  assert.match(onboardingRoute, /completedStepKey: "step_5"/);
  assert.doesNotMatch(onboardingRoute, /completeMyStockTutorial\(\{[\s\S]*replay: true/);
  assert.match(
    onboardingRoute,
    /await completeMyStockTutorial\(\{ data: \{ completedStepKey: "step_5" \} \}\);\s*clearOnboardingSessionBypass\(\)/,
  );
  assert.match(onboardingRoute, /if \(isReplay\) \{\s*clearOnboardingSessionBypass\(\)/);
  assert.match(onboardingRoute, /if \(!isReplay\) setOnboardingSessionBypass\(\)/);
});

test("TerminalShell installs optional onboarding without changing navigation", () => {
  assert.match(terminalShellSource, /OnboardingExperience/);
  assert.match(terminalShellSource, /<OnboardingExperience signedIn=\{!!user\} \/>/);
  assert.match(routeTreeSource, /AuthenticatedOnboardingRouteImport/);
  assert.match(routeTreeSource, /'\/onboarding': typeof AuthenticatedOnboardingRoute/);
  assert.match(
    routeTreeSource,
    /'\/_authenticated\/onboarding': typeof AuthenticatedOnboardingRoute/,
  );
  assert.match(routeTreeSource, /import type \{ getRouter \} from '\.\/router\.tsx'/);
  assert.match(routeTreeSource, /declare module '@tanstack\/react-start'/);
});

test("page coach is accessible and can be dismissed or skipped", () => {
  assert.match(pageCoachSource, /aria-labelledby="page-coach-title"/);
  assert.match(pageCoachSource, /useRef/);
  assert.match(pageCoachSource, /headingRef\.current\?\.focus\(\)/);
  assert.match(pageCoachSource, /tabIndex=\{-1\}/);
  assert.match(pageCoachSource, /\[tip\.id, tip\.version\]/);
  assert.match(pageCoachSource, /Close/);
  assert.match(pageCoachSource, /Skip tips/);
  assert.match(pageCoachSource, /Got it/);
  assert.match(pageCoachSource, /Tip \{currentIndex \+ 1\} \/ \{total\}/);

  assert.match(onboardingExperienceSource, /shouldAutoOpenOnboarding/);
  assert.match(onboardingExperienceSource, /hasOnboardingSessionBypass/);
  assert.match(onboardingExperienceSource, /pageTipsForPath/);
  assert.match(onboardingExperienceSource, /dismissMyPageTip/);
  assert.match(onboardingExperienceSource, /skipMyPageTips/);
  assert.match(onboardingExperienceSource, /recordMyOnboardingEvent/);
  assert.match(onboardingExperienceSource, /onClose=\{\(\) => void dismissCurrentTip\(false\)\}/);
  assert.match(
    onboardingExperienceSource,
    /setHiddenTipIds\(\(current\) => new Set\(current\)\.add\(currentTip\.id\)\)/,
  );
  assert.doesNotMatch(onboardingExperienceSource, /eventName: "onboarding_offer_seen"/);
  assert.match(
    onboardingExperienceSource,
    /catch\(\(\) => logOnboardingUiFailure\("page_tip_seen"\)\)/,
  );
  assert.doesNotMatch(onboardingExperienceSource, /export function clearOnboardingSessionBypass/);
  assert.match(
    sessionBypassSource,
    /window\.sessionStorage\.setItem\(ONBOARDING_SESSION_BYPASS_KEY, "1"\)/,
  );
  assert.match(
    sessionBypassSource,
    /window\.sessionStorage\.removeItem\(ONBOARDING_SESSION_BYPASS_KEY\)/,
  );
});

test("Profile exposes tutorial replay and page-tip controls without disturbing deletion", () => {
  assert.match(profileSource, /Help & Tutorials/);
  assert.match(profileSource, /Replay practice trade/);
  assert.match(profileSource, /REPLAY PAGE TIPS/);
  assert.match(profileSource, /SKIP REMAINING PAGE TIPS/);
  assert.match(profileSource, /startMyStockTutorial/);
  assert.match(profileSource, /skipMyStockTutorial/);
  assert.match(profileSource, /resetMyPageTips/);
  assert.match(profileSource, /skipMyPageTips/);
  assert.match(profileSource, /clearOnboardingSessionBypass/);
  assert.match(
    profileSource,
    /startMyStockTutorial\(\{ data: \{ restart, source: "profile" \} \}\)/,
  );
  assert.match(profileSource, /startMyStockTutorial\(\{ data: \{ replay: true \} \}\)/);
  assert.match(profileSource, /!onboardingQ\.data\.pageTipsDisabled &&/);

  const deleteBlock = sourceBetween(
    profileSource,
    '<div className="terminal-panel border-bear/60">',
    "<Dialog",
  );
  assert.match(deleteBlock, /DELETE ACCOUNT/);
  assert.match(deleteBlock, /This cannot be undone\./);
  assert.match(deleteBlock, /onClick=\{openDeleteDialog\}/);
  assert.doesNotMatch(deleteBlock, /onboarding|tutorial|page tips/i);
});

test("Portfolio soft prompt is optional and does not modify trading behavior", () => {
  assert.match(portfolioSource, /Practice Trading/);
  assert.match(portfolioSource, /Start practice trade/);
  assert.match(portfolioSource, /Resume practice trade/);
  assert.match(portfolioSource, /Skip tutorial/);
  assert.match(
    portfolioSource,
    /does not change your\s+wallet, holdings, stats, prices, or trade history/,
  );
  assert.match(portfolioSource, /showTutorialCard/);
  assert.match(portfolioSource, /stockTutorialOffer === "soft"/);
  assert.match(portfolioSource, /eventName: "onboarding_offer_seen"/);
  assert.match(portfolioSource, /metadata: \{ offer: "soft" \}/);
  assert.match(portfolioSource, /clearOnboardingSessionBypass/);
  assert.match(
    portfolioSource,
    /startMyStockTutorial\(\{ data: \{ restart, source: "portfolio" \} \}\)/,
  );
  assert.match(
    portfolioSource,
    /sellShares\(\{ data: \{ slug, shares: sellSharesQuantity, requestId \} \}\)/,
  );
  assert.doesNotMatch(portfolioSource, /buyShares\(/);
});
