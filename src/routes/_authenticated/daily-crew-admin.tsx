import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions } from "@tanstack/react-query";
import { TerminalShell } from "@/components/TerminalShell";
import { DailyCrewMissionStudio } from "@/components/admin/DailyCrewMissionStudio";
import { DailyCrewTemplateLibrary } from "@/components/admin/DailyCrewTemplateLibrary";
import {
  listAdminDailyCrewMissions,
  listAdminDailyCrewTemplates,
} from "@/lib/api/daily-crew-builder-admin.functions";
import { amIAdmin, listCharacters } from "@/lib/api/market.functions";

const dailyCrewAdminMissionsQO = queryOptions({
  queryKey: ["admin", "daily-crew", "missions"],
  queryFn: () => listAdminDailyCrewMissions(),
});

const dailyCrewAdminCharactersQO = queryOptions({
  queryKey: ["characters"],
  queryFn: () => listCharacters(),
});

const dailyCrewAdminTemplatesQO = queryOptions({
  queryKey: ["admin", "daily-crew", "templates"],
  queryFn: () => listAdminDailyCrewTemplates(),
});

export const Route = createFileRoute("/_authenticated/daily-crew-admin")({
  head: () => ({
    meta: [
      { title: "Daily Crew Mission Studio - Berry Street" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    const { isAdmin } = await amIAdmin();
    if (!isAdmin) throw redirect({ to: "/", search: { page: 1, q: "" } });
    await Promise.all([
      context.queryClient.ensureQueryData(dailyCrewAdminMissionsQO),
      context.queryClient.ensureQueryData(dailyCrewAdminTemplatesQO),
      context.queryClient.ensureQueryData(dailyCrewAdminCharactersQO),
    ]);
  },
  component: DailyCrewAdmin,
  errorComponent: ({ error }) => (
    <TerminalShell>
      <div className="p-8 text-bear">{error.message}</div>
    </TerminalShell>
  ),
  notFoundComponent: () => null,
});

type DailyCrewAdminMode = "mission-studio" | "template-library";

function DailyCrewAdmin() {
  const [mode, setMode] = useState<DailyCrewAdminMode>("mission-studio");

  return (
    <TerminalShell>
      <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-4">
        <section className="terminal-panel">
          <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
            <span>Daily Crew Admin</span>
            <span className="text-muted-foreground">Protected mission authoring</span>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            <button
              type="button"
              onClick={() => setMode("mission-studio")}
              className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${
                mode === "mission-studio"
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Mission Studio
            </button>
            <button
              type="button"
              onClick={() => setMode("template-library")}
              className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${
                mode === "template-library"
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Template Library
            </button>
          </div>
        </section>

        <div hidden={mode !== "mission-studio"}>
          <DailyCrewMissionStudio />
        </div>
        <div hidden={mode !== "template-library"}>
          <DailyCrewTemplateLibrary onOpenMissionStudio={() => setMode("mission-studio")} />
        </div>
      </div>
    </TerminalShell>
  );
}
