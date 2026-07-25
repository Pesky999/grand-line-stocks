import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { TerminalShell } from "@/components/TerminalShell";
import {
  ONBOARDING_QUERY_KEY,
  completeMyStockTutorial,
  getMyOnboardingState,
  recordMyOnboardingEvent,
  saveMyStockTutorialStep,
  skipMyStockTutorial,
  startMyStockTutorial,
} from "@/lib/api/onboarding.functions";
import {
  clearOnboardingSessionBypass,
  setOnboardingSessionBypass,
} from "@/lib/onboarding/session-bypass";
import {
  BERRY_SYMBOL,
  PRACTICE_STEPS,
  STOCK_TUTORIAL_PRACTICE,
  applyPracticeInteraction,
  createInitialPracticeInteractionState,
  finalPracticeState,
  formatPracticeBerries,
  reconstructPracticeInteractionState,
  reconstructPracticeState,
  type PracticeInteractionAction,
  type PracticeInteractionState,
} from "@/lib/onboarding/stock-tutorial";
import { STOCK_TUTORIAL_FINAL_STEP, STOCK_TUTORIAL_VERSION } from "@/lib/onboarding/progress";

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
  const [interaction, setInteraction] = useState<PracticeInteractionState>(() =>
    createInitialPracticeInteractionState(),
  );
  const [practiceActive, setPracticeActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finishedPractice, setFinishedPractice] = useState(false);
  const stepTitleRef = useRef<HTMLHeadingElement | null>(null);
  const seenWelcomeOfferRef = useRef(false);
  const state = onboardingQ.data ?? null;
  const isReplay = Boolean(search.replay && state?.stockTutorialStatus === "completed");
  const currentStep = PRACTICE_STEPS[interaction.currentStep - 1]!;
  const practice = useMemo(
    () =>
      finishedPractice || (state?.stockTutorialStatus === "completed" && !isReplay)
        ? finalPracticeState()
        : reconstructPracticeState(interaction.currentStep),
    [finishedPractice, interaction.currentStep, isReplay, state?.stockTutorialStatus],
  );

  useEffect(() => {
    if (!state) return;
    if (isReplay) {
      clearOnboardingSessionBypass();
      setInteraction(createInitialPracticeInteractionState());
      setPracticeActive(true);
      setFinishedPractice(false);
      return;
    }
    if (state.stockTutorialStatus === "in_progress" && practiceActive) return;
    if (state.stockTutorialStatus !== "in_progress") {
      setPracticeActive(false);
      setInteraction(createInitialPracticeInteractionState());
      setFinishedPractice(false);
    }
  }, [isReplay, practiceActive, state]);

  useEffect(() => {
    if (!state) return;
    if (state.stockTutorialStatus !== "not_started") return;
    if (state.stockTutorialOffer !== "first_login") return;
    if (seenWelcomeOfferRef.current) return;
    seenWelcomeOfferRef.current = true;
    void recordMyOnboardingEvent({
      data: {
        eventName: "onboarding_offer_seen",
        metadata: { offer: "first_login" },
        dedupeKey: `onboarding_offer_seen:first_login:v${state.stockTutorialVersion}`,
      },
    }).catch(() => logOnboardingRouteFailure("onboarding_offer_seen"));
  }, [state]);

  useEffect(() => {
    if (!practiceActive) return;
    stepTitleRef.current?.focus();
  }, [interaction.currentStep, practiceActive]);

  async function refreshOnboarding() {
    await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
  }

  async function beginTutorial(restart = false, source: "welcome" | "resume" = "welcome") {
    setBusy(true);
    try {
      clearOnboardingSessionBypass();
      await startMyStockTutorial({
        data: { restart, source },
      });
      await refreshOnboarding();
      setInteraction(createInitialPracticeInteractionState());
      setPracticeActive(true);
      setFinishedPractice(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the tutorial.");
    } finally {
      setBusy(false);
    }
  }

  function resumePractice() {
    if (!state) return;
    setInteraction(reconstructPracticeInteractionState(state.stockTutorialLastStep));
    setPracticeActive(true);
    setFinishedPractice(false);
  }

  async function persistStep(next: PracticeInteractionState, completedStepKey: string) {
    if (isReplay) return;
    await saveMyStockTutorialStep({
      data: { step: next.currentStep, completedStepKey },
    });
    await refreshOnboarding();
  }

  async function completePractice(next: PracticeInteractionState) {
    if (isReplay) {
      setInteraction(next);
      setFinishedPractice(true);
      return;
    }

    await completeMyStockTutorial({ data: { completedStepKey: "step_5" } });
    clearOnboardingSessionBypass();
    await refreshOnboarding();
    setInteraction(next);
    setFinishedPractice(true);
  }

  async function handlePracticeAction(action: PracticeInteractionAction) {
    const next = applyPracticeInteraction(interaction, action);
    if (next === interaction) return;

    if (action.type === "enter_berry_amount" || action.type === "select_sell_shares") {
      setInteraction(next);
      return;
    }

    setBusy(true);
    try {
      if (action.type === "confirm_practice_sale" && next.practiceSaleConfirmed) {
        await completePractice(next);
        return;
      }

      if (next.currentStep > interaction.currentStep) {
        await persistStep(next, currentStep.key);
      }
      setInteraction(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save tutorial progress.");
    } finally {
      setBusy(false);
    }
  }

  async function skipTutorial() {
    setBusy(true);
    try {
      clearOnboardingSessionBypass();
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

  if (finishedPractice || (state.stockTutorialStatus === "completed" && !isReplay)) {
    return (
      <TerminalShell>
        <CompletionScreen />
      </TerminalShell>
    );
  }

  if (isReplay && practiceActive) {
    return renderPractice();
  }

  if (state.stockTutorialStatus === "in_progress" && !practiceActive) {
    return (
      <TerminalShell>
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <div className="terminal-panel p-6">
            <h1 className="text-2xl font-bold">PRACTICE TRADE IN PROGRESS</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your practice progress was saved.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resumePractice}
                disabled={busy}
                className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                RESUME PRACTICE
              </button>
              <button
                type="button"
                onClick={() => void beginTutorial(true, "resume")}
                disabled={busy}
                className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
              >
                START OVER
              </button>
              <button
                type="button"
                onClick={() => void skipTutorial()}
                disabled={busy}
                className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-bear disabled:opacity-50"
              >
                SKIP TUTORIAL
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
            <h1 className="text-2xl font-bold">WELCOME TO BERRY STREET</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Build a portfolio by trading One Piece character stocks with virtual Berries.
              <br />
              Prices change as market events and story developments affect each character.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  void beginTutorial(state.stockTutorialStatus === "skipped", "welcome")
                }
                disabled={busy}
                className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                START PRACTICE TRADE
              </button>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                About 90 seconds
              </span>
            </div>
            <button
              type="button"
              onClick={() => void skipTutorial()}
              disabled={busy}
              className="mt-3 border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-bear disabled:opacity-50"
            >
              EXPLORE ON MY OWN
            </button>
            <p className="mt-4 text-xs text-muted-foreground">
              You can replay the tutorial later from your Profile.
            </p>
          </div>
        </div>
      </TerminalShell>
    );
  }

  return renderPractice();

  function renderPractice() {
    return (
      <TerminalShell>
        <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_22rem]">
          <section className="terminal-panel p-5">
            <div className="mb-4 border border-primary/50 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
              PRACTICE MODE — No real Berries, holdings, statistics, or rewards will change.
            </div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary">
                  Step {interaction.currentStep} / {STOCK_TUTORIAL_FINAL_STEP}
                </div>
                <h1
                  ref={stepTitleRef}
                  tabIndex={-1}
                  className="mt-1 text-2xl font-bold outline-none"
                >
                  {currentStep.title}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => void exitForNow()}
                disabled={busy}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
              >
                Exit Tutorial
              </button>
            </div>

            <PracticeStepBody
              interaction={interaction}
              busy={busy}
              onAction={(action) => void handlePracticeAction(action)}
            />
          </section>

          <aside className="terminal-panel overflow-hidden">
            <div className="terminal-header">Practice Listing</div>
            <div className="space-y-4 p-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Character
                </div>
                <div className="mt-1 font-bold">{STOCK_TUTORIAL_PRACTICE.name}</div>
                <div className="text-xs text-muted-foreground">
                  {STOCK_TUTORIAL_PRACTICE.symbol}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px border border-border bg-border text-xs">
                <PracticeStat label="Wallet" value={formatPracticeBerries(practice.cash)} />
                <PracticeStat label="Shares" value={practice.shares.toLocaleString()} />
                <PracticeStat label="Price" value={formatPracticeBerries(practice.price)} />
                <PracticeStat
                  label="Position"
                  value={formatPracticeBerries(practice.positionValue)}
                />
                <PracticeStat
                  label="Profit"
                  value={`${practice.realizedPnl > 0 || practice.unrealizedPnl > 0 ? "+" : ""}${formatPracticeBerries(
                    practice.realizedPnl || practice.unrealizedPnl,
                  )}`}
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
}

function PracticeStepBody({
  interaction,
  busy,
  onAction,
}: {
  interaction: PracticeInteractionState;
  busy: boolean;
  onAction: (action: PracticeInteractionAction) => void;
}) {
  if (interaction.currentStep === 1) {
    return (
      <div className="space-y-5">
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>Each character stock has a current price and recent movement.</p>
          <p>Select the practice stock to open its trade panel.</p>
        </div>
        <button
          type="button"
          onClick={() => onAction({ type: "select_listing" })}
          disabled={busy}
          className="block w-full border border-primary/60 bg-card p-4 text-left hover:border-primary disabled:opacity-50"
        >
          <div className="text-[10px] uppercase tracking-widest text-primary">Practice stock</div>
          <div className="mt-1 text-lg font-bold">{STOCK_TUTORIAL_PRACTICE.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {STOCK_TUTORIAL_PRACTICE.symbol} · Current price{" "}
            {formatPracticeBerries(STOCK_TUTORIAL_PRACTICE.buyPrice)}
          </div>
        </button>
      </div>
    );
  }

  if (interaction.currentStep === 2) {
    const amountIsValid =
      Number(interaction.berryAmountText.trim()) === STOCK_TUTORIAL_PRACTICE.investment;

    return (
      <div className="space-y-5">
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>You can buy by share quantity or by Berry amount.</p>
          <p>For this practice trade, invest {formatPracticeBerries(1000)}.</p>
        </div>
        <label className="block max-w-sm">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Berry amount
          </span>
          <input
            value={interaction.berryAmountText}
            onChange={(event) =>
              onAction({ type: "enter_berry_amount", value: event.target.value })
            }
            inputMode="numeric"
            placeholder="1000"
            className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {formatPracticeBerries(1000)} equals 10 shares at {formatPracticeBerries(100)} per share.
        </p>
        {!amountIsValid && interaction.berryAmountText.trim() !== "" ? (
          <p className="text-xs text-bear">Enter exactly 1000 for this practice trade.</p>
        ) : null}
        <button
          type="button"
          onClick={() => onAction({ type: "apply_berry_amount" })}
          disabled={busy || !amountIsValid}
          className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          APPLY
        </button>
      </div>
    );
  }

  if (interaction.currentStep === 3) {
    return (
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Before confirming, review the price, estimated shares, total cost, and remaining balance.
        </p>
        <dl className="grid max-w-md gap-px border border-border bg-border text-sm tabular">
          <ReviewRow label="Price" value={formatPracticeBerries(100)} />
          <ReviewRow label="Estimated shares" value="10" />
          <ReviewRow label="Total cost" value={formatPracticeBerries(1000)} />
          <ReviewRow label="Balance after" value={formatPracticeBerries(4000)} />
        </dl>
        <button
          type="button"
          onClick={() => onAction({ type: "confirm_practice_buy" })}
          disabled={busy}
          className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          CONFIRM PRACTICE BUY
        </button>
      </div>
    );
  }

  if (interaction.currentStep === 4) {
    return (
      <div className="space-y-5">
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>You now own 10 shares.</p>
          <p>
            Your open profit or loss changes as the stock price moves. Live prices can rise or fall.
          </p>
        </div>
        <div className="text-xl font-bold tabular text-bull">
          {BERRY_SYMBOL}100 → {BERRY_SYMBOL}105
        </div>
        <dl className="grid max-w-md gap-px border border-border bg-border text-sm tabular">
          <ReviewRow label="Average cost" value={formatPracticeBerries(100)} />
          <ReviewRow label="Current price" value={formatPracticeBerries(105)} />
          <ReviewRow label="Position value" value={formatPracticeBerries(1050)} />
          <ReviewRow label="Unrealized P&L" value={`+${formatPracticeBerries(50)}`} />
        </dl>
        <button
          type="button"
          onClick={() => onAction({ type: "acknowledge_price_movement" })}
          disabled={busy}
          className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>Selling converts some or all of your position back into Berries.</p>
        <p>Once sold, the profit or loss becomes realized.</p>
      </div>
      <div className="text-sm tabular">Available shares: 10</div>
      <label className="block max-w-sm">
        <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
          Shares to sell
        </span>
        <input
          value={interaction.selectedSellShares ?? ""}
          onChange={(event) =>
            onAction({ type: "select_sell_shares", shares: Number(event.target.value) })
          }
          inputMode="numeric"
          placeholder="10"
          className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onAction({ type: "select_all_shares" })}
          disabled={busy}
          className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
        >
          Select all 10 shares
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: "confirm_practice_sale" })}
          disabled={busy || interaction.selectedSellShares !== 10}
          className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          CONFIRM PRACTICE SALE
        </button>
      </div>
    </div>
  );
}

function CompletionScreen() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="terminal-panel p-6 text-sm">
        <h1 className="text-2xl font-bold">PRACTICE TRADE COMPLETE</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          You bought 10 shares for {formatPracticeBerries(1000)} and sold them for{" "}
          {formatPracticeBerries(1050)}.
        </p>
        <p className="mt-3 font-bold text-bull">
          Realized practice profit: +{formatPracticeBerries(50)}
        </p>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          No real Berries, holdings, statistics, achievements, or leaderboard values were changed.
        </p>
        <Link
          to="/"
          search={{ page: 1, q: "" }}
          className="mt-5 inline-block border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground"
        >
          ENTER THE MARKET
        </Link>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 bg-card px-4 py-3">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-bold">{value}</dd>
    </div>
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

function logOnboardingRouteFailure(stage: string) {
  console.warn("[Onboarding]", { stage, code: "ONBOARDING_ROUTE_OPTIONAL_FAILURE" });
}
