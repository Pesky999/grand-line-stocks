/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260715150000_daily_crew_rotation_backend.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const generatedTypesPath = join(process.cwd(), "src", "integrations", "supabase", "types.ts");
const generatedTypes = readFileSync(generatedTypesPath, "utf8");

function stripSqlComments(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const executableSql = stripSqlComments(sql);

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

test("Daily Crew rotation migration is additive and transactional", () => {
  assert.match(sql, /^BEGIN;\s*/);
  assert.match(sql, /\bCOMMIT;\s*NOTIFY pgrst, 'reload schema';\s*$/);

  for (const table of ["daily_crew_rotation_plans", "daily_crew_rotation_plan_slots"]) {
    expectSql(new RegExp(`CREATE TABLE public\\.${table}\\b`, "i"), `${table} table exists`);
    expectSql(
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      `${table} enables RLS`,
    );
    expectSql(
      new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, "i"),
      `${table} revokes browser privileges`,
    );
    expectSql(
      new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`, "i"),
      `${table} grants service-role privileges`,
    );
  }

  rejectExecutableSql(/CREATE POLICY\b/i, "rotation tables add no browser-readable policies");
  rejectExecutableSql(
    /GRANT\s+SELECT\b[\s\S]*\bTO\s+(anon|authenticated)\b/i,
    "no browser SELECT grant",
  );
  rejectExecutableSql(
    /GRANT\s+(INSERT|UPDATE|DELETE)\b[\s\S]*\bTO\s+(anon|authenticated)\b/i,
    "no browser writes",
  );
});

test("rotation plans and slots enforce the 30-slot model without banning repeated templates", () => {
  expectSql(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i, "plans use uuid primary keys");
  expectSql(/name text NOT NULL/i, "plans have names");
  expectSql(/revision integer NOT NULL DEFAULT 1/i, "plans start at revision 1");
  expectSql(
    /name = btrim\(name\) AND char_length\(name\) BETWEEN 1 AND 120/i,
    "plan names are trimmed and bounded",
  );
  expectSql(/CHECK \(revision > 0\)/i, "plan revisions are positive");
  expectSql(
    /EXECUTE FUNCTION public\.touch_updated_at\(\)/i,
    "plans use the shared updated-at trigger",
  );
  expectSql(
    /plan_id uuid NOT NULL REFERENCES public\.daily_crew_rotation_plans\(id\) ON DELETE CASCADE/i,
    "slot rows cascade when a plan is deleted",
  );
  expectSql(
    /template_id uuid NOT NULL REFERENCES public\.daily_crew_mission_templates\(id\) ON DELETE RESTRICT/i,
    "template references cannot silently delete slot assignments",
  );
  expectSql(/PRIMARY KEY \(plan_id, slot_number\)/i, "one template assignment per numbered slot");
  expectSql(/CHECK \(slot_number BETWEEN 1 AND 30\)/i, "slots are bounded to 1 through 30");
  expectSql(
    /CREATE INDEX idx_daily_crew_rotation_plan_slots_template[\s\S]*\(template_id, plan_id\)/i,
    "template-to-plan lookup index exists",
  );
  expectSql(
    /CREATE INDEX idx_daily_crew_rotation_plan_slots_plan_order[\s\S]*\(plan_id, slot_number\)/i,
    "plan slot ordering index exists",
  );
  rejectExecutableSql(
    /UNIQUE\s*\(\s*plan_id\s*,\s*template_id\s*\)/i,
    "repeated templates are intentionally allowed across slots",
  );
});

test("mission source metadata records rotation origin and is safe on plan deletion", () => {
  const clearSource = functionSource("clear_daily_crew_mission_rotation_source_on_delete");

  expectSql(
    /ALTER TABLE public\.daily_crew_missions[\s\S]*ADD COLUMN source_rotation_plan_id uuid/i,
    "source rotation plan id is added",
  );
  expectSql(/ADD COLUMN source_rotation_plan_revision integer/i, "source plan revision is added");
  expectSql(/ADD COLUMN source_rotation_slot integer/i, "source slot is added");
  expectSql(
    /FOREIGN KEY \(source_rotation_plan_id\)[\s\S]*REFERENCES public\.daily_crew_rotation_plans\(id\)/i,
    "source plan references rotation plans",
  );
  expectSql(
    /source_rotation_plan_id IS NULL[\s\S]*source_rotation_plan_revision IS NULL[\s\S]*source_rotation_slot IS NULL/i,
    "source metadata allows all null",
  );
  expectSql(
    /source_rotation_plan_id IS NOT NULL[\s\S]*source_rotation_plan_revision IS NOT NULL[\s\S]*source_rotation_slot IS NOT NULL/i,
    "source metadata requires all fields together",
  );
  expectSql(
    /source_rotation_plan_revision IS NULL[\s\S]*OR source_rotation_plan_revision > 0/i,
    "source plan revisions are positive",
  );
  expectSql(
    /source_rotation_slot IS NULL[\s\S]*OR source_rotation_slot BETWEEN 1 AND 30/i,
    "source slots are bounded",
  );
  expectSql(
    /CREATE INDEX idx_daily_crew_missions_source_rotation_date[\s\S]*\(source_rotation_plan_id, mission_date DESC\)/i,
    "source plan history index exists",
  );
  assert.match(clearSource, /UPDATE public\.daily_crew_missions/);
  assert.match(clearSource, /source_rotation_plan_id = NULL/);
  assert.match(clearSource, /source_rotation_plan_revision = NULL/);
  assert.match(clearSource, /source_rotation_slot = NULL/);
  assert.match(clearSource, /WHERE source_rotation_plan_id = OLD\.id/);
  assert.doesNotMatch(
    clearSource,
    /source_template_id|source_template_revision|status|daily_crew_submissions|reward_paid|user_wallets|wallet_ledger_entries/i,
    "plan deletion cleanup clears only rotation-source metadata",
  );
});

test("validate_daily_crew_rotation_plan requires exactly 30 contiguous ready active template slots", () => {
  const validate = functionSource("validate_daily_crew_rotation_plan");

  assert.match(validate, /RETURNS boolean/);
  assert.match(validate, /LANGUAGE plpgsql/);
  assert.match(validate, /STABLE/);
  assert.match(validate, /SECURITY DEFINER/);
  assert.match(validate, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(validate, /v_plan_exists/);
  assert.match(validate, /count\(\*\)/);
  assert.match(validate, /count\(DISTINCT slot_number\)/);
  assert.match(validate, /min\(slot_number\)/);
  assert.match(validate, /max\(slot_number\)/);
  assert.match(validate, /v_slot_count = 30/);
  assert.match(validate, /v_slot_number_count = 30/);
  assert.match(validate, /v_min_slot_number = 1/);
  assert.match(validate, /v_max_slot_number = 30/);
  assert.match(validate, /templates\.id IS NULL/);
  assert.match(validate, /NOT templates\.is_active/);
  assert.match(validate, /NOT public\.validate_daily_crew_template\(templates\.id\)/);
  assert.match(validate, /v_missing_template_count = 0/);
  assert.match(validate, /v_inactive_template_count = 0/);
  assert.match(validate, /v_unready_template_count = 0/);
});

test("rotation save allows partial plans but rejects malformed or duplicate slots", () => {
  const save = functionSource("admin_save_daily_crew_rotation_plan");

  assert.match(save, /_plan_id uuid/);
  assert.match(save, /_name text/);
  assert.match(save, /_slots jsonb/);
  assert.match(save, /char_length\(v_name\) NOT BETWEEN 1 AND 120/);
  assert.match(save, /jsonb_typeof\(_slots\) <> 'array'/);
  assert.match(save, /v_slot_count > 30/);
  assert.match(save, /jsonb_array_elements\(_slots\)/);
  assert.match(save, /jsonb_typeof\(slot\.value\) <> 'object'/);
  assert.match(save, /NOT \(slot\.value \? 'slotNumber'\)/);
  assert.match(save, /NOT \(slot\.value \? 'templateId'\)/);
  assert.match(save, /key\.value NOT IN \('slotNumber', 'templateId'\)/);
  assert.match(save, /\(slot\.value->>'slotNumber'\)::integer/);
  assert.match(save, /\(slot\.value->>'templateId'\)::uuid/);
  assert.match(save, /slot_number NOT BETWEEN 1 AND 30/);
  assert.match(save, /HAVING count\(\*\) > 1/);
  assert.match(save, /LEFT JOIN public\.daily_crew_mission_templates/);
  assert.match(save, /templates\.id IS NULL/);
  assert.match(save, /FOR UPDATE/);
  assert.match(save, /revision = revision \+ 1/);
  assert.match(save, /DELETE FROM public\.daily_crew_rotation_plan_slots/);
  assert.match(save, /INSERT INTO public\.daily_crew_rotation_plan_slots/);
  assert.match(
    save,
    /count\(DISTINCT template_id\)/,
    "repeated templates are counted, not rejected",
  );
  assert.match(save, /public\.validate_daily_crew_rotation_plan\(v_plan_id\)/);
  assert.match(save, /'slotCount'/);
  assert.match(save, /'uniqueTemplateCount'/);
  assert.match(save, /'ready'/);
  assert.doesNotMatch(save, /EXCEPTION\s+WHEN/i, "save relies on transaction rollback");
  assert.doesNotMatch(save, /(INSERT INTO|UPDATE|DELETE FROM) public\.daily_crew_missions\b/i);
  assert.doesNotMatch(save, /daily_crew_submissions|reward_paid|user_wallets|transactions/i);
});

test("rotation preview is read-only and reports all 30 UTC dates and conflicts", () => {
  const preview = functionSource("admin_preview_daily_crew_rotation");

  assert.match(preview, /_target_status public\.daily_crew_mission_status/);
  assert.match(preview, /\(pg_catalog\.now\(\) AT TIME ZONE 'UTC'\)::date/);
  assert.match(preview, /_start_date IS NULL OR _start_date < v_today/);
  assert.match(preview, /_target_status IS NULL OR _target_status NOT IN/);
  assert.match(preview, /'draft'::public\.daily_crew_mission_status/);
  assert.match(preview, /'scheduled'::public\.daily_crew_mission_status/);
  assert.doesNotMatch(preview, /'published'::public\.daily_crew_mission_status/);
  assert.doesNotMatch(preview, /'archived'::public\.daily_crew_mission_status/);
  assert.match(preview, /FOR v_slot_number IN 1\.\.30 LOOP/);
  assert.match(preview, /v_mission_date := _start_date \+ \(v_slot_number - 1\)/);
  assert.match(preview, /'endDate', _start_date \+ 29/);
  assert.match(preview, /'incomplete_plan'/);
  assert.match(
    preview,
    /IF v_template_id IS NULL THEN[\s\S]*v_template_ready := false;[\s\S]*'missing_slot'/,
    "missing slots return a deliberate false templateReady value",
  );
  assert.match(preview, /'missing_slot'/);
  assert.match(preview, /'inactive_template'/);
  assert.match(preview, /'unready_template'/);
  assert.match(preview, /'date_conflict'/);
  assert.match(preview, /'slug_conflict'/);
  assert.match(preview, /'generated_slug_too_long'/);
  assert.match(preview, /mission_date = v_mission_date/);
  assert.match(preview, /slug = v_generated_slug/);
  assert.match(preview, /'readyToGenerate', v_plan_ready AND v_conflict_count = 0/);
  assert.match(preview, /'slots', v_slots/);
  assert.doesNotMatch(preview, /\b(INSERT INTO|UPDATE|DELETE FROM)\b/i);
});

test("rotation generation locks, preflights, instantiates, and optionally schedules atomically", () => {
  const generate = functionSource("admin_generate_daily_crew_rotation");
  const instantiateCall = generate.indexOf(
    "public.admin_create_daily_crew_builder_mission_from_template",
  );
  const preflightDateConflict = generate.indexOf("WHERE mission_date = v_mission_date");
  const preflightSlugConflict = generate.indexOf("WHERE slug = v_generated_slug");

  assert.match(generate, /_target_status public\.daily_crew_mission_status/);
  assert.match(generate, /\(pg_catalog\.now\(\) AT TIME ZONE 'UTC'\)::date/);
  assert.match(generate, /_target_status IS NULL OR _target_status NOT IN/);
  assert.match(generate, /'draft'::public\.daily_crew_mission_status/);
  assert.match(generate, /'scheduled'::public\.daily_crew_mission_status/);
  assert.doesNotMatch(generate, /'published'::public\.daily_crew_mission_status/);
  assert.doesNotMatch(generate, /'archived'::public\.daily_crew_mission_status/);
  assert.match(generate, /FROM public\.daily_crew_rotation_plans[\s\S]*FOR UPDATE/);
  assert.match(generate, /SELECT DISTINCT template_id[\s\S]*ORDER BY template_id/);
  assert.match(generate, /FROM public\.daily_crew_mission_templates[\s\S]*FOR UPDATE/);
  assert.match(generate, /NOT v_template\.is_active/);
  assert.match(generate, /NOT public\.validate_daily_crew_template\(v_template\.id\)/);
  assert.match(generate, /NOT public\.validate_daily_crew_rotation_plan\(v_plan\.id\)/);
  assert.ok(
    preflightDateConflict > -1 && preflightDateConflict < instantiateCall,
    "date conflicts are checked before the first mission is created",
  );
  assert.ok(
    preflightSlugConflict > -1 && preflightSlugConflict < instantiateCall,
    "slug conflicts are checked before the first mission is created",
  );
  assert.match(generate, /char_length\(v_generated_slug\) > 80/);
  assert.match(generate, /ERRCODE = '23505'/);
  assert.match(generate, /public\.admin_create_daily_crew_builder_mission_from_template/);
  assert.match(generate, /source_rotation_plan_id = v_plan\.id/);
  assert.match(generate, /source_rotation_plan_revision = v_plan\.revision/);
  assert.match(generate, /source_rotation_slot = v_slot\.slot_number/);
  assert.match(generate, /GET DIAGNOSTICS v_updated_count = ROW_COUNT/);
  assert.match(generate, /IF v_updated_count <> 1 THEN/);
  assert.match(generate, /rotation source metadata update failed/);
  assert.match(generate, /public\.admin_set_daily_crew_builder_mission_status/);
  assert.match(generate, /'scheduled'::public\.daily_crew_mission_status/);
  assert.match(generate, /'createdCount', v_created_count/);
  assert.match(generate, /v_created_count := v_created_count \+ 1/);
  assert.match(generate, /'missions', v_missions/);
  assert.doesNotMatch(generate, /EXCEPTION\s+WHEN/i, "generation does not swallow failures");
  assert.doesNotMatch(generate, /archive|delete from public\.daily_crew_missions/i);
});

test("rotation RPCs are executable only by service role", () => {
  for (const signature of [
    /public\.clear_daily_crew_mission_rotation_source_on_delete\(\)/,
    /public\.validate_daily_crew_rotation_plan\(uuid\)/,
    /public\.admin_save_daily_crew_rotation_plan\(uuid, text, jsonb\)/,
    /public\.admin_preview_daily_crew_rotation\([\s\S]*uuid,[\s\S]*date,[\s\S]*public\.daily_crew_mission_status[\s\S]*\)/,
    /public\.admin_generate_daily_crew_rotation\([\s\S]*uuid,[\s\S]*date,[\s\S]*public\.daily_crew_mission_status[\s\S]*\)/,
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

test("rotation backend has no gameplay, payout, or market scope creep", () => {
  rejectExecutableSql(/CREATE\s+TRIGGER[\s\S]*cron/i, "no cron or automatic scheduler is added");
  rejectExecutableSql(/INSERT INTO public\.daily_crew_submissions/i, "no submissions are created");
  rejectExecutableSql(
    /INSERT INTO public\.daily_crew_submission_roles/i,
    "no submission roles are created",
  );
  rejectExecutableSql(
    /award_daily_crew_builder_reward|record_daily_crew_builder_submission/i,
    "payout and submission RPCs are untouched",
  );
  rejectExecutableSql(
    /public\.user_wallets|wallet_ledger_entries|public\.transactions/i,
    "no wallet, ledger, or trade table is touched",
  );
  rejectExecutableSql(
    /public\.characters[\s\S]*current_price|price_history|user_holdings|market_events/i,
    "no market state is touched",
  );
  rejectExecutableSql(/grand_line_guess/i, "Grand Line Guess is untouched");
});

test("generated Supabase types include only the rotation backend contract additions", () => {
  assert.match(generatedTypes, /daily_crew_rotation_plans: \{/);
  assert.match(generatedTypes, /daily_crew_rotation_plan_slots: \{/);
  assert.match(generatedTypes, /Row: \{[\s\S]*name: string[\s\S]*revision: number/);
  assert.match(generatedTypes, /Insert: \{[\s\S]*name: string[\s\S]*revision\?: number/);
  assert.match(generatedTypes, /Update: \{[\s\S]*name\?: string[\s\S]*revision\?: number/);
  assert.match(
    generatedTypes,
    /plan_id: string[\s\S]*slot_number: number[\s\S]*template_id: string/,
  );
  assert.match(
    generatedTypes,
    /foreignKeyName: "daily_crew_rotation_plan_slots_plan_id_fkey"[\s\S]*referencedRelation: "daily_crew_rotation_plans"/,
  );
  assert.match(
    generatedTypes,
    /foreignKeyName: "daily_crew_rotation_plan_slots_template_id_fkey"[\s\S]*referencedRelation: "daily_crew_mission_templates"/,
  );
  assert.match(generatedTypes, /source_rotation_plan_id: string \| null/);
  assert.match(generatedTypes, /source_rotation_plan_revision: number \| null/);
  assert.match(generatedTypes, /source_rotation_slot: number \| null/);
  assert.match(
    generatedTypes,
    /foreignKeyName: "daily_crew_missions_source_rotation_plan_fkey"[\s\S]*referencedRelation: "daily_crew_rotation_plans"/,
  );
  assert.match(generatedTypes, /admin_save_daily_crew_rotation_plan: \{/);
  assert.match(generatedTypes, /Args: \{ _name: string; _plan_id: string \| null; _slots: Json \}/);
  assert.match(generatedTypes, /admin_preview_daily_crew_rotation: \{/);
  assert.match(generatedTypes, /admin_generate_daily_crew_rotation: \{/);
  assert.match(
    generatedTypes,
    /_target_status: Database\["public"\]\["Enums"\]\["daily_crew_mission_status"\]/,
  );
  assert.match(generatedTypes, /validate_daily_crew_rotation_plan: \{/);
  assert.match(generatedTypes, /Args: \{ _plan_id: string \}[\s\S]*Returns: boolean/);
});
