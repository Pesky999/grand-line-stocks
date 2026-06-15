import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getLatestReport, listReports, listActiveRumors } from "@/lib/api/living-market.functions";
import { TerminalShell } from "@/components/TerminalShell";

const latestQO = queryOptions({ queryKey: ["report", "latest"], queryFn: () => getLatestReport() });
const historyQO = queryOptions({ queryKey: ["report", "history"], queryFn: () => listReports({ data: { limit: 30 } }) });
const rumorsQO = queryOptions({ queryKey: ["rumors", "active"], queryFn: () => listActiveRumors({ data: { limit: 20 } }) });

export const Route = createFileRoute("/market-report")({
  head: () => ({
    meta: [
      { title: "Daily Market Report — Berry Street" },
      { name: "description", content: "Daily One Piece market report: sentiment, biggest movers, rumors, and trends." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(latestQO),
      context.queryClient.ensureQueryData(historyQO),
      context.queryClient.ensureQueryData(rumorsQO),
    ]),
  component: ReportPage,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">{error.message}</div></TerminalShell>,
  notFoundComponent: () => null,
});

const SENT_TONE: Record<string, string> = {
  extremely_bullish: "text-bull",
  bullish: "text-bull",
  neutral: "text-muted-foreground",
  bearish: "text-bear",
  extremely_bearish: "text-bear",
};

function fmtSent(s: string) { return s.replace(/_/g, " ").toUpperCase(); }

function ReportPage() {
  const { data: latest } = useSuspenseQuery(latestQO);
  const { data: history } = useSuspenseQuery(historyQO);
  const { data: rumors } = useSuspenseQuery(rumorsQO);

  return (
    <TerminalShell>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <section className="terminal-panel">
          <div className="terminal-header flex justify-between">
            <span>● Daily Market Report</span>
            <span className="text-muted-foreground">{latest ? new Date(latest.report_date).toDateString() : "—"}</span>
          </div>
          {!latest ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No report yet. First cycle runs on schedule.</div>
          ) : (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className={`text-xs uppercase tracking-widest ${SENT_TONE[latest.sentiment] ?? ""}`}>{fmtSent(latest.sentiment)}</span>
                <span className={`tabular text-sm ${Number(latest.avg_change_pct) >= 0 ? "text-bull" : "text-bear"}`}>
                  AVG {Number(latest.avg_change_pct) >= 0 ? "+" : ""}{Number(latest.avg_change_pct).toFixed(2)}%
                </span>
              </div>
              <h1 className="text-xl font-bold text-foreground">{latest.headline}</h1>
              <p className="text-sm text-muted-foreground">{latest.summary}</p>
              <div className="grid gap-px bg-border md:grid-cols-4">
                <Cell label="Biggest Gainer" name={(latest as any).gainer?.name} slug={(latest as any).gainer?.slug} pct={latest.biggest_gainer_pct} explanation={(latest as any).gainer_explanation} bull />
                <Cell label="Biggest Loser" name={(latest as any).loser?.name} slug={(latest as any).loser?.slug} pct={latest.biggest_loser_pct} explanation={(latest as any).loser_explanation} />
                <Cell label="Trending" name={(latest as any).trending?.name} slug={(latest as any).trending?.slug} explanation={(latest as any).trending_explanation} />
                <Cell label="Most Discussed" name={(latest as any).discussed?.name} slug={(latest as any).discussed?.slug} explanation={(latest as any).discussed_explanation} />
              </div>
            </div>
          )}
        </section>

        <section className="terminal-panel">
          <div className="terminal-header">Active Rumors · Speculation</div>
          <ul className="divide-y divide-border">
            {rumors.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">No rumors circulating.</li>}
            {rumors.map((r: any) => {
              const impact = r.market_rumor_impacts?.[0];
              const up = Number(impact?.pct_change ?? 0) >= 0;
              return (
                <li key={r.id} className="p-4">
                  <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-warn">
                    ◆ Rumor · unverified
                    <span className="text-muted-foreground tabular">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <h2 className="text-sm font-bold text-foreground">{r.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                  {impact?.characters && (
                    <div className="mt-2 flex items-center gap-2 text-xs tabular">
                      <Link to="/character/$slug" params={{ slug: impact.characters.slug }} className="text-accent">
                        {impact.characters.slug.toUpperCase()}
                      </Link>
                      <span className={up ? "text-bull" : "text-bear"}>{up ? "▲" : "▼"} {Math.abs(Number(impact.pct_change)).toFixed(2)}%</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="terminal-panel">
          <div className="terminal-header">Report History</div>
          <ul className="divide-y divide-border text-xs">
            {history.length === 0 && <li className="p-6 text-center text-muted-foreground">No history yet.</li>}
            {history.map((r: any) => (
              <li key={r.id} className="grid grid-cols-[100px_120px_1fr_120px] items-center gap-3 px-3 py-2">
                <span className="tabular text-muted-foreground">{r.report_date}</span>
                <span className={`uppercase tracking-widest text-[10px] ${SENT_TONE[r.sentiment] ?? ""}`}>{fmtSent(r.sentiment)}</span>
                <span className="text-foreground truncate">{r.headline}</span>
                <span className={`tabular text-right ${Number(r.avg_change_pct) >= 0 ? "text-bull" : "text-bear"}`}>
                  {Number(r.avg_change_pct) >= 0 ? "+" : ""}{Number(r.avg_change_pct).toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </TerminalShell>
  );
}

function Cell({ label, name, slug, pct, explanation, bull }: { label: string; name?: string; slug?: string; pct?: number | null; explanation?: string | null; bull?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-bold text-foreground">
        {slug ? <Link to="/character/$slug" params={{ slug }} className="hover:text-primary">{name}</Link> : "—"}
      </div>
      {pct != null && (
        <div className={`text-[10px] tabular ${bull || Number(pct) >= 0 ? "text-bull" : "text-bear"}`}>
          {Number(pct) >= 0 ? "+" : ""}{Number(pct).toFixed(2)}%
        </div>
      )}
      {explanation && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{explanation}</p>}
    </div>
  );
}
