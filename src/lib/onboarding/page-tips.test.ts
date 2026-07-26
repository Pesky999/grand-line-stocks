/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { createSoftOnboardingState } from "./progress.ts";
import {
  PAGE_TIPS,
  PAGE_TIPS_REPLAYED_EVENT,
  listenForPageTipsReplayed,
  notifyPageTipsReplayed,
  pageTipDedupeKey,
  pageTipsForPath,
} from "./page-tips.ts";

test("page tip route mapping and copy match the approved stock-trading tour", () => {
  assert.deepEqual(
    PAGE_TIPS.map((tip) => tip.id),
    [
      "market.overview",
      "portfolio.overview",
      "portfolio.pnl",
      "market_bulletin.overview",
      "ranks.overview",
      "games.overview",
      "legacy.overview",
      "profile.overview",
    ],
  );
  assert.equal(PAGE_TIPS.filter((tip) => tip.route === "/portfolio").length, 2);
  assert.equal(PAGE_TIPS.find((tip) => tip.id === "market.overview")?.title, "MARKET");
  assert.match(PAGE_TIPS.find((tip) => tip.id === "portfolio.pnl")?.body ?? "", /Unrealized P&L/);
});

test("market tip requires skipped tutorial and excluded routes never show tips", () => {
  const state = createSoftOnboardingState();
  assert.equal(pageTipsForPath("/", state).length, 0);
  assert.equal(
    pageTipsForPath("/", { ...state, stockTutorialStatus: "skipped" })[0]?.id,
    "market.overview",
  );
  assert.equal(pageTipsForPath("/character/luffy", state).length, 0);
  assert.equal(pageTipsForPath("/games/grand-line-guess", state).length, 0);
  assert.equal(pageTipsForPath("/onboarding", state).length, 0);
});

test("page tips honor disabled and versioned completion state", () => {
  const state = createSoftOnboardingState();
  assert.equal(pageTipsForPath("/portfolio", state).length, 0);
  assert.deepEqual(
    pageTipsForPath("/portfolio", { ...state, stockTutorialStatus: "skipped" }).map(
      (tip) => tip.id,
    ),
    ["portfolio.overview", "portfolio.pnl"],
  );
  assert.deepEqual(
    pageTipsForPath("/portfolio", {
      ...state,
      stockTutorialStatus: "skipped",
      pageTipVersions: { "portfolio.overview": 1 },
    }).map((tip) => tip.id),
    ["portfolio.pnl"],
  );
  assert.equal(
    pageTipsForPath("/portfolio", {
      ...state,
      stockTutorialStatus: "skipped",
      pageTipsDisabled: true,
    }).length,
    0,
  );
});

test("page tip analytics use deterministic dedupe keys", () => {
  const tip = PAGE_TIPS[1];
  assert.equal(pageTipDedupeKey("page_tip_seen", tip), "page_tip_seen:portfolio.overview:v1");
  assert.equal(
    pageTipDedupeKey("page_tip_completed", tip),
    "page_tip_completed:portfolio.overview:v1",
  );
});

test("page tip replay notification is in-memory and clears mounted fallback state", () => {
  const originalWindow = globalThis.window;
  const listeners = new Map<string, Set<() => void>>();
  const fakeWindow = {
    addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
      const callback = listener as () => void;
      listeners.set(name, (listeners.get(name) ?? new Set()).add(callback));
    },
    removeEventListener(name: string, listener: EventListenerOrEventListenerObject) {
      listeners.get(name)?.delete(listener as () => void);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener();
      return true;
    },
  };

  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    configurable: true,
  });

  try {
    let replayCount = 0;
    const cleanup = listenForPageTipsReplayed(() => {
      replayCount += 1;
    });

    notifyPageTipsReplayed();
    assert.equal(replayCount, 1);
    assert.equal(listeners.get(PAGE_TIPS_REPLAYED_EVENT)?.size, 1);
    cleanup();
    notifyPageTipsReplayed();
    assert.equal(replayCount, 1);
  } finally {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  }
});
