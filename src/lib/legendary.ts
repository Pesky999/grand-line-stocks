export const TITLE_LABEL: Record<string, string> = {
  rookie_pirate: "Rookie Pirate",
  east_blue_trader: "East Blue Trader",
  grand_line_investor: "Grand Line Investor",
  warlord_investor: "Warlord Investor",
  yonko_investor: "Yonko Investor",
  pirate_king_investor: "Pirate King Investor",
};

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

export const TIER_TONE: Record<string, string> = {
  beginner: "text-muted-foreground border-muted-foreground/40",
  intermediate: "text-primary border-primary/60",
  advanced: "text-accent border-accent/60",
  legendary: "text-yellow-400 border-yellow-400/70",
};

export function rankDeltaLabel(prev: number | null | undefined, curr: number) {
  if (prev == null) return { text: "NEW", tone: "text-accent" };
  const d = prev - curr;
  if (d === 0) return { text: "—", tone: "text-muted-foreground" };
  if (d > 0) return { text: `▲ ${d}`, tone: "text-bull" };
  return { text: `▼ ${Math.abs(d)}`, tone: "text-bear" };
}
