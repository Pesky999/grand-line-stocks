import { createFileRoute, Link } from "@tanstack/react-router";
import { TerminalShell } from "@/components/TerminalShell";

export const Route = createFileRoute("/games/")({
  head: () => ({
    meta: [
      { title: "Games - Berry Street" },
      {
        name: "description",
        content: "Play the currently available Berry Street daily game.",
      },
    ],
  }),
  component: Games,
});

function Games() {
  return (
    <TerminalShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <section className="terminal-panel">
          <div className="terminal-header">Games</div>
          <div className="space-y-2 p-4">
            <h1 className="text-xl font-bold text-foreground">Daily Games</h1>
            <p className="text-sm text-muted-foreground">
              Play the current Berry Street daily game and check back as the arcade expands.
            </p>
          </div>
        </section>

        <Link
          to="/games/grand-line-guess"
          className="block border border-primary/40 bg-primary/5 p-4 transition hover:bg-primary/10"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Available daily
          </div>
          <div className="mt-2 text-lg font-bold text-foreground">Grand Line Guess</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Deduce today's mystery character from market-style feedback and earn Berries for a clean
            solve.
          </p>
        </Link>

        <Link
          to="/games/daily-crew-builder"
          className="block border border-primary/40 bg-primary/5 p-4 transition hover:bg-primary/10"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Available daily
          </div>
          <div className="mt-2 text-lg font-bold text-foreground">Daily Crew Builder</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Build a crew from the current mission pool, lock in your score, and earn the rank
            reward.
          </p>
        </Link>

        <section className="border border-border bg-card/60 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            More games coming soon
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Grand Line Guess remains the active daily game while the arcade gets ready for future
            additions.
          </p>
        </section>
      </div>
    </TerminalShell>
  );
}
