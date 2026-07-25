import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ONBOARDING_QUERY_KEY,
  dismissMyPageTip,
  getMyOnboardingState,
  recordMyOnboardingEvent,
  skipMyPageTips,
} from "@/lib/api/onboarding.functions";
import { shouldAutoOpenOnboarding } from "@/lib/onboarding/progress";
import { pageTipDedupeKey, pageTipsForPath } from "@/lib/onboarding/page-tips";
import { hasOnboardingSessionBypass } from "@/lib/onboarding/session-bypass";
import { PageCoachCard } from "@/components/onboarding/PageCoachCard";

type OnboardingExperienceProps = {
  signedIn: boolean;
};

function logOnboardingUiFailure(stage: string) {
  console.warn("[Onboarding]", { stage, code: "ONBOARDING_UI_OPTIONAL_FAILURE" });
}

export function OnboardingExperience({ signedIn }: OnboardingExperienceProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tipIndex, setTipIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hiddenTipIds, setHiddenTipIds] = useState<Set<string>>(() => new Set());
  const seenTipKeyRef = useRef<string | null>(null);
  const seenOfferKeyRef = useRef<string | null>(null);
  const onboardingQ = useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: () => getMyOnboardingState(),
    enabled: signedIn,
    retry: false,
    staleTime: 30_000,
  });
  const state = onboardingQ.data ?? null;
  const tips = useMemo(
    () => pageTipsForPath(pathname, state).filter((tip) => !hiddenTipIds.has(tip.id)),
    [hiddenTipIds, pathname, state],
  );
  const currentTip = tips[Math.min(tipIndex, Math.max(0, tips.length - 1))] ?? null;

  useEffect(() => {
    setTipIndex(0);
    seenTipKeyRef.current = null;
  }, [pathname]);

  useEffect(() => {
    if (!signedIn || !state) return;
    if (state.stockTutorialStatus === "not_started" && state.stockTutorialOffer !== "none") {
      const dedupeKey = `onboarding_offer_seen:${state.stockTutorialOffer}:v${state.stockTutorialVersion}`;
      if (seenOfferKeyRef.current !== dedupeKey) {
        seenOfferKeyRef.current = dedupeKey;
        void recordMyOnboardingEvent({
          data: {
            eventName: "onboarding_offer_seen",
            metadata: { offer: state.stockTutorialOffer },
            dedupeKey,
          },
        }).catch(() => logOnboardingUiFailure("onboarding_offer_seen"));
      }
    }
    if (
      !shouldAutoOpenOnboarding(state, {
        pathname,
        hasSessionBypass: hasOnboardingSessionBypass(),
      })
    ) {
      return;
    }
    void navigate({ to: "/onboarding", replace: true });
  }, [navigate, pathname, signedIn, state]);

  useEffect(() => {
    if (!currentTip) return;
    const dedupeKey = pageTipDedupeKey("page_tip_seen", currentTip);
    if (seenTipKeyRef.current === dedupeKey) return;
    seenTipKeyRef.current = dedupeKey;
    void recordMyOnboardingEvent({
      data: {
        eventName: "page_tip_seen",
        pageKey: currentTip.id,
        dedupeKey,
      },
    }).catch(() => logOnboardingUiFailure("page_tip_seen"));
  }, [currentTip]);

  if (!signedIn || onboardingQ.isError || !currentTip) return null;

  async function invalidateOnboarding() {
    await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
  }

  async function dismissCurrentTip(advance: boolean) {
    if (!currentTip) return;
    setBusy(true);
    try {
      await dismissMyPageTip({ data: { tipId: currentTip.id, version: currentTip.version } });
      await invalidateOnboarding();
      if (advance && tipIndex < tips.length - 1) setTipIndex((current) => current + 1);
    } catch {
      setHiddenTipIds((current) => new Set(current).add(currentTip.id));
      logOnboardingUiFailure("page_tip_dismiss");
    } finally {
      setBusy(false);
    }
  }

  async function skipTips() {
    setBusy(true);
    try {
      await skipMyPageTips();
      await invalidateOnboarding();
    } catch {
      setHiddenTipIds(new Set(tips.map((tip) => tip.id)));
      logOnboardingUiFailure("page_tips_skip");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageCoachCard
      tip={currentTip}
      currentIndex={Math.min(tipIndex, tips.length - 1)}
      total={tips.length}
      busy={busy}
      onNext={() => void dismissCurrentTip(true)}
      onGotIt={() => void dismissCurrentTip(false)}
      onClose={() => setHiddenTipIds((current) => new Set(current).add(currentTip.id))}
      onSkipTips={() => void skipTips()}
    />
  );
}
