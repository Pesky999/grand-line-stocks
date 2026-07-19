import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

const migration = read("supabase/migrations/20260719040000_public_identity_moderation.sql");
const typesSource = read("src/integrations/supabase/types.ts");

test("public identity moderation migration creates private moderation tables", () => {
  for (const table of [
    "identity_moderation_terms",
    "identity_moderation_flags",
    "identity_moderation_actions",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`),
    );
    assert.match(migration, new RegExp(`GRANT ALL ON public\\.${table} TO service_role`));
    assert.match(typesSource, new RegExp(`${table}: \\{`));
  }

  assert.match(migration, /severity integer NOT NULL CHECK \(severity BETWEEN 1 AND 4\)/);
  assert.match(typesSource, /severity: number/);
});

test("moderation policy supports expected categories and match modes without exposing a public list RPC", () => {
  for (const category of [
    "reserved",
    "contact_info",
    "threat",
    "hate_group",
    "common_profanity",
    "harassment",
    "privacy_abuse",
    "racial_ethnic_slur",
    "religious_slur",
    "nationality_slur",
    "sex_gender_slur",
    "sexual_orientation_slur",
    "disability_slur",
    "sexual_profanity",
    "allow",
  ]) {
    assert.match(migration, new RegExp(`'${category}'`), `${category} should be seeded`);
  }

  for (const matchMode of ["exact", "word", "substring", "compact_substring"]) {
    assert.match(migration, new RegExp(`'${matchMode}'`), `${matchMode} match mode should exist`);
  }

  assert.doesNotMatch(migration, /slur-racial|explicit-sexual/);
  assert.match(migration, /U&'\\03B1\\0430\\03BF\\043E\\0441\\0440\\0435\\0445\\0443\\0456'/);
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.list_identity_moderation_terms/,
  );
  assert.doesNotMatch(typesSource, /list_identity_moderation_terms:/);
});

test("database normalization mirrors browser-side Unicode and contact checks", () => {
  const normalizeFunction = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.identity_moderation_normalize",
    "CREATE OR REPLACE FUNCTION public.identity_moderation_words",
  );
  const evaluateFunction = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.evaluate_public_identity",
    "CREATE OR REPLACE FUNCTION public.identity_moderation_next_username",
  );

  assert.match(normalizeFunction, /normalize\(coalesce\(_value, ''\), NFKC\)/);
  assert.match(
    normalizeFunction,
    /U&'\\03B1\\0430\\03BF\\043E\\0441\\0440\\0435\\0445\\0443\\0456'/,
  );
  assert.match(
    normalizeFunction,
    /U&'\\200B\\200C\\200D\\200E\\200F\\202A\\202B\\202C\\202D\\202E\\FEFF'/,
  );
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.identity_moderation_clean_display/);
  assert.match(evaluateFunction, /v_contact_value text := normalize\(v_value, NFKC\)/);
  assert.match(
    evaluateFunction,
    /v_contact_value ~\* '\(\^\|\[\^\[:alnum:\]_\]\)\(https\?:\/\/\|www\\\.\)'/,
  );
  assert.match(
    evaluateFunction,
    /v_display_value text := public\.identity_moderation_clean_display\(v_value\)/,
  );
  assert.match(evaluateFunction, /translate\(v_display_value, chr\(8217\), ''''\)/);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.identity_moderation_clean_display\(text\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.identity_moderation_clean_display\(text\) TO service_role/,
  );
});

test("profile writes are moved behind triggers and trusted server paths", () => {
  const triggerFunction = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.enforce_public_identity_profile()",
    "CREATE OR REPLACE FUNCTION public.remediate_existing_public_identities()",
  );

  assert.match(migration, /CREATE TRIGGER enforce_public_identity_profile_trigger/);
  assert.match(migration, /resolution_note text/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF username, display_name ON public\.profiles/);
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Users can update own profile" ON public\.profiles/,
  );
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Users can insert own profile" ON public\.profiles/,
  );
  assert.match(migration, /REVOKE INSERT, UPDATE ON public\.profiles FROM authenticated/);
  assert.match(migration, /IDENTITY_USERNAME_IMMUTABLE/);
  assert.match(
    triggerFunction,
    /current_setting\('app\.identity_moderation_username_override', true\)/,
  );
  assert.match(triggerFunction, /v_override = 'migration_remediate'/);
  assert.match(triggerFunction, /v_override = 'admin_reset'/);
  assert.match(triggerFunction, /auth\.uid\(\) IS NOT NULL/);
  assert.match(triggerFunction, /public\.has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/);
  assert.match(triggerFunction, /NEW\.display_name := public\.identity_moderation_clean_display/);
});

test("handle_new_user preserves the wallet default and validates generated public identity", () => {
  const signupFunction = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.handle_new_user()",
    "CREATE OR REPLACE FUNCTION public.admin_reset_profile_identity",
  );

  assert.match(
    signupFunction,
    /FROM public\.evaluate_public_identity\(v_raw_username, 'username'\)/,
  );
  assert.match(signupFunction, /v_metadata_username := nullif\(btrim/);
  assert.match(
    signupFunction,
    /v_email_prefix := split_part\(coalesce\(NEW\.email, ''\), '@', 1\)/,
  );
  assert.match(
    signupFunction,
    /regexp_replace\(public\.identity_moderation_normalize\(v_email_prefix\), '\[\^a-z0-9\]\+', '_', 'g'\)/,
  );
  assert.match(signupFunction, /'pirate_' \|\| left\(replace\(NEW\.id::text, '-', ''\), 8\)/);
  assert.match(signupFunction, /INSERT INTO public\.profiles \(id, username, display_name\)/);
  assert.match(signupFunction, /INSERT INTO public\.user_wallets \(user_id\)\s+VALUES \(NEW\.id\)/);
  assert.doesNotMatch(signupFunction, /berries\)/);
  assert.doesNotMatch(signupFunction, /\b10000\b|\b25000\b/);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC, anon, authenticated/,
  );
});

test("existing-profile remediation flags and resets unsafe public identity without deleting profiles", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.remediate_existing_public_identities/,
  );
  assert.match(migration, /SELECT public\.remediate_existing_public_identities\(\)/);
  assert.match(migration, /INSERT INTO public\.identity_moderation_flags/);
  assert.match(migration, /INSERT INTO public\.identity_moderation_actions/);
  assert.match(migration, /UPDATE public\.profiles/);
  assert.match(
    migration,
    /PERFORM set_config\('app\.identity_moderation_username_override', 'migration_remediate', true\)/,
  );
  assert.match(migration, /SELECT username INTO v_new_display_name/);
  assert.doesNotMatch(
    migration,
    /DELETE FROM public\.profiles|TRUNCATE public\.profiles|DROP TABLE public\.profiles/,
  );
});

test("admin reset RPC is security definer and keeps service-side admin verification", () => {
  const resetFunction = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.admin_reset_profile_identity",
    "REVOKE EXECUTE ON FUNCTION public.evaluate_public_identity",
  );

  assert.match(resetFunction, /SECURITY DEFINER/);
  assert.match(resetFunction, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(resetFunction, /auth\.uid\(\)/);
  assert.match(resetFunction, /public\.has_role\(v_actor, 'admin'::public\.app_role\)/);
  assert.match(resetFunction, /FOR UPDATE/);
  assert.match(
    resetFunction,
    /set_config\('app\.identity_moderation_username_override', 'admin_reset', true\)/,
  );
  assert.match(resetFunction, /IDENTITY_RESET_SCOPE_REQUIRED/);
  assert.match(resetFunction, /UPDATE public\.identity_moderation_flags/);
  assert.match(resetFunction, /INSERT INTO public\.identity_moderation_actions/);
  assert.match(resetFunction, /IF _reset_username THEN[\s\S]*'username'/);
  assert.match(resetFunction, /IF _reset_display_name THEN[\s\S]*'display_name'/);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.admin_reset_profile_identity\(uuid, boolean, boolean, text\) FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.admin_reset_profile_identity\(uuid, boolean, boolean, text\) TO authenticated/,
  );
});

test("migration avoids destructive schema operations and unrelated domains", () => {
  assert.doesNotMatch(migration, /\bCASCADE\b/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM public\.user_wallets/);
  assert.doesNotMatch(migration, /daily_crew|grand_line_guess|transactions|holdings|stock_prices/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
});
