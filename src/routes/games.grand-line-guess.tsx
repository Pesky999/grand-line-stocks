import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TerminalShell } from "@/components/TerminalShell";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  getGrandLineGuessAutocomplete,
  getTodayGrandLineGuessState,
  submitGrandLineGuess,
  getGrandLineGuessStats,
} from "@/lib/api/grand-line-guess.functions";

export const Route = createFileRoute("/games/grand-line-guess")({
  head: () => ({
    meta: [
      { title: "Grand Line Guess — Berry Street" },
      { name: "description", content: "Use market intelligence to identify today's mystery One Piece character." },
    ],
  }),
  component: GrandLineGuessPage,
});

type Cell = { value: string; result: string };
type Feedback = Record<string, Cell>;
type AutocompleteOption = { id: string; name: string };
type GuessAttempt = {
  guessed_character_id: string;
  feedback: Feedback;
  attempt_number: number;
  is_correct: boolean;
};

const COLUMNS: { key: keyof Feedback; label: string }[] = [
  { key: "character", label: "Character" },
  { key: "gender", label: "Gender" },
  { key: "affiliation", label: "Affiliation" },
  { key: "devil_fruit", label: "Devil Fruit" },
  { key: "haki", label: "Haki" },
  { key: "bounty", label: "Bounty" },
  { key: "height", label: "Height" },
  { key: "first_arc", label: "First Arc" },
];

const GREEN = "bg-bull/20 text-bull border-bull/40";
const RED = "bg-bear/20 text-bear border-bear/40";
const YELLOW = "bg-yellow-400/15 text-yellow-300 border-yellow-400/40";
const UNKNOWN_CLS = "bg-muted/20 text-muted-foreground border-border";
const NEUTRAL_CLS = "bg-muted/10 text-muted-foreground border-border";

function cellClasses(columnKey: string, result: string) {
  if (!result) return NEUTRAL_CLS;
  if (result === "exact") return GREEN;
  if (result === "unknown") return UNKNOWN_CLS;
  // Haki is the only column that uses yellow for partial matches
  if (columnKey === "haki") {
    if (result === "partial") return YELLOW;
    return RED;
  }
  // All other columns: anything not exact reads as incorrect (red),
  // including partial/wrong/higher/lower/earlier/later.
  return RED;
}

function arrow(columnKey: string, result: string) {
  // Directional arrows on Bounty, Height, and First Arc
  if (columnKey !== "bounty" && columnKey !== "height" && columnKey !== "first_arc") return "";
  if (columnKey === "first_arc") {
    if (result === "earlier") return "↓";
    if (result === "later") return "↑";
    return "";
  }
  if (result === "higher") return "↑";
  if (result === "lower") return "↓";
  return "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Submission failed";
}

function GrandLineGuessPage() {
  const { user } = useMe();
  const qc = useQueryClient();
  const invalidateMe = useInvalidateMe();

  const autocompleteQ = useQuery({
    queryKey: ["glg-autocomplete"],
    queryFn: () => getGrandLineGuessAutocomplete(),
    staleTime: 5 * 60_000,
  });

  const stateQ = useQuery({
    queryKey: ["glg-state"],
    queryFn: () => getTodayGrandLineGuessState(),
    enabled: !!user,
  });

  const statsQ = useQuery({
    queryKey: ["glg-stats"],
    queryFn: () => getGrandLineGuessStats(),
    enabled: !!user,
  });

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [rewardPayoutError, setRewardPayoutError] = useState<string | null>(null);
  const [rewardPayoutCode, setRewardPayoutCode] = useState<string | null>(null);

  const state = stateQ.data;
  const stats = statsQ.data;
  const attempts = useMemo(() => ((state?.attempts ?? []) as unknown) as GuessAttempt[], [state?.attempts]);
  const guessedIds = new Set(attempts.map((attempt) => attempt.guessed_character_id));
  const rewardError = rewardPayoutError ?? state?.reward_error ?? null;
  const rewardDiagnosticCode = rewardPayoutCode ?? state?.payout_error_code ?? null;
  const showRewardFailure = Boolean(rewardError);
  const options = useMemo(() => {
    const all = (autocompleteQ.data ?? []) as AutocompleteOption[];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return all.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [autocompleteQ.data, query]);

  const submitM = useMutation({
    mutationFn: (id: string) => submitGrandLineGuess({ data: { guessed_character_id: id } }),
    onMutate: () => {
      setSubmissionError(null);
      setRewardPayoutError(null);
      setRewardPayoutCode(null);
    },
    onSuccess: (next) => {
      qc.setQueryData(["glg-state"], next);
      if (next?.reward_error) {
        setRewardPayoutError(next.reward_error);
        setRewardPayoutCode(next.payout_error_code ?? null);
        toast.error(next.reward_error);
        return;
      }
      setRewardPayoutError(null);
      setRewardPayoutCode(null);
      if (next?.solved) {
        toast.success(`Solved in ${next.attempts_used}! +฿${next.reward_amount}`);
        invalidateMe();
        qc.invalidateQueries({ queryKey: ["glg-stats"] });
      }
      setQuery("");
      setOpen(false);
    },
    onError: (error) => {
      const message = errorMessage(error);
      setSubmissionError(message);
      toast.error(message);
    },
  });

  const handlePick = (id: string) => {
    if (guessedIds.has(id)) { toast("Already guessed"); return; }
    submitM.mutate(id);
  };

  const shareText = useMemo(() => {
    if (!state?.solved) return "";
    const grid = attempts.map(a =>
      COLUMNS.map(c => {
        const r = a.feedback[c.key]?.result;
        if (r === "exact") return "🟩";
        if (r === "partial") return "🟨";
        if (r === "higher" || r === "later") return "⬆️";
        if (r === "lower" || r === "earlier") return "⬇️";
        if (r === "unknown") return "⬜";
        return "⬛";
      }).join("")
    ).join("\n");
    return `Grand Line Guess — Daily Run\nSolved in ${state.attempts_used} guesses\nReward: ${state.reward_amount} berries\nStreak: ${stats?.current_streak ?? 0}\n\n${grid}`;
  }, [state, attempts, stats]);

  return (
    <TerminalShell>
      <div className="mx-auto max-w-5xl p-3 sm:p-4">
        <div className="terminal-panel">
          <div className="terminal-header flex items-center justify-between">
            <span>Grand Line Guess · Daily</span>
            <span className="text-muted-foreground text-[10px]">{state?.puzzle_date ?? "—"} UTC</span>
          </div>

          <div className="p-4 sm:p-6">
            <h1 className="text-lg sm:text-xl font-bold text-foreground">Grand Line Guess</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use market intelligence to identify today's mystery character. Each guess returns feedback. Green = exact, yellow = partial, arrows = higher/lower or earlier/later.
            </p>

            {!user && (
              <div className="mt-4 border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                <Link to="/auth" className="text-primary underline">Sign in</Link> to play Daily Mode and earn Berries.
              </div>
            )}

            {user && (
              <>
                {/* Stats row */}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px] uppercase tracking-widest">
                  <Stat label="Streak" value={stats?.current_streak ?? 0} />
                  <Stat label="Best" value={stats?.best_streak ?? 0} />
                  <Stat label="Attempts" value={state?.attempts_used ?? 0} />
                  <Stat
                    label={state?.solved ? (state.reward_paid ? "Earned" : "Pending reward") : "Next reward"}
                    value={`฿${state?.solved ? (state.reward_paid ? state.reward_amount : (state.pending_reward_amount ?? state.reward_amount)) : (state?.potential_next_reward ?? 0)}`}
                  />
                </div>

                {/* Search */}
                {!state?.solved && state?.status === "active" && (
                  <div className="relative mt-5">
                    <input
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                      onFocus={() => setOpen(true)}
                      placeholder="Type a character name…"
                      className="w-full h-12 border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && options[0]) handlePick(options[0].id);
                      }}
                    />
                    {open && options.length > 0 && (
                      <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto border border-border bg-card">
                        {options.map((o) => {
                          const used = guessedIds.has(o.id);
                          return (
                            <li key={o.id}>
                              <button
                                disabled={used || submitM.isPending}
                                onClick={() => handlePick(o.id)}
                                className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm hover:bg-secondary ${used ? "opacity-40 cursor-not-allowed" : ""}`}
                              >
                                <span>{o.name}</span>
                                {used && <span className="text-[10px] text-muted-foreground">guessed</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {submissionError && (
                  <div role="alert" className="mt-4 border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
                    <div className="font-bold uppercase tracking-widest">Guess could not be submitted</div>
                    <p className="mt-1 text-muted-foreground">{submissionError}</p>
                  </div>
                )}

                {showRewardFailure && (
                  <div role="alert" className="mt-4 border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
                    <div className="font-bold uppercase tracking-widest">Reward payout needs attention</div>
                    <p className="mt-1 text-muted-foreground">
                      {rewardError}
                    </p>
                    {rewardDiagnosticCode ? (
                      <p className="mt-1 text-muted-foreground">Diagnostic code: {rewardDiagnosticCode}</p>
                    ) : null}
                  </div>
                )}


                {/* Grid */}
                <div className="mt-5 -mx-3 sm:mx-0 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {COLUMNS.map(c => <th key={c.key} className="px-2 py-2 text-left">{c.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.length === 0 && (
                        <tr><td colSpan={COLUMNS.length} className="px-2 py-6 text-center text-muted-foreground">No guesses yet.</td></tr>
                      )}
                      {attempts.map((a) => (
                        <tr key={a.attempt_number}>
                          {COLUMNS.map(c => {
                            const cell = a.feedback[c.key];
                            return (
                              <td key={c.key} className="p-1">
                                <div className={`border px-2 py-2 text-center ${cellClasses(c.key as string, cell?.result)}`}>
                                  <div className="font-bold truncate">{cell?.value}</div>
                                  {arrow(c.key as string, cell?.result) && <div className="text-base font-bold leading-none">{arrow(c.key as string, cell?.result)}</div>}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <LegendChip cls="bg-bull/20 text-bull border-bull/40" label="Exact" />
                  <LegendChip cls="bg-yellow-400/15 text-yellow-300 border-yellow-400/40" label="Partial" />
                  <LegendChip cls="bg-secondary text-foreground border-border" label="↑ higher / later" />
                  <LegendChip cls="bg-secondary text-foreground border-border" label="↓ lower / earlier" />
                  <LegendChip cls="bg-muted/20 text-muted-foreground border-border" label="Unknown" />
                </div>

                {/* Result */}
                {state?.solved && state.answer && (
                  <div className="mt-6 border border-bull/40 bg-bull/5 p-4 text-sm">
                    <div className="font-bold text-bull">Solved! Mystery character: {state.answer.name}</div>
                    <div className="mt-1 text-muted-foreground">
                      In {state.attempts_used} guesses · {state.reward_paid ? "earned" : "pending payout"} ฿{state.reward_paid ? state.reward_amount : (state.pending_reward_amount ?? state.reward_amount)} · streak {stats?.current_streak ?? 0}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to="/character/$slug" params={{ slug: state.answer.slug }} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary">
                        View stock
                      </Link>
                      <button
                        onClick={() => { navigator.clipboard.writeText(shareText); toast.success("Copied!"); }}
                        className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary"
                      >
                        Share result
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </TerminalShell>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-border bg-card/60 p-2">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-foreground tabular">{value}</div>
    </div>
  );
}

function LegendChip({ cls, label }: { cls: string; label: string }) {
  return <span className={`border px-2 py-1 ${cls}`}>{label}</span>;
}
