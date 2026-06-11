export function formatBerries(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function formatBounty(n: number) {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `฿${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`;
  return `฿${n.toLocaleString()}`;
}
