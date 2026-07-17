/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260715130000_daily_crew_template_library_backend.sql",
);
const bulkMigrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260716120000_daily_crew_bulk_template_import.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const bulkSql = readFileSync(bulkMigrationPath, "utf8");

function stripSqlComments(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const executableSql = stripSqlComments(sql);
const executableBulkSql = stripSqlComments(bulkSql);

function expectSql(pattern: RegExp, message: string): void {
  assert.match(sql, pattern, message);
}

function rejectExecutableSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(executableSql, pattern, message);
}

function functionSource(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} function exists`);
  const end = sql.indexOf("$function$;", start);
  assert.notEqual(end, -1, `${name} function closes`);
  return sql.slice(start, end + "$function$;".length);
}

function bulkFunctionSource(name: string): string {
  const start = bulkSql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} function exists`);
  const end = bulkSql.indexOf("$function$;", start);
  assert.notEqual(end, -1, `${name} function closes`);
  return bulkSql.slice(start, end + "$function$;".length);
}

test("Daily Crew Builder template migration is additive and transactional", () => {
  assert.match(sql, /^BEGIN;\s*/);
  assert.match(sql, /\bCOMMIT;\s*NOTIFY pgrst, 'reload schema';\s*$/);

  for (const table of [
    "daily_crew_mission_templates",
    "daily_crew_mission_template_pool",
    "daily_crew_mission_template_role_requirements",
    "daily_crew_mission_template_character_role_scores",
    "daily_crew_mission_template_perfect_solution",
  ]) {
    expectSql(new RegExp(`CREATE TABLE public\\.${table}\\b`, "i"), `${table} table exists`);
    expectSql(
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      `${table} enables RLS`,
    );
    expectSql(
      new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, "i"),
      `${table} revokes browser table privileges`,
    );
    expectSql(
      new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`, "i"),
      `${table} grants service-role table privileges`,
    );
  }

  rejectExecutableSql(
    /CREATE POLICY\b/i,
    "template migration creates no browser-readable policies",
  );
  rejectExecutableSql(
    /GRANT\s+SELECT\b[\s\S]*\bTO\s+(anon|authenticated)\b/i,
    "no browser SELECT grant",
  );
  rejectExecutableSql(
    /GRANT\s+(INSERT|UPDATE|DELETE)\b[\s\S]*\bTO\s+(anon|authenticated)\b/i,
    "no browser writes",
  );
});

test("template tables mirror mission structure and protect hidden authoring data", () => {
  expectSql(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i, "templates use uuid primary keys");
  expectSql(/slug text NOT NULL UNIQUE/i, "template slugs are unique");
  expectSql(/char_length\(slug\) <= 69/i, "template slug reserves dated suffix length");
  expectSql(/slug ~ '\^\[a-z0-9\]\(\?:\[a-z0-9-\]\*\[a-z0-9\]\)\?\$'/i, "slug is lowercase safe");
  expectSql(
    /title = btrim\(title\) AND char_length\(title\) BETWEEN 1 AND 120/i,
    "title is trimmed",
  );
  expectSql(
    /brief = btrim\(brief\) AND char_length\(brief\) BETWEEN 1 AND 2000/i,
    "brief is trimmed",
  );
  expectSql(/revision integer NOT NULL DEFAULT 1/i, "templates start at revision 1");
  expectSql(/CHECK \(revision > 0\)/i, "template revisions are positive");
  expectSql(
    /EXECUTE FUNCTION public\.touch_updated_at\(\)/i,
    "templates use shared updated_at trigger",
  );

  expectSql(
    /template_id uuid NOT NULL REFERENCES public\.daily_crew_mission_templates\(id\) ON DELETE CASCADE/i,
    "children cascade with templates",
  );
  expectSql(
    /character_id uuid NOT NULL REFERENCES public\.characters\(id\) ON DELETE RESTRICT/i,
    "template pool references market characters",
  );
  expectSql(/CHECK \(display_order BETWEEN 1 AND 15\)/i, "template pool display order supports 15");
  expectSql(
    /UNIQUE \(template_id, character_id\)/i,
    "template pool and perfect crew prevent duplicate characters",
  );
  expectSql(
    /UNIQUE \(template_id, display_order\)/i,
    "template pool/jobs prevent duplicate display order",
  );
  expectSql(
    /PRIMARY KEY \(template_id, role\)/i,
    "template jobs and perfect crew are keyed by role",
  );
  expectSql(
    /CHECK \(max_points BETWEEN 1 AND 30\)/i,
    "template jobs support simplified max points",
  );
  expectSql(
    /CHECK \(score BETWEEN 0 AND 30\)/i,
    "template hidden scores support simplified max points",
  );
  expectSql(/PRIMARY KEY \(template_id, character_id, role\)/i, "hidden score matrix is unique");
  expectSql(
    /REFERENCES public\.daily_crew_mission_template_pool\(template_id, character_id\)/i,
    "scores and solutions reference template pool",
  );
  expectSql(
    /REFERENCES public\.daily_crew_mission_template_role_requirements\(template_id, role\)/i,
    "scores and solutions reference template jobs",
  );
});

test("mission source tracking stores source template and revision without changing instances", () => {
  const clearSource = functionSource("clear_daily_crew_mission_template_source_on_delete");

  expectSql(
    /ALTER TABLE public\.daily_crew_missions[\s\S]*ADD COLUMN source_template_id uuid/i,
    "source template id is added",
  );
  expectSql(/ADD COLUMN source_template_revision integer/i, "source template revision is added");
  expectSql(
    /REFERENCES public\.daily_crew_mission_templates\(id\)[\s\S]*ON DELETE SET NULL/i,
    "source template uses set-null FK",
  );
  expectSql(
    /source_template_id IS NULL AND source_template_revision IS NULL/i,
    "source pair allows both null",
  );
  expectSql(
    /source_template_id IS NOT NULL AND source_template_revision IS NOT NULL/i,
    "source pair requires both present",
  );
  expectSql(
    /source_template_revision IS NULL OR source_template_revision > 0/i,
    "source revisions are positive",
  );
  expectSql(
    /CREATE INDEX idx_daily_crew_missions_source_template_date[\s\S]*\(source_template_id, mission_date DESC\)/i,
    "instance history index exists",
  );
  expectSql(
    /CREATE OR REPLACE FUNCTION public\.clear_daily_crew_mission_template_source_on_delete\(\)/i,
    "template delete keeps source pair valid",
  );
  expectSql(
    /CREATE TRIGGER daily_crew_template_source_delete[\s\S]*BEFORE DELETE ON public\.daily_crew_mission_templates[\s\S]*EXECUTE FUNCTION public\.clear_daily_crew_mission_template_source_on_delete\(\)/i,
    "template source cleanup runs before FK set-null handling",
  );
  assert.match(clearSource, /UPDATE public\.daily_crew_missions/);
  assert.match(clearSource, /source_template_id = NULL/);
  assert.match(clearSource, /source_template_revision = NULL/);
  assert.match(clearSource, /WHERE source_template_id = OLD\.id/);
  assert.doesNotMatch(
    clearSource,
    /daily_crew_mission_pool|daily_crew_role_requirements|daily_crew_character_role_scores|daily_crew_perfect_solution|daily_crew_submissions|daily_crew_submission_roles|reward_paid/i,
    "template deletion cleanup does not alter mission snapshots, submissions, or rewards",
  );
});

test("validate_daily_crew_template mirrors the current mission readiness contract", () => {
  const validate = functionSource("validate_daily_crew_template");

  assert.match(validate, /RETURNS boolean/);
  assert.match(validate, /LANGUAGE plpgsql/);
  assert.match(validate, /STABLE/);
  assert.match(validate, /SECURITY DEFINER/);
  assert.match(validate, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(validate, /v_pool_count = 9\s+AND v_requirement_count = 3/);
  assert.match(validate, /v_pool_count = 15\s+AND v_requirement_count = 5/);
  assert.doesNotMatch(validate, /v_pool_count IN \(9, 15\)[\s\S]*v_requirement_count IN \(3, 5\)/);
  assert.match(validate, /v_pool_straw_hats <= 5/);
  assert.match(validate, /v_pool_display_order_count = v_pool_count/);
  assert.match(validate, /v_pool_min_display_order = 1/);
  assert.match(validate, /v_pool_max_display_order = v_pool_count/);
  assert.match(validate, /v_requirement_role_count = v_requirement_count/);
  assert.match(validate, /v_requirement_display_order_count = v_requirement_count/);
  assert.match(validate, /v_requirement_min_display_order = 1/);
  assert.match(validate, /v_requirement_max_display_order = v_requirement_count/);
  assert.match(validate, /v_requirement_max_points_total = 90/);
  assert.match(validate, /v_score_count = v_pool_count \* v_requirement_count/);
  assert.match(validate, /v_solution_count = v_requirement_count/);
  assert.match(validate, /v_solution_role_count = v_requirement_count/);
  assert.match(validate, /v_solution_character_count = v_requirement_count/);
  assert.match(validate, /v_solution_straw_hats <= 3/);
  assert.match(validate, /v_solution_score_total = 90/);
  assert.match(validate, /v_solution_nonmax_count = 0/);
});

test("validate_daily_crew_template rejects total-90 perfect crews when a selected job is not maxed", () => {
  const validate = functionSource("validate_daily_crew_template");

  assert.match(validate, /v_solution_nonmax_count integer/);
  assert.match(
    validate,
    /SELECT count\(\*\) FILTER \([\s\S]*INTO v_solution_nonmax_count[\s\S]*FROM public\.daily_crew_mission_template_perfect_solution AS s/i,
    "validator counts non-max perfect rows separately from total score",
  );
  assert.match(
    validate,
    /LEFT JOIN public\.daily_crew_mission_template_role_requirements AS requirements[\s\S]*requirements\.template_id = s\.template_id[\s\S]*requirements\.role = s\.role/i,
    "validator joins perfect solutions to template role requirements by template and role",
  );
  assert.match(
    validate,
    /LEFT JOIN public\.daily_crew_mission_template_character_role_scores AS scores[\s\S]*scores\.template_id = s\.template_id[\s\S]*scores\.character_id = s\.character_id[\s\S]*scores\.role = s\.role/i,
    "validator joins perfect solutions to scores by template, character, and role",
  );
  assert.match(
    validate,
    /requirements\.template_id IS NULL[\s\S]*OR scores\.template_id IS NULL[\s\S]*OR scores\.score IS DISTINCT FROM requirements\.max_points/i,
    "missing requirement rows, missing score rows, and non-max selected scores are invalid",
  );
  assert.match(
    validate,
    /v_solution_score_total = 90[\s\S]*AND v_solution_nonmax_count = 0/i,
    "total score 90 alone is insufficient; every selected job must equal its configured max points",
  );
});

test("template save RPC is atomic, revises templates, and never updates mission instances", () => {
  const save = functionSource("admin_save_daily_crew_builder_template");

  assert.match(save, /SECURITY DEFINER/);
  assert.match(save, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(save, /_template_id uuid/);
  assert.match(save, /_is_active boolean/);
  assert.match(save, /FOR UPDATE/);
  assert.match(save, /revision = revision \+ 1/);
  assert.match(save, /INSERT INTO public\.daily_crew_mission_templates/);
  assert.match(save, /revision\s*\)\s*VALUES[\s\S]*1/i, "new templates start at revision 1");
  assert.match(save, /is_active = _is_active/);
  assert.match(save, /DELETE FROM public\.daily_crew_mission_template_perfect_solution/);
  assert.match(save, /DELETE FROM public\.daily_crew_mission_template_character_role_scores/);
  assert.match(save, /DELETE FROM public\.daily_crew_mission_template_role_requirements/);
  assert.match(save, /DELETE FROM public\.daily_crew_mission_template_pool/);
  assert.match(save, /public\.validate_daily_crew_template\(v_template_id\)/);
  assert.match(save, /RAISE EXCEPTION 'Daily Crew Builder template is not ready to save'/);
  assert.match(
    save,
    /revision = revision \+ 1[\s\S]*public\.validate_daily_crew_template\(v_template_id\)[\s\S]*RAISE EXCEPTION 'Daily Crew Builder template is not ready to save'/,
    "failed validation raises inside the atomic RPC after revision update so the update rolls back",
  );
  assert.match(save, /'templateId'/);
  assert.match(save, /'instanceCount'/);
  assert.match(save, /'ready'/);
  assert.doesNotMatch(save, /(INSERT INTO|UPDATE|DELETE FROM) public\.daily_crew_missions\b/i);
  assert.doesNotMatch(save, /(INSERT INTO|UPDATE|DELETE FROM) public\.daily_crew_mission_pool\b/i);
  assert.doesNotMatch(
    save,
    /(INSERT INTO|UPDATE|DELETE FROM) public\.daily_crew_role_requirements\b/i,
  );
  assert.doesNotMatch(
    save,
    /(INSERT INTO|UPDATE|DELETE FROM) public\.daily_crew_character_role_scores\b/i,
  );
  assert.doesNotMatch(
    save,
    /(INSERT INTO|UPDATE|DELETE FROM) public\.daily_crew_perfect_solution\b/i,
  );
  assert.doesNotMatch(
    save,
    /daily_crew_submissions|reward_paid|user_wallets|wallet_ledger_entries|transactions/i,
  );
});

test("template instantiation RPC creates a fresh draft mission snapshot only", () => {
  const instantiate = functionSource("admin_create_daily_crew_builder_mission_from_template");

  assert.match(instantiate, /_template_id uuid/);
  assert.match(instantiate, /_mission_date date/);
  assert.match(instantiate, /SECURITY DEFINER/);
  assert.match(instantiate, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(instantiate, /\(pg_catalog\.now\(\) AT TIME ZONE 'UTC'\)::date/);
  assert.match(instantiate, /FOR UPDATE/);
  assert.match(
    instantiate,
    /SELECT \*[\s\S]*FROM public\.daily_crew_mission_templates[\s\S]*WHERE id = _template_id[\s\S]*FOR UPDATE/,
    "instantiation locks one template row before reading child rows",
  );
  assert.match(instantiate, /v_template\.is_active/);
  assert.match(instantiate, /public\.validate_daily_crew_template\(v_template\.id\)/);
  assert.match(instantiate, /ERRCODE = '23505'/);
  assert.match(instantiate, /v_slug := v_template\.slug \|\| '-' \|\| _mission_date::text/);
  assert.match(instantiate, /char_length\(v_slug\) > 80/, "generated dated slug is checked");
  assert.match(instantiate, /INSERT INTO public\.daily_crew_missions/);
  assert.match(instantiate, /'draft'::public\.daily_crew_mission_status/);
  assert.match(instantiate, /NULL,/i, "reveal_at is inserted as null");
  assert.match(instantiate, /source_template_id/);
  assert.match(instantiate, /source_template_revision/);
  assert.match(instantiate, /v_template\.id/);
  assert.match(instantiate, /v_template\.revision/);
  assert.match(instantiate, /INSERT INTO public\.daily_crew_mission_pool/);
  assert.match(instantiate, /INSERT INTO public\.daily_crew_role_requirements/);
  assert.match(instantiate, /INSERT INTO public\.daily_crew_character_role_scores/);
  assert.match(instantiate, /INSERT INTO public\.daily_crew_perfect_solution/);
  assert.match(
    instantiate,
    /FROM public\.daily_crew_mission_template_pool[\s\S]*WHERE template_id = v_template\.id/,
    "pool rows are copied from the locked template",
  );
  assert.match(
    instantiate,
    /FROM public\.daily_crew_mission_template_role_requirements[\s\S]*WHERE template_id = v_template\.id/,
    "job rows are copied from the locked template",
  );
  assert.match(
    instantiate,
    /FROM public\.daily_crew_mission_template_character_role_scores[\s\S]*WHERE template_id = v_template\.id/,
    "score rows are copied from the locked template",
  );
  assert.match(
    instantiate,
    /FROM public\.daily_crew_mission_template_perfect_solution[\s\S]*WHERE template_id = v_template\.id/,
    "perfect-solution rows are copied from the locked template",
  );
  assert.match(instantiate, /public\.validate_daily_crew_mission\(v_mission_id\)/);
  assert.match(instantiate, /'submissionCount', 0/);
  assert.match(
    instantiate,
    /mission_date = _mission_date[\s\S]*ERRCODE = '23505'/,
    "duplicate mission dates raise explicit conflicts",
  );
  assert.match(
    instantiate,
    /slug = v_slug[\s\S]*ERRCODE = '23505'/,
    "duplicate generated slugs raise explicit conflicts",
  );
  assert.doesNotMatch(
    instantiate,
    /admin_set_daily_crew_builder_mission_status|scheduled|published/,
  );
  assert.doesNotMatch(
    instantiate,
    /daily_crew_submissions|reward_paid|user_wallets|wallet_ledger_entries|transactions/i,
  );
});

test("template RPCs are executable only by service role", () => {
  for (const signature of [
    /public\.validate_daily_crew_template\(uuid\)/,
    /public\.admin_save_daily_crew_builder_template\([\s\S]*uuid,[\s\S]*text,[\s\S]*text,[\s\S]*text,[\s\S]*text\[\],[\s\S]*public\.daily_crew_reveal_policy,[\s\S]*boolean,[\s\S]*jsonb,[\s\S]*jsonb,[\s\S]*jsonb,[\s\S]*jsonb[\s\S]*\)/,
    /public\.admin_create_daily_crew_builder_mission_from_template\([\s\S]*uuid,[\s\S]*date[\s\S]*\)/,
  ]) {
    expectSql(
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${signature.source}[\\s\\S]*FROM PUBLIC, anon, authenticated`,
        "i",
      ),
      "browser execute is revoked",
    );
    expectSql(
      new RegExp(`GRANT EXECUTE ON FUNCTION ${signature.source}[\\s\\S]*TO service_role`, "i"),
      "service role execute is granted",
    );
  }
});

test("bulk template import migration is additive, service-role-only, and transactional", () => {
  const bulkImport = bulkFunctionSource("admin_bulk_import_daily_crew_builder_templates");

  assert.match(bulkSql, /^BEGIN;\s*/);
  assert.match(bulkSql, /\bCOMMIT;\s*NOTIFY pgrst, 'reload schema';\s*$/);
  assert.match(bulkImport, /RETURNS jsonb/);
  assert.match(bulkImport, /LANGUAGE plpgsql/);
  assert.match(bulkImport, /SECURITY DEFINER/);
  assert.match(bulkImport, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(bulkImport, /jsonb_typeof\(_templates\) <> 'array'/);
  assert.match(bulkImport, /v_template_count < 1 OR v_template_count > 50/);
  assert.match(bulkImport, /jsonb_typeof\(entries\.value\) <> 'object'/);
  assert.match(bulkImport, /btrim\(entries\.value->>'slug'\) = ''/);
  assert.match(
    bulkImport,
    /\?\| ARRAY\[[\s\S]*'templateId'[\s\S]*'missionDate'[\s\S]*'revealAt'[\s\S]*'status'[\s\S]*'rotationPlanId'/,
  );
  assert.match(bulkImport, /GROUP BY normalized\.slug[\s\S]*HAVING count\(\*\) > 1/);
  assert.match(
    bulkImport,
    /JOIN public\.daily_crew_mission_templates AS existing[\s\S]*ON lower\(btrim\(existing\.slug\)\) = normalized\.slug/,
  );
  assert.match(bulkImport, /USING ERRCODE = '23505'/);
  const creationLoopIndex = bulkImport.indexOf("FOR v_item, v_item_index IN");
  assert.ok(creationLoopIndex > 0, "bulk import creation loop should be present");
  for (const preflight of [
    "jsonb_typeof(_templates) <> 'array'",
    "v_template_count < 1 OR v_template_count > 50",
    "jsonb_typeof(entries.value) <> 'object'",
    "btrim(entries.value->>'slug') = ''",
    "HAVING count(*) > 1",
    "JOIN public.daily_crew_mission_templates AS existing",
  ]) {
    const preflightIndex = bulkImport.indexOf(preflight);
    assert.ok(
      preflightIndex > -1 && preflightIndex < creationLoopIndex,
      `${preflight} should be checked before the creation loop`,
    );
  }
  assert.match(
    bulkImport,
    /FROM jsonb_array_elements\(_templates\) WITH ORDINALITY[\s\S]*ORDER BY entries\.ordinality/,
    "bulk import iterates in input order",
  );
  assert.match(
    bulkImport,
    /public\.admin_save_daily_crew_builder_template\([\s\S]*_template_id := NULL[\s\S]*_is_active := TRUE/s,
    "bulk import delegates creation to the existing single-template RPC",
  );
  assert.match(bulkImport, /v_error_message = MESSAGE_TEXT/);
  assert.match(bulkImport, /v_error_state = RETURNED_SQLSTATE/);
  assert.match(bulkImport, /failed at item % \(%\): %/);
  assert.match(bulkImport, /v_results := v_results \|\| jsonb_build_array\(v_result\)/);
  assert.match(bulkImport, /\(v_result->>'isActive'\)::boolean IS DISTINCT FROM TRUE/);
  assert.match(bulkImport, /\(v_result->>'ready'\)::boolean IS DISTINCT FROM TRUE/);
  assert.match(bulkImport, /\(v_result->>'revision'\)::integer <> 1/);
  assert.match(bulkImport, /\(v_result->>'instanceCount'\)::integer <> 0/);
  assert.match(bulkImport, /jsonb_array_length\(v_results\) <> v_template_count/);
  assert.match(bulkImport, /'importedCount', v_template_count/);
  assert.match(bulkImport, /'templates', v_results/);
  assert.match(
    bulkSql,
    /REVOKE EXECUTE ON FUNCTION public\.admin_bulk_import_daily_crew_builder_templates\(jsonb\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    bulkSql,
    /GRANT EXECUTE ON FUNCTION public\.admin_bulk_import_daily_crew_builder_templates\(jsonb\)[\s\S]*TO service_role/i,
  );
  assert.doesNotMatch(bulkImport, /INSERT INTO public\.daily_crew_missions\b/i);
  assert.doesNotMatch(bulkImport, /daily_crew_rotation|admin_generate_daily_crew_rotation/i);
  assert.doesNotMatch(
    bulkImport,
    /UPDATE public\.daily_crew_mission_templates|UPSERT|ON CONFLICT/i,
  );
  assert.doesNotMatch(
    executableBulkSql,
    /daily_crew_submissions|reward_paid|user_wallets|wallet_ledger_entries|transactions|grand_line_guess/i,
  );
});

test("template library migration has no gameplay or financial scope creep", () => {
  rejectExecutableSql(/CREATE\s+TRIGGER[\s\S]*cron/i, "no cron or scheduler is added");
  rejectExecutableSql(/INSERT INTO public\.daily_crew_submissions/i, "no submissions are created");
  rejectExecutableSql(
    /INSERT INTO public\.daily_crew_submission_roles/i,
    "no submission roles are created",
  );
  rejectExecutableSql(
    /award_daily_crew_builder_reward|record_daily_crew_builder_submission/i,
    "no payout or submission RPC is changed",
  );
  rejectExecutableSql(
    /public\.user_wallets|wallet_ledger_entries|public\.transactions/i,
    "no wallet or ledger table is touched",
  );
  rejectExecutableSql(
    /public\.characters[\s\S]*current_price|price_history|user_holdings|market_events/i,
    "no market state is touched",
  );
  rejectExecutableSql(/grand_line_guess/i, "Grand Line Guess is untouched");
});
