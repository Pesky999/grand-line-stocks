/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const adminSource = readFileSync(
  join(process.cwd(), "src/lib/api/daily-crew-builder-admin.functions.ts"),
  "utf8",
);
const publicSource = readFileSync(
  join(process.cwd(), "src/lib/api/daily-crew-builder.functions.ts"),
  "utf8",
);

function functionSource(name: string): string {
  const start = adminSource.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const next = adminSource.indexOf("\nexport const ", start + 1);
  return adminSource.slice(start, next < 0 ? adminSource.length : next);
}

test("Daily Crew Builder admin functions require auth, admin role, and service role after authorization", () => {
  for (const name of [
    "listAdminDailyCrewMissions",
    "getAdminDailyCrewMission",
    "saveAdminDailyCrewMissionDraft",
    "setAdminDailyCrewMissionStatus",
    "listAdminDailyCrewTemplates",
    "getAdminDailyCrewTemplate",
    "saveAdminDailyCrewTemplate",
    "createAdminDailyCrewMissionFromTemplate",
    "listAdminDailyCrewRotationPlans",
    "getAdminDailyCrewRotationPlan",
    "saveAdminDailyCrewRotationPlan",
    "previewAdminDailyCrewRotation",
    "generateAdminDailyCrewRotation",
  ]) {
    const body = functionSource(name);
    assert.match(body, /\.middleware\(\[requireSupabaseAuth\]\)/, `${name} requires auth`);
    assert.match(body, /authorizedAdmin\(context\)/, `${name} uses the shared admin gate`);
  }

  const authHelper = adminSource.slice(
    adminSource.indexOf("async function authorizedAdmin"),
    adminSource.indexOf("function toJson"),
  );
  assert.match(authHelper, /await requireAdminRole\(context\.supabase, context\.userId\)/);
  assert.match(authHelper, /return admin\(\)/);
  assert.match(
    adminSource,
    /const \{ supabaseAdmin \} = await import\("@\/integrations\/supabase\/client\.server"\)/,
  );
  assert.match(adminSource, /\.rpc\("has_role", \{ _user_id: userId, _role: "admin" \}\)/);
});

test("Daily Crew Builder template admin schemas are strict and date-independent", () => {
  const inputSchema = adminSource.slice(
    adminSource.indexOf("const templateAuthoringInput"),
    adminSource.indexOf("const missionIdInput"),
  );

  assert.match(inputSchema, /\.strict\(\)/);
  assert.match(inputSchema, /templateId: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(inputSchema, /slug: templateSlugSchema/);
  assert.match(inputSchema, /title: trimmedString\(120\)/);
  assert.match(inputSchema, /brief: trimmedString\(2000\)/);
  assert.match(inputSchema, /revealPolicy: z\.enum\(DAILY_CREW_REVEAL_POLICIES\)/);
  assert.match(inputSchema, /isActive: z\.boolean\(\)/);
  assert.match(inputSchema, /pool: z\s+\.array\(authoringPoolEntrySchema\)/);
  assert.match(inputSchema, /jobs: z\.array\(authoringJobSchema\)/);
  assert.match(inputSchema, /scores: z\.array\(authoringScoreSchema\)/);
  assert.match(inputSchema, /perfectSolution: z\.array\(authoringPerfectSolutionSchema\)/);
  assert.match(inputSchema, /value\.pool\.length === 9 && value\.jobs\.length === 3/);
  assert.match(inputSchema, /value\.pool\.length === 15 && value\.jobs\.length === 5/);
  assert.match(inputSchema, /value\.scores\.length !== value\.pool\.length \* value\.jobs\.length/);
  assert.match(inputSchema, /value\.perfectSolution\.length !== value\.jobs\.length/);
  assert.doesNotMatch(
    inputSchema,
    /missionDate|targetStatus|revealAt|submission|reward|wallet|financial/i,
  );

  const templateSlug = adminSource.slice(
    adminSource.indexOf("const templateSlugSchema"),
    adminSource.indexOf("const subtypeKeySchema"),
  );
  assert.match(templateSlug, /\{0,67\}/, "template slugs reserve room for -YYYY-MM-DD");
});

test("Daily Crew Builder admin save and status writes call only approved RPCs", () => {
  const save = functionSource("saveAdminDailyCrewMissionDraft");
  const status = functionSource("setAdminDailyCrewMissionStatus");

  assert.match(save, /\.inputValidator\(\(input\) => missionAuthoringInput\.parse\(input\)\)/);
  assert.match(save, /\.rpc\("admin_save_daily_crew_builder_mission"/);
  assert.match(save, /_mission_id: data\.missionId \?\? null/);
  assert.match(save, /_pool: toJson\(data\.pool\)/);
  assert.match(save, /_jobs: toJson\(data\.jobs\)/);
  assert.match(save, /_scores: toJson\(data\.scores\)/);
  assert.match(save, /_perfect_solution: toJson\(data\.perfectSolution\)/);
  assert.doesNotMatch(save, /\.from\("daily_crew_/);
  assert.doesNotMatch(save, /\.(insert|update|upsert|delete)\s*\(/);

  assert.match(status, /\.inputValidator\(\(input\) => statusInput\.parse\(input\)\)/);
  assert.match(status, /\.rpc\("admin_set_daily_crew_builder_mission_status"/);
  assert.match(status, /_target_status: data\.targetStatus/);
  assert.doesNotMatch(status, /\.from\("daily_crew_/);
  assert.doesNotMatch(status, /\.(insert|update|upsert|delete)\s*\(/);
});

test("Daily Crew Builder template writes call only approved template RPCs", () => {
  const save = functionSource("saveAdminDailyCrewTemplate");
  const instantiate = functionSource("createAdminDailyCrewMissionFromTemplate");

  assert.match(save, /\.inputValidator\(\(input\) => templateAuthoringInput\.parse\(input\)\)/);
  assert.match(save, /\.rpc\("admin_save_daily_crew_builder_template"/);
  assert.match(save, /_template_id: data\.templateId \?\? null/);
  assert.match(save, /_is_active: data\.isActive/);
  assert.match(save, /_pool: toJson\(data\.pool\)/);
  assert.match(save, /_jobs: toJson\(data\.jobs\)/);
  assert.match(save, /_scores: toJson\(data\.scores\)/);
  assert.match(save, /_perfect_solution: toJson\(data\.perfectSolution\)/);
  assert.doesNotMatch(save, /\.from\("daily_crew_/);
  assert.doesNotMatch(save, /\.(insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(save, /missionDate|targetStatus|revealAt|reward|wallet|submission/i);

  assert.match(
    instantiate,
    /\.inputValidator\(\(input\) => createMissionFromTemplateInput\.parse\(input\)\)/,
  );
  assert.match(instantiate, /\.rpc\(\s*"admin_create_daily_crew_builder_mission_from_template"/);
  assert.match(instantiate, /_template_id: data\.templateId/);
  assert.match(instantiate, /_mission_date: data\.missionDate/);
  assert.doesNotMatch(instantiate, /\.from\("daily_crew_/);
  assert.doesNotMatch(instantiate, /\.(insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(instantiate, /targetStatus|revealAt|reward|wallet|submission/i);
});

test("Daily Crew Builder rotation schemas are strict and allow only draft or scheduled generation", () => {
  assert.match(
    adminSource,
    /const DAILY_CREW_ROTATION_TARGET_STATUSES = \["draft", "scheduled"\] as const/,
  );

  const saveInput = adminSource.slice(
    adminSource.indexOf("const rotationPlanSaveInput"),
    adminSource.indexOf("const rotationRunInput"),
  );
  assert.match(saveInput, /\.strict\(\)/);
  assert.match(saveInput, /planId: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(saveInput, /name: trimmedString\(120\)/);
  assert.match(saveInput, /slots: z\.array\(rotationSlotInput\)\.max\(30\)\.default\(\[\]\)/);
  assert.match(saveInput, /seenSlots\.has\(slot\.slotNumber\)/);
  assert.match(saveInput, /Daily Crew Builder rotation slots cannot repeat slot numbers/);

  const runInput = adminSource.slice(
    adminSource.indexOf("const rotationRunInput"),
    adminSource.indexOf("const authoringRpcResultSchema"),
  );
  assert.match(runInput, /\.strict\(\)/);
  assert.match(runInput, /planId: z\.string\(\)\.uuid\(\)/);
  assert.match(runInput, /startDate: missionDateSchema/);
  assert.match(runInput, /targetStatus: z\.enum\(DAILY_CREW_ROTATION_TARGET_STATUSES\)/);
  assert.doesNotMatch(runInput, /published|archived/);

  const previewResult = adminSource.slice(
    adminSource.indexOf("const rotationPreviewSlotSchema"),
    adminSource.indexOf("const generatedRotationMissionSchema"),
  );
  assert.match(previewResult, /\.strict\(\)/);
  assert.match(previewResult, /slots: z\.array\(rotationPreviewSlotSchema\)\.length\(30\)/);
  assert.match(previewResult, /blockingReasons: z\.array\(z\.string\(\)\)/);

  const generateResult = adminSource.slice(
    adminSource.indexOf("const generatedRotationMissionSchema"),
    adminSource.indexOf("const missionRowSchema"),
  );
  assert.match(generateResult, /status: z\.enum\(DAILY_CREW_ROTATION_TARGET_STATUSES\)/);
  assert.match(generateResult, /createdCount: z\.literal\(30\)/);
  assert.match(
    generateResult,
    /missions: z\.array\(generatedRotationMissionSchema\)\.length\(30\)/,
  );
});

test("Daily Crew Builder rotation writes call only approved rotation RPCs", () => {
  const save = functionSource("saveAdminDailyCrewRotationPlan");
  const preview = functionSource("previewAdminDailyCrewRotation");
  const generate = functionSource("generateAdminDailyCrewRotation");

  assert.match(save, /\.inputValidator\(\(input\) => rotationPlanSaveInput\.parse\(input\)\)/);
  assert.match(save, /\.rpc\("admin_save_daily_crew_rotation_plan"/);
  assert.match(save, /_plan_id: data\.planId \?\? null/);
  assert.match(save, /_name: data\.name/);
  assert.match(save, /_slots: toJson\(data\.slots\)/);
  assert.doesNotMatch(save, /\.from\("daily_crew_/);
  assert.doesNotMatch(save, /\.(insert|update|upsert|delete)\s*\(/);

  for (const [name, body, rpc] of [
    ["preview", preview, "admin_preview_daily_crew_rotation"],
    ["generate", generate, "admin_generate_daily_crew_rotation"],
  ] as const) {
    assert.match(body, /\.inputValidator\(\(input\) => rotationRunInput\.parse\(input\)\)/);
    assert.match(body, new RegExp(`\\.rpc\\("${rpc}"`), `${name} uses approved RPC`);
    assert.match(body, /_plan_id: data\.planId/);
    assert.match(body, /_start_date: data\.startDate/);
    assert.match(body, /_target_status: data\.targetStatus/);
    assert.doesNotMatch(body, /\.from\("daily_crew_/);
    assert.doesNotMatch(body, /\.(insert|update|upsert|delete)\s*\(/);
    assert.doesNotMatch(body, /reward|wallet|transaction|grandLineGuess/i);
  }
});

test("Daily Crew Builder rotation list and detail do not expose hidden template internals", () => {
  const list = functionSource("listAdminDailyCrewRotationPlans");
  const detail = functionSource("getAdminDailyCrewRotationPlan");

  for (const field of [
    "name",
    "revision",
    "slotCount",
    "uniqueTemplateCount",
    "ready",
    "generatedMissionCount",
    "mostRecentGeneratedMissionDate",
    "createdAt",
    "updatedAt",
  ]) {
    assert.match(adminSource, new RegExp(`${field}:`), `${field} is exposed in rotation summaries`);
  }

  assert.match(list, /\.from\("daily_crew_rotation_plans"\)/);
  assert.match(list, /\.from\("daily_crew_rotation_plan_slots"\)/);
  assert.match(list, /getRotationPlanReadyMap\(db, planIds\)/);
  assert.match(adminSource, /\.rpc\("validate_daily_crew_rotation_plan"/);
  assert.match(detail, /listTemplateBasics\(db, templateIds\)/);
  assert.match(detail, /listRowsByTemplate\(db, templateIds\)/);
  assert.match(detail, /templateReady\.get\(template\.id\)/);
  assert.doesNotMatch(list, /scores: scores\.map|perfectSolution: perfectSolution\.map/);
  assert.doesNotMatch(detail, /scores: scores\.map|perfectSolution: perfectSolution\.map/);
  assert.doesNotMatch(
    detail,
    /explanation|daily_crew_mission_template_perfect_solution|perfect_solution/i,
  );
});

test("Daily Crew Builder admin schemas are strict and support complete authoring payloads", () => {
  const inputSchema = adminSource.slice(
    adminSource.indexOf("const missionAuthoringInput"),
    adminSource.indexOf("const missionIdInput"),
  );

  assert.match(inputSchema, /\.strict\(\)/);
  assert.match(inputSchema, /missionId: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(inputSchema, /missionDate: missionDateSchema/);
  assert.match(inputSchema, /slug: slugSchema/);
  assert.match(inputSchema, /revealPolicy: z\.enum\(DAILY_CREW_REVEAL_POLICIES\)/);
  assert.match(
    inputSchema,
    /revealAt: z\.string\(\)\.datetime\(\{ offset: true \}\)\.nullable\(\)/,
  );
  assert.match(inputSchema, /pool: z\s+\.array\(authoringPoolEntrySchema\)/);
  assert.match(inputSchema, /jobs: z\.array\(authoringJobSchema\)/);
  assert.match(inputSchema, /scores: z\.array\(authoringScoreSchema\)/);
  assert.match(inputSchema, /perfectSolution: z\.array\(authoringPerfectSolutionSchema\)/);
  assert.match(inputSchema, /value\.pool\.length === 9 && value\.jobs\.length === 3/);
  assert.match(inputSchema, /value\.pool\.length === 15 && value\.jobs\.length === 5/);
  assert.match(inputSchema, /value\.scores\.length !== value\.pool\.length \* value\.jobs\.length/);
  assert.match(inputSchema, /value\.perfectSolution\.length !== value\.jobs\.length/);
  assert.doesNotMatch(inputSchema, /status|createdAt|updatedAt|reward|wallet|submission/i);
});

test("Daily Crew Builder template list is narrow and detail is admin-only", () => {
  const list = functionSource("listAdminDailyCrewTemplates");
  const detail = functionSource("getAdminDailyCrewTemplate");

  for (const field of [
    "slug",
    "title",
    "isActive",
    "revision",
    "revealPolicy",
    "poolCount",
    "jobCount",
    "scoreCount",
    "instanceCount",
    "mostRecentMissionDate",
    "ready",
    "createdAt",
    "updatedAt",
  ]) {
    assert.match(adminSource, new RegExp(`${field}:`), `${field} is exposed in template summaries`);
  }

  assert.match(list, /getTemplateReadyMap\(db, templateIds\)/);
  assert.match(adminSource, /\.rpc\("validate_daily_crew_template"/);
  assert.doesNotMatch(list, /scores: scores\.map|perfectSolution: perfectSolution\.map/);
  assert.match(detail, /\.from\("daily_crew_mission_template_role_requirements"\)/);
  assert.match(detail, /\.from\("daily_crew_mission_template_character_role_scores"\)/);
  assert.match(detail, /\.from\("daily_crew_mission_template_perfect_solution"\)/);
  assert.match(detail, /scores: scores\.map/);
  assert.match(detail, /perfectSolution: perfectSolution\.map/);
});

test("Daily Crew Builder admin list is narrow and detail is admin-only", () => {
  const list = functionSource("listAdminDailyCrewMissions");
  const detail = functionSource("getAdminDailyCrewMission");

  for (const field of [
    "missionDate",
    "slug",
    "title",
    "status",
    "revealPolicy",
    "revealAt",
    "poolCount",
    "jobCount",
    "scoreCount",
    "submissionCount",
    "ready",
    "createdAt",
    "updatedAt",
  ]) {
    assert.match(adminSource, new RegExp(`${field}:`), `${field} is exposed in admin summaries`);
  }

  assert.match(list, /getMissionReadyMap\(db, missionIds\)/);
  assert.match(adminSource, /\.rpc\("validate_daily_crew_mission"/);
  assert.doesNotMatch(list, /roleScores|perfectSolution|subtypeKey|subtypeLabel|explanation/);
  assert.match(detail, /\.from\("daily_crew_role_requirements"\)/);
  assert.match(detail, /\.from\("daily_crew_character_role_scores"\)/);
  assert.match(detail, /\.from\("daily_crew_perfect_solution"\)/);
  assert.match(detail, /scores: scores\.map/);
  assert.match(detail, /perfectSolution: perfectSolution\.map/);
});

test("Daily Crew Builder public mission and gameplay APIs remain unchanged", () => {
  const publicMapper = publicSource.slice(
    publicSource.indexOf("function toPublicDailyCrewBuilderMission"),
    publicSource.indexOf("function perfectSolutionSynergyRule"),
  );

  assert.match(publicSource, /export const getTodayDailyCrewBuilderMission/);
  assert.match(publicSource, /export const getMyTodayDailyCrewBuilderResult/);
  assert.match(publicSource, /export const submitDailyCrewBuilderPreview/);
  assert.doesNotMatch(publicSource, /admin_save_daily_crew_builder_mission/);
  assert.doesNotMatch(publicSource, /admin_set_daily_crew_builder_mission_status/);
  assert.doesNotMatch(publicSource, /admin_save_daily_crew_builder_template/);
  assert.doesNotMatch(publicSource, /admin_create_daily_crew_builder_mission_from_template/);
  assert.doesNotMatch(publicSource, /admin_save_daily_crew_rotation_plan/);
  assert.doesNotMatch(publicSource, /admin_preview_daily_crew_rotation/);
  assert.doesNotMatch(publicSource, /admin_generate_daily_crew_rotation/);
  assert.doesNotMatch(publicSource, /daily_crew_mission_templates/);
  assert.doesNotMatch(publicSource, /daily_crew_rotation_plans/);
  assert.doesNotMatch(
    publicMapper,
    /roleScores|roleRequirements|perfectSolution|subtypeKey|subtypeLabel/,
  );
});
