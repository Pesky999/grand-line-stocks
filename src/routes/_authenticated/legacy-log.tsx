import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TerminalShell } from "@/components/TerminalShell";
import { getMyLegacyLog, LEGACY_LOG_QUERY_KEY } from "@/lib/api/legendary.functions";
import {
  ACHIEVEMENT_TIER_ORDER,
  SPEC_DESCRIPTION,
  SPEC_LABEL,
  SPEC_ORDER,
  TIER_TONE,
  TITLE_LABEL,
  TITLE_LADDER,
  TITLE_TONE,
  getInvestorTitleStatus,
  getNextInvestorTitle,
} from "@/lib/legendary";
import { buildAchievementProgressRows } from "@/lib/legacy-log/progress";
import { formatBerries } from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/legacy-log")({
  head: () => ({
    meta: [
      { title: "Legacy Log — Berry Street" },
      {
        name: "description",
        content: "Track your Legendary Investor achievements, reputation, titles, and records.",
      },
    ],
  }),
  component: LegacyLog,
});

type Filter = "all" | "unlocked" | "locked";

function LegacyLog() {
  const [filter, setFilter] = useState<Filter>("all");
  const log = useQuery({
    queryKey: LEGACY_LOG_QUERY_KEY,
    queryFn: () => getMyLegacyLog(),
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    if (!log.data) return [];
    return buildAchievementProgressRows({
      catalog: log.data.catalog,
      unlocked: log.data.unlocked,
      metrics: log.data.metrics,
    });
  }, [log.data]);

  const filteredRows = rows.filter((row) => {
    if (filter === "unlocked") return row.unlocked;
    if (filter === "locked") return !row.unlocked;
    return true;
  });
  const currentTitle = log.data?.currentTitle ?? "rookie_pirate";
  const currentSpecialization = log.data?.currentSpecialization ?? "generalist";
  const reputationScore = Number(log.data?.metrics.reputationScore ?? 0);
  const nextTitle = getNextInvestorTitle(reputationScore);
  const stats = log.data?.stats;
  const legacyRecords = log.data?.legacyRecords ?? [];
  const emptyAchievementMessage =
    filter === "all"
      ? "No achievements in this tier."
      : filter === "unlocked"
        ? "No unlocked achievements in this tier."
        : "No locked achievements in this tier.";

  return (
    <TerminalShell>
      <div className="border-b border-border bg-card/60 px-4 py-4">
        <h1 className="text-2xl font-bold tracking-widest text-primary">LEGACY LOG</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Your Legendary Investor dossier: achievements, reputation title progress, specialization,
          and first-to records claimed on Berry Street.
        </p>
      </div>

      {log.isLoading ? (
        <div className="p-8 text-xs text-muted-foreground">Loading Legacy Log...</div>
      ) : log.isError || !log.data ? (
        <div className="p-8 text-xs text-bear">Legacy Log could not load.</div>
      ) : (
        <div className="space-y-4 p-4">
          <section className="grid gap-px border border-border bg-border md:grid-cols-4">
            <SummaryCell label="Reputation" value={`${reputationScore} / 1000`} tone="accent" />
            <SummaryCell
              label="Title"
              value={TITLE_LABEL[currentTitle] ?? "Rookie Pirate"}
              tone="primary"
            />
            <SummaryCell
              label="Next Title"
              value={
                nextTitle ? `${nextTitle.label} at ${nextTitle.threshold}` : "Maximum title reached"
              }
            />
            <SummaryCell
              label="Specialization"
              value={SPEC_LABEL[currentSpecialization] ?? "Generalist"}
            />
            <SummaryCell
              label="Achievements"
              value={`${log.data.achievementCount} / ${rows.length}`}
              tone="bull"
            />
            <SummaryCell
              label="Catalog Rep Earned"
              value={String(log.data.achievementReputationRewardTotal)}
            />
            <SummaryCell label="Current Streak" value={`${stats?.login_streak ?? 0} days`} />
            <SummaryCell
              label="Best Rank"
              value={stats?.highest_rank ? `#${stats.highest_rank}` : "-"}
            />
          </section>

          <section className="terminal-panel">
            <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
              <span>Achievement Catalog</span>
              <div className="flex gap-1">
                {(["all", "unlocked", "locked"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFilter(option)}
                    className={`border px-2 py-1 text-[10px] uppercase tracking-widest ${
                      filter === option
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option === "all" ? "All" : option === "unlocked" ? "Unlocked" : "Locked"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-5 p-4">
              {ACHIEVEMENT_TIER_ORDER.map((tier) => {
                const tierRows = filteredRows.filter((row) => row.tier === tier);
                return (
                  <div key={tier}>
                    <h2
                      className={`mb-2 text-xs font-bold uppercase tracking-widest ${TIER_TONE[tier]}`}
                    >
                      {tier}
                    </h2>
                    {tierRows.length === 0 ? (
                      <div className="border border-border/60 p-3 text-xs text-muted-foreground">
                        {emptyAchievementMessage}
                      </div>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {tierRows.map((achievement) => (
                          <AchievementCard key={achievement.code} achievement={achievement} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="terminal-panel">
              <div className="terminal-header">Reputation Title Ladder</div>
              <div className="divide-y divide-border text-xs">
                {TITLE_LADDER.map((title) => {
                  const status = getInvestorTitleStatus({
                    titleCode: title.code,
                    currentTitle,
                    reputationScore,
                  });
                  const isCurrent = status === "current";
                  return (
                    <div key={title.code} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div
                          className={`font-bold uppercase tracking-widest ${
                            isCurrent ? TITLE_TONE[title.code] : "text-foreground"
                          }`}
                        >
                          {title.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {title.threshold} reputation required
                        </div>
                      </div>
                      <span
                        className={`border px-2 py-1 text-[10px] uppercase tracking-widest ${
                          isCurrent
                            ? "border-primary text-primary"
                            : status === "complete"
                              ? "border-bull/60 text-bull"
                              : status === "next"
                                ? "border-accent/60 text-accent"
                                : "border-border text-muted-foreground"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="terminal-panel">
              <div className="terminal-header">Specialization</div>
              <div className="p-4 text-xs text-muted-foreground">
                Specializations are dynamic classifications and can change as your trading behavior
                changes. Rules are shown in evaluation order; later override rules can replace an
                earlier volume classification when their condition qualifies.
              </div>
              <div className="divide-y divide-border text-xs">
                {SPEC_ORDER.map((spec) => (
                  <div key={spec} className="px-4 py-3">
                    <div
                      className={`font-bold ${
                        currentSpecialization === spec ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {SPEC_LABEL[spec]}
                      {currentSpecialization === spec && (
                        <span className="ml-2 border border-primary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary">
                          current
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-muted-foreground">{SPEC_DESCRIPTION[spec]}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="terminal-panel">
            <div className="terminal-header">Legacy Records</div>
            <div className="border-b border-border p-4 text-xs text-muted-foreground">
              First-to records currently track two templates: First Millionaire Pirate and First
              [Character] Millionaire.
            </div>
            {legacyRecords.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                No first-to legacy records claimed yet.
              </div>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {legacyRecords.map((record) => (
                  <li key={record.code} className="px-4 py-3">
                    <div className="font-bold text-yellow-400">{record.title}</div>
                    <div className="mt-1 text-muted-foreground">{record.description}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {new Date(record.achieved_at).toLocaleString()} - à¸¿
                      {formatBerries(Number(record.value ?? 0))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </TerminalShell>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "bull" | "primary";
}) {
  const color =
    tone === "accent"
      ? "text-accent"
      : tone === "bull"
        ? "text-bull"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground";
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-bold tabular ${color}`}>{value}</div>
    </div>
  );
}

function AchievementCard({
  achievement,
}: {
  achievement: ReturnType<typeof buildAchievementProgressRows>[number];
}) {
  return (
    <article
      className={`border p-3 ${
        achievement.unlocked ? "border-primary/70 bg-primary/5" : "border-border bg-card/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">
            <span className="mr-1">{achievement.icon}</span>
            {achievement.name}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {achievement.description}
          </div>
        </div>
        <span
          className={`shrink-0 border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${TIER_TONE[achievement.tier] ?? "border-border text-muted-foreground"}`}
        >
          {achievement.tier}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{achievement.category}</span>
        <span>+{achievement.reputationReward} rep</span>
        <span className={achievement.unlocked ? "text-primary" : "text-muted-foreground"}>
          {achievement.unlocked ? "unlocked" : "locked"}
        </span>
        {achievement.unlockedAt && (
          <span>{new Date(achievement.unlockedAt).toLocaleDateString()}</span>
        )}
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">{achievement.progressLabel}</div>
      {achievement.progressPercent !== null && (
        <div className="mt-2 h-1.5 border border-border bg-background">
          <div className="h-full bg-primary" style={{ width: `${achievement.progressPercent}%` }} />
        </div>
      )}
    </article>
  );
}
