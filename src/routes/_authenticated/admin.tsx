import { createFileRoute, useRouter, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listCharacters, adminUpdatePrice, adminPostNews, amIAdmin } from "@/lib/api/market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { toast } from "sonner";

const charsQO = queryOptions({ queryKey: ["characters"], queryFn: () => listCharacters() });

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Berry Street" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    const { isAdmin } = await amIAdmin();
    if (!isAdmin) throw redirect({ to: "/" });
    await context.queryClient.ensureQueryData(charsQO);
  },
  component: Admin,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">{error.message}</div></TerminalShell>,
  notFoundComponent: () => null,
});

function Admin() {
  const { data: characters } = useSuspenseQuery(charsQO);
  const router = useRouter();
  const [slug, setSlug] = useState(characters[0]?.slug ?? "");
  const [newPrice, setNewPrice] = useState("");
  const [note, setNote] = useState("");

  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [impact, setImpact] = useState<"bullish" | "bearish" | "neutral">("neutral");
  const [newsSlug, setNewsSlug] = useState("");

  async function submitPrice(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminUpdatePrice({ data: { slug, newPrice: parseFloat(newPrice), note: note || undefined } });
      toast.success(`${slug.toUpperCase()} updated to ฿${newPrice}`);
      setNewPrice(""); setNote("");
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function submitNews(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminPostNews({ data: { title: newsTitle, body: newsBody, impact, characterSlug: newsSlug || undefined } });
      toast.success("News posted");
      setNewsTitle(""); setNewsBody("");
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  const current = characters.find((c) => c.slug === slug);

  return (
    <TerminalShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="terminal-panel">
          <div className="terminal-header text-warn">⚡ Editor Console — Admin Role Verified</div>
          <div className="p-4 text-xs text-muted-foreground">
            You are signed in with the <span className="text-accent">admin</span> role. All actions are logged against your account.
          </div>
        </div>

        <form onSubmit={submitPrice} className="terminal-panel">
          <div className="terminal-header">Set Stock Price</div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Character</span>
              <select value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full border border-border bg-input px-2 py-2 text-sm">
                {characters.map((c) => (
                  <option key={c.id} value={c.slug}>{c.name} ({c.slug.toUpperCase()})</option>
                ))}
              </select>
              {current && <div className="mt-1 text-[10px] text-muted-foreground tabular">Current: ฿{Number(current.current_price).toFixed(2)}</div>}
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">New price (฿)</span>
              <input
                type="number" min="0.01" step="0.01" required value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
                className="mt-1 w-full border border-border bg-input px-3 py-2 tabular focus:border-primary outline-none"
              />
            </label>
            <label className="md:col-span-2 block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Note (optional)</span>
              <input
                value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Gear 5 reveal"
                className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
              />
            </label>
            <button type="submit" className="md:col-span-2 bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90">
              ▲ Commit new quote
            </button>
          </div>
        </form>

        <form onSubmit={submitNews} className="terminal-panel">
          <div className="terminal-header">Post to The Wire</div>
          <div className="grid gap-3 p-4">
            <input required value={newsTitle} onChange={(e) => setNewsTitle(e.target.value)} placeholder="Headline"
              className="w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none" />
            <textarea required value={newsBody} onChange={(e) => setNewsBody(e.target.value)} placeholder="Body" rows={3}
              className="w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none" />
            <div className="grid gap-3 md:grid-cols-2">
              <select value={impact} onChange={(e) => setImpact(e.target.value as any)} className="border border-border bg-input px-2 py-2 text-sm">
                <option value="neutral">neutral</option>
                <option value="bullish">bullish</option>
                <option value="bearish">bearish</option>
              </select>
              <select value={newsSlug} onChange={(e) => setNewsSlug(e.target.value)} className="border border-border bg-input px-2 py-2 text-sm">
                <option value="">— Tag character (optional) —</option>
                {characters.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <button type="submit" className="bg-accent px-4 py-2 text-xs font-bold uppercase tracking-widest text-accent-foreground hover:opacity-90">
              Publish
            </button>
          </div>
        </form>
      </div>
    </TerminalShell>
  );
}
