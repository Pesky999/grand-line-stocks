export const ACHIEVEMENT_MEDALLION_PATHS = {
  first_trade: "/achievements/medallions/first_trade.webp",
  first_profit: "/achievements/medallions/first_profit.webp",
  first_event: "/achievements/medallions/first_event.webp",
  hundred_trades: "/achievements/medallions/hundred_trades.webp",
  hundred_k_profit: "/achievements/medallions/hundred_k_profit.webp",
  streak_30: "/achievements/medallions/streak_30.webp",
  millionaire: "/achievements/medallions/millionaire.webp",
  top_100: "/achievements/medallions/top_100.webp",
  top_10: "/achievements/medallions/top_10.webp",
  largest_holder: "/achievements/medallions/largest_holder.webp",
  yonko_investor: "/achievements/medallions/yonko_investor.webp",
  pirate_king: "/achievements/medallions/pirate_king.webp",
  market_prophet: "/achievements/medallions/market_prophet.webp",
  diamond_hands: "/achievements/medallions/diamond_hands.webp",
} as const;

export type AchievementMedallionCode = keyof typeof ACHIEVEMENT_MEDALLION_PATHS;

export function getAchievementMedallionPath(code: string) {
  return ACHIEVEMENT_MEDALLION_PATHS[code as AchievementMedallionCode] ?? null;
}
