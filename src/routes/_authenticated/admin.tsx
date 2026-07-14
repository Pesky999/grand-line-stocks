import { createFileRoute, Link, useRouter, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { listCharacters, adminPostNews, amIAdmin } from "@/lib/api/market.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { CharacterManagementPanel } from "@/components/admin/CharacterManagementPanel";
import { toast } from "sonner";

const charsQO = queryOptions({ queryKey: ["characters"], queryFn: () => listCharacters() });
type NewsImpact = "bullish" | "bearish" | "neutral";

function isNewsImpact(value: string): value is NewsImpact {
  return value === "bullish" || value === "bearish" || value === "neutral";
}

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Admin — Berry Street" }, { name: "robots", content: "noindex" }],
  }),
  loader: async ({ context }) => {
    const { isAdmin } = await amIAdmin();
    if (!isAdmin) throw redirect({ to: "/", search: { page: 1, q: "" } });
    await context.queryClient.ensureQueryData(charsQO);
  },
  component: Admin,
  errorComponent: ({ error }) => (
    <TerminalShell>
      <div className="p-8 text-bear">{error.message}</div>
    </TerminalShell>
  ),
  notFoundComponent: () => null,
});

function Admin() {
  const { data: characters } = useSuspenseQuery(charsQO);
  const router = useRouter();

  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [impact, setImpact] = useState<NewsImpact>("neutral");
  const [newsSlug, setNewsSlug] = useState("");

  async function submitNews(e: FormEvent) {
    e.preventDefault();
    try {
      await adminPostNews({
        data: { title: newsTitle, body: newsBody, impact, characterSlug: newsSlug || undefined },
      });
      toast.success("News posted");
      setNewsTitle("");
      setNewsBody("");
      router.invalidate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="terminal-panel">
          <div className="terminal-header text-warn">⚡ Editor Console — Admin Role Verified</div>
          <div className="space-y-3 p-4 text-xs text-muted-foreground">
            <p>
              You are signed in with the <span className="text-accent">admin</span> role.
              Administrative actions require the admin role.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/events-admin"
                className="inline-block bg-accent px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-accent-foreground hover:opacity-90"
              >
                → Event Editor (catalysts)
              </Link>
              <Link
                to="/market-admin"
                className="inline-block bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                → Living Market Console
              </Link>
              <Link
                to="/pricing-admin"
                className="inline-block border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-accent hover:text-accent"
              >
                → Market Pricing Preview
              </Link>
              <Link
                to="/daily-crew-admin"
                className="inline-block border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary"
              >
                → Daily Crew Mission Studio
              </Link>
            </div>
          </div>
        </div>

        <CharacterManagementPanel characters={characters} />

        <form onSubmit={submitNews} className="terminal-panel">
          <div className="terminal-header">Post to The Wire</div>
          <div className="grid gap-3 p-4">
            <input
              required
              value={newsTitle}
              onChange={(e) => setNewsTitle(e.target.value)}
              placeholder="Headline"
              className="w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
            />
            <textarea
              required
              value={newsBody}
              onChange={(e) => setNewsBody(e.target.value)}
              placeholder="Body"
              rows={3}
              className="w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={impact}
                onChange={(e) => {
                  if (isNewsImpact(e.target.value)) setImpact(e.target.value);
                }}
                className="border border-border bg-input px-2 py-2 text-sm"
              >
                <option value="neutral">neutral</option>
                <option value="bullish">bullish</option>
                <option value="bearish">bearish</option>
              </select>
              <select
                value={newsSlug}
                onChange={(e) => setNewsSlug(e.target.value)}
                className="border border-border bg-input px-2 py-2 text-sm"
              >
                <option value="">— Tag character (optional) —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="bg-accent px-4 py-2 text-xs font-bold uppercase tracking-widest text-accent-foreground hover:opacity-90"
            >
              Publish
            </button>
          </div>
        </form>
      </div>
    </TerminalShell>
  );
}
