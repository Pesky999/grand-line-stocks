import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { TerminalShell } from "@/components/TerminalShell";
import { useMe } from "@/hooks/useMe";
import {
  getTodayDailyCrewBuilderMission,
  submitDailyCrewBuilderPreview,
  type DailyCrewBuilderPersistedResult,
  type DailyCrewBuilderPublicMission,
} from "@/lib/api/daily-crew-builder.functions";
import type { DailyCrewRole } from "@/lib/daily-crew-builder/scoring";

export const Route = createFileRoute("/games/daily-crew-builder")({
  head: () => ({
    meta: [
      { title: "Daily Crew Builder - Berry Street" },
      {
        name: "description",
        content: "Build a five-role One Piece crew from a curated 15-character daily pool.",
      },
    ],
  }),
  component: DailyCrewBuilderPage,
});

type Assignments = Partial<Record<DailyCrewRole, string>>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Daily Crew Builder submission failed";
}

function rankLabel(rank: DailyCrewBuilderPersistedResult["rank"]) {
  return rank === "fail" ? "Fail" : rank.toUpperCase();
}

function DailyCrewBuilderPage() {
  const { user, authLoading } = useMe();
  const [assignments, setAssignments] = useState<Assignments>({});
  const [result, setResult] = useState<DailyCrewBuilderPersistedResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const missionQ = useQuery({
    queryKey: ["daily-crew-builder-mission"],
    queryFn: () => getTodayDailyCrewBuilderMission(),
    staleTime: 5 * 60_000,
  });

  const mission = missionQ.data as DailyCrewBuilderPublicMission | undefined;
  const roles = mission?.roles ?? [];
  const pool = mission?.pool ?? [];

  const assignedEntries = useMemo(
    () => Object.entries(assignments).filter((entry): entry is [DailyCrewRole, string] => Boolean(entry[1])),
    [assignments],
  );
  const assignedIds = useMemo(() => new Set(assignedEntries.map(([, characterId]) => characterId)), [assignedEntries]);
  const allRolesAssigned = roles.length > 0 && roles.every((role) => assignments[role.role]);
  const submissionLocked = Boolean(result?.submissionSaved);
  const canSubmit = Boolean(user) && allRolesAssigned && !missionQ.isLoading && !submissionLocked;

  const submitPreviewM = useMutation({
    mutationFn: () =>
      submitDailyCrewBuilderPreview({
        data: {
          missionId: mission?.id ?? "",
          assignments: roles.map((role) => ({
            role: role.role,
            characterId: assignments[role.role] ?? "",
          })),
        },
      }),
    onMutate: () => {
      setSubmissionError(null);
    },
    onSuccess: (next) => {
      const savedResult = next as DailyCrewBuilderPersistedResult;
      setResult(savedResult);
      setAssignments(
        Object.fromEntries(
          savedResult.roles.map((role) => [role.role, role.characterId]),
        ) as Assignments,
      );
      toast.success(
        savedResult.rewardPaid
          ? savedResult.alreadySubmitted
            ? "Your saved crew result is loaded. Reward already paid."
            : "Crew submitted. Reward paid."
          : "Your crew is saved. Reward payout is pending.",
      );
    },
    onError: (error) => {
      const message = errorMessage(error);
      setSubmissionError(message);
      toast.error(message);
    },
  });

  const assignedRoleForCharacter = (characterId: string) => {
    const match = assignedEntries.find(([, assignedCharacterId]) => assignedCharacterId === characterId);
    return match ? mission?.roles.find((role) => role.role === match[0])?.name : null;
  };

  const setRoleAssignment = (role: DailyCrewRole, characterId: string) => {
    if (submissionLocked) return;
    setSubmissionError(null);
    setResult(null);

    setAssignments((current) => {
      if (!characterId) {
        const next = { ...current };
        delete next[role];
        return next;
      }

      const duplicateRole = Object.entries(current).find(
        ([otherRole, assignedCharacterId]) => otherRole !== role && assignedCharacterId === characterId,
      );

      if (duplicateRole) {
        toast.error("Each character can only fill one role.");
        return current;
      }

      return { ...current, [role]: characterId };
    });
  };

  const clearAssignments = () => {
    if (submissionLocked) return;
    setAssignments({});
    setResult(null);
    setSubmissionError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      setSubmissionError("Sign in to submit your crew.");
      toast("Sign in to submit your crew.");
      return;
    }
    if (!allRolesAssigned) {
      setSubmissionError("Assign one unique character to every role before submitting.");
      return;
    }

    submitPreviewM.mutate();
  };

  return (
    <TerminalShell>
      <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
        <section className="terminal-panel">
          <div className="terminal-header flex items-center justify-between">
            <span>Daily Crew Builder</span>
            <span className="text-[10px] text-muted-foreground">{mission?.missionDate ?? "Loading"} UTC</span>
          </div>
          <div className="space-y-4 p-4 sm:p-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
                15-character pool
              </div>
              <h1 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">
                Daily Crew Builder
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Build a five-role crew from today's curated One Piece pool. Your first submitted crew
                is saved for this mission and pays its rank reward automatically.
              </p>
            </div>

            {missionQ.isLoading && (
              <div className="border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                Loading today's crew mission...
              </div>
            )}

            {missionQ.isError && (
              <div role="alert" className="border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
                Could not load Daily Crew Builder. Please refresh and try again.
              </div>
            )}

            {mission && (
              <div className="border border-border bg-card/60 p-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Mission
                </div>
                <h2 className="mt-2 text-lg font-bold text-foreground">{mission.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{mission.brief}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {mission.missionTags.map((tag) => (
                    <span key={tag} className="border border-border bg-background px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
                  Submit once per mission. Your saved result is locked in, and eligible rewards are
                  paid automatically after the server records your crew.
                </div>
              </div>
            )}

            {!authLoading && !user && (
              <div className="border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                You can inspect the mission and build a crew while signed out.{" "}
                <a href="/auth" className="text-primary underline">
                  Sign in
                </a>{" "}
                to submit your crew.
              </div>
            )}
          </div>
        </section>

        {mission && (
          <>
            <form onSubmit={handleSubmit} className="terminal-panel">
              <div className="terminal-header">Role Assignment</div>
              <div className="space-y-4 p-4">
                <div className="grid gap-3 md:grid-cols-5">
                  {roles.map((role) => (
                    <label key={role.role} className="block border border-border bg-card/60 p-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {role.name}
                      </span>
                      <select
                        value={assignments[role.role] ?? ""}
                        onChange={(event) => setRoleAssignment(role.role, event.target.value)}
                        disabled={submissionLocked}
                        className="mt-2 w-full border border-border bg-background px-2 py-2 text-xs text-foreground outline-none focus:border-primary"
                      >
                        <option value="">Choose character</option>
                        {pool.map((character) => {
                          const assignedToAnotherRole = assignedIds.has(character.id) && assignments[role.role] !== character.id;
                          return (
                            <option key={character.id} value={character.id} disabled={assignedToAnotherRole}>
                              {character.name}
                            </option>
                          );
                        })}
                      </select>
                      {assignments[role.role] && (
                        <button
                          type="button"
                          onClick={() => setRoleAssignment(role.role, "")}
                          disabled={submissionLocked}
                          className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground underline hover:text-primary"
                        >
                          Clear
                        </button>
                      )}
                    </label>
                  ))}
                </div>

                {submissionError && (
                  <div role="alert" className="border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
                    {submissionError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={!canSubmit || submitPreviewM.isPending}
                    className="border border-primary bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submissionLocked ? "Crew Saved" : user ? "Submit Crew" : "Sign in to submit"}
                  </button>
                  <button
                    type="button"
                    onClick={clearAssignments}
                    disabled={submissionLocked}
                    className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    {submissionLocked ? "Saved Result Locked" : "Reset Form"}
                  </button>
                </div>
              </div>
            </form>

            <section className="terminal-panel">
              <div className="terminal-header">Character Pool</div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {pool.map((character) => {
                  const assignedRole = assignedRoleForCharacter(character.id);
                  return (
                    <article
                      key={character.id}
                      className={`border p-3 ${assignedRole ? "border-primary/50 bg-primary/5" : "border-border bg-card/60"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            #{character.displayOrder}
                          </div>
                          <h3 className="mt-1 text-sm font-bold text-foreground">{character.name}</h3>
                        </div>
                        {assignedRole && (
                          <span className="border border-primary/40 px-2 py-1 text-[10px] uppercase tracking-widest text-primary">
                            {assignedRole}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {character.visibleTags.map((tag) => (
                          <span key={tag} className="border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {result && (
              <section className="terminal-panel">
                <div className="terminal-header flex items-center justify-between">
                  <span>Saved Crew Result</span>
                  {result.isPerfectSolution && <span className="text-primary">Perfect crew</span>}
                </div>
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <ResultStat label="Score" value={`${result.score} / ${result.maxScore}`} />
                    <ResultStat label="Rank" value={rankLabel(result.rank)} />
                    <ResultStat label="Reward" value={`${result.rewardAmount} Berries`} />
                    <ResultStat label="Synergy" value={`+${result.synergyScore}`} />
                  </div>
                  <div className={`border p-3 text-xs ${result.rewardPaid ? "border-primary/30 bg-primary/5 text-primary" : "border-bear/40 bg-bear/10 text-bear"}`}>
                    {result.alreadySubmitted
                      ? "You already submitted for this mission, so your saved result is shown. "
                      : "Your first submitted crew is saved for this mission. "}
                    {result.rewardPaid
                      ? `Reward ${result.alreadySubmitted ? "already paid" : "paid"}: ฿${result.rewardAmount}.${typeof result.walletBalance === "number" ? ` Wallet balance: ฿${result.walletBalance}.` : ""}`
                      : `Reward payout is pending. Your saved result is safe.${result.payoutErrorCode ? ` Diagnostic: ${result.payoutErrorCode}.` : ""}`}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-foreground">Role breakdown</h3>
                      {result.roles.map((role) => (
                        <div key={role.role} className="border border-border bg-card/60 p-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-foreground">{role.roleName}: {role.characterName}</span>
                            <span className="tabular text-primary">{role.score} / {role.maxScore}</span>
                          </div>
                          <p className="mt-1 text-muted-foreground">{role.explanation}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-foreground">Score summary</h3>
                      <div className="border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                        Base score: <span className="text-foreground tabular">{result.baseScore}</span>
                      </div>
                      <div className="border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                        Synergy score: <span className="text-foreground tabular">{result.synergyScore}</span>
                      </div>
                      {result.synergy.length > 0 ? (
                        result.synergy.map((synergy) => (
                          <div key={synergy.id} className="border border-primary/30 bg-primary/5 p-3 text-xs">
                            <div className="font-bold text-primary">{synergy.label} +{synergy.points}</div>
                            <p className="mt-1 text-muted-foreground">{synergy.explanation}</p>
                          </div>
                        ))
                      ) : (
                        <div className="border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                          No synergy bonus earned.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </TerminalShell>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground tabular">{value}</div>
    </div>
  );
}
