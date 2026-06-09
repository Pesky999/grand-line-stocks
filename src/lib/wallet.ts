import { useEffect, useState, useCallback } from "react";

const WALLET_KEY = "berry-street-wallet-v1";
const STARTING_BERRIES = 10000;

export type Holding = { slug: string; shares: number; avgCost: number };
export type WalletState = { berries: number; holdings: Record<string, Holding>; triviaSeen: string[] };

function load(): WalletState {
  if (typeof window === "undefined") return { berries: STARTING_BERRIES, holdings: {}, triviaSeen: [] };
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    if (!raw) return { berries: STARTING_BERRIES, holdings: {}, triviaSeen: [] };
    const parsed = JSON.parse(raw);
    return { berries: parsed.berries ?? STARTING_BERRIES, holdings: parsed.holdings ?? {}, triviaSeen: parsed.triviaSeen ?? [] };
  } catch {
    return { berries: STARTING_BERRIES, holdings: {}, triviaSeen: [] };
  }
}

function save(s: WalletState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WALLET_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("wallet-update"));
}

export function useWallet() {
  const [state, setState] = useState<WalletState>(() => load());

  useEffect(() => {
    const handler = () => setState(load());
    window.addEventListener("wallet-update", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("wallet-update", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const buy = useCallback((slug: string, shares: number, price: number) => {
    const s = load();
    const cost = shares * price;
    if (s.berries < cost) return { ok: false, error: "Not enough Berries" };
    const cur = s.holdings[slug];
    const newShares = (cur?.shares ?? 0) + shares;
    const newAvg = cur ? (cur.avgCost * cur.shares + cost) / newShares : price;
    s.berries -= cost;
    s.holdings[slug] = { slug, shares: newShares, avgCost: newAvg };
    save(s);
    return { ok: true as const };
  }, []);

  const sell = useCallback((slug: string, shares: number, price: number) => {
    const s = load();
    const cur = s.holdings[slug];
    if (!cur || cur.shares < shares) return { ok: false, error: "Not enough shares" };
    s.berries += shares * price;
    cur.shares -= shares;
    if (cur.shares <= 0) delete s.holdings[slug];
    else s.holdings[slug] = cur;
    save(s);
    return { ok: true as const };
  }, []);

  const rewardBerries = useCallback((amount: number, questionId?: string) => {
    const s = load();
    s.berries += amount;
    if (questionId) s.triviaSeen = [...new Set([...s.triviaSeen, questionId])];
    save(s);
  }, []);

  const reset = useCallback(() => {
    save({ berries: STARTING_BERRIES, holdings: {}, triviaSeen: [] });
  }, []);

  return { state, buy, sell, rewardBerries, reset };
}

export function formatBerries(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function formatBounty(n: number) {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `฿${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`;
  return `฿${n.toLocaleString()}`;
}
