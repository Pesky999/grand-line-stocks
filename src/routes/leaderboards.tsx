import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLeaderboard, listClimbersAndFallers } from "@/lib/api/legendary.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { formatBerries } from "@/lib/wallet";
import { TITLE_LABEL, TITLE_TONE, rankDeltaLabel } from "@/lib/legendary";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({
    meta: [
      { title: "Leaderboards — Berry Street" },
      { name: "description", content: "Top investors on the Grand Line stock market — net worth, returns, accuracy, and per-character holders." },
    ],
  }),
  component: Leaderboards,
});

const BOARDS = [
  { key: "net_worth_all_time", label: "Net Worth", suffix: "berries", value: (v: number) => `฿${formatBerries(v)}` },
  { key: "return_all_time", label: "All-Time Return", suffix: "%", value: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` },
  { key: "return_30d", label: "30-Day Return", suffix: "%", value: (v: number) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%` },
  { key: "return_7d", label: "7-Day Return", suffix: "%", value: (v: number) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%` },
  { key: "most_profitable", label: "Most Profitable", suffix: "berries", value: (v: number) => `฿${formatBerries(v)}` },
  { key: "most_accurate", label: "Most Accurate", suffix: "%", value: (v: number) => `${v.toFixed(1)}% win rate` },
  { key: "most_active", label: "Most Active", suffix: "trades", value: (v: number) => `${v} trades` },
] as const;

function Leaderboards() {
  const [active, setActive] = useState<typeof BOARDS[number]["key"]>("net_worth_all_time");
  const board = BOARDS.find((b) => b.key === active)!;

  const rows = useQuery({
    queryKey: ["leaderboard", active],
    queryFn: () => listLeaderboard({ data: { board: active, limit: 100 } }),
    staleTime: 60_000,
  });

  const movement = useQuery({
    queryKey: ["climbers"],
    queryFn: () => listClimbersAndFallers(),
    staleTime: 60_000,
  });

  return (
    <TerminalShell>
      <div className="border-b border-border bg-card/60 px-4 py-3">
        <h1 className="text-lg font-bold tracking-widest text-primary">LEGENDARY INVESTORS</h1>
        <p className="text-[11px] text-muted-foreground">Rankings refresh daily at 00:15 UTC. Status climbs with reputation.</p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-widest">
            {BOARDS.map((b) => (
              <button
                key={b.key}
                onClick={() => setActive(b.key)}
                className={`border px-2 py-1 ${active === b.key ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="terminal-panel overflow-hidden">
            <div className="terminal-header">{board.label} · Top 100</div>
            {rows.isLoading ? (
              <div className="p-6 text-xs text-muted-foreground">Loading rankings…</div>
            ) : (rows.data ?? []).length === 0 ? (
              <div className="p-6 text-xs text-muted-foreground">No qualifying investors yet on this board.</div>
            ) : (
              <table className="w-full text-xs tabular">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left w-12">#</th>
                    <th className="px-3 py-2 text-left">Investor</th>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-right">{board.label}</th>
                    <th className="px-3 py-2 text-right w-20">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows.data ?? []).map((r: any) => {
                    const d = rankDeltaLabel(r.prev_rank, r.rank);
                    return (
                      <tr key={r.username} className="border-b border-border/40 hover:bg-secondary/40">
                        <td className="px-3 py-2 font-bold text-accent">{r.rank}</td>
                        <td className="px-3 py-2">
                          <Link to="/u/$username" params={{ username: r.username }} className="text-primary hover:underline">
                            @{r.username}
                          </Link>
                          {r.display_name && <span className="ml-2 text-muted-foreground">{r.display_name}</span>}
                        </td>
                        <td className={`px-3 py-2 text-[10px] uppercase tracking-widest ${TITLE_TONE[r.title] ?? ""}`}>
                          {TITLE_LABEL[r.title] ?? r.title}
                        </td>
                        <td className="px-3 py-2 text-right">{board.value(Number(r.value))}</td>
                        <td className={`px-3 py-2 text-right ${d.tone}`}>{d.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <Panel title="Biggest Climbers">
            {(movement.data?.climbers ?? []).length === 0 ? (
              <div className="p-3 text-[11px] text-muted-foreground">No movement yet.</div>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {movement.data!.climbers.map((c) => (
                  <li key={c.username} className="flex items-center justify-between px-3 py-2">
                    <Link to="/u/$username" params={{ username: c.username }} className="text-primary hover:underline">@{c.username}</Link>
                    <span className="text-bull tabular">▲ {c.delta} → #{c.rank}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Biggest Fallers">
            {(movement.data?.fallers ?? []).length === 0 ? (
              <div className="p-3 text-[11px] text-muted-foreground">No movement yet.</div>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {movement.data!.fallers.map((c) => (
                  <li key={c.username} className="flex items-center justify-between px-3 py-2">
                    <Link to="/u/$username" params={{ username: c.username }} className="text-primary hover:underline">@{c.username}</Link>
                    <span className="text-bear tabular">▼ {Math.abs(c.delta)} → #{c.rank}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </TerminalShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="terminal-panel">
      <div className="terminal-header">{title}</div>
      {children}
    </div>
  );
}
