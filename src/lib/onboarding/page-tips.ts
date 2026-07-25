import type { OnboardingProgressState } from "./progress";

export type PageTip = {
  id: string;
  version: number;
  route: string;
  title: string;
  body: string;
};

export const PAGE_TIP_VERSION = 1;

export const PAGE_TIPS = [
  {
    id: "market.overview",
    version: PAGE_TIP_VERSION,
    route: "/",
    title: "MARKET",
    body: "Browse character stocks, review their current prices, and open a listing when you are ready to buy or sell.",
  },
  {
    id: "portfolio.overview",
    version: PAGE_TIP_VERSION,
    route: "/portfolio",
    title: "PORTFOLIO",
    body: "Your cash, holdings, average cost, position values, and profit or loss are tracked here.",
  },
  {
    id: "portfolio.pnl",
    version: PAGE_TIP_VERSION,
    route: "/portfolio",
    title: "PORTFOLIO",
    body: "Unrealized P&L changes while you hold a stock. Realized P&L is recorded when you sell it.",
  },
  {
    id: "market_bulletin.overview",
    version: PAGE_TIP_VERSION,
    route: "/market-bulletin",
    title: "MARKET BULLETIN",
    body: "Published events explain major market developments and the reasons character prices changed.",
  },
  {
    id: "ranks.overview",
    version: PAGE_TIP_VERSION,
    route: "/leaderboards",
    title: "RANKS",
    body: "Leaderboards compare players using the selected performance metric. Your position changes as your portfolio and results change.",
  },
  {
    id: "games.overview",
    version: PAGE_TIP_VERSION,
    route: "/games",
    title: "GAMES",
    body: "Daily games are optional side activities. They can award Berries and progression, but they are separate from stock trading.",
  },
  {
    id: "legacy.overview",
    version: PAGE_TIP_VERSION,
    route: "/legacy-log",
    title: "LEGACY",
    body: "Achievements, reputation, titles, streaks, and long-term records are tracked here. Locked achievements show your next milestones.",
  },
  {
    id: "profile.overview",
    version: PAGE_TIP_VERSION,
    route: "/profile",
    title: "PROFILE",
    body: "Manage your public identity and review the accomplishments shown on your public profile.",
  },
] as const satisfies readonly PageTip[];

export function pageTipsForPath(pathname: string, state: OnboardingProgressState | null) {
  if (!state || state.pageTipsDisabled) return [];
  if (isPageTipsExcluded(pathname)) return [];
  const route = normalizeTipRoute(pathname);
  if (!route) return [];
  if (route === "/" && state.stockTutorialStatus !== "skipped") return [];
  if (
    route === "/portfolio" &&
    (state.stockTutorialStatus === "in_progress" ||
      (state.stockTutorialStatus === "not_started" && state.stockTutorialOffer === "soft"))
  ) {
    return [];
  }

  return PAGE_TIPS.filter((tip) => tip.route === route).filter(
    (tip) => state.pageTipVersions[tip.id] !== tip.version,
  );
}

export function isPageTipsExcluded(pathname: string) {
  return (
    pathname === "/auth" ||
    pathname === "/reset-password" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/admin") ||
    pathname.endsWith("-admin") ||
    pathname.startsWith("/character/") ||
    pathname.startsWith("/games/")
  );
}

export function normalizeTipRoute(pathname: string) {
  if (pathname === "/") return "/";
  if (pathname === "/portfolio") return "/portfolio";
  if (pathname === "/market-bulletin") return "/market-bulletin";
  if (pathname === "/leaderboards") return "/leaderboards";
  if (pathname === "/games") return "/games";
  if (pathname === "/legacy-log") return "/legacy-log";
  if (pathname === "/profile") return "/profile";
  return null;
}

export function pageTipDedupeKey(eventName: "page_tip_seen" | "page_tip_completed", tip: PageTip) {
  return `${eventName}:${tip.id}:v${tip.version}`;
}
