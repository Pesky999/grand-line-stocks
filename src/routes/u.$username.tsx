import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPublicProfile, listLegacy } from "@/lib/api/legendary.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { formatBerries } from "@/lib/wallet";
import { TITLE_LABEL, TITLE_TONE, SPEC_LABEL, TIER_TONE, rankDeltaLabel } from "@/lib/legendary";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Legendary Investor` },
      { name: "description", content: `Public investor profile for @${params.username} on Berry Street.` },
    ],
  }),
  errorComponent: ({ error }) => (
    <TerminalShell>
      <div className="p-8 text-sm text-muted-foreground">{error.message}</div>
    </TerminalShell>
  ),
  notFoundComponent: () => (
    <TerminalShell>
      <div className="p-8 text-sm text-muted-foreground">Investor not found.</div>
    </TerminalShell>
  ),
  component: PublicProfile,
});

const STARTING_WALLET_BALANCE = 25_000;

type PublicProfileStats = {
  title?: string | null;
  specialization?: string | null;
  days_active?: number | null;
  reputation_score?: number | null;
  wins?: number | null;
  losses?: number | null;
  total_trades?: number | null;
  realized_pnl?: number | null;
  avg_holding_days?: number | null;
  best_trade_slug?: string | null;
  best_trade_pnl?: number | null;
  worst_trade_slug?: string | null;
  worst_trade_pnl?: number | null;
  largest_position_slug?: string | null;
  largest_position_value?: number | null;
  highest_rank?: number | null;
};

type PublicProfileSnapshot = {
  net_worth: number | string | null;
};

type PublicProfileAchievement = {
  achievements: {
    code: string;
    name: string;
    description: string;
    tier: keyof typeof TIER_TONE;
    icon: string | null;
  };
};

type PublicLegacyRecord = {
  username: string | null;
  code: string;
  title: string;
  description: string;
};

function PublicProfile() {
  const { username } = Route.useParams();
  const q = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => getPublicProfile({ data: { username } }),
    retry: false,
  });

  const legacy = useQuery({
    queryKey: ["legacy-records"],
    queryFn: () => listLegacy(),
    staleTime: 5 * 60_000,
  });

  if (q.isLoading) {
    return <TerminalShell><div className="p-8 text-xs text-muted-foreground">Loading investor profile…</div></TerminalShell>;
  }
  if (q.isError || !q.data) {
    throw notFound();
  }
  const d = q.data;
  const s = (d.stats ?? {}) as PublicProfileStats;
  const totalReturn = ((d.net_worth - STARTING_WALLET_BALANCE) * 100) / STARTING_WALLET_BALANCE;
  const closed = (s.wins ?? 0) + (s.losses ?? 0);
  const winRate = closed > 0 ? ((s.wins ?? 0) * 100) / closed : 0;
  const delta = rankDeltaLabel(d.prev_rank, d.rank ?? 9999);
  const userLegacy = ((legacy.data ?? []) as PublicLegacyRecord[]).filter((l) => l.username === username);
  const title = s.title ?? "rookie_pirate";
  const specialization = s.specialization ?? "generalist";

  return (
    <TerminalShell>
      <div className="border-b border-border bg-card/60 px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-widest text-primary">@{d.profile.username}</h1>
          <span className={`border px-2 py-1 text-[10px] uppercase tracking-widest ${TITLE_TONE[title] ?? ""}`}>
            {TITLE_LABEL[title] ?? "Rookie Pirate"}
          </span>
          <span className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {SPEC_LABEL[specialization] ?? "Generalist"}
          </span>
          {d.rank && (
            <span className="border border-accent/60 px-2 py-1 text-[10px] uppercase tracking-widest text-accent">
              Rank #{d.rank} <span className={`ml-2 ${delta.tone}`}>{delta.text}</span>
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Joined {new Date(d.profile.created_at).toLocaleDateString()} · {s.days_active ?? 1} days active · Reputation {s.reputation_score ?? 0}/1000
        </div>
      </div>

      <div className="grid gap-px border-b border-border bg-border md:grid-cols-4">
        <Stat label="Net Worth" value={`฿${formatBerries(d.net_worth)}`} tone="accent" />
        <Stat label="Cash" value={`฿${formatBerries(d.cash)}`} />
        <Stat label="Portfolio Value" value={`฿${formatBerries(d.equity)}`} />
        <Stat label="Total Return" value={`${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2)}%`} tone={totalReturn >= 0 ? "bull" : "bear"} />
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          <div className="terminal-panel">
            <div className="terminal-header">Investment Statistics</div>
            <div className="grid grid-cols-2 gap-px bg-border text-xs">
              <Cell label="Total Trades" value={s.total_trades ?? 0} />
              <Cell label="Win Rate" value={`${winRate.toFixed(1)}% (${s.wins ?? 0}W / ${s.losses ?? 0}L)`} />
              <Cell label="Realized P/L" value={`${(s.realized_pnl ?? 0) >= 0 ? "+" : ""}฿${formatBerries(s.realized_pnl ?? 0)}`} />
              <Cell label="Avg Holding" value={`${(s.avg_holding_days ?? 0).toFixed(1)} days`} />
              <Cell label="Best Trade" value={s.best_trade_slug ? `${s.best_trade_slug.toUpperCase()} (+฿${formatBerries(s.best_trade_pnl ?? 0)})` : "—"} />
              <Cell label="Worst Trade" value={s.worst_trade_slug ? `${s.worst_trade_slug.toUpperCase()} (฿${formatBerries(s.worst_trade_pnl ?? 0)})` : "—"} />
              <Cell label="Largest Position" value={s.largest_position_slug ? `${s.largest_position_slug.toUpperCase()} (฿${formatBerries(s.largest_position_value ?? 0)})` : "—"} />
              <Cell label="Highest Rank" value={s.highest_rank ? `#${s.highest_rank}` : "—"} />
            </div>
          </div>

          <div className="terminal-panel">
            <div className="terminal-header">Net Worth History · {d.snapshots.length} snapshots</div>
            {d.snapshots.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">Not enough history yet. Snapshots accumulate daily.</div>
            ) : (
              <Sparkline points={(d.snapshots as PublicProfileSnapshot[]).map((snapshot) => Number(snapshot.net_worth))} />
            )}
          </div>

          <div className="terminal-panel">
            <div className="terminal-header">Current Positions ({d.holdings.length})</div>
            {d.holdings.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">No open positions.</div>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {d.holdings.map((h) => (
                  <li key={h.slug} className="flex items-center justify-between px-3 py-2">
                    <Link to="/character/$slug" params={{ slug: h.slug }} className="text-primary hover:underline">
                      <span className="font-bold">{h.slug.toUpperCase().slice(0, 4)}</span> · {h.name}
                    </Link>
                    <span className="tabular">{h.shares} sh @ ฿{h.avgCost.toFixed(2)} · ฿{formatBerries(h.shares * h.currentPrice)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="terminal-panel">
            <div className="terminal-header">Achievements ({d.achievements.length})</div>
            {d.achievements.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">No achievements unlocked yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {(d.achievements as PublicProfileAchievement[]).map((ua) => (
                  <li key={ua.achievements.code} className="px-3 py-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-bold">{ua.achievements.icon} {ua.achievements.name}</span>
                      <span className={`border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${TIER_TONE[ua.achievements.tier]}`}>{ua.achievements.tier}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{ua.achievements.description}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {userLegacy.length > 0 && (
            <div className="terminal-panel">
              <div className="terminal-header">Legacy Records</div>
              <ul className="divide-y divide-border text-xs">
                {userLegacy.map((l) => (
                  <li key={l.code} className="px-3 py-2">
                    <div className="font-bold text-yellow-400">{l.title}</div>
                    <div className="text-[11px] text-muted-foreground">{l.description}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </TerminalShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "accent" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "accent" ? "text-accent" : "text-foreground";
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular ${c}`}>{value}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 tabular">{value}</div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="p-4 text-xs text-muted-foreground">Not enough data.</div>;
  const w = 600;
  const h = 120;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const positive = points[points.length - 1] >= points[0];
  return (
    <div className="px-3 py-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <path d={d} fill="none" stroke={positive ? "hsl(var(--bull))" : "hsl(var(--bear))"} strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular">
        <span>฿{formatBerries(min)}</span>
        <span>฿{formatBerries(max)}</span>
      </div>
    </div>
  );
}
