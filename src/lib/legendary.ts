export const TITLE_LABEL: Record<string, string> = {
  rookie_pirate: "Rookie Pirate",
  east_blue_trader: "East Blue Trader",
  grand_line_investor: "Grand Line Investor",
  warlord_investor: "Warlord Investor",
  yonko_investor: "Yonko Investor",
  pirate_king_investor: "Pirate King Investor",
};

export const TITLE_LADDER = [
  { code: "rookie_pirate", label: TITLE_LABEL.rookie_pirate, threshold: 0 },
  { code: "east_blue_trader", label: TITLE_LABEL.east_blue_trader, threshold: 100 },
  { code: "grand_line_investor", label: TITLE_LABEL.grand_line_investor, threshold: 300 },
  { code: "warlord_investor", label: TITLE_LABEL.warlord_investor, threshold: 600 },
  { code: "yonko_investor", label: TITLE_LABEL.yonko_investor, threshold: 850 },
  { code: "pirate_king_investor", label: TITLE_LABEL.pirate_king_investor, threshold: 950 },
] as const;

export type InvestorTitleCode = (typeof TITLE_LADDER)[number]["code"];
export type InvestorTitleStatus = "current" | "complete" | "next" | "locked";

export const TITLE_TONE: Record<string, string> = {
  rookie_pirate: "text-muted-foreground border-muted-foreground/40",
  east_blue_trader: "text-foreground border-foreground/40",
  grand_line_investor: "text-primary border-primary/60",
  warlord_investor: "text-accent border-accent/60",
  yonko_investor: "text-bull border-bull/60",
  pirate_king_investor: "text-yellow-400 border-yellow-400/70",
};

export const SPEC_LABEL: Record<string, string> = {
  generalist: "Generalist",
  value_investor: "Value Investor",
  growth_investor: "Growth Investor",
  speculator: "Speculator",
  meme_investor: "Meme Investor",
  event_trader: "Event Trader",
  whale: "Whale",
};

export const SPEC_DESCRIPTION: Record<string, string> = {
  generalist: "Fallback when no specialization rule qualifies.",
  meme_investor: "More than 40% of lifetime buy volume is in meme-category characters.",
  speculator:
    "More than 50% of lifetime buy volume is in speculative characters, unless Meme Investor already qualifies.",
  value_investor:
    "More than 50% of lifetime buy volume is in blue-chip characters, unless a higher-priority volume rule qualifies.",
  growth_investor:
    "More than 50% of lifetime buy volume is in growth characters, unless a higher-priority volume rule qualifies.",
  event_trader:
    "At least 10 total trades and more than 30% of all trades occurred within two hours after a market event was published. This overrides the volume-based classifications.",
  whale: `Average current open-position value exceeds \u0E3F250,000 or net worth exceeds \u0E3F5,000,000. This is the final override.`,
};

export const SPEC_ORDER = [
  "generalist",
  "meme_investor",
  "speculator",
  "value_investor",
  "growth_investor",
  "event_trader",
  "whale",
] as const;

export const ACHIEVEMENT_TIER_ORDER = [
  "beginner",
  "intermediate",
  "advanced",
  "legendary",
] as const;

export const TIER_TONE: Record<string, string> = {
  beginner: "text-muted-foreground border-muted-foreground/40",
  intermediate: "text-primary border-primary/60",
  advanced: "text-accent border-accent/60",
  legendary: "text-yellow-400 border-yellow-400/70",
};

export function getNextInvestorTitle(reputationScore: number) {
  return TITLE_LADDER.find((title) => reputationScore < title.threshold) ?? null;
}

export function getInvestorTitleStatus({
  titleCode,
  currentTitle,
  reputationScore,
}: {
  titleCode: InvestorTitleCode;
  currentTitle: string;
  reputationScore: number;
}): InvestorTitleStatus {
  if (titleCode === currentTitle) return "current";
  const title = TITLE_LADDER.find((entry) => entry.code === titleCode);
  if (!title) return "locked";
  if (reputationScore >= title.threshold) return "complete";
  if (currentTitle === "pirate_king_investor") return "locked";
  return getNextInvestorTitle(reputationScore)?.code === titleCode ? "next" : "locked";
}

export function rankDeltaLabel(prev: number | null | undefined, curr: number) {
  if (prev == null) return { text: "NEW", tone: "text-accent" };
  const d = prev - curr;
  if (d === 0) return { text: "—", tone: "text-muted-foreground" };
  if (d > 0) return { text: `▲ ${d}`, tone: "text-bull" };
  return { text: `▼ ${Math.abs(d)}`, tone: "text-bear" };
}
