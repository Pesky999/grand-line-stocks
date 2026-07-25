import { useEffect, useRef } from "react";
import type { PageTip } from "@/lib/onboarding/page-tips";

type PageCoachCardProps = {
  tip: PageTip;
  currentIndex: number;
  total: number;
  busy?: boolean;
  onNext: () => void;
  onGotIt: () => void;
  onClose: () => void;
  onSkipTips: () => void;
};

export function PageCoachCard({
  tip,
  currentIndex,
  total,
  busy = false,
  onNext,
  onGotIt,
  onClose,
  onSkipTips,
}: PageCoachCardProps) {
  const isLast = currentIndex >= total - 1;
  const headingRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [tip.id, tip.version]);

  return (
    <aside
      role="region"
      aria-labelledby="page-coach-title"
      className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] border border-primary/50 bg-card shadow-lg shadow-background/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="text-[10px] uppercase tracking-widest text-primary">
          Tip {currentIndex + 1} / {total}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="space-y-3 p-4 text-sm">
        <div
          ref={headingRef}
          id="page-coach-title"
          tabIndex={-1}
          className="font-bold uppercase tracking-widest text-foreground outline-none"
        >
          {tip.title}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{tip.body}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkipTips}
            disabled={busy}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-bear disabled:opacity-50"
          >
            Skip tips
          </button>
          <div className="flex gap-2">
            {!isLast && (
              <button
                type="button"
                onClick={onNext}
                disabled={busy}
                className="border border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
              >
                Next
              </button>
            )}
            <button
              type="button"
              onClick={onGotIt}
              disabled={busy}
              className="border border-primary bg-primary px-3 py-2 text-[10px] uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
