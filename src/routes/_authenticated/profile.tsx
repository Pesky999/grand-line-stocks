import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { updateProfile } from "@/lib/api/wallet.functions";
import { getPublicProfile } from "@/lib/api/legendary.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSignOut } from "@/hooks/useSignOut";

import { TerminalShell } from "@/components/TerminalShell";
import { formatBerries } from "@/lib/wallet";
import { TITLE_LABEL, TITLE_TONE, SPEC_LABEL } from "@/lib/legendary";
import { validateDisplayNameFormat } from "@/lib/moderation/public-identity";
import { formatShares } from "@/lib/trading/fractional-shares";
import { toast } from "sonner";

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

function Profile() {
  const { data, isLoading } = useMe();
  const invalidate = useInvalidateMe();
  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const handleSignOut = useSignOut();

  const username = data?.profile?.username ?? null;
  const pub = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => getPublicProfile({ data: { username: username! } }),
    enabled: !!username,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <TerminalShell>
        <div className="p-8 text-sm text-muted-foreground">Loading profile…</div>
      </TerminalShell>
    );
  }

  const profile = data.profile;
  const marketValue = data.holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
  const netWorth = data.berries + marketValue;
  const joined = profile?.created_at ? new Date(profile.created_at) : null;
  const stats = (pub.data?.stats ?? {}) as ProfileStats;
  const ach = (pub.data?.achievements ?? []) as ProfileAchievement[];
  const title = stats.title ?? "rookie_pirate";
  const specialization = stats.specialization ?? "generalist";

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
                    className="border border-border px-2 py-1 text-[11px]"
                    title={ua.achievements.description}
                  >
                    {ua.achievements.icon} {ua.achievements.name}
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

        <div className="flex justify-end">
          <button
            onClick={handleSignOut}
            className="border border-bear px-4 py-2 text-xs font-bold uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground"
          >
            Sign out
          </button>
        </div>
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
