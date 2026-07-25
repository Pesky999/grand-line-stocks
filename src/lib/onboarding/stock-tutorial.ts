export const BERRY_SYMBOL = "\u0e3f";

export const STOCK_TUTORIAL_PRACTICE = {
  name: "Practice Listing",
  symbol: "DEMO",
  initialWallet: 5000,
  investment: 1000,
  buyPrice: 100,
  shares: 10,
  newPrice: 105,
  saleProceeds: 1050,
  profit: 50,
} as const;

export type PracticeStep = 1 | 2 | 3 | 4 | 5;

export type PracticeState = {
  step: PracticeStep;
  cash: number;
  shares: number;
  price: number;
  averageCost: number | null;
  positionValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
};

export const PRACTICE_STEPS = [
  {
    step: 1,
    key: "step_1",
    title: "Understand a stock",
    copy: "Each character stock has a current price and recent movement.",
    action: "Select the practice stock",
  },
  {
    step: 2,
    key: "step_2",
    title: "Place a buy",
    copy: "You can buy by share quantity or by Berry amount.",
    action: "Apply the practice Berry amount",
  },
  {
    step: 3,
    key: "step_3",
    title: "Review the order",
    copy: "Before confirming, review the price, estimated shares, total cost, and remaining balance.",
    action: "Confirm practice buy",
  },
  {
    step: 4,
    key: "step_4",
    title: "Portfolio movement",
    copy: "Your open profit or loss changes as the stock price moves. Live prices can rise or fall.",
    action: "Continue",
  },
  {
    step: 5,
    key: "step_5",
    title: "Sell",
    copy: "Selling converts some or all of your position back into Berries.",
    action: "Confirm practice sale",
  },
] as const;

export function formatPracticeBerries(value: number) {
  return `${BERRY_SYMBOL}${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function reconstructPracticeState(step: number): PracticeState {
  const safeStep = Math.min(5, Math.max(1, Math.trunc(step))) as PracticeStep;
  const hasBought = safeStep >= 4;
  const hasMoved = safeStep >= 4;
  const hasSold = safeStep > 5;
  const price = hasMoved ? STOCK_TUTORIAL_PRACTICE.newPrice : STOCK_TUTORIAL_PRACTICE.buyPrice;
  const shares = hasBought && !hasSold ? STOCK_TUTORIAL_PRACTICE.shares : 0;
  const cash = hasBought
    ? STOCK_TUTORIAL_PRACTICE.initialWallet - STOCK_TUTORIAL_PRACTICE.investment
    : STOCK_TUTORIAL_PRACTICE.initialWallet;
  const positionValue = shares * price;
  const unrealizedPnl = hasBought ? positionValue - STOCK_TUTORIAL_PRACTICE.investment : 0;

  return {
    step: safeStep,
    cash,
    shares,
    price,
    averageCost: hasBought ? STOCK_TUTORIAL_PRACTICE.buyPrice : null,
    positionValue,
    unrealizedPnl,
    realizedPnl: 0,
  };
}

export function finalPracticeState(): PracticeState {
  return {
    step: 5,
    cash: STOCK_TUTORIAL_PRACTICE.initialWallet + STOCK_TUTORIAL_PRACTICE.profit,
    shares: 0,
    price: STOCK_TUTORIAL_PRACTICE.newPrice,
    averageCost: STOCK_TUTORIAL_PRACTICE.buyPrice,
    positionValue: 0,
    unrealizedPnl: 0,
    realizedPnl: STOCK_TUTORIAL_PRACTICE.profit,
  };
}
