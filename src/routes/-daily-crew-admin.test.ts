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
  assert.match(
    componentSource,
    /const currentEditorSnapshot = editor \? editorSnapshot\(editor\) : ""/,
  );
  assert.match(
    componentSource,
    /const dirty = editor \? currentEditorSnapshot !== baselineSnapshot : false/,
  );
  assert.match(componentSource, /beforeunload/);
  assert.match(componentSource, /Discard unsaved changes and load another mission/);
  assert.match(componentSource, /Discard unsaved changes and start a new mission/);
  assert.match(componentSource, /Reset Unsaved Changes/);
});

test("Daily Crew Mission Studio disables editor actions while mutations are busy", () => {
  assert.match(
    componentSource,
    /const mutationBusy = saveMutation\.isPending \|\| statusMutation\.isPending/,
  );
  assert.match(
    componentSource,
    /function selectMission\(missionId: string\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(componentSource, /function newMission\(\) \{\s+if \(mutationBusy\) return;/);
  assert.match(
    componentSource,
    /function resetUnsavedChanges\(\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    componentSource,
    /function updateEditor\([\s\S]*?\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    componentSource,
    /function changeJobRole\(job: DailyCrewEditorJob, role: DailyCrewRole\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    componentSource,
    /function saveDraft\(\) \{\s+if \(!editor \|\| mutationBusy\) return;/,
  );
  assert.match(
    componentSource,
    /function runStatusAction\(action: DailyCrewStatusAction\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(componentSource, /disabled=\{mutationBusy\}/);
  assert.match(componentSource, /disabled=\{!dirty \|\| mutationBusy\}/);
  assert.match(componentSource, /disabled=\{editorDisabled\}/);
  assert.match(componentSource, /disabled=\{!canSave \|\| mutationBusy\}/);
  assert.match(componentSource, /disabled=\{!action\.allowed \|\| mutationBusy\}/);
});

test("Daily Crew Mission Studio ignores stale save and status mutation results", () => {
  assert.match(
    componentSource,
    /type SaveMissionMutationVariables = \{[\s\S]*targetMissionId: string \| null;[\s\S]*submittedSnapshot: string;[\s\S]*operationKey: number;[\s\S]*\};/,
  );
  assert.match(
    componentSource,
    /type StatusMissionMutationVariables = \{[\s\S]*missionId: string;[\s\S]*action: DailyCrewStatusAction;[\s\S]*operationKey: number;[\s\S]*\};/,
  );
  assert.match(componentSource, /selectedMissionIdRef\.current === variables\.targetMissionId/);
  assert.match(componentSource, /editorSnapshotRef\.current === variables\.submittedSnapshot/);
  assert.match(componentSource, /activeEditorOperationRef\.current === variables\.operationKey/);
  assert.match(componentSource, /selectedMissionIdRef\.current !== variables\.missionId/);
  assert.match(
    componentSource,
    /mutationFn: async \(\{ missionId, action \}: StatusMissionMutationVariables\)/,
  );
  assert.doesNotMatch(
    componentSource,
    /mutationFn: async \(action: DailyCrewStatusAction\)[\s\S]*editor\?\.missionId/,
  );
});

test("Daily Crew Mission Studio restores the typed baseline on reset", () => {
  const resetUnsavedChanges = componentSource.match(
    /function resetUnsavedChanges\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(resetUnsavedChanges, "resetUnsavedChanges should be present");
  assert.match(componentSource, /const \[baselineEditor, setBaselineEditor\]/);
  assert.match(componentSource, /function setEditorBaseline\(nextEditor: DailyCrewMissionEditor/);
  assert.match(resetUnsavedChanges, /if \(baselineEditor\) \{/);
  assert.match(resetUnsavedChanges, /setEditor\(baselineEditor\)/);
  assert.match(resetUnsavedChanges, /setBaselineSnapshot\(editorSnapshot\(baselineEditor\)\)/);
  assert.doesNotMatch(resetUnsavedChanges, /createNewDailyCrewMissionEditor/);
  assert.doesNotMatch(resetUnsavedChanges, /editorFromMissionDetail/);
});

test("Daily Crew Mission Studio prevents duplicate role lanes before clearing role data", () => {
  assert.match(editorSource, /roleChanged &&[\s\S]*job\.role === patch\.role[\s\S]*return editor;/);
  assert.match(
    componentSource,
    /editor\?\.jobs\.some\(\s*\(otherJob\) =>[\s\S]*otherJob\.role === role[\s\S]*That role lane is already assigned to another job\./,
  );
  assert.match(componentSource, /const occupiedRoles = new Set\(/);
  assert.match(componentSource, /disabled=\{role !== job\.role && occupiedRoles\.has\(role\)\}/);
  assert.match(
    componentSource,
    /Changing this job role clears score explanations and perfect-crew selections for the old role/,
  );
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
