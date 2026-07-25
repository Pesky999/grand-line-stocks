import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { TerminalShell } from "@/components/TerminalShell";
import {
  ONBOARDING_QUERY_KEY,
  completeMyStockTutorial,
  getMyOnboardingState,
  saveMyStockTutorialStep,
  skipMyStockTutorial,
  startMyStockTutorial,
} from "@/lib/api/onboarding.functions";
import {
  clearOnboardingSessionBypass,
  setOnboardingSessionBypass,
} from "@/lib/onboarding/session-bypass";
import {
  PRACTICE_STEPS,
  STOCK_TUTORIAL_PRACTICE,
  finalPracticeState,
  formatPracticeBerries,
  reconstructPracticeState,
} from "@/lib/onboarding/stock-tutorial";
import { STOCK_TUTORIAL_FINAL_STEP } from "@/lib/onboarding/progress";

type OnboardingSearch = {
  replay?: boolean;
};

export const Route = createFileRoute("/_authenticated/onboarding")({
  validateSearch: (raw: Record<string, unknown>): OnboardingSearch => ({
    replay: raw.replay === true || raw.replay === "true",
  }),
  head: () => ({
    meta: [
      { title: "Stock Trading Tutorial - Berry Street" },
      {
        name: "description",
        content: "Practice buying and selling a stock with simulated Berry Street numbers.",
      },
    ],
  }),
  component: StockTradingOnboarding,
});

function StockTradingOnboarding() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onboardingQ = useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: () => getMyOnboardingState(),
    retry: false,
    staleTime: 0,
  });
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [finishedReplay, setFinishedReplay] = useState(false);
  const stepTitleRef = useRef<HTMLHeadingElement | null>(null);
  const state = onboardingQ.data ?? null;
  const isReplay = Boolean(search.replay && state?.stockTutorialStatus === "completed");
  const currentStep = PRACTICE_STEPS[Math.max(0, Math.min(step, STOCK_TUTORIAL_FINAL_STEP) - 1)]!;
  const practice = useMemo(
    () =>
      finishedReplay || (state?.stockTutorialStatus === "completed" && !isReplay)
        ? finalPracticeState()
        : reconstructPracticeState(step),
    [finishedReplay, isReplay, state?.stockTutorialStatus, step],
  );

  useEffect(() => {
    if (!state) return;
    if (isReplay) {
      setStep(1);
      return;
    }
    if (state.stockTutorialStatus === "in_progress") {
      setStep(Math.max(1, state.stockTutorialLastStep));
      return;
    }
    setStep(1);
  }, [isReplay, state]);

  useEffect(() => {
    stepTitleRef.current?.focus();
  }, [step]);

  async function refreshOnboarding() {
    await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
  }

  async function beginTutorial(restart = false) {
    setBusy(true);
    try {
      clearOnboardingSessionBypass();
      await startMyStockTutorial({ data: { restart } });
      await refreshOnboarding();
      setStep(1);
      setFinishedReplay(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the tutorial.");
    } finally {
      setBusy(false);
    }
  }

  async function nextStep() {
    if (!currentStep) return;
    setBusy(true);
    try {
      if (step >= STOCK_TUTORIAL_FINAL_STEP) {
        if (isReplay) {
          await completeMyStockTutorial({
            data: { replay: true, completedStepKey: currentStep.key },
          });
          setFinishedReplay(true);
        } else {
          await completeMyStockTutorial({ data: { completedStepKey: currentStep.key } });
          await refreshOnboarding();
        }
        return;
      }

      const next = step + 1;
      if (!isReplay) {
        await saveMyStockTutorialStep({
          data: { step: next, completedStepKey: currentStep.key },
        });
        await refreshOnboarding();
      }
      setStep(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save tutorial progress.");
    } finally {
      setBusy(false);
    }
  }

  async function skipTutorial() {
    setBusy(true);
    try {
      await skipMyStockTutorial();
      await refreshOnboarding();
      await navigate({ to: "/", search: { page: 1, q: "" } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not skip the tutorial.");
    } finally {
      setBusy(false);
    }
  }

  async function exitForNow() {
    if (!isReplay) setOnboardingSessionBypass();
    await navigate({ to: isReplay ? "/profile" : "/portfolio" });
  }

  if (onboardingQ.isLoading) {
    return (
      <TerminalShell>
        <div className="p-8 text-sm text-muted-foreground">Loading tutorial...</div>
      </TerminalShell>
    );
  }

  if (onboardingQ.isError || !state) {
    return (
      <TerminalShell>
        <div className="mx-auto max-w-2xl space-y-4 p-4">
          <div className="terminal-panel p-5 text-sm text-muted-foreground">
            The tutorial could not load right now. You can still browse and trade normally.
          </div>
          <Link to="/" search={{ page: 1, q: "" }} className="text-sm text-primary underline">
            Open the market
          </Link>
        </div>
      </TerminalShell>
    );
  }

  if (finishedReplay || (state.stockTutorialStatus === "completed" && !isReplay)) {
    return (
      <TerminalShell>
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <div className="terminal-panel p-6 text-sm">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-primary">
              Practice complete
            </div>
            <h1 className="text-2xl font-bold">You practiced the full buy-and-sell loop.</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              The tutorial used simulated numbers only. Your real wallet, holdings, prices, and
              trade history were not changed.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/"
                search={{ page: 1, q: "" }}
                className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground"
              >
                Browse market
              </Link>
              <button
                type="button"
                onClick={() => void beginTutorial(true)}
                disabled={busy}
                className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
              >
                Practice again
              </button>
            </div>
          </div>
        </div>
      </TerminalShell>
    );
  }

  if (state.stockTutorialStatus === "not_started" || state.stockTutorialStatus === "skipped") {
    return (
      <TerminalShell>
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <div className="terminal-panel p-6">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-primary">
              Optional tutorial
            </div>
            <h1 className="text-2xl font-bold">Practice a stock trade without risking Berries.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Walk through a simulated listing, buy order, price move, and sell order. This does not
              call the trade system and does not change your wallet, holdings, or stats.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void beginTutorial(state.stockTutorialStatus === "skipped")}
                disabled={busy}
                className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                Start practice trade
              </button>
              <button
                type="button"
                onClick={() => void skipTutorial()}
                disabled={busy}
                className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-bear disabled:opacity-50"
              >
                Explore on my own
              </button>
            </div>
          </div>
        </div>
      </TerminalShell>
    );
  }

  return (
    <TerminalShell>
      <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_22rem]">
        <section className="terminal-panel p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-primary">
                Step {step} / {STOCK_TUTORIAL_FINAL_STEP}
              </div>
              <h1 ref={stepTitleRef} tabIndex={-1} className="mt-1 text-2xl font-bold outline-none">
                {currentStep.title}
              </h1>
            </div>
            <div className="text-right text-[10px] uppercase tracking-widest text-muted-foreground">
              Practice Mode
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {currentStep.copy}
          </p>

          <div className="mt-5 grid gap-px border border-border bg-border md:grid-cols-3">
            <PracticeStat label="Wallet" value={formatPracticeBerries(practice.cash)} />
            <PracticeStat label="Shares" value={practice.shares.toLocaleString()} />
            <PracticeStat
              label="Position value"
              value={formatPracticeBerries(practice.positionValue)}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void exitForNow()}
              disabled={busy}
              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
            >
              Exit tutorial
            </button>
            <div className="flex flex-wrap gap-2">
              {!isReplay && (
                <button
                  type="button"
                  onClick={() => void skipTutorial()}
                  disabled={busy}
                  className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-bear disabled:opacity-50"
                >
                  Skip tutorial
                </button>
              )}
              <button
                type="button"
                onClick={() => void nextStep()}
                disabled={busy}
                className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                {step >= STOCK_TUTORIAL_FINAL_STEP ? "Finish practice" : "Continue"}
              </button>
            </div>
          </div>
        </section>

        <aside className="terminal-panel overflow-hidden">
          <div className="terminal-header">Practice Listing</div>
          <div className="space-y-4 p-4 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Character
              </div>
              <div className="mt-1 font-bold">{STOCK_TUTORIAL_PRACTICE.name}</div>
              <div className="text-xs text-muted-foreground">{STOCK_TUTORIAL_PRACTICE.symbol}</div>
            </div>
            <div className="grid grid-cols-2 gap-px border border-border bg-border text-xs">
              <PracticeStat label="Buy price" value={formatPracticeBerries(practice.price)} />
              <PracticeStat
                label="Invest"
                value={formatPracticeBerries(STOCK_TUTORIAL_PRACTICE.investment)}
              />
              <PracticeStat
                label="New price"
                value={formatPracticeBerries(STOCK_TUTORIAL_PRACTICE.newPrice)}
              />
              <PracticeStat
                label="Profit"
                value={formatPracticeBerries(
                  Math.max(0, practice.realizedPnl || practice.unrealizedPnl),
                )}
                tone={practice.realizedPnl > 0 || practice.unrealizedPnl > 0 ? "bull" : undefined}
              />
            </div>
            <div className="text-xs leading-relaxed text-muted-foreground">
              These numbers are reconstructed locally from the tutorial step. No real order is
              placed.
            </div>
          </div>
        </aside>
      </div>
    </TerminalShell>
  );
}

function PracticeStat({ label, value, tone }: { label: string; value: string; tone?: "bull" }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-bold tabular ${tone === "bull" ? "text-bull" : ""}`}>{value}</div>
    </div>
  );
}
