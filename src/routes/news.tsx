import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listNews } from "@/lib/api/market.functions";
import { TerminalShell } from "@/components/TerminalShell";

const qo = queryOptions({ queryKey: ["news"], queryFn: () => listNews() });

export const Route = createFileRoute("/news")({
  head: () => ({ meta: [{ title: "Wire — Berry Street" }, { name: "description", content: "Story events moving the One Piece markets." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  component: News,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">{error.message}</div></TerminalShell>,
  notFoundComponent: () => null,
});

function News() {
  const { data: news } = useSuspenseQuery(qo);
  return (
    <TerminalShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="terminal-panel">
          <div className="terminal-header">The Wire</div>
          <ul className="divide-y divide-border">
            {news.map((n: any) => (
              <li key={n.id} className="p-4">
                <div className="mb-1 flex items-center gap-3 text-[10px] uppercase tracking-widest">
                  <span className={n.impact === "bullish" ? "text-bull" : n.impact === "bearish" ? "text-bear" : "text-muted-foreground"}>
                    ● {n.impact}
                  </span>
                  <span className="text-muted-foreground tabular">{new Date(n.created_at).toLocaleString()}</span>
                  {n.characters && (
                    <Link to="/character/$slug" params={{ slug: n.characters.slug }} className="text-accent">
                      {n.characters.name}
                    </Link>
                  )}
                </div>
                <h2 className="text-base font-bold text-foreground">{n.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TerminalShell>
  );
}
