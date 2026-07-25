import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { updateProfile } from "@/lib/api/wallet.functions";
import { getPublicProfile } from "@/lib/api/legendary.functions";
import {
  deleteMyAccount,
  getMyAccountDeletionReadiness,
} from "@/lib/api/account-deletion.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSignOut } from "@/hooks/useSignOut";

import { TerminalShell } from "@/components/TerminalShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBerries } from "@/lib/wallet";
import { TITLE_LABEL, TITLE_TONE, SPEC_LABEL } from "@/lib/legendary";
import { validateDisplayNameFormat } from "@/lib/moderation/public-identity";
import { formatShares } from "@/lib/trading/fractional-shares";
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  ACCOUNT_DELETION_SUCCESS_KEY,
  accountDeletionMessageForCode,
  extractAccountDeletionReasonCode,
} from "@/lib/account-deletion/security";
import { toast } from "sonner";
import { AchievementMedallion } from "@/components/AchievementMedallion";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Berry Street" }] }),
  component: Profile,
});

type ProfileStats = {
  title?: string | null;
  specialization?: string | null;
  reputation_score?: number | null;
  highest_rank?: number | null;
};

type ProfileAchievement = {
  achievements: {
    code: string;
    name: string;
    description: string;
    icon: string | null;
  };
};

const DELETE_ACCOUNT_INCLUDED_DATA = [
  "Public profile and username",
  "Berry wallet",
  "Character holdings",
  "Trade history",
  "Cost basis and realized profit records",
  "Portfolio and net-worth snapshots",
  "Leaderboard and ranking data",
  "User statistics and reputation",
  "Achievements and Legacy progress",
  "Grand Line Guess activity",
  "Daily Crew activity",
  "Trivia activity",
  "Roles and account-specific preferences",
] as const;

const TRADE_REQUEST_STORAGE_PREFIX = "grand-line-stocks:trade-request";

function safeSessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Session storage is optional; the server-side deletion result is authoritative.
  }
}

function clearStoragePrefix(storage: Storage | null, prefix: string) {
  if (!storage) return;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) storage.removeItem(key);
    }
  } catch {
    // Best-effort local cleanup. Deletion already succeeded on the server.
  }
}

async function cleanupAfterConfirmedAccountDeletion(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await queryClient.cancelQueries();
  queryClient.clear();
  clearStoragePrefix(window.sessionStorage, TRADE_REQUEST_STORAGE_PREFIX);
  clearStoragePrefix(window.localStorage, TRADE_REQUEST_STORAGE_PREFIX);

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The Auth user is already deleted; local sign-out failure should not report deletion failure.
  }

  safeSessionSet(ACCOUNT_DELETION_SUCCESS_KEY, "1");
  window.location.assign("/auth");
}

function Profile() {
  const { data, isLoading } = useMe();
  const invalidate = useInvalidateMe();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUsername, setDeleteUsername] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const handleSignOut = useSignOut();

  const profile = data?.profile ?? null;
  const username = profile?.username ?? null;
  const pub = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => getPublicProfile({ data: { username: username! } }),
    enabled: !!username,
    staleTime: 30_000,
  });
  const deletionReadiness = useQuery({
    queryKey: ["account-deletion-readiness"],
    queryFn: () => getMyAccountDeletionReadiness(),
    enabled: !!data && !!username,
    retry: false,
    staleTime: 0,
  });

  if (isLoading || !data) {
    return (
      <TerminalShell>
        <div className="p-8 text-sm text-muted-foreground">Loading profile…</div>
      </TerminalShell>
    );
  }

  const marketValue = data.holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
  const netWorth = data.berries + marketValue;
  const joined = profile?.created_at ? new Date(profile.created_at) : null;
  const stats = (pub.data?.stats ?? {}) as ProfileStats;
  const ach = (pub.data?.achievements ?? []) as ProfileAchievement[];
  const title = stats.title ?? "rookie_pirate";
  const specialization = stats.specialization ?? "generalist";
  const readiness = deletionReadiness.data ?? null;
  const finalDeletionEnabled =
    !!username &&
    deleteUsername === username &&
    deletePhrase === ACCOUNT_DELETION_CONFIRMATION_PHRASE &&
    readiness?.canDelete === true &&
    !deletingAccount;

  async function handleSave() {
    const validation = validateDisplayNameFormat(displayName);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ data: { display_name: validation.value } });
      await invalidate();
      setEditing(false);
      toast.success("Profile updated.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  function openDeleteDialog() {
    setDeletionError(null);
    void deletionReadiness.refetch();
    setDeleteOpen(true);
  }

  function closeDeleteDialog() {
    if (deletingAccount) return;
    setDeleteOpen(false);
    setDeleteUsername("");
    setDeletePhrase("");
    setDeletionError(null);
  }

  async function handleDeleteAccount() {
    if (!finalDeletionEnabled || !username) return;
    setDeletingAccount(true);
    setDeletionError(null);
    try {
      const result = await deleteMyAccount({
        data: { username: deleteUsername, confirmationPhrase: deletePhrase },
      });
      if (result.deleted) {
        await cleanupAfterConfirmedAccountDeletion(queryClient);
      }
    } catch (error) {
      const code = extractAccountDeletionReasonCode(error);
      const message = accountDeletionMessageForCode(code);
      setDeletionError(message);
      toast.error(message);
      await deletionReadiness.refetch();
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="terminal-panel">
          <div className="terminal-header">Trader Identity</div>
          <div className="grid gap-4 p-5 text-sm md:grid-cols-2">
            <Row label="Username">@{profile?.username}</Row>
            <div className="text-[10px] leading-relaxed text-muted-foreground md:col-span-2">
              Usernames are permanent public handles. If yours needs help, contact an admin.
            </div>
            <Row label="Email">{data.email ?? "—"}</Row>
            <Row label="Display Name">
              {editing ? (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={profile?.display_name ?? ""}
                      maxLength={40}
                      className="flex-1 border border-border bg-input px-2 py-1 tabular outline-none focus:border-primary"
                    />
                    <button
                      onClick={handleSave}
                      disabled={
                        saving || displayName.trim() === (profile?.display_name ?? "").trim()
                      }
                      className="bg-primary px-3 py-1 text-[10px] uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                    >
                      save
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="border border-border px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground"
                    >
                      x
                    </button>
                  </div>
                  <div className="text-[10px] leading-relaxed text-muted-foreground">
                    Display names are public and must follow Berry Street identity rules.
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>{profile?.display_name ?? "—"}</span>
                  <button
                    onClick={() => {
                      setDisplayName(profile?.display_name ?? "");
                      setEditing(true);
                    }}
                    className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                  >
                    [edit]
                  </button>
                </div>
              )}
            </Row>
            <Row label="Member Since">
              {joined
                ? joined.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </Row>
          </div>
        </div>

        <div className="terminal-panel">
          <div className="terminal-header flex items-center justify-between gap-3">
            <span>Prestige</span>
            <Link
              to="/legacy-log"
              className="text-[10px] uppercase tracking-widest text-primary hover:underline"
            >
              open Legacy Log →
            </Link>
            {username && (
              <Link
                to="/u/$username"
                params={{ username }}
                className="text-[10px] uppercase tracking-widest text-primary hover:underline"
              >
                view public profile →
              </Link>
            )}
          </div>
          <div className="grid gap-3 p-4 text-xs md:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Title
              </div>
              <div
                className={`mt-1 inline-block border px-2 py-1 text-[11px] uppercase tracking-widest ${TITLE_TONE[title] ?? ""}`}
              >
                {TITLE_LABEL[title] ?? "Rookie Pirate"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Specialization
              </div>
              <div className="mt-1 tabular">{SPEC_LABEL[specialization] ?? "Generalist"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Reputation
              </div>
              <div className="mt-1 tabular">{stats.reputation_score ?? 0} / 1000</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Rank · Best
              </div>
              <div className="mt-1 tabular">
                {pub.data?.rank ? `#${pub.data.rank}` : "—"}
                <span className="ml-2 text-muted-foreground">
                  best #{stats.highest_rank ?? "—"}
                </span>
              </div>
            </div>
          </div>
          {ach.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Achievements ({ach.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {ach.slice(0, 8).map((ua) => (
                  <span
                    key={ua.achievements.code}
                    className="inline-flex items-center gap-2 border border-border px-2 py-1 text-[11px]"
                    title={ua.achievements.description}
                  >
                    <AchievementMedallion
                      code={ua.achievements.code}
                      name={ua.achievements.name}
                      icon={ua.achievements.icon}
                      size="sm"
                    />
                    {ua.achievements.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-px border border-border bg-border md:grid-cols-3">
          <Stat label="Cash Balance" value={`฿${formatBerries(data.berries)}`} tone="accent" />
          <Stat label="Portfolio Value" value={`฿${formatBerries(marketValue)}`} />
          <Stat label="Net Worth" value={`฿${formatBerries(netWorth)}`} tone="bull" />
        </div>

        <div className="terminal-panel">
          <div className="terminal-header">Positions ({data.holdings.length})</div>
          {data.holdings.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No holdings yet.</div>
          ) : (
            <ul className="divide-y divide-border text-xs tabular">
              {data.holdings.map((h) => (
                <li key={h.slug} className="flex items-center justify-between px-4 py-2">
                  <span>
                    <span className="font-bold text-accent">
                      {h.slug.toUpperCase().slice(0, 4)}
                    </span>{" "}
                    · {h.name}
                  </span>
                  <span>
                    {formatShares(h.shares)} sh @ ฿{h.avgCost.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="terminal-panel border-bear/60">
          <div className="terminal-header text-bear">DELETE ACCOUNT</div>
          <div className="space-y-4 p-5 text-xs">
            <p className="text-sm text-foreground">
              Permanently delete your Berry Street account and all associated player data.
            </p>
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                This includes your:
              </div>
              <ul className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                {DELETE_ACCOUNT_INCLUDED_DATA.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
            <p className="font-bold uppercase tracking-widest text-bear">This cannot be undone.</p>
            {readiness?.isLastAdmin && (
              <p className="border border-bear/60 bg-bear/10 px-3 py-2 text-bear">
                This is the final administrator account. Assign another administrator before
                deleting it.
              </p>
            )}
            <button
              type="button"
              onClick={openDeleteDialog}
              disabled={deletionReadiness.isLoading}
              className="border border-bear px-4 py-2 text-xs font-bold uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground disabled:opacity-40"
            >
              DELETE ACCOUNT
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSignOut}
            className="border border-bear px-4 py-2 text-xs font-bold uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground"
          >
            Sign out
          </button>
        </div>

        <Dialog
          open={deleteOpen}
          onOpenChange={(open) => (open ? setDeleteOpen(true) : closeDeleteDialog())}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto border-bear bg-card">
            <DialogHeader>
              <DialogTitle className="text-bear">PERMANENT ACCOUNT DELETION</DialogTitle>
              <DialogDescription>
                This action cannot be undone. Your account, portfolio, game progress, achievements,
                and public profile will be permanently removed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              <div className="space-y-2 rounded border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  To continue:
                </div>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Enter your exact username.</li>
                  <li>Type DELETE MY ACCOUNT.</li>
                </ol>
              </div>

              {deletionReadiness.isLoading ? (
                <div className="text-muted-foreground">Checking deletion readiness...</div>
              ) : null}

              {readiness?.isLastAdmin && (
                <div role="alert" className="border border-bear/60 bg-bear/10 px-3 py-2 text-bear">
                  This is the final administrator account. Assign another administrator before
                  deleting it.
                </div>
              )}

              <div className="space-y-3">
                <Field label="Exact current username">
                  <input
                    value={deleteUsername}
                    onChange={(e) => setDeleteUsername(e.target.value)}
                    autoComplete="off"
                    className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Confirmation phrase">
                  <input
                    value={deletePhrase}
                    onChange={(e) => setDeletePhrase(e.target.value)}
                    autoComplete="off"
                    className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
                  />
                </Field>
                <div className="text-[10px] leading-relaxed text-muted-foreground">
                  Matching is case-sensitive. Leading or trailing spaces are not accepted.
                </div>
              </div>

              {deletionError && (
                <div role="alert" className="border border-bear/60 bg-bear/10 px-3 py-2 text-bear">
                  {deletionError}
                </div>
              )}
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deletingAccount}
                className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={!finalDeletionEnabled}
                className="border border-bear bg-bear px-4 py-2 text-xs font-bold uppercase tracking-widest text-destructive-foreground disabled:opacity-40"
              >
                {deletingAccount ? "Deleting..." : "PERMANENTLY DELETE ACCOUNT"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TerminalShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-foreground">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "accent" }) {
  const color =
    tone === "bull" ? "text-bull" : tone === "accent" ? "text-accent" : "text-foreground";
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular ${color}`}>{value}</div>
    </div>
  );
}
