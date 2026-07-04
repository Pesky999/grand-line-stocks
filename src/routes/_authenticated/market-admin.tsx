import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TerminalShell } from "@/components/TerminalShell";
import { amIAdmin } from "@/lib/api/market.functions";
import {
  adminListAttributes,
  adminUpdateAttributes,
} from "@/lib/api/living-market.functions";

const attrsQO = queryOptions({ queryKey: ["admin", "attributes"], queryFn: () => adminListAttributes() });

export const Route = createFileRoute("/_authenticated/market-admin")({
  head: () => ({ meta: [{ title: "Market Admin — Berry Street" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    const { isAdmin } = await amIAdmin();
    if (!isAdmin) throw redirect({ to: "/" });
    await context.queryClient.ensureQueryData(attrsQO);
  },
  component: MarketAdmin,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">{error.message}</div></TerminalShell>,
  notFoundComponent: () => null,
});

const CATS = ["blue_chip", "growth", "speculative", "meme"] as const;

function MarketAdmin() {
  const { data: chars } = useSuspenseQuery(attrsQO);
  const router = useRouter();

  return (
    <TerminalShell>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <section className="terminal-panel">
          <div className="terminal-header text-warn">Living Market Automation</div>
          <div className="space-y-2 p-4 text-xs text-muted-foreground">
            <p className="text-foreground">Market movements are currently human-directed.</p>
            <p>
              Automatic random market movement is disabled from the application interface. Use
              manual price updates or reviewed market events for approved changes.
            </p>
          </div>
        </section>

        <section className="terminal-panel">
          <div className="terminal-header">Character Attributes · Hidden from Users</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">Category</th>
                  <th className="px-2 py-2 text-right">Narrative</th>
                  <th className="px-2 py-2 text-right">Hype</th>
                  <th className="px-2 py-2 text-right">Confidence</th>
                  <th className="px-2 py-2 text-right">Volatility</th>
                  <th className="px-2 py-2 text-right">Momentum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {chars.map((c: any) => (
                  <AttrRow key={c.id} c={c} onSaved={() => router.invalidate()} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </TerminalShell>
  );
}

function AttrRow({ c, onSaved }: { c: any; onSaved: () => void }) {
  const a = c.character_attributes ?? { narrative_potential: 50, hype_rating: 50, investor_confidence: 50, volatility_rating: 50 };
  const [cat, setCat] = useState<typeof CATS[number]>(c.category);
  const [np, setNp] = useState<number>(a.narrative_potential);
  const [hr, setHr] = useState<number>(a.hype_rating);
  const [ic, setIc] = useState<number>(a.investor_confidence);
  const [vr, setVr] = useState<number>(a.volatility_rating);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await adminUpdateAttributes({
        data: { slug: c.slug, category: cat, narrative_potential: Number(np), hype_rating: Number(hr), investor_confidence: Number(ic), volatility_rating: Number(vr) },
      });
      toast.success(`${c.name} updated`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-border/40">
      <td className="px-2 py-1 text-foreground">{c.name}</td>
      <td className="px-2 py-1">
        <select value={cat} onChange={(e) => setCat(e.target.value as typeof CATS[number])} className="bg-input border border-border px-1 py-0.5 text-[10px] uppercase">
          {CATS.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
        </select>
      </td>
      <td className="px-2 py-1 text-right"><NumIn v={np} set={setNp} /></td>
      <td className="px-2 py-1 text-right"><NumIn v={hr} set={setHr} /></td>
      <td className="px-2 py-1 text-right"><NumIn v={ic} set={setIc} /></td>
      <td className="px-2 py-1 text-right"><NumIn v={vr} set={setVr} /></td>
      <td className={`px-2 py-1 text-right ${Number(c.momentum) >= 0 ? "text-bull" : "text-bear"}`}>{Number(c.momentum).toFixed(3)}</td>
      <td className="px-2 py-1 text-right">
        <button disabled={saving} onClick={save} className="bg-secondary px-2 py-1 text-[10px] uppercase tracking-widest text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-40">
          Save
        </button>
      </td>
    </tr>
  );
}

function NumIn({ v, set }: { v: number; set: (n: number) => void }) {
  return (
    <input type="number" min={0} max={100} value={v} onChange={(e) => set(Number(e.target.value))}
      className="w-14 bg-input border border-border px-1 py-0.5 text-right tabular text-[11px]" />
  );
}
