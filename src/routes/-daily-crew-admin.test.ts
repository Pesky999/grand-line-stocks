/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

const routeSource = read("src/routes/_authenticated/daily-crew-admin.tsx");
const componentSource = read("src/components/admin/DailyCrewMissionStudio.tsx");
const adminRouteSource = read("src/routes/_authenticated/admin.tsx");
const publicDailyCrewRouteSource = read("src/routes/games.daily-crew-builder.tsx");
const editorSource = read("src/lib/daily-crew-builder/admin-editor.ts");

test("Daily Crew Mission Studio is a protected noindex route", () => {
  assert.match(routeSource, /createFileRoute\("\/_authenticated\/daily-crew-admin"\)/);
  assert.match(routeSource, /Daily Crew Mission Studio - Berry Street/);
  assert.match(routeSource, /robots", content: "noindex"/);
  assert.match(routeSource, /const \{ isAdmin \} = await amIAdmin\(\)/);
  assert.match(
    routeSource,
    /if \(!isAdmin\) throw redirect\(\{ to: "\/", search: \{ page: 1, q: "" \} \}\)/,
  );
  assert.match(routeSource, /<TerminalShell>/);
});

test("Daily Crew Mission Studio loader prefetches summaries and characters only", () => {
  const loader = routeSource.match(/loader: async \(\{ context \}\) => \{[\s\S]*?\n\s{2}\},/)?.[0];
  assert.ok(loader, "loader should be present");
  assert.match(loader, /ensureQueryData\(dailyCrewAdminMissionsQO\)/);
  assert.match(loader, /ensureQueryData\(dailyCrewAdminCharactersQO\)/);
  assert.doesNotMatch(loader, /getAdminDailyCrewMission/);
  assert.doesNotMatch(loader, /daily_crew_character_role_scores|daily_crew_perfect_solution/);
});

test("Daily Crew Mission Studio detail loads only after a mission is selected", () => {
  assert.match(componentSource, /const \[selectedMissionId, setSelectedMissionId\]/);
  assert.match(componentSource, /getAdminDailyCrewMission\(\{/);
  assert.match(componentSource, /data: \{ missionId: selectedMissionId \?\? "" \}/);
  assert.match(componentSource, /enabled: Boolean\(selectedMissionId\)/);
  assert.match(componentSource, /if \(detailQ\.data\.id !== selectedMissionId\) return/);
  assert.match(componentSource, /if \(dirty && editor\?\.missionId === selectedMissionId\) return/);
});

test("Daily Crew Mission Studio uses only protected server functions for writes", () => {
  assert.match(componentSource, /saveAdminDailyCrewMissionDraft\(\{/);
  assert.match(componentSource, /setAdminDailyCrewMissionStatus\(\{/);
  assert.match(componentSource, /targetStatus: action\.targetStatus/);
  assert.doesNotMatch(componentSource, /supabaseAdmin|getSupabaseAdmin|client\.server/);
  assert.doesNotMatch(
    componentSource,
    /\bdb\.from\(|\.rpc\(|daily_crew_missions|daily_crew_role_requirements/,
  );
  assert.doesNotMatch(
    routeSource,
    /supabaseAdmin|getSupabaseAdmin|client\.server|\bdb\.from\(|\.rpc\(/,
  );
});

test("Daily Crew Mission Studio exposes no manual publish or delete action", () => {
  assert.match(componentSource, /manual publishing and mission deletion are not available here/);
  assert.doesNotMatch(componentSource, /targetStatus:\s*["']published["']/);
  assert.doesNotMatch(componentSource, /deleteAdmin|deleteMission|Delete Mission/);
  assert.doesNotMatch(editorSource, /targetStatus:\s*"published"/);
});

test("Daily Crew Mission Studio labels hidden authoring data and read-only states", () => {
  assert.match(componentSource, /Admin-only authoring data/);
  assert.match(componentSource, /Score Matrix - Admin-only Hidden Data/);
  assert.match(componentSource, /Perfect Crew - Admin-only Hidden Data/);
  assert.match(componentSource, /readOnlyReason/);
  assert.match(componentSource, /This mission is read-only/);
});

test("Daily Crew Mission Studio has dirty-state protection hooks", () => {
  assert.match(componentSource, /editorSnapshot\(editor\) !== baselineSnapshot/);
  assert.match(componentSource, /beforeunload/);
  assert.match(componentSource, /Discard unsaved changes and load another mission/);
  assert.match(componentSource, /Discard unsaved changes and start a new mission/);
  assert.match(componentSource, /Reset Unsaved Changes/);
});

test("admin console links to Daily Crew Mission Studio", () => {
  assert.match(adminRouteSource, /to="\/daily-crew-admin"/);
  assert.match(adminRouteSource, /Daily Crew Mission Studio/);
});

test("public Daily Crew Builder route is unchanged by Mission Studio", () => {
  assert.match(publicDailyCrewRouteSource, /createFileRoute\("\/games\/daily-crew-builder"\)/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /DailyCrewMissionStudio/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /getAdminDailyCrewMission/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /saveAdminDailyCrewMissionDraft/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /setAdminDailyCrewMissionStatus/);
});
