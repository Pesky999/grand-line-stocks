import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { TerminalShell } from "@/components/TerminalShell";
import { amIAdmin } from "@/lib/api/market.functions";
import {
  addIdentityModerationRule,
  adminResetProfileIdentity,
  getIdentityModerationOverview,
  listIdentityModerationActions,
  listIdentityModerationFlags,
  listIdentityModerationRules,
  markIdentityModerationFlagReviewed,
  rescanIdentityModerationProfiles,
  searchIdentityModerationProfiles,
  setIdentityModerationRuleActive,
} from "@/lib/api/identity-moderation.functions";
import { toast } from "sonner";

const overviewQO = queryOptions({
  queryKey: ["identity-moderation", "overview"],
  queryFn: () => getIdentityModerationOverview(),
});

type FlagStatusFilter = "open" | "reviewed" | "resolved" | "dismissed" | "all";

const flagsQO = (status: FlagStatusFilter = "open") =>
  queryOptions({
    queryKey: ["identity-moderation", "flags", status],
    queryFn: () => listIdentityModerationFlags({ data: { status } }),
  });

const rulesQO = queryOptions({
  queryKey: ["identity-moderation", "rules"],
  queryFn: () => listIdentityModerationRules(),
});

const actionsQO = queryOptions({
  queryKey: ["identity-moderation", "actions"],
  queryFn: () => listIdentityModerationActions(),
});

export const Route = createFileRoute("/_authenticated/identity-moderation-admin")({
  head: () => ({
    meta: [{ title: "Identity Moderation - Berry Street" }, { name: "robots", content: "noindex" }],
  }),
  loader: async ({ context }) => {
    const { isAdmin } = await amIAdmin();
    if (!isAdmin) throw redirect({ to: "/", search: { page: 1, q: "" } });
    await Promise.all([
      context.queryClient.ensureQueryData(overviewQO),
      context.queryClient.ensureQueryData(flagsQO()),
      context.queryClient.ensureQueryData(rulesQO),
      context.queryClient.ensureQueryData(actionsQO),
    ]);
  },
  component: IdentityModerationAdmin,
});

function IdentityModerationAdmin() {
  const router = useRouter();
  const { data: overview } = useSuspenseQuery(overviewQO);
  const { data: rules } = useSuspenseQuery(rulesQO);
  const { data: actions } = useSuspenseQuery(actionsQO);
  const [flagStatus, setFlagStatus] = useState<FlagStatusFilter>("open");
  const { data: flags } = useSuspenseQuery(flagsQO(flagStatus));
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("supplemental");
  const [kind, setKind] = useState<"blocked" | "reserved" | "allow">("blocked");
  const [matchMode, setMatchMode] = useState<"exact" | "word" | "substring" | "compact_substring">(
    "word",
  );
  const [severity, setSeverity] = useState(2);

  const searchQ = useQuery({
    queryKey: ["identity-moderation", "profiles", query],
    queryFn: () => searchIdentityModerationProfiles({ data: { query } }),
    enabled: query.trim().length > 0,
  });

  const invalidate = () => router.invalidate();

  const reviewMutation = useMutation({
    mutationFn: (data: { flagId: string; status: "reviewed" | "resolved" | "dismissed" }) =>
      markIdentityModerationFlagReviewed({ data }),
    onSuccess: async () => {
      toast.success("Flag updated.");
      await invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update flag."),
  });

  const resetMutation = useMutation({
    mutationFn: (data: { profileId: string; resetUsername: boolean; resetDisplayName: boolean }) =>
      adminResetProfileIdentity({
        data: {
          profileId: data.profileId,
          resetUsername: data.resetUsername,
          resetDisplayName: data.resetDisplayName,
          reason: "Admin reset from Identity Moderation console.",
        },
      }),
    onSuccess: async () => {
      toast.success("Public identity reset.");
      await invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not reset public identity."),
  });

  const addRuleMutation = useMutation({
    mutationFn: () =>
      addIdentityModerationRule({
        data: {
          term,
          kind,
          category,
          matchMode,
          severity,
        },
      }),
    onSuccess: async () => {
      toast.success("Moderation rule added.");
      setTerm("");
      await invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add rule."),
  });

  const rescanMutation = useMutation({
    mutationFn: () => rescanIdentityModerationProfiles(),
    onSuccess: async (result) => {
      toast.success(`Scan complete: ${result.flagged} flag(s) from ${result.scanned} profile(s).`);
      await invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not scan profiles."),
  });

  const ruleActiveMutation = useMutation({
    mutationFn: (data: { termId: string; active: boolean }) =>
      setIdentityModerationRuleActive({ data }),
    onSuccess: async () => {
      toast.success("Rule updated.");
      await invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update rule."),
  });

  function submitRule(event: FormEvent) {
    event.preventDefault();
    if (!term.trim()) return;
    addRuleMutation.mutate();
  }

  function confirmIdentityReset(
    profileId: string,
    resetUsername: boolean,
    resetDisplayName: boolean,
  ) {
    const scope =
      resetUsername && resetDisplayName
        ? "username and display name"
        : resetUsername
          ? "username"
          : "display name";
    if (!window.confirm(`Reset this profile's public ${scope}?`)) return;
    resetMutation.mutate({ profileId, resetUsername, resetDisplayName });
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="terminal-panel">
          <div className="terminal-header text-warn">Identity Moderation</div>
          <div className="space-y-3 p-4 text-xs text-muted-foreground">
            <p>
              Review public usernames and display names, manage supplemental policy terms, and reset
              public identities when needed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/admin"
                className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary"
              >
                Back to Admin Console
              </Link>
              <button
                type="button"
                onClick={() => rescanMutation.mutate()}
                disabled={rescanMutation.isPending}
                className="border border-warn px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-warn hover:bg-warn hover:text-background disabled:opacity-40"
              >
                Rescan Profiles
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-px border border-border bg-border md:grid-cols-4">
          <Stat label="Open Flags" value={overview.openFlags} />
          <Stat label="Reviewed" value={overview.reviewedFlags} />
          <Stat label="Resolved" value={overview.resolvedFlags} />
          <Stat label="Active Rules" value={overview.activeRules} />
          <Stat label="Supplemental Blocked" value={overview.supplementalBlockedTerms} />
          <Stat label="Reserved" value={overview.reservedTerms} />
          <Stat label="Allowlist" value={overview.allowlistTerms} />
          <Stat label="Recent Actions" value={overview.recentActions} />
        </div>

        <section className="terminal-panel">
          <div className="terminal-header">Profile Review</div>
          <div className="border-b border-border p-4">
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:max-w-xs">
              Flag Status
              <select
                value={flagStatus}
                onChange={(event) => setFlagStatus(event.target.value as FlagStatusFilter)}
                className="border border-border bg-input px-2 py-2 text-xs normal-case tracking-normal text-foreground"
              >
                <option value="open">open</option>
                <option value="reviewed">reviewed</option>
                <option value="resolved">resolved</option>
                <option value="dismissed">dismissed</option>
                <option value="all">all</option>
              </select>
            </label>
          </div>
          {flags.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">No matching identity flags.</div>
          ) : (
            <ul className="divide-y divide-border text-xs">
              {flags.map((flag) => (
                <li key={flag.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="font-bold text-foreground">
                      @{flag.profiles?.username ?? "unknown"} - {flag.field}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Status: {flag.status} / Category: {flag.category} / Code:{" "}
                      {flag.violation_code}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Detected: {new Date(flag.created_at).toLocaleString()}
                    </div>
                    <div className="mt-1 tabular text-muted-foreground">
                      Observed: {flag.observed_value ?? "-"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 self-start">
                    <button
                      type="button"
                      onClick={() => reviewMutation.mutate({ flagId: flag.id, status: "reviewed" })}
                      disabled={reviewMutation.isPending}
                      className="border border-border px-3 py-2 text-[10px] uppercase tracking-widest hover:border-primary hover:text-primary disabled:opacity-40"
                    >
                      Mark Reviewed
                    </button>
                    <IdentityResetButtons
                      profileId={flag.profile_id}
                      busy={resetMutation.isPending}
                      onReset={confirmIdentityReset}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="terminal-panel">
          <div className="terminal-header">Profile Lookup</div>
          <div className="space-y-3 p-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search username, display name, or profile ID"
              className="w-full border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {searchQ.data && (
              <ul className="divide-y divide-border border border-border text-xs">
                {searchQ.data.map((profile) => (
                  <li
                    key={profile.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span>
                      @{profile.username} - {profile.display_name ?? "No display name"}
                    </span>
                    <IdentityResetButtons
                      profileId={profile.id}
                      busy={resetMutation.isPending}
                      onReset={confirmIdentityReset}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <form onSubmit={submitRule} className="terminal-panel">
            <div className="terminal-header">Add Supplemental Rule</div>
            <div className="grid gap-3 p-4 text-xs">
              <input
                required
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Term"
                className="border border-border bg-input px-3 py-2 outline-none focus:border-primary"
              />
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as typeof kind)}
                  className="border border-border bg-input px-2 py-2"
                >
                  <option value="blocked">blocked</option>
                  <option value="reserved">reserved</option>
                  <option value="allow">allow</option>
                </select>
                <select
                  value={matchMode}
                  onChange={(event) => setMatchMode(event.target.value as typeof matchMode)}
                  className="border border-border bg-input px-2 py-2"
                >
                  <option value="exact">exact</option>
                  <option value="word">word</option>
                  <option value="substring">substring</option>
                  <option value="compact_substring">compact substring</option>
                </select>
                <select
                  value={severity}
                  onChange={(event) => setSeverity(Number(event.target.value))}
                  className="border border-border bg-input px-2 py-2"
                >
                  <option value={1}>low</option>
                  <option value={2}>medium</option>
                  <option value={3}>high</option>
                  <option value={4}>critical</option>
                </select>
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Category"
                  className="border border-border bg-input px-3 py-2 outline-none focus:border-primary"
                />
              </div>
              <button
                type="submit"
                disabled={addRuleMutation.isPending}
                className="bg-primary px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
              >
                Add Rule
              </button>
            </div>
          </form>

          <div className="terminal-panel">
            <div className="terminal-header">Recent Moderation Actions</div>
            {actions.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">No actions recorded.</div>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {actions.slice(0, 12).map((action) => (
                  <li key={action.id} className="p-3">
                    <div className="font-bold text-foreground">
                      {action.action_type} - {new Date(action.created_at).toLocaleString()}
                    </div>
                    <div className="text-muted-foreground">
                      @{action.profiles?.username ?? "unknown"} - {action.reason ?? "No reason"}
                    </div>
                    <div className="text-muted-foreground">
                      Actor:{" "}
                      {action.actor_user_id ? `...${action.actor_user_id.slice(-8)}` : "system"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="terminal-panel">
          <div className="terminal-header">Policy Rules</div>
          <ul className="max-h-96 divide-y divide-border overflow-auto text-xs">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  {rule.term} / {rule.kind} / {rule.category} / {rule.match_mode} / {rule.severity}
                  {rule.is_core ? " / core" : ""}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    ruleActiveMutation.mutate({ termId: rule.id, active: !rule.active })
                  }
                  disabled={rule.is_core || ruleActiveMutation.isPending}
                  className={`border border-border px-2 py-1 text-[10px] uppercase tracking-widest disabled:opacity-40 ${
                    rule.active ? "text-bull" : "text-muted-foreground"
                  }`}
                >
                  {rule.active ? "active" : "inactive"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </TerminalShell>
  );
}

function IdentityResetButtons({
  profileId,
  busy,
  onReset,
}: {
  profileId: string;
  busy: boolean;
  onReset: (profileId: string, resetUsername: boolean, resetDisplayName: boolean) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onReset(profileId, true, false)}
        disabled={busy}
        className="border border-bear px-3 py-2 text-[10px] uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground disabled:opacity-40"
      >
        Reset Username
      </button>
      <button
        type="button"
        onClick={() => onReset(profileId, false, true)}
        disabled={busy}
        className="border border-bear px-3 py-2 text-[10px] uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground disabled:opacity-40"
      >
        Reset Display
      </button>
      <button
        type="button"
        onClick={() => onReset(profileId, true, true)}
        disabled={busy}
        className="border border-bear px-3 py-2 text-[10px] uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground disabled:opacity-40"
      >
        Reset Both
      </button>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular text-accent">{value}</div>
    </div>
  );
}
