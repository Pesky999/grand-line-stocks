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
const templateLibrarySource = read("src/components/admin/DailyCrewTemplateLibrary.tsx");
const rotationSchedulerSource = read("src/components/admin/DailyCrewRotationScheduler.tsx");
const adminRouteSource = read("src/routes/_authenticated/admin.tsx");
const publicDailyCrewRouteSource = read("src/routes/games.daily-crew-builder.tsx");
const editorSource = read("src/lib/daily-crew-builder/admin-editor.ts");
const importSource = read("src/lib/daily-crew-builder/admin-import.ts");
const templateImportSource = read("src/lib/daily-crew-builder/template-import.ts");
const templateBulkImportSource = read("src/lib/daily-crew-builder/template-bulk-import.ts");
const rotationEditorSource = read("src/lib/daily-crew-builder/rotation-editor.ts");

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
  assert.match(loader, /ensureQueryData\(dailyCrewAdminTemplatesQO\)/);
  assert.match(loader, /ensureQueryData\(dailyCrewAdminRotationPlansQO\)/);
  assert.match(loader, /ensureQueryData\(dailyCrewAdminCharactersQO\)/);
  assert.doesNotMatch(loader, /getAdminDailyCrewMission/);
  assert.doesNotMatch(loader, /getAdminDailyCrewTemplate/);
  assert.doesNotMatch(loader, /getAdminDailyCrewRotationPlan/);
  assert.doesNotMatch(loader, /daily_crew_character_role_scores|daily_crew_perfect_solution/);
});

test("Daily Crew admin defaults to Mission Studio and exposes all three mounted modes", () => {
  assert.match(
    routeSource,
    /type DailyCrewAdminMode = "mission-studio" \| "template-library" \| "rotation-scheduler"/,
  );
  assert.match(routeSource, /useState<DailyCrewAdminMode>\("mission-studio"\)/);
  assert.match(routeSource, />\s*Mission Studio\s*<\/button>/);
  assert.match(routeSource, />\s*Template Library\s*<\/button>/);
  assert.match(routeSource, />\s*Rotation Scheduler\s*<\/button>/);
  assert.match(
    routeSource,
    /<div hidden=\{mode !== "mission-studio"\}>[\s\S]*<DailyCrewMissionStudio \/>[\s\S]*<\/div>/,
  );
  assert.match(
    routeSource,
    /<div hidden=\{mode !== "template-library"\}>[\s\S]*<DailyCrewTemplateLibrary onOpenMissionStudio=\{\(\) => setMode\("mission-studio"\)\} \/>[\s\S]*<\/div>/,
  );
  assert.match(
    routeSource,
    /<div hidden=\{mode !== "rotation-scheduler"\}>[\s\S]*<DailyCrewRotationScheduler onOpenMissionStudio=\{\(\) => setMode\("mission-studio"\)\} \/>[\s\S]*<\/div>/,
  );
  assert.doesNotMatch(routeSource, /mode === "mission-studio"\s*\?\s*\(\s*<DailyCrewMissionStudio/);
  assert.doesNotMatch(
    routeSource,
    /mode === "rotation-scheduler"\s*\?\s*\(\s*<DailyCrewRotationScheduler/,
  );
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
  assert.match(componentSource, /function toggleImportPanel\(\) \{\s+if \(mutationBusy\) return;/);
  assert.match(componentSource, /function clearImportText\(\) \{\s+if \(mutationBusy\) return;/);
  assert.match(
    componentSource,
    /function insertImportExample\(\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    componentSource,
    /function loadImportedMission\(\) \{\s+if \(mutationBusy\) return;/,
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

test("Daily Crew Mission Studio imports mission JSON only into local unsaved editor state", () => {
  assert.match(componentSource, /Import Mission JSON/);
  assert.match(componentSource, /Validate and Load/);
  assert.match(componentSource, /Insert Example/);
  assert.match(
    componentSource,
    /Importing fills the editor only\. It does not save or schedule the mission\./,
  );
  assert.match(componentSource, /importMissionJsonToEditor\(importText, characters\)/);
  assert.match(componentSource, /if \(mutationBusy\) return;[\s\S]*importMissionJsonToEditor/);
  assert.match(
    componentSource,
    /dirty &&[\s\S]*window\.confirm\("Replace the current unsaved editor with this imported mission JSON\?"\)/,
  );
  assert.match(componentSource, /setSelectedMissionId\(null\)/);
  assert.match(componentSource, /setEditor\(result\.editor\)/);
  assert.match(componentSource, /setBaselineEditor\(null\)/);
  assert.match(componentSource, /setBaselineSnapshot\(""\)/);
  assert.match(componentSource, /setSlugTouched\(true\)/);
  assert.match(componentSource, /setImportText\(""\)/);
  assert.match(componentSource, /setImportResult\(null\)/);
  assert.match(componentSource, /setImportOpen\(false\)/);
  assert.match(componentSource, /dirty \? "Unsaved changes" : "No unsaved changes"/);
  assert.match(
    componentSource,
    /Mission JSON loaded into the editor\. Click Save Complete Draft to save it\./,
  );
});

test("Daily Crew Mission Studio import UI does not call save or status functions", () => {
  const importPanel = componentSource.match(
    /function ImportMissionPanel[\s\S]*?\n}\n\nfunction MissionList/,
  )?.[0];
  const loadImportedMission = componentSource.match(
    /function loadImportedMission\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(importPanel, "ImportMissionPanel should be present");
  assert.ok(loadImportedMission, "loadImportedMission should be present");
  assert.doesNotMatch(importPanel, /saveAdminDailyCrewMissionDraft|setAdminDailyCrewMissionStatus/);
  assert.doesNotMatch(
    loadImportedMission,
    /saveAdminDailyCrewMissionDraft|setAdminDailyCrewMissionStatus/,
  );
  assert.doesNotMatch(
    importSource,
    /createServerFn|supabaseAdmin|getSupabaseAdmin|client\.server|Supabase|\.rpc\(|\.from\(/,
  );
});

test("Daily Crew Mission Studio import failure leaves editor state untouched", () => {
  const loadImportedMission = componentSource.match(
    /function loadImportedMission\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(loadImportedMission, "loadImportedMission should be present");
  assert.match(loadImportedMission, /setImportResult\(result\)/);
  assert.match(loadImportedMission, /if \(!result\.ok\) \{[\s\S]*return;[\s\S]*\}/);
  const failureBranch = loadImportedMission.match(/if \(!result\.ok\) \{[\s\S]*?return;\s*\}/)?.[0];
  assert.ok(failureBranch, "failure branch should be present");
  assert.doesNotMatch(
    failureBranch,
    /setEditor|setSelectedMissionId|setBaselineSnapshot|setSlugTouched/,
  );
});

test("Daily Crew Mission Studio cancelled import replacement leaves editor state untouched", () => {
  const loadImportedMission = componentSource.match(
    /function loadImportedMission\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(loadImportedMission, "loadImportedMission should be present");
  const cancellationBranch = loadImportedMission.match(/if \(\s*dirty &&[\s\S]*?return;\s*\}/)?.[0];
  assert.ok(cancellationBranch, "dirty import cancellation branch should be present");
  assert.match(
    cancellationBranch,
    /window\.confirm\("Replace the current unsaved editor with this imported mission JSON\?"\)/,
  );
  assert.doesNotMatch(
    cancellationBranch,
    /advanceEditorOperation|setEditor|setSelectedMissionId|setBaselineEditor|setBaselineSnapshot|setSlugTouched|setImportText|setImportResult|setImportOpen/,
  );
});

test("Daily Crew Mission Studio import advances operation key before replacing editor", () => {
  const loadImportedMission = componentSource.match(
    /function loadImportedMission\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(loadImportedMission, "loadImportedMission should be present");
  assert.match(
    loadImportedMission,
    /advanceEditorOperation\(\);[\s\S]*setSelectedMissionId\(null\)/,
  );
  assert.match(componentSource, /if \(!selectedMissionId \|\| !detailQ\.isSuccess/);
  assert.match(componentSource, /if \(detailQ\.data\.id !== selectedMissionId\) return/);
});

test("Daily Crew Mission Studio does not persist pasted mission JSON outside component state", () => {
  const importHandlingSource = `${componentSource}\n${importSource}\n${templateLibrarySource}\n${templateImportSource}\n${templateBulkImportSource}`;
  assert.doesNotMatch(
    importHandlingSource,
    /console\.(log|info|warn|error)|localStorage|sessionStorage|URLSearchParams|navigator\.sendBeacon|analytics|captureException|captureMessage|Sentry/,
  );
});

test("Daily Crew Template Library uses only approved template APIs", () => {
  assert.match(templateLibrarySource, /listAdminDailyCrewTemplates/);
  assert.match(templateLibrarySource, /getAdminDailyCrewTemplate/);
  assert.match(templateLibrarySource, /saveAdminDailyCrewTemplate/);
  assert.match(templateLibrarySource, /bulkImportAdminDailyCrewTemplates/);
  assert.match(templateLibrarySource, /createAdminDailyCrewMissionFromTemplate/);
  assert.match(templateLibrarySource, /listCharacters/);
  assert.doesNotMatch(templateLibrarySource, /supabaseAdmin|getSupabaseAdmin|client\.server/);
  assert.doesNotMatch(
    templateLibrarySource,
    /\bdb\.from\(|\.rpc\(|daily_crew_mission_templates|daily_crew_missions/,
  );
});

test("Daily Crew Template Library supports atomic create-only batch imports", () => {
  assert.match(templateLibrarySource, /Import Template Batch JSON/);
  assert.match(templateLibrarySource, /TemplateBatchImportPanel/);
  assert.match(
    templateLibrarySource,
    /Paste a JSON array of 1 to 50 complete Mission JSON objects/,
  );
  assert.match(templateLibrarySource, /Validation performs no writes/);
  assert.match(templateLibrarySource, /Validate Batch/);
  assert.match(templateLibrarySource, /Insert Batch Example/);
  assert.match(templateLibrarySource, /Import All Templates/);
  assert.match(
    templateLibrarySource,
    /importTemplateBatchJsonToDrafts\(batchText, characters, templates\)/,
  );
  assert.match(templateLibrarySource, /batchText === pendingBatch\.validatedJsonText/);
  assert.match(
    templateLibrarySource,
    /The batch JSON has changed since validation\. Validate it again before import\./,
  );
  assert.match(
    templateLibrarySource,
    /Import all \$\{count\} new active Daily Crew templates\? This operation is atomic: all templates will be created or none will be created\. Existing templates will not be replaced\./,
  );
  assert.match(templateLibrarySource, /bulkImportAdminDailyCrewTemplates\(\{/);
  assert.match(templateLibrarySource, /templates: drafts\.map\(templateDraftToCreatePayload\)/);
  assert.match(templateLibrarySource, /queryKey: \["admin", "daily-crew", "templates"\]/);
  assert.match(templateLibrarySource, /setBatchOpen\(false\)/);
  assert.match(templateLibrarySource, /setSelectedTemplateId\(null\)/);
  const bulkImportMutation = templateLibrarySource.match(
    /const bulkImportMutation = useMutation\(\{[\s\S]*?\n\s{2}\}\);\s+\n\s{2}const createMissionMutation/,
  )?.[0];
  assert.ok(bulkImportMutation, "bulk import mutation should be present");
  assert.equal((bulkImportMutation.match(/bulkImportAdminDailyCrewTemplates/g) ?? []).length, 1);
  assert.doesNotMatch(bulkImportMutation, /saveAdminDailyCrewTemplate/);
  assert.doesNotMatch(
    bulkImportMutation,
    /createAdminDailyCrewMissionFromTemplate|generateAdminDailyCrewRotation|setAdminDailyCrewMissionStatus/,
  );
  assert.match(
    bulkImportMutation,
    /onError: \(error\) => \{\s+toast\.error\(messageFromError\(error, "Could not import Daily Crew template batch\."\)\);\s+\}/,
    "bulk import failure should preserve the validated batch state by only reporting the error",
  );
});

test("Daily Crew Template Library batch preview is summary-only", () => {
  const batchPanel = templateLibrarySource.match(
    /function TemplateBatchImportPanel[\s\S]*?\n}\n\nfunction TemplateImportPanel/,
  )?.[0];
  assert.ok(batchPanel, "TemplateBatchImportPanel should be present");
  assert.match(batchPanel, /template count|Templates/i);
  assert.match(batchPanel, /totalPoolRows|Pool rows/);
  assert.match(batchPanel, /totalJobs|Jobs/);
  assert.match(batchPanel, /totalScoreRows|Score rows/);
  assert.match(batchPanel, /totalPerfectCrewRows|Perfect crew rows/);
  assert.match(batchPanel, /summary\.position/);
  assert.match(batchPanel, /summary\.title/);
  assert.match(batchPanel, /summary\.slug/);
  assert.match(batchPanel, /summary\.format/);
  assert.match(batchPanel, /summary\.sourceMissionDate/);
  assert.match(batchPanel, /none/);
  assert.match(batchPanel, /active/);
  assert.match(batchPanel, /summary\.validationStatus/);
  assert.doesNotMatch(batchPanel, /explanation|scores\.map|perfectSolution\.map/);
});

test("Daily Crew Template Library keeps list rows free of hidden solution data", () => {
  const templateList = templateLibrarySource.match(
    /function TemplateList[\s\S]*?\n}\n\nfunction TemplateDetail/,
  )?.[0];
  assert.ok(templateList, "TemplateList should be present");
  assert.match(templateList, /template\.title/);
  assert.match(templateList, /template\.slug/);
  assert.match(templateList, /template\.isActive/);
  assert.match(templateList, /template\.revision/);
  assert.match(templateList, /\$\{template\.poolCount\}\/\$\{template\.jobCount\}/);
  assert.match(templateList, /template\.scoreCount/);
  assert.match(templateList, /template\.ready/);
  assert.match(templateList, /template\.instanceCount/);
  assert.match(templateList, /template\.mostRecentMissionDate/);
  assert.doesNotMatch(templateList, /perfectSolution|scores\.map|explanation/);
});

test("Daily Crew Template Library detail may expose protected perfect crew", () => {
  assert.match(templateLibrarySource, /getAdminDailyCrewTemplate\(\{/);
  assert.match(templateLibrarySource, /enabled: Boolean\(selectedTemplateId\)/);
  assert.match(templateLibrarySource, /detailQ\.data\?\.id === selectedTemplateId/);
  assert.match(templateLibrarySource, /Protected Template Detail/);
  assert.match(templateLibrarySource, /Jobs and perfect crew/);
  assert.match(templateLibrarySource, /detail\.perfectSolution\.map/);
  assert.match(templateLibrarySource, /Hidden score matrix summarized/);
  assert.doesNotMatch(templateLibrarySource, /score\.explanation|explanations\.map/);
});

test("Daily Crew Template Library validates JSON locally before saving", () => {
  const validateImportText = templateLibrarySource.match(
    /function validateImportText\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(validateImportText, "validateImportText should be present");
  assert.match(validateImportText, /importTemplateJsonToDraft\(importText, characters/);
  assert.match(validateImportText, /setImportResult\(result\)/);
  assert.match(validateImportText, /if \(!result\.ok\) \{[\s\S]*return;[\s\S]*\}/);
  assert.doesNotMatch(validateImportText, /saveAdminDailyCrewTemplate/);
  assert.doesNotMatch(validateImportText, /createAdminDailyCrewMissionFromTemplate/);
  assert.match(templateLibrarySource, /Mission date is used only to validate the JSON format/);
});

test("Daily Crew Template Library makes pending imports saveable only for the validated JSON text", () => {
  assert.match(templateLibrarySource, /validatedJsonText: string/);
  assert.match(templateLibrarySource, /validatedJsonText: importText/);
  assert.match(
    templateLibrarySource,
    /const pendingImportMatchesText = Boolean\(\s*pendingImport && importText === pendingImport\.validatedJsonText,\s*\)/,
  );
  assert.match(
    templateLibrarySource,
    /const canSaveImport = Boolean\(pendingImportMatchesText && !mutationBusy\)/,
  );
  assert.match(
    templateLibrarySource,
    /if \(importText !== pendingImport\.validatedJsonText\) \{[\s\S]*The JSON has changed since validation\. Validate it again before saving\.[\s\S]*return;/,
  );
  assert.match(
    templateLibrarySource,
    /JSON changed after validation\. Validate again before saving\./,
  );
});

test("Daily Crew Template Library editing JSON makes the prior preview stale without discarding it", () => {
  const updateImportText = templateLibrarySource.match(
    /function updateImportText\(value: string\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(updateImportText, "updateImportText should be present");
  assert.match(updateImportText, /setImportText\(value\)/);
  assert.match(updateImportText, /setImportResult\(null\)/);
  assert.doesNotMatch(updateImportText, /setPendingImport|saveAdminDailyCrewTemplate/);

  const insertImportExample = templateLibrarySource.match(
    /function insertImportExample\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(insertImportExample, "insertImportExample should be present");
  assert.match(insertImportExample, /setImportText\(DAILY_CREW_TEMPLATE_IMPORT_EXAMPLE\)/);
  assert.match(insertImportExample, /setImportResult\(null\)/);
  assert.doesNotMatch(insertImportExample, /setPendingImport|saveAdminDailyCrewTemplate/);
});

test("Daily Crew Template Library clear intentionally discards import text, result, and pending draft", () => {
  const clearImportPanel = templateLibrarySource.match(
    /function clearImportPanel\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(clearImportPanel, "clearImportPanel should be present");
  assert.match(clearImportPanel, /setImportText\(""\)/);
  assert.match(clearImportPanel, /setImportResult\(null\)/);
  assert.match(clearImportPanel, /setPendingImport\(null\)/);
  assert.doesNotMatch(
    clearImportPanel,
    /setSelectedTemplateId|advanceTemplateOperation|createAdminDailyCrewMissionFromTemplate/,
  );
});

test("Daily Crew Template Library failed revalidation retains the prior draft and cannot save stale text", () => {
  const failureBranch = templateLibrarySource.match(
    /if \(!result\.ok\) \{[\s\S]*?return;\s*\}/,
  )?.[0];
  assert.ok(failureBranch, "failed validation branch should be present");
  assert.match(failureBranch, /setImportResult\(result\)/);
  assert.doesNotMatch(failureBranch, /setPendingImport|saveAdminDailyCrewTemplate/);
  assert.match(
    templateLibrarySource,
    /if \(!result\.ok\) \{[\s\S]*?return;\s*\}\s+if \(\s*pendingImport &&\s*importText !== pendingImport\.validatedJsonText/,
  );
  assert.match(templateLibrarySource, /disabled=\{!canSave\}/);
});

test("Daily Crew Template Library save buttons share the safe validated-text eligibility", () => {
  assert.match(templateLibrarySource, /<TemplateImportPanel[\s\S]*canSave=\{canSaveImport\}/);
  assert.match(templateLibrarySource, /<PendingImportPreview[\s\S]*canSave=\{canSaveImport\}/);
  const templateImportPanel = templateLibrarySource.match(
    /function TemplateImportPanel[\s\S]*?\n}\n\nfunction PendingImportPreview/,
  )?.[0];
  const pendingImportPreview = templateLibrarySource.match(
    /function PendingImportPreview[\s\S]*?\n}\n\nfunction ImportErrors/,
  )?.[0];
  assert.ok(templateImportPanel, "TemplateImportPanel should be present");
  assert.ok(pendingImportPreview, "PendingImportPreview should be present");
  assert.match(templateImportPanel, /disabled=\{!canSave\}/);
  assert.match(pendingImportPreview, /disabled=\{!canSave\}/);
});

test("Daily Crew Template Library save and replacement payloads preserve template identity rules", () => {
  assert.match(
    templateLibrarySource,
    /templateId: replacementDetail\?\.id \?\? null,[\s\S]*isActive: replacementDetail\?\.isActive \?\? true/,
  );
  assert.match(templateLibrarySource, /setSelectedTemplateId\(null\)/);
  assert.match(templateLibrarySource, /Save as Template/);
  assert.match(templateLibrarySource, /Update Template/);
  assert.match(
    templateLibrarySource,
    /Update \$\{pendingImport\.draft\.title\}\? This creates revision/,
  );
  assert.match(templateLibrarySource, /saveAdminDailyCrewTemplate\(\{ data: draft \}\)/);
});

test("Daily Crew Template Library toggles active state through complete save API", () => {
  const toggleActiveState = templateLibrarySource.match(
    /function toggleActiveState\(nextIsActive: boolean\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(toggleActiveState, "toggleActiveState should be present");
  assert.match(toggleActiveState, /if \(!selectedDetail\.ready\)/);
  assert.match(
    toggleActiveState,
    /Discard the pending imported template draft before changing active state/,
  );
  assert.match(toggleActiveState, /creates revision/);
  assert.match(toggleActiveState, /clearPendingImport\(\)/);
  assert.match(toggleActiveState, /templateDetailToDraft\(selectedDetail, nextIsActive\)/);
  assert.match(toggleActiveState, /source: "toggle"/);
  assert.doesNotMatch(toggleActiveState, /\.from\(|\.rpc\(|update\s*\(/);
});

test("Daily Crew Template Library creates dated drafts only through instantiation API", () => {
  const createDatedDraft = templateLibrarySource.match(
    /function createDatedDraft\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(createDatedDraft, "createDatedDraft should be present");
  assert.match(createDatedDraft, /!selectedDetail\.isActive/);
  assert.match(createDatedDraft, /!selectedDetail\.ready/);
  assert.match(createDatedDraft, /isCurrentOrFutureUtcDate\(draftMissionDate\)/);
  assert.match(
    createDatedDraft,
    /Discard the pending imported template draft before creating a dated mission/,
  );
  assert.match(createDatedDraft, /This will not schedule or publish it/);
  assert.match(createDatedDraft, /clearPendingImport\(\)/);
  assert.match(templateLibrarySource, /createAdminDailyCrewMissionFromTemplate\(\{/);
  assert.match(templateLibrarySource, /queryKey: \["admin", "daily-crew", "missions"\]/);
  assert.match(templateLibrarySource, /queryKey: \["admin", "daily-crew", "templates"\]/);
  assert.match(templateLibrarySource, /Open Mission Studio/);
  assert.doesNotMatch(templateLibrarySource, /setAdminDailyCrewMissionStatus|targetStatus/);
});

test("Daily Crew Template Library has stale-response and mutation-busy protections", () => {
  assert.match(templateLibrarySource, /activeTemplateOperationRef/);
  assert.match(templateLibrarySource, /pendingDraftSnapshotRef/);
  assert.match(templateLibrarySource, /submittedSnapshot: string/);
  assert.match(
    templateLibrarySource,
    /pendingDraftSnapshotRef\.current === variables\.submittedSnapshot/,
  );
  assert.match(
    templateLibrarySource,
    /activeTemplateOperationRef\.current !== variables\.operationKey/,
  );
  assert.match(templateLibrarySource, /detailQ\.data\?\.id === selectedTemplateId/);
  assert.match(
    templateLibrarySource,
    /saveMutation\.isPending \|\| bulkImportMutation\.isPending \|\| createMissionMutation\.isPending/,
  );
  assert.match(
    templateLibrarySource,
    /function selectTemplate\(templateId: string\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    templateLibrarySource,
    /function clearSelection\(\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    templateLibrarySource,
    /function openImport\(mode: ImportMode\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    templateLibrarySource,
    /function validateImportText\(\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    templateLibrarySource,
    /function savePendingImport\(\) \{\s+if \(!pendingImport \|\| mutationBusy\) return;/,
  );
  assert.match(
    templateLibrarySource,
    /function validateBatchText\(\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    templateLibrarySource,
    /function importPendingBatch\(\) \{\s+if \(!pendingBatch \|\| mutationBusy\) return;/,
  );
  assert.match(
    templateLibrarySource,
    /if \(batchText !== pendingBatch\.validatedJsonText\) \{[\s\S]*?Validate it again before import\.[\s\S]*?return;[\s\S]*?\}/,
  );
  assert.match(templateLibrarySource, /disabled=\{!canImport\}/);
  assert.match(
    templateLibrarySource,
    /function createDatedDraft\(\) \{\s+if \(mutationBusy \|\| !selectedDetail\) return;/,
  );
  assert.match(templateLibrarySource, /Discard the pending imported template draft/);
});

test("Daily Crew Rotation Scheduler uses only approved protected rotation APIs", () => {
  assert.match(rotationSchedulerSource, /listAdminDailyCrewRotationPlans/);
  assert.match(rotationSchedulerSource, /getAdminDailyCrewRotationPlan/);
  assert.match(rotationSchedulerSource, /saveAdminDailyCrewRotationPlan/);
  assert.match(rotationSchedulerSource, /previewAdminDailyCrewRotation/);
  assert.match(rotationSchedulerSource, /generateAdminDailyCrewRotation/);
  assert.match(rotationSchedulerSource, /listAdminDailyCrewTemplates/);
  assert.doesNotMatch(rotationSchedulerSource, /supabaseAdmin|getSupabaseAdmin|client\.server/);
  assert.doesNotMatch(
    rotationSchedulerSource,
    /\bdb\.from\(|\.rpc\(|admin_create_daily_crew_builder_mission_from_template|admin_set_daily_crew_builder_mission_status/,
  );
  assert.doesNotMatch(rotationSchedulerSource, /setAdminDailyCrewMissionStatus/);
});

test("Daily Crew Rotation Scheduler keeps local slot editing separate from backend writes", () => {
  assert.match(rotationSchedulerSource, /createBlankRotationEditor/);
  assert.match(rotationSchedulerSource, /rotationEditorFromDetail/);
  assert.match(rotationSchedulerSource, /rotationEditorToSavePayload/);
  assert.match(rotationSchedulerSource, /Fill Empty Slots/);
  assert.match(rotationSchedulerSource, /Clear All Assignments/);
  assert.match(rotationSchedulerSource, /fillEmptyRotationSlots/);
  assert.match(rotationSchedulerSource, /clearRotationAssignments/);
  assert.match(rotationEditorSource, /slots: createEmptySlots\(\)/);
  assert.match(rotationEditorSource, /filter\([\s\S]*Boolean\(slot\.templateId\)/);
  assert.match(rotationEditorSource, /template\.isActive && template\.ready/);
  assert.match(rotationEditorSource, /a\.title\.localeCompare\(b\.title\)/);
  assert.match(rotationEditorSource, /a\.slug\.localeCompare\(b\.slug\)/);
  assert.match(rotationEditorSource, /a\.id\.localeCompare\(b\.id\)/);
  assert.match(rotationEditorSource, /parseUtcDateMs/);
  assert.match(rotationEditorSource, /date\.toISOString\(\)\.slice\(0, 10\) !== value/);
  assert.match(rotationEditorSource, /isDailyCrewRotationTargetStatus/);
  assert.doesNotMatch(rotationEditorSource, /Math\.random|shuffle|drag/i);
});

test("Daily Crew Rotation Scheduler protects dirty state and stale responses", () => {
  assert.match(rotationSchedulerSource, /beforeunload/);
  assert.match(
    rotationSchedulerSource,
    /Discard unsaved rotation-plan changes and load another plan/,
  );
  assert.match(
    rotationSchedulerSource,
    /Discard unsaved rotation-plan changes and clear selection/,
  );
  assert.match(
    rotationSchedulerSource,
    /Discard unsaved rotation-plan changes and create a new plan/,
  );
  assert.match(rotationSchedulerSource, /selectedPlanIdRef/);
  assert.match(rotationSchedulerSource, /editorSnapshotRef/);
  assert.match(rotationSchedulerSource, /activeOperationRef/);
  assert.match(rotationSchedulerSource, /operationKey: activeOperationRef\.current/);
  assert.match(rotationSchedulerSource, /activeOperationRef\.current !== variables\.operationKey/);
  assert.match(
    rotationSchedulerSource,
    /selectedPlanIdRef\.current !== variables\.snapshot\.planId/,
  );
  assert.match(rotationSchedulerSource, /isRotationPreviewSnapshotCurrent/);
  assert.match(
    rotationSchedulerSource,
    /if \(dirty && editor\?\.planId === selectedPlanId\) return/,
  );
  assert.match(rotationSchedulerSource, /function updateEditor[\s\S]*?if \(mutationBusy\) return;/);
  assert.match(
    rotationSchedulerSource,
    /function selectPlan\(planId: string\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    rotationSchedulerSource,
    /function createNewPlan\(\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    rotationSchedulerSource,
    /function updateStartDate\(value: string\) \{\s+if \(mutationBusy\) return;/,
  );
  assert.match(
    rotationSchedulerSource,
    /function updateTargetStatus\(value: string\) \{\s+if \(mutationBusy \|\| !isDailyCrewRotationTargetStatus\(value\)\) return;/,
  );
  assert.match(rotationSchedulerSource, /disabled=\{mutationBusy\}/);
  assert.match(rotationSchedulerSource, /disabled=\{!dirty \|\| mutationBusy\}/);
});

test("Daily Crew Rotation Scheduler ignores editor-equivalent detail refetches", () => {
  const detailSyncEffect = rotationSchedulerSource.match(
    /useEffect\(\(\) => \{[\s\S]*?if \(!selectedPlanId \|\| !detailQ\.isSuccess \|\| !detailQ\.data\) return;[\s\S]*?\n\s{2}\}, \[[\s\S]*?selectedPlanId,[\s\S]*?\]\);/,
  )?.[0];
  assert.ok(detailSyncEffect, "selected rotation-plan detail sync effect should exist");
  assert.match(detailSyncEffect, /const nextEditor = rotationEditorFromDetail\(detailQ\.data\);/);
  assert.match(
    detailSyncEffect,
    /const nextEditorSnapshot = rotationEditorSnapshot\(nextEditor\);/,
  );
  assert.match(detailSyncEffect, /editor\?\.planId === selectedPlanId/);
  assert.match(detailSyncEffect, /!dirty/);
  assert.match(detailSyncEffect, /currentEditorSnapshot === nextEditorSnapshot/);
  assert.match(detailSyncEffect, /baselineSnapshot === nextEditorSnapshot/);
  assert.match(
    detailSyncEffect,
    /baselineSnapshot === nextEditorSnapshot[\s\S]*?\) \{\s+return;\s+\}\s+advanceOperation\(\);/,
  );
  assert.match(
    detailSyncEffect,
    /return;\s+\}\s+advanceOperation\(\);\s+setEditorBaseline\(nextEditor\);\s+clearPreviewState\(\);/,
  );
  assert.match(detailSyncEffect, /if \(dirty && editor\?\.planId === selectedPlanId\) return/);
  assert.match(detailSyncEffect, /baselineSnapshot/);
  assert.match(detailSyncEffect, /currentEditorSnapshot/);
});

test("Daily Crew Rotation Scheduler preview and generation are snapshot-gated", () => {
  assert.match(rotationSchedulerSource, /previewAdminDailyCrewRotation\(\{/);
  assert.match(rotationSchedulerSource, /generateAdminDailyCrewRotation\(\{/);
  assert.match(rotationSchedulerSource, /preview performs no save or generation/i);
  assert.match(rotationSchedulerSource, /previewResult\?\.readyToGenerate/);
  assert.match(rotationSchedulerSource, /previewCurrent/);
  assert.match(rotationSchedulerSource, /type GenerateRotationMutationVariables = \{/);
  assert.match(rotationSchedulerSource, /planName: string/);
  assert.match(rotationSchedulerSource, /previewEndDate: string/);
  assert.match(rotationSchedulerSource, /planName: previewResult\.planName/);
  assert.match(rotationSchedulerSource, /previewEndDate: previewResult\.endDate/);
  assert.match(
    rotationSchedulerSource,
    /Preview is stale\. Preview again before generating missions/,
  );
  assert.match(rotationSchedulerSource, /Preview must be ready before generating missions/);
  assert.match(rotationSchedulerSource, /targetStatus === "scheduled"/);
  assert.match(rotationSchedulerSource, /Create and schedule 30 missions/);
  assert.match(rotationSchedulerSource, /Create 30 draft missions/);
  assert.match(rotationSchedulerSource, /queryKey: \["admin", "daily-crew", "missions"\]/);
  assert.match(rotationSchedulerSource, /queryKey: \["admin", "daily-crew", "templates"\]/);
  assert.match(rotationSchedulerSource, /queryKey: \["admin", "daily-crew", "rotation-plans"\]/);
  assert.match(rotationSchedulerSource, /queryKey: \["admin", "daily-crew", "rotation-plan"/);
  assert.match(
    rotationSchedulerSource,
    /await Promise\.all\(\[[\s\S]*?queryKey: \["admin", "daily-crew", "rotation-plan", variables\.snapshot\.planId\],[\s\S]*?\]\);\s+if \(/,
  );
  assert.match(
    rotationSchedulerSource,
    /if \([\s\S]*?activeOperationRef\.current !== variables\.operationKey[\s\S]*?selectedPlanIdRef\.current !== variables\.snapshot\.planId[\s\S]*?!isRotationPreviewSnapshotCurrent\(previewSnapshotFromCurrent\(\), variables\.snapshot\)[\s\S]*?\) \{\s+return;\s+\}\s+setGenerationResult\(result\);/,
  );
  assert.match(
    rotationSchedulerSource,
    /result\.slots\.slice\(\)\.sort\(\(a, b\) => a\.slotNumber - b\.slotNumber\)/,
  );
  assert.match(
    rotationSchedulerSource,
    /result\.missions\.slice\(\)\.sort\(\(a, b\) => a\.slotNumber - b\.slotNumber\)/,
  );
  assert.doesNotMatch(
    rotationSchedulerSource,
    /targetStatus:\s*"published"|targetStatus:\s*"archived"/,
  );
});

test("Daily Crew Rotation Scheduler displays every backend blocking reason safely", () => {
  assert.match(rotationSchedulerSource, /Plan does not contain all 30 assignments/);
  assert.match(rotationSchedulerSource, /No template assigned/);
  assert.match(rotationSchedulerSource, /Template is inactive/);
  assert.match(rotationSchedulerSource, /Template is not ready/);
  assert.match(rotationSchedulerSource, /A mission already exists on this date/);
  assert.match(rotationSchedulerSource, /Generated mission slug already exists/);
  assert.match(rotationSchedulerSource, /Generated mission slug is too long/);
  assert.match(rotationSchedulerSource, /Unknown blocker: \$\{reason\}/);
  assert.doesNotMatch(
    rotationSchedulerSource,
    /score\.explanation|perfectSolution|daily_crew_character_role_scores/,
  );
});

test("Daily Crew Mission Studio reset clears imported draft when no baseline exists", () => {
  const resetUnsavedChanges = componentSource.match(
    /function resetUnsavedChanges\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0];
  assert.ok(resetUnsavedChanges, "resetUnsavedChanges should be present");
  assert.match(resetUnsavedChanges, /if \(baselineEditor\) \{/);
  assert.match(resetUnsavedChanges, /setEditor\(baselineEditor\)/);
  assert.match(resetUnsavedChanges, /setSelectedMissionId\(null\)/);
  assert.match(resetUnsavedChanges, /setEditor\(null\)/);
  assert.match(resetUnsavedChanges, /setBaselineEditor\(null\)/);
  assert.match(resetUnsavedChanges, /setBaselineSnapshot\(""\)/);
  assert.match(resetUnsavedChanges, /setSlugTouched\(false\)/);
});

test("admin console links to Daily Crew Mission Studio", () => {
  assert.match(adminRouteSource, /to="\/daily-crew-admin"/);
  assert.match(adminRouteSource, /Daily Crew Mission Studio/);
});

test("public Daily Crew Builder route is unchanged by Mission Studio", () => {
  assert.match(publicDailyCrewRouteSource, /createFileRoute\("\/games\/daily-crew-builder"\)/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /DailyCrewMissionStudio/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /importMissionJsonToEditor/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /getAdminDailyCrewMission/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /saveAdminDailyCrewMissionDraft/);
  assert.doesNotMatch(publicDailyCrewRouteSource, /setAdminDailyCrewMissionStatus/);
});
