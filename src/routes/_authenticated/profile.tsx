import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe, useInvalidateMe } from "@/hooks/useMe";
import { updateProfile } from "@/lib/api/wallet.functions";
import { getPublicProfile } from "@/lib/api/legendary.functions";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/TerminalShell";
import { formatBerries } from "@/lib/wallet";
import { TITLE_LABEL, TITLE_TONE, SPEC_LABEL } from "@/lib/legendary";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Berry Street" }] }),
  component: Profile,
});

function Profile() {
  const { data, isLoading } = useMe();
  const invalidate = useInvalidateMe();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const username = data?.profile?.username ?? null;
  const pub = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => getPublicProfile({ data: { username: username! } }),
    enabled: !!username,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return <TerminalShell><div className="p-8 text-sm text-muted-foreground">Loading profile…</div></TerminalShell>;
  }

  const profile = data.profile;
  const marketValue = data.holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
  const netWorth = data.berries + marketValue;
  const joined = profile?.created_at ? new Date(profile.created_at) : null;
  const stats: any = pub.data?.stats ?? {};
  const ach = pub.data?.achievements ?? [];

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({ data: { display_name: displayName } });
      await invalidate();
      setEditing(false);
      toast.success("Profile updated.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="terminal-panel">
          <div className="terminal-header">Trader Identity</div>
          <div className="grid gap-4 p-5 text-sm md:grid-cols-2">
            <Row label="Username">@{profile?.username}</Row>
            <Row label="Email">{data.email ?? "—"}</Row>
            <Row label="Display Name">
              {editing ? (
                <div className="flex gap-2">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={profile?.display_name ?? ""}
                    className="flex-1 border border-border bg-input px-2 py-1 tabular outline-none focus:border-primary"
                  />
                  <button onClick={handleSave} disabled={saving} className="bg-primary px-3 py-1 text-[10px] uppercase tracking-widest text-primary-foreground disabled:opacity-40">save</button>
                  <button onClick={() => setEditing(false)} className="border border-border px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">x</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>{profile?.display_name ?? "—"}</span>
                  <button
                    onClick={() => { setDisplayName(profile?.display_name ?? ""); setEditing(true); }}
                    className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                  >
                    [edit]
                  </button>
                </div>
              )}
            </Row>
            <Row label="Member Since">{joined ? joined.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—"}</Row>
          </div>
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
                  <span><span className="font-bold text-accent">{h.slug.toUpperCase().slice(0, 4)}</span> · {h.name}</span>
                  <span>{h.shares} sh @ ฿{h.avgCost.toFixed(2)}</span>
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
  const color = tone === "bull" ? "text-bull" : tone === "accent" ? "text-accent" : "text-foreground";
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular ${color}`}>{value}</div>
    </div>
  );
}
