import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { TerminalShell } from "@/components/TerminalShell";
import { DailyCrewMissionStudio } from "@/components/admin/DailyCrewMissionStudio";
import { listAdminDailyCrewMissions } from "@/lib/api/daily-crew-builder-admin.functions";
import { amIAdmin, listCharacters } from "@/lib/api/market.functions";

const dailyCrewAdminMissionsQO = queryOptions({
  queryKey: ["admin", "daily-crew", "missions"],
  queryFn: () => listAdminDailyCrewMissions(),
});

const dailyCrewAdminCharactersQO = queryOptions({
  queryKey: ["characters"],
  queryFn: () => listCharacters(),
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

function DailyCrewAdmin() {
  return (
    <TerminalShell>
      <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-4">
        <DailyCrewMissionStudio />
      </div>
    </TerminalShell>
  );
}
