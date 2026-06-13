import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listCharacters, amIAdmin } from "@/lib/api/market.functions";
import {
  listAllEvents,
  createEvent,
  previewEvent,
  publishEvent,
  deleteEvent,
} from "@/lib/api/events.functions";
import { TerminalShell } from "@/components/TerminalShell";
import { toast } from "sonner";

const charsQO = queryOptions({ queryKey: ["characters"], queryFn: () => listCharacters() });
const eventsQO = queryOptions({ queryKey: ["admin", "events"], queryFn: () => listAllEvents() });

const EVENT_TYPES = [
  "story_event",
  "battle_result",
  "character_reveal",
  "power_up",
  "political_event",
  "community_event",
  "market_correction",
  "meme_event",
] as const;
type EventType = (typeof EVENT_TYPES)[number];

export const Route = createFileRoute("/_authenticated/events-admin")({
  head: () => ({ meta: [{ title: "Event Editor — Berry Street" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    const { isAdmin } = await amIAdmin();
    if (!isAdmin) throw redirect({ to: "/" });
    await Promise.all([
      context.queryClient.ensureQueryData(charsQO),
      context.queryClient.ensureQueryData(eventsQO),
    ]);
  },
  component: EventsAdmin,
  errorComponent: ({ error }) => <TerminalShell><div className="p-8 text-bear">{error.message}</div></TerminalShell>,
  notFoundComponent: () => null,
});

type Impact = { slug: string; pct_change: number };

function EventsAdmin() {
  const { data: characters } = useSuspenseQuery(charsQO);
  const { data: events } = useSuspenseQuery(eventsQO);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<EventType>("story_event");
  const [defaultPct, setDefaultPct] = useState("5");
  const [scheduleAt, setScheduleAt] = useState("");
  const [impacts, setImpacts] = useState<Impact[]>([]);
  const [busy, setBusy] = useState(false);

  function addImpact(slug: string) {
    if (!slug || impacts.find((i) => i.slug === slug)) return;
    setImpacts([...impacts, { slug, pct_change: parseFloat(defaultPct) || 0 }]);
  }
  function updateImpact(slug: string, pct: number) {
    setImpacts(impacts.map((i) => (i.slug === slug ? { ...i, pct_change: pct } : i)));
  }
  function removeImpact(slug: string) {
    setImpacts(impacts.filter((i) => i.slug !== slug));
  }

  const previewRows = impacts.map((i) => {
    const c = characters.find((x) => x.slug === i.slug);
    if (!c) return null;
    const before = Number(c.current_price);
    const after = Math.max(Math.round(before * (1 + i.pct_change / 100) * 100) / 100, 0.01);
    return { slug: i.slug, name: c.name, before, after, pct: i.pct_change };
  }).filter(Boolean) as { slug: string; name: string; before: number; after: number; pct: number }[];

  async function submit(publish: boolean) {
    if (!title || impacts.length === 0) { toast.error("Title and at least one impact required"); return; }
    setBusy(true);
    try {
      await createEvent({
        data: {
          title,
          description,
          event_type: eventType,
          default_pct_change: parseFloat(defaultPct) || 0,
          impacts,
          scheduled_for: scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
          publish,
        },
      });
      toast.success(publish ? "Event published — prices updated" : "Event saved");
      setTitle(""); setDescription(""); setImpacts([]); setScheduleAt("");
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  }

  async function publishExisting(id: string) {
    try {
      await publishEvent({ data: { id } });
      toast.success("Event published");
      router.invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function previewExisting(id: string) {
    try {
      const rows = await previewEvent({ data: { id } });
      const summary = (rows as any[]).map((r) => `${r.slug.toUpperCase()} ${Number(r.price_before).toFixed(2)}→${Number(r.price_after).toFixed(2)}`).join(", ");
      toast.message("Preview", { description: summary || "no impacts" });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function removeExisting(id: string) {
    if (!confirm("Delete this event?")) return;
    try {
      await deleteEvent({ data: { id } });
      router.invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="terminal-panel">
          <div className="terminal-header text-warn">⚡ Event Editor — Catalyst Console</div>
          <div className="p-4 text-xs text-muted-foreground">
            Build a market event, attach character impacts, preview new prices, then publish to apply atomically.
          </div>
        </div>

        <section className="terminal-panel">
          <div className="terminal-header">New Event</div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <label className="md:col-span-2 block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gear 5 Awakening Revealed"
                className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none" />
            </label>
            <label className="md:col-span-2 block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Type</span>
              <select value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}
                className="mt-1 w-full border border-border bg-input px-2 py-2 text-sm">
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Default % change</span>
              <input type="number" step="0.1" value={defaultPct} onChange={(e) => setDefaultPct(e.target.value)}
                className="mt-1 w-full border border-border bg-input px-3 py-2 tabular focus:border-primary outline-none" />
            </label>
            <label className="md:col-span-2 block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Schedule for (optional)</span>
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
                className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none" />
              <span className="mt-1 block text-[10px] text-muted-foreground">Scheduled events publish when an admin or cron runs them.</span>
            </label>
          </div>

          <div className="border-t border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Affected Characters</span>
              <select onChange={(e) => { addImpact(e.target.value); e.currentTarget.value = ""; }}
                className="border border-border bg-input px-2 py-1 text-xs">
                <option value="">+ add character…</option>
                {characters.filter((c) => !impacts.find((i) => i.slug === c.slug)).map((c) => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>
            {impacts.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No impacts yet.</div>
            ) : (
              <table className="w-full text-xs tabular">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-1 text-left">Character</th>
                    <th className="px-2 py-1 text-right">Before</th>
                    <th className="px-2 py-1 text-right">% change</th>
                    <th className="px-2 py-1 text-right">After</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => {
                    const up = r.pct >= 0;
                    return (
                      <tr key={r.slug} className="border-b border-border/40">
                        <td className="px-2 py-1.5"><span className="font-bold text-accent">{r.slug.toUpperCase()}</span> <span className="text-muted-foreground">{r.name}</span></td>
                        <td className="px-2 py-1.5 text-right">฿{r.before.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" step="0.1" value={r.pct}
                            onChange={(e) => updateImpact(r.slug, parseFloat(e.target.value) || 0)}
                            className={`w-20 border border-border bg-input px-2 py-1 text-right tabular ${up ? "text-bull" : "text-bear"}`} />
                        </td>
                        <td className={`px-2 py-1.5 text-right ${up ? "text-bull" : "text-bear"}`}>฿{r.after.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button onClick={() => removeImpact(r.slug)} className="text-muted-foreground hover:text-bear">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex gap-2 border-t border-border p-4">
            <button onClick={() => submit(false)} disabled={busy}
              className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-foreground hover:border-primary disabled:opacity-40">
              Save {scheduleAt ? "+ schedule" : "as draft"}
            </button>
            <button onClick={() => submit(true)} disabled={busy}
              className="bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40">
              ▲ Publish now — apply prices
            </button>
          </div>
        </section>

        <section className="terminal-panel">
          <div className="terminal-header">All Events</div>
          <table className="w-full text-xs tabular">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No events yet.</td></tr>}
              {events.map((e: any) => (
                <tr key={e.id} className="border-b border-border/40">
                  <td className="px-3 py-2 text-foreground">{e.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.event_type.replace("_", " ")}</td>
                  <td className="px-3 py-2">
                    <span className={
                      e.status === "published" ? "text-bull" :
                      e.status === "scheduled" ? "text-warn" : "text-muted-foreground"
                    }>{e.status}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(e.published_at ?? e.scheduled_for ?? e.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {e.status !== "published" && (
                      <>
                        <button onClick={() => previewExisting(e.id)} className="text-muted-foreground hover:text-primary">preview</button>
                        <button onClick={() => publishExisting(e.id)} className="text-bull hover:opacity-80">publish</button>
                      </>
                    )}
                    <button onClick={() => removeExisting(e.id)} className="text-muted-foreground hover:text-bear">delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </TerminalShell>
  );
}
