import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getTriviaBatch } from "@/lib/api/market.functions";
import { submitTriviaAnswer } from "@/lib/api/wallet.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { formatBerries } from "@/lib/wallet";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { toast } from "sonner";

type Q = { id: string; question: string; choices: string[]; reward: number; difficulty: string };

export const Route = createFileRoute("/games/")({
  head: () => ({ meta: [{ title: "Games — Berry Street" }, { name: "description", content: "Play One Piece trivia to earn Berries." }] }),
  component: Games,
});

function Games() {
  const { data: me, user } = useMe();
  const invalidateMe = useInvalidateMe();
  const [batch, setBatch] = useState<Q[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [earned, setEarned] = useState(0);
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    setEarned(0);
    setIdx(0);
    setSelected(null);
    setCorrectIndex(null);
    const b = await getTriviaBatch();
    setBatch(b as any);
    setLoading(false);
  }

  useEffect(() => { start(); }, []);

  async function answer(i: number) {
    if (!batch || selected !== null) return;
    setSelected(i);
    const q = batch[idx];
    if (!user) {
      toast("Sign in to play trivia and earn Berries.");
      return;
    }
    try {
      const r = await submitTriviaAnswer({ data: { questionId: q.id, choiceIndex: i } });
      if (r.alreadyAnswered) toast("Already answered.");
      else if (r.correct) {
        setCorrectIndex(i);
        setEarned((e) => e + r.reward);
        toast.success(`+฿${r.reward}`);
        await invalidateMe();
      } else {
        toast.error("Wrong — no Berries");
      }
    } catch (e: any) { toast.error(e.message); }
  }

  function next() {
    if (!batch) return;
    if (idx + 1 >= batch.length) start();
    else { setIdx(idx + 1); setSelected(null); setCorrectIndex(null); }
  }


  return (
    <TerminalShell>
      <div className="mx-auto max-w-2xl p-4">
        {!user && (
          <div className="mb-4 border border-border bg-card/60 p-3 text-xs text-muted-foreground">
            Playing as guest. <Link to="/auth" className="text-primary underline">Sign in</Link> to earn and keep your Berries.
          </div>
        )}
        <div className="terminal-panel">
          <div className="terminal-header flex items-center justify-between">
            <span>Trivia · Earn Berries</span>
            <span className="text-muted-foreground tabular">Balance ฿{formatBerries(me?.berries ?? 0)}</span>
          </div>

          {loading || !batch ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading round…</div>
          ) : (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Question {idx + 1} / {batch.length}</span>
                <span>
                  <span className="text-accent">{batch[idx].difficulty}</span> · reward ฿{batch[idx].reward}
                </span>
              </div>
              <h2 className="mb-6 text-lg font-bold text-foreground">{batch[idx].question}</h2>
              <ul className="space-y-2">
                {batch[idx].choices.map((c, i) => {
                  const picked = selected === i;
                  const showState = selected !== null;
                  const isCorrect = correctIndex !== null && i === correctIndex;
                  const isWrongPick = showState && picked && correctIndex !== null && i !== correctIndex;
                  const cls = !showState
                    ? "border-border hover:border-primary hover:bg-secondary"
                    : isCorrect
                      ? "border-bull bg-bull/10 text-bull"
                      : isWrongPick
                        ? "border-bear bg-bear/10 text-bear"
                        : picked
                          ? "border-border bg-secondary"
                          : "border-border opacity-60";

                  return (
                    <li key={i}>
                      <button onClick={() => answer(i)} disabled={selected !== null} className={`flex w-full items-center gap-3 border px-4 py-3 text-left text-sm tabular transition ${cls}`}>
                        <span className="text-muted-foreground">[{String.fromCharCode(65 + i)}]</span>
                        <span>{c}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-6 flex items-center justify-between">
                <span className="text-xs text-muted-foreground tabular">Round earned: <span className="text-accent">฿{earned}</span></span>
                <button
                  disabled={selected === null}
                  onClick={next}
                  className="bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  {idx + 1 >= batch.length ? "New round ▶" : "Next ▶"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </TerminalShell>
  );
}
