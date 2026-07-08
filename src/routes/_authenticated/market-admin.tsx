import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TerminalShell } from "@/components/TerminalShell";
import { amIAdmin } from "@/lib/api/market.functions";
import {
  adminApplyCategory,
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
type Category = (typeof CATS)[number];

type AttributeValues = {
  narrative_potential: number;
  hype_rating: number;
  investor_confidence: number;
  volatility_rating: number;
};

type CharacterAttributeRow = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  momentum: number | string;
  character_attributes: Partial<AttributeValues> | Partial<AttributeValues>[] | null;
};

const DEFAULT_ATTRIBUTES: AttributeValues = {
  narrative_potential: 50,
  hype_rating: 50,
  investor_confidence: 50,
  volatility_rating: 50,
};

function getAttributes(row: CharacterAttributeRow): AttributeValues {
  const relation = Array.isArray(row.character_attributes) ? row.character_attributes[0] : row.character_attributes;
  return {
    narrative_potential: Number(relation?.narrative_potential ?? DEFAULT_ATTRIBUTES.narrative_potential),
    hype_rating: Number(relation?.hype_rating ?? DEFAULT_ATTRIBUTES.hype_rating),
    investor_confidence: Number(relation?.investor_confidence ?? DEFAULT_ATTRIBUTES.investor_confidence),
    volatility_rating: Number(relation?.volatility_rating ?? DEFAULT_ATTRIBUTES.volatility_rating),
  };
}

function formatCategory(category: Category) {
  return category.replace("_", " ");
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Failed";
}

function MarketAdmin() {
  const { data: chars } = useSuspenseQuery(attrsQO) as { data: CharacterAttributeRow[] };
  const router = useRouter();

  return (
    <TerminalShell>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <Link
          to="/market-bulletin"
          className="inline-flex border border-border bg-secondary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary"
        >
          Back to Market Bulletin
        </Link>

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
                {chars.map((c) => (
                  <AttrRow key={c.id} c={c} onChanged={() => router.invalidate()} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </TerminalShell>
  );
}

function AttrRow({ c, onChanged }: { c: CharacterAttributeRow; onChanged: () => void }) {
  const a = getAttributes(c);
  const [cat, setCat] = useState<Category>(c.category);
  const [np, setNp] = useState<number>(a.narrative_potential);
  const [hr, setHr] = useState<number>(a.hype_rating);
  const [ic, setIc] = useState<number>(a.investor_confidence);
  const [vr, setVr] = useState<number>(a.volatility_rating);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const attributesChanged =
    np !== a.narrative_potential ||
    hr !== a.hype_rating ||
    ic !== a.investor_confidence ||
    vr !== a.volatility_rating;
  const categoryChanged = cat !== c.category;
  const hasPendingChanges = attributesChanged || categoryChanged;

  async function save() {
    if (!attributesChanged) return;
    setSaving(true);
    try {
      await adminUpdateAttributes({
        data: {
          slug: c.slug,
          narrative_potential: Number(np),
          hype_rating: Number(hr),
          investor_confidence: Number(ic),
          volatility_rating: Number(vr),
        },
      });
      toast.success(`${c.name} attributes saved`);
      onChanged();
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setSaving(false);
    }
  }

  async function applyCategory() {
    if (!categoryChanged) return;
    const confirmed = window.confirm(`Apply ${c.name}'s public category change from ${formatCategory(c.category)} to ${formatCategory(cat)}?`);
    if (!confirmed) return;

    setApplying(true);
    try {
      await adminApplyCategory({ data: { slug: c.slug, category: cat } });
      toast.success(`${c.name} category applied`);
      onChanged();
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <tr className="border-b border-border/40">
        <td className="px-2 py-1 text-foreground">{c.name}</td>
        <td className="px-2 py-1">
          <select value={cat} onChange={(e) => setCat(e.target.value as Category)} className="bg-input border border-border px-1 py-0.5 text-[10px] uppercase">
            {CATS.map((x) => <option key={x} value={x}>{formatCategory(x)}</option>)}
          </select>
        </td>
        <td className="px-2 py-1 text-right"><NumIn v={np} set={setNp} /></td>
        <td className="px-2 py-1 text-right"><NumIn v={hr} set={setHr} /></td>
        <td className="px-2 py-1 text-right"><NumIn v={ic} set={setIc} /></td>
        <td className="px-2 py-1 text-right"><NumIn v={vr} set={setVr} /></td>
        <td className={`px-2 py-1 text-right ${Number(c.momentum) >= 0 ? "text-bull" : "text-bear"}`}>{Number(c.momentum).toFixed(3)}</td>
        <td className="px-2 py-1 text-right">
          <div className="flex flex-wrap justify-end gap-1">
            <button onClick={() => setPreviewOpen((open) => !open)} className="bg-secondary px-2 py-1 text-[10px] uppercase tracking-widest text-foreground hover:bg-primary hover:text-primary-foreground">
              Preview
            </button>
            <button disabled={saving || !attributesChanged} onClick={save} className="bg-secondary px-2 py-1 text-[10px] uppercase tracking-widest text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-40">
              Save
            </button>
            <button disabled={applying || !categoryChanged} onClick={applyCategory} className="bg-secondary px-2 py-1 text-[10px] uppercase tracking-widest text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-40">
              Apply
            </button>
          </div>
        </td>
      </tr>
      {previewOpen ? (
        <tr className="border-b border-border/40 bg-muted/20">
          <td colSpan={8} className="px-3 py-3">
            <div className="space-y-2 text-xs">
              <div className="font-bold uppercase tracking-widest text-primary">Pending changes · {c.name}</div>
              {!hasPendingChanges ? (
                <p className="text-muted-foreground">No pending changes for this character.</p>
              ) : (
                <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                  <ChangeLine label="Category" before={formatCategory(c.category)} after={formatCategory(cat)} changed={categoryChanged} />
                  <ChangeLine label="Narrative potential" before={a.narrative_potential} after={np} changed={np !== a.narrative_potential} />
                  <ChangeLine label="Hype rating" before={a.hype_rating} after={hr} changed={hr !== a.hype_rating} />
                  <ChangeLine label="Investor confidence" before={a.investor_confidence} after={ic} changed={ic !== a.investor_confidence} />
                  <ChangeLine label="Volatility rating" before={a.volatility_rating} after={vr} changed={vr !== a.volatility_rating} />
                </div>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ChangeLine({ label, before, after, changed }: { label: string; before: number | string; after: number | string; changed: boolean }) {
  return (
    <div className={changed ? "text-foreground" : ""}>
      <span className="font-bold">{label}:</span> {before} &rarr; {after}
    </div>
  );
}

function NumIn({ v, set }: { v: number; set: (n: number) => void }) {
  return (
    <input type="number" min={0} max={100} value={v} onChange={(e) => set(Number(e.target.value))}
      className="w-14 bg-input border border-border px-1 py-0.5 text-right tabular text-[11px]" />
  );
}
