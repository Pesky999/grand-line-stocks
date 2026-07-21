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

function sourceBetweenAfter(source: string, after: string, start: string, end: string) {
  const afterIndex = source.indexOf(after);
  assert.notEqual(afterIndex, -1, `${after} should exist`);
  const startIndex = source.indexOf(start, afterIndex + after.length);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist after ${after}`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function loopContaining(source: string, needle: string, occurrence = 1) {
  let needleIndex = -1;
  let searchFrom = 0;
  for (let index = 0; index < occurrence; index += 1) {
    needleIndex = source.indexOf(needle, searchFrom);
    assert.notEqual(needleIndex, -1, `${needle} occurrence ${occurrence} should exist`);
    searchFrom = needleIndex + needle.length;
  }

  const loopStart = source.lastIndexOf("  FOR v_action IN", needleIndex);
  const nextLoop = source.indexOf("\n  FOR v_action IN", needleIndex + needle.length);
  const functionReturn = source.indexOf(
    "\n  RETURN jsonb_build_object",
    needleIndex + needle.length,
  );
  const loopEnd = nextLoop === -1 ? functionReturn : Math.min(nextLoop, functionReturn);
  assert.notEqual(loopStart, -1, `${needle} should be inside a restore loop`);
  assert.notEqual(loopEnd, -1, `${needle} loop should have an end`);
  return source.slice(loopStart, loopEnd);
}

const migration = read("supabase/migrations/20260719040000_public_identity_moderation.sql");
const hotfixMigration = read("supabase/migrations/20260720020000_restore_profile_identities.sql");
const effectiveIdentitySql = `${migration}\n${hotfixMigration}`;
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
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_moderation_terms_active_unique\s+ON public\.identity_moderation_terms \(normalized_term, kind, match_mode\)\s+WHERE active/,
  );
});

test("moderation policy supports expected categories and match modes without exposing a public list RPC", () => {
  for (const category of [
    "reserved",
    "threat",
    "hate_group",
    "common_profanity",
    "severe_profanity",
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
  const canonicalFunction = sourceBetween(
    hotfixMigration,
    "CREATE OR REPLACE FUNCTION public.identity_username_canonical",
    "CREATE OR REPLACE FUNCTION public.identity_username_legacy_format_valid",
  );
  const normalizeFunction = sourceBetween(
    hotfixMigration,
    "CREATE OR REPLACE FUNCTION public.identity_moderation_normalize",
    "CREATE OR REPLACE FUNCTION public.identity_moderation_words",
  );
  const evaluateFunction = sourceBetween(
    hotfixMigration,
    "CREATE OR REPLACE FUNCTION public.evaluate_public_identity",
    "CREATE OR REPLACE FUNCTION public.identity_moderation_next_username",
  );

  assert.match(canonicalFunction, /normalize\(coalesce\(_value, ''\), NFKC\)/);
  assert.match(canonicalFunction, /lower\(normalize\(coalesce\(_value, ''\), NFKC\)\)/);
  assert.doesNotMatch(canonicalFunction, /'0134578@\$!'/);
  assert.match(
    normalizeFunction,
    /U&'\\03B1\\0430\\03BF\\043E\\0441\\0440\\0435\\0445\\0443\\0456'/,
  );
  assert.match(normalizeFunction, /'0134578@\$!'/);
  assert.match(normalizeFunction, /'oieastbasi'/);
  assert.match(
    canonicalFunction,
    /U&'\\200B\\200C\\200D\\200E\\200F\\202A\\202B\\202C\\202D\\202E\\FEFF'/,
  );
  assert.match(
    effectiveIdentitySql,
    /CREATE OR REPLACE FUNCTION public\.identity_moderation_clean_display/,
  );
  assert.match(
    evaluateFunction,
    /v_canonical text := public\.identity_username_canonical\(v_value\)/,
  );
  assert.match(evaluateFunction, /IF v_canonical = '' THEN/);
  assert.match(evaluateFunction, /char_length\(v_canonical\) < 3/);
  assert.match(evaluateFunction, /char_length\(v_canonical\) > 20/);
  assert.match(evaluateFunction, /IF v_canonical <> btrim\(v_value\)/);
  assert.match(evaluateFunction, /v_canonical !~ '\^\[a-z0-9\]/);
  assert.doesNotMatch(evaluateFunction, /v_normalized <> btrim\(v_value\)/);
  assert.doesNotMatch(evaluateFunction, /v_contact_value|https\?:|www\\\.|contact_info/);
  assert.match(
    evaluateFunction,
    /v_display_value text := public\.identity_moderation_clean_display\(v_value\)/,
  );
  assert.match(evaluateFunction, /translate\(v_display_value, chr\(8217\), ''''\)/);
  assert.match(evaluateFunction, /\[\^\[:alnum:\]\[:space:\]\.,''_!\?&\(\) -\]/);
  assert.doesNotMatch(evaluateFunction, /\[\^\[:alnum:\]\[:space:\]\.,''_!\?&\(\)\[\] -\]/);
  assert.match(
    hotfixMigration,
    /REVOKE EXECUTE ON FUNCTION public\.identity_username_canonical\(text\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    hotfixMigration,
    /GRANT EXECUTE ON FUNCTION public\.identity_username_canonical\(text\) TO service_role/,
  );
  assert.match(
    effectiveIdentitySql,
    /REVOKE EXECUTE ON FUNCTION public\.identity_moderation_clean_display\(text\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    effectiveIdentitySql,
    /GRANT EXECUTE ON FUNCTION public\.identity_moderation_clean_display\(text\) TO service_role/,
  );
});

test("profile writes are moved behind triggers and trusted server paths", () => {
  const triggerFunction = sourceBetween(
    hotfixMigration,
    "CREATE OR REPLACE FUNCTION public.enforce_public_identity_profile()",
    "CREATE OR REPLACE FUNCTION public.handle_new_user()",
  );

  assert.match(effectiveIdentitySql, /CREATE TRIGGER enforce_public_identity_profile_trigger/);
  assert.match(effectiveIdentitySql, /resolution_note text/);
  assert.match(
    effectiveIdentitySql,
    /BEFORE INSERT OR UPDATE OF username, display_name ON public\.profiles/,
  );
  assert.match(
    effectiveIdentitySql,
    /DROP POLICY IF EXISTS "Users can update own profile" ON public\.profiles/,
  );
  assert.match(
    effectiveIdentitySql,
    /DROP POLICY IF EXISTS "Users can insert own profile" ON public\.profiles/,
  );
  assert.match(
    effectiveIdentitySql,
    /REVOKE INSERT, UPDATE ON public\.profiles FROM authenticated/,
  );
  assert.match(effectiveIdentitySql, /IDENTITY_USERNAME_IMMUTABLE/);
  assert.match(
    triggerFunction,
    /current_setting\('app\.identity_moderation_username_override', true\)/,
  );
  assert.match(triggerFunction, /v_override = 'restore_incident'/);
  assert.match(triggerFunction, /v_override = 'admin_reset'/);
  assert.match(triggerFunction, /auth\.uid\(\) IS NOT NULL/);
  assert.match(triggerFunction, /public\.has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/);
  assert.match(triggerFunction, /IF TG_OP = 'UPDATE' THEN[\s\S]*IDENTITY_USERNAME_IMMUTABLE/);
  assert.match(
    triggerFunction,
    /IF TG_OP = 'INSERT' OR \(TG_OP = 'UPDATE' AND NEW\.username IS DISTINCT FROM OLD\.username\) THEN/,
  );
  assert.match(triggerFunction, /IF v_override <> 'restore_incident' THEN/);
  assert.doesNotMatch(triggerFunction, /identity_username_legacy_format_valid\(NEW\.username\)/);
  assert.match(
    triggerFunction,
    /IF NEW\.display_name IS NOT NULL\s+AND v_override <> 'restore_incident'\s+AND \(\s+TG_OP = 'INSERT'\s+OR \(TG_OP = 'UPDATE' AND NEW\.display_name IS DISTINCT FROM OLD\.display_name\)\s+\) THEN/,
  );
  assert.match(triggerFunction, /NEW\.display_name := public\.identity_moderation_clean_display/);
});

test("handle_new_user preserves the wallet default and validates generated public identity", () => {
  const signupFunction = sourceBetween(
    hotfixMigration,
    "CREATE OR REPLACE FUNCTION public.handle_new_user()",
    "CREATE OR REPLACE FUNCTION public.restore_public_identity_remediation_incident",
  );
  const manualInsertBranch = sourceBetweenAfter(
    signupFunction,
    "v_clean_display_name := public.identity_moderation_clean_display",
    "IF v_provider = 'email' THEN",
    "ELSE",
  );
  const oauthInsertBranch = sourceBetweenAfter(
    signupFunction,
    "v_candidate := v_metadata_canonical;",
    "ELSE",
    "INSERT INTO public.user_wallets",
  );

  assert.match(
    signupFunction,
    /v_provider := lower\(coalesce\(NEW\.raw_app_meta_data ->> 'provider', 'email'\)\)/,
  );
  assert.match(signupFunction, /IF v_provider = 'email' THEN/);
  assert.match(signupFunction, /IDENTITY_USERNAME_REQUIRED/);
  assert.match(signupFunction, /IDENTITY_USERNAME_REJECTED/);
  assert.match(signupFunction, /IDENTITY_USERNAME_UNAVAILABLE/);
  assert.match(
    signupFunction,
    /FROM public\.evaluate_public_identity\(v_metadata_username, 'username'\)/,
  );
  assert.match(
    signupFunction,
    /v_metadata_canonical := public\.identity_username_canonical\(v_metadata_username\)/,
  );
  assert.match(signupFunction, /WHERE username = v_metadata_canonical/);
  assert.match(signupFunction, /v_candidate_base := v_metadata_canonical/);
  assert.match(signupFunction, /IF v_provider <> 'email' THEN/);
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
    /regexp_replace\(public\.identity_username_canonical\(v_email_prefix\), '\[\^a-z0-9\]\+', '_', 'g'\)/,
  );
  assert.doesNotMatch(signupFunction, /identity_moderation_normalize\(v_email_prefix\)/);
  assert.match(
    signupFunction,
    /v_candidate_base := public\.identity_username_canonical\(v_raw_username\)/,
  );
  assert.match(signupFunction, /'pirate_' \|\| left\(replace\(NEW\.id::text, '-', ''\), 8\)/);
  assert.match(manualInsertBranch, /v_candidate := v_metadata_canonical/);
  assert.match(manualInsertBranch, /VALUES \(NEW\.id, v_candidate, v_display_name\)/);
  assert.match(
    manualInsertBranch,
    /EXCEPTION\s+WHEN unique_violation THEN\s+RAISE EXCEPTION 'IDENTITY_USERNAME_UNAVAILABLE'/,
  );
  assert.doesNotMatch(manualInsertBranch, /identity_moderation_next_username|v_attempt :=/);
  assert.match(oauthInsertBranch, /LOOP[\s\S]*v_attempt := v_attempt \+ 1[\s\S]*IF v_attempt > 8/);
  assert.match(oauthInsertBranch, /identity_moderation_next_username\(v_candidate_base, NEW\.id\)/);
  assert.match(oauthInsertBranch, /EXCEPTION\s+WHEN unique_violation THEN/);
  assert.match(
    oauthInsertBranch,
    /IF EXISTS \(SELECT 1 FROM public\.profiles WHERE id = NEW\.id\) THEN/,
  );
  assert.match(signupFunction, /INSERT INTO public\.profiles \(id, username, display_name\)/);
  assert.doesNotMatch(signupFunction, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(signupFunction, /INSERT INTO public\.user_wallets \(user_id\)\s+VALUES \(NEW\.id\)/);
  assert.doesNotMatch(signupFunction, /berries\)/);
  assert.doesNotMatch(signupFunction, /\b10000\b|\b25000\b/);
  assert.match(
    effectiveIdentitySql,
    /REVOKE EXECUTE ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC, anon, authenticated/,
  );
});

test("hotfix disables automatic remediation and restores exact incident-modified identities", () => {
  const restoreFunction = sourceBetween(
    hotfixMigration,
    "CREATE OR REPLACE FUNCTION public.restore_public_identity_remediation_incident()",
    "SELECT public.restore_public_identity_remediation_incident();",
  );
  const usernameLoop = loopContaining(
    restoreFunction,
    "reason = 'Existing username failed public identity policy during migration.'",
    1,
  );
  const explicitDisplayLoop = loopContaining(
    restoreFunction,
    "reason = 'Existing display name failed public identity policy during migration.'",
  );
  const derivedDisplayLoop = loopContaining(
    restoreFunction,
    "reason = 'Existing username failed public identity policy during migration.'",
    2,
  );

  assert.match(migration, /SELECT public\.remediate_existing_public_identities\(\)/);
  assert.doesNotMatch(hotfixMigration, /SELECT public\.remediate_existing_public_identities\(\)/);
  assert.match(
    hotfixMigration,
    /DROP FUNCTION IF EXISTS public\.remediate_existing_public_identities\(\)/,
  );
  assert.match(hotfixMigration, /'incident_restore'/);
  assert.match(hotfixMigration, /'incident_restore_conflict'/);
  assert.match(
    restoreFunction,
    /reason = 'Existing username failed public identity policy during migration\.'/,
  );
  assert.match(
    restoreFunction,
    /reason = 'Existing display name failed public identity policy during migration\.'/,
  );
  assert.match(restoreFunction, /ORDER BY profile_id, field, created_at ASC, id ASC/);
  assert.match(usernameLoop, /action_type IN \('incident_restore', 'incident_restore_conflict'\)/);
  assert.ok(
    usernameLoop.indexOf("action_type IN ('incident_restore', 'incident_restore_conflict')") <
      usernameLoop.indexOf("SELECT * INTO v_profile"),
    "username rerun restore/conflict checks should happen before profile-state accounting",
  );
  assert.match(
    usernameLoop,
    /IF NOT FOUND THEN[\s\S]*v_missing_profiles := v_missing_profiles \+ 1/,
  );
  assert.match(
    usernameLoop,
    /v_profile\.username IS DISTINCT FROM v_action\.new_value[\s\S]*v_skipped_changed_later := v_skipped_changed_later \+ 1/,
  );
  assert.ok(
    usernameLoop.indexOf("v_skipped_changed_later := v_skipped_changed_later + 1") <
      usernameLoop.indexOf("v_username_candidates := v_username_candidates + 1"),
    "changed username rows should not inflate username candidates",
  );
  assert.match(
    explicitDisplayLoop,
    /IF NOT FOUND THEN[\s\S]*v_missing_profiles := v_missing_profiles \+ 1/,
  );
  assert.match(
    explicitDisplayLoop,
    /v_profile\.display_name IS DISTINCT FROM v_action\.new_value[\s\S]*v_skipped_changed_later := v_skipped_changed_later \+ 1/,
  );
  assert.match(
    derivedDisplayLoop,
    /explicit_display_action\.action_type = 'auto_remediate'[\s\S]*explicit_display_action\.field = 'display_name'/,
  );
  assert.ok(
    derivedDisplayLoop.indexOf("explicit_display_action.action_type = 'auto_remediate'") <
      derivedDisplayLoop.indexOf("SELECT * INTO v_profile"),
    "explicit display actions should prevent derived display false skips before profile checks",
  );
  assert.match(
    derivedDisplayLoop,
    /v_profile\.display_name IS DISTINCT FROM v_action\.new_value[\s\S]*v_skipped_changed_later := v_skipped_changed_later \+ 1/,
  );
  assert.match(
    restoreFunction,
    /WHERE username = v_action\.previous_value[\s\S]*AND id IS DISTINCT FROM v_action\.profile_id/,
  );
  assert.doesNotMatch(
    restoreFunction,
    /identity_username_legacy_format_valid\(v_action\.previous_value\)/,
  );
  assert.doesNotMatch(
    restoreFunction,
    /evaluate_public_identity\(v_action\.previous_value, 'username'\)/,
  );
  assert.doesNotMatch(
    restoreFunction,
    /evaluate_public_identity\(v_action\.previous_value, 'display_name'\)/,
  );
  assert.doesNotMatch(restoreFunction, /char_length\(v_action\.previous_value\)/);
  assert.doesNotMatch(restoreFunction, /too_short|too_long|invalid_format/);
  assert.match(
    restoreFunction,
    /'Could not automatically restore July 19, 2026 username; manual review required\.'/,
  );
  assert.doesNotMatch(restoreFunction, /identity_moderation_next_username\(/);
  assert.match(
    restoreFunction,
    /UPDATE public\.profiles[\s\S]*SET username = v_action\.previous_value[\s\S]*AND username = v_action\.new_value/,
  );
  assert.match(
    restoreFunction,
    /SET display_name = v_action\.previous_value[\s\S]*WHERE id = v_action\.profile_id[\s\S]*AND display_name = v_action\.new_value/,
  );
  assert.match(restoreFunction, /explicitDisplayNameCandidates[\s\S]*derivedDisplayNameCandidates/);
  assert.match(
    restoreFunction,
    /v_derived_reason text := 'Restored display identity changed as a side effect/,
  );
  assert.match(
    restoreFunction,
    /later_action\.action_type IN \('admin_reset', 'incident_restore'\)/,
  );
  assert.match(restoreFunction, /field = 'username'[\s\S]*later_action\.action_type IN/);
  assert.match(restoreFunction, /field = 'display_name'[\s\S]*later_action\.action_type IN/);
  assert.match(
    restoreFunction,
    /'Restored identity changed by the July 19, 2026 automatic-remediation incident\.'/,
  );
  assert.match(
    restoreFunction,
    /'Restored display identity changed as a side effect of the July 19, 2026 username-remediation incident\.'/,
  );
  assert.match(
    restoreFunction,
    /jsonb_build_object\([\s\S]*'usernameCandidates'[\s\S]*'explicitDisplayNameCandidates'[\s\S]*'derivedDisplayNamesRestored'[\s\S]*'skippedBecauseChangedLater'[\s\S]*'missingProfiles'/,
  );
  assert.doesNotMatch(restoreFunction, /displayNameConflicts/);
  assert.match(
    hotfixMigration,
    /REVOKE EXECUTE ON FUNCTION public\.restore_public_identity_remediation_incident\(\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    hotfixMigration,
    /GRANT EXECUTE ON FUNCTION public\.restore_public_identity_remediation_incident\(\) TO service_role/,
  );
  assert.match(typesSource, /restore_public_identity_remediation_incident: \{/);
  assert.doesNotMatch(
    hotfixMigration,
    /GRANT EXECUTE ON FUNCTION public\.restore_public_identity_remediation_incident\(\) TO authenticated/,
  );
  assert.doesNotMatch(
    hotfixMigration,
    /DELETE FROM public\.profiles|TRUNCATE public\.profiles|DROP TABLE public\.profiles/,
  );
});

test("hotfix narrows active enforcement to approved profanity and slur categories", () => {
  const evaluateFunction = sourceBetween(
    hotfixMigration,
    "CREATE OR REPLACE FUNCTION public.evaluate_public_identity",
    "CREATE OR REPLACE FUNCTION public.identity_moderation_next_username",
  );

  assert.match(evaluateFunction, /AND kind = 'blocked'/);
  for (const category of [
    "common_profanity",
    "severe_profanity",
    "racial_ethnic_slur",
    "religious_slur",
    "nationality_slur",
    "sex_gender_slur",
    "sexual_orientation_slur",
    "disability_slur",
  ]) {
    assert.match(evaluateFunction, new RegExp(`'${category}'`));
  }

  assert.doesNotMatch(evaluateFunction, /kind IN \('blocked', 'reserved'\)/);
  assert.doesNotMatch(evaluateFunction, /CASE WHEN v_rule\.kind = 'reserved'/);
  assert.match(
    hotfixMigration,
    /UPDATE public\.identity_moderation_terms[\s\S]*SET active = false[\s\S]*kind IN \('blocked', 'reserved'\)/,
  );
  for (const category of [
    "reserved",
    "contact_info",
    "threat",
    "hate_group",
    "harassment",
    "privacy_abuse",
    "sexual_profanity",
  ]) {
    assert.doesNotMatch(
      evaluateFunction,
      new RegExp(`'${category}'`),
      `${category} should not be in the active enforcement predicate`,
    );
  }
});

test("hotfix curates the private term rows to actual profanity and slurs", () => {
  assert.match(
    hotfixMigration,
    /UPDATE public\.identity_moderation_terms\s+SET active = false,[\s\S]*category = 'common_profanity'[\s\S]*normalized_term IN \('idiot', 'stupid', 'trash'\)/,
  );
  assert.match(
    hotfixMigration,
    /UPDATE public\.identity_moderation_terms\s+SET active = true,[\s\S]*category = 'common_profanity'[\s\S]*normalized_term IN \('damn', 'hell', 'crap'\)/,
  );
  assert.match(
    hotfixMigration,
    /UPDATE public\.identity_moderation_terms\s+SET category = 'severe_profanity',\s+active = true,[\s\S]*category = 'sexual_profanity'[\s\S]*normalized_term IN \('dick', 'cock', 'pussy'\)/,
  );
  assert.match(
    hotfixMigration,
    /UPDATE public\.identity_moderation_terms\s+SET active = false,[\s\S]*category = 'sexual_profanity'[\s\S]*normalized_term IN \('porn', 'xxx', 'sex'\)/,
  );
  assert.ok(
    hotfixMigration.indexOf("AND normalized_term IN ('dick', 'cock', 'pussy')") <
      hotfixMigration.indexOf("WHERE active\n  AND kind IN ('blocked', 'reserved')"),
    "vulgar terms should be reclassified before non-approved category deactivation runs",
  );
  assert.doesNotMatch(hotfixMigration, /DELETE FROM public\.identity_moderation_terms/);
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
  assert.match(resetFunction, /IDENTITY_RESET_NO_CHANGE/);
  assert.match(resetFunction, /v_username_changed :=/);
  assert.match(resetFunction, /v_display_name_changed :=/);
  assert.ok(
    resetFunction.indexOf("IDENTITY_RESET_NO_CHANGE") <
      resetFunction.indexOf("set_config('app.identity_moderation_username_override'"),
    "no-op resets should fail before enabling the transaction-local username override",
  );
  assert.match(resetFunction, /UPDATE public\.identity_moderation_flags/);
  assert.match(resetFunction, /INSERT INTO public\.identity_moderation_actions/);
  assert.match(resetFunction, /IF v_username_changed THEN[\s\S]*'username'/);
  assert.match(resetFunction, /IF v_display_name_changed THEN[\s\S]*'display_name'/);
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
  assert.doesNotMatch(effectiveIdentitySql, /\bCASCADE\b/);
  assert.doesNotMatch(effectiveIdentitySql, /DROP TABLE|TRUNCATE|DELETE FROM public\.user_wallets/);
  assert.doesNotMatch(
    hotfixMigration,
    /daily_crew|grand_line_guess|transactions|holdings|stock_prices|character_prices|rewards|achievements/,
  );
  assert.match(effectiveIdentitySql, /NOTIFY pgrst, 'reload schema'/);
});
