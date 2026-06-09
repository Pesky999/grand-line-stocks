import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getTriviaBatch } from "@/lib/api/market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { useWallet, formatBerries } from "@/lib/wallet";
import { toast } from "sonner";

type Q = { id: string; question: string; choices: string[]; answer_index: number; reward: number; difficulty: string };

export const Route = createFileRoute("/games")({
  head: () => ({ meta: [{ title: "Games — Berry Street" }, { name: "description", content: "Play One Piece trivia to earn Berries." }] }),
  component: Games,
});

function Games() {
  const { state, rewardBerries } = useWallet();
  const [batch, setBatch] = useState<Q[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [earned, setEarned] = useState(0);
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    setEarned(0);
    setIdx(0);
    setSelected(null);
    const b = await getTriviaBatch();
    setBatch(b as any);
    setLoading(false);
  }

  useEffect(() => { start(); }, []);

  function answer(i: number) {
    if (!batch || selected !== null) return;
    setSelected(i);
    const q = batch[idx];
    if (i === q.answer_index) {
      rewardBerries(q.reward, q.id);
      setEarned((e) => e + q.reward);
      toast.success(`+฿${q.reward}`);
    } else {
      toast.error("Wrong — no Berries");
    }
  }

  function next() {
    if (!batch) return;
    if (idx + 1 >= batch.length) {
      start();
    } else {
      setIdx(idx + 1);
      setSelected(null);
    }
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-2xl p-4">
        <div className="terminal-panel">
          <div className="terminal-header flex items-center justify-between">
            <span>Trivia · Earn Berries</span>
            <span className="text-muted-foreground tabular">Balance ฿{formatBerries(state.berries)}</span>
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
                  const isAns = i === batch[idx].answer_index;
                  const picked = selected === i;
                  const showState = selected !== null;
                  const cls = !showState
                    ? "border-border hover:border-primary hover:bg-secondary"
                    : isAns
                      ? "border-bull bg-bull/10 text-bull"
                      : picked
                        ? "border-bear bg-bear/10 text-bear"
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

        <div className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
          Trivia is the v1 earner. More games coming: bounty-guessing, devil-fruit roulette, bounty board.
        </div>
      </div>
    </TerminalShell>
  );
}
