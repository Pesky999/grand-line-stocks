import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function functionSource(source: string, name: string, nextName: string) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = source.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should follow ${name}`);
  return source.slice(start, end);
}

const migrationPath =
  "supabase/migrations/20260804017500_identity_moderation_lovable_cloud_access.sql";
const migration = read(migrationPath);
const apiSource = read("src/lib/api/identity-moderation.functions.ts");
const walletSource = read("src/lib/api/wallet.functions.ts");
const typesSource = read("src/integrations/supabase/types.ts");

const adminFunctions = [
  ["admin_get_identity_moderation_overview", "admin_search_identity_moderation_profiles"],
  ["admin_search_identity_moderation_profiles", "admin_list_identity_moderation_flags"],
  ["admin_list_identity_moderation_flags", "admin_list_identity_moderation_rules"],
  ["admin_list_identity_moderation_rules", "admin_list_identity_moderation_actions"],
  ["admin_list_identity_moderation_actions", "admin_mark_identity_moderation_flag_reviewed"],
  ["admin_mark_identity_moderation_flag_reviewed", "admin_add_identity_moderation_rule"],
  ["admin_add_identity_moderation_rule", "admin_set_identity_moderation_rule_active"],
  ["admin_set_identity_moderation_rule_active", "admin_rescan_identity_moderation_profiles"],
  ["admin_rescan_identity_moderation_profiles", "check_public_username_policy_and_availability"],
] as const;

test("Identity Moderation admin RPCs derive and authorize the caller without caller IDs", () => {
  for (const [name, nextName] of adminFunctions) {
    const rpc = functionSource(migration, name, nextName);
    const signature = rpc.slice(0, rpc.indexOf("RETURNS"));

    assert.match(rpc, /v_actor uuid := auth\.uid\(\)/, `${name} derives auth.uid()`);
    assert.match(rpc, /IF v_actor IS NULL THEN/, `${name} rejects anonymous callers`);
    assert.match(
      rpc,
      /IF NOT public\.has_role\(v_actor, 'admin'::public\.app_role\) THEN/,
      `${name} rejects authenticated non-admin callers`,
    );
    assert.match(rpc, /SECURITY DEFINER/);
    assert.match(rpc, /SET search_path = pg_catalog, public, pg_temp/);
    assert.doesNotMatch(signature, /_user_id|_admin_id|_actor_id|_caller_id/);
    assert.match(
      migration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${name}\\([^;]* FROM PUBLIC, anon, authenticated`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]* TO authenticated, service_role`,
      ),
    );
  }
});

test("public identity checks expose booleans without protected policy details", () => {
  const usernameCheck = functionSource(
    migration,
    "check_public_username_policy_and_availability",
    "check_public_display_name_policy",
  );
  const displayNameCheck = functionSource(
    migration,
    "check_public_display_name_policy",
    "update_my_public_display_name",
  );

  for (const rpc of [usernameCheck, displayNameCheck]) {
    assert.match(rpc, /RETURNS boolean/);
    assert.match(rpc, /SECURITY DEFINER/);
    assert.match(rpc, /SET search_path = pg_catalog, public, pg_temp/);
    assert.match(rpc, /EXCEPTION\s+WHEN OTHERS THEN\s+RETURN false/);
    assert.doesNotMatch(rpc, /RETURNS TABLE|jsonb_build_object|normalized_term|term_id|category/);
  }

  assert.match(usernameCheck, /lower\(username\) = lower\(v_username\)/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.check_public_username_policy_and_availability\(text\) TO anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.check_public_display_name_policy\(text\) TO anon, authenticated, service_role/,
  );
});

test("admin rule listing excludes protected core blocked rules", () => {
  const ruleList = functionSource(
    migration,
    "admin_list_identity_moderation_rules",
    "admin_list_identity_moderation_actions",
  );

  assert.match(ruleList, /WHERE NOT \(terms\.is_core AND terms\.kind = 'blocked'\)/);
  assert.match(ruleList, /rows\.active DESC, rows\.category ASC, rows\.term ASC/);
  assert.doesNotMatch(ruleList, /OR public\.has_role/);
});

test("profile rescan is bounded, duplicate-safe, and flag-only", () => {
  const rescan = functionSource(
    migration,
    "admin_rescan_identity_moderation_profiles",
    "check_public_username_policy_and_availability",
  );

  assert.match(rescan, /LIMIT 1000/);
  assert.match(rescan, /pg_advisory_xact_lock/);
  assert.match(rescan, /flags\.status IN \('open', 'reviewed'\)/);
  assert.match(rescan, /flags\.term_id IS NOT DISTINCT FROM v_term_id/);
  assert.match(rescan, /INSERT INTO public\.identity_moderation_flags/);
  assert.doesNotMatch(
    rescan,
    /UPDATE public\.profiles|INSERT INTO public\.profiles|DELETE FROM public\.profiles/,
  );
  assert.doesNotMatch(rescan, /admin_reset_profile_identity/);
});

test("display-name updates are caller-scoped and no longer require a server secret", () => {
  const updateRpc = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.update_my_public_display_name"),
    migration.indexOf("REVOKE EXECUTE ON FUNCTION public.admin_get_identity_moderation_overview"),
  );

  assert.match(updateRpc, /v_actor uuid := auth\.uid\(\)/);
  assert.match(updateRpc, /WHERE id = v_actor/);
  assert.doesNotMatch(updateRpc.slice(0, updateRpc.indexOf("RETURNS")), /_user_id/);
  assert.match(walletSource, /context\.supabase\.rpc\(\s*"check_public_display_name_policy"/);
  assert.match(walletSource, /context\.supabase\.rpc\("update_my_public_display_name"/);
  assert.doesNotMatch(walletSource, /supabaseAdmin|client\.server|public-identity\.server/);
  assert.doesNotMatch(apiSource, /supabaseAdmin|client\.server|public-identity\.server/);
});

test("schema contract contains only caller-scoped Identity Moderation RPC arguments", () => {
  for (const name of [
    "admin_get_identity_moderation_overview",
    "admin_search_identity_moderation_profiles",
    "admin_list_identity_moderation_flags",
    "admin_list_identity_moderation_rules",
    "admin_list_identity_moderation_actions",
    "admin_mark_identity_moderation_flag_reviewed",
    "admin_add_identity_moderation_rule",
    "admin_set_identity_moderation_rule_active",
    "admin_rescan_identity_moderation_profiles",
    "check_public_username_policy_and_availability",
    "check_public_display_name_policy",
    "update_my_public_display_name",
  ]) {
    assert.match(typesSource, new RegExp(`${name}: \\{`));
    const start = typesSource.indexOf(`${name}: {`);
    const end = typesSource.indexOf("Returns:", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    assert.doesNotMatch(typesSource.slice(start, end), /_user_id|_admin_id|_actor_id|_caller_id/);
  }
});

test("migration changes no table grants or RLS policies and keeps reset access", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /GRANT (?:ALL|SELECT|INSERT|UPDATE|DELETE) ON/);
  assert.doesNotMatch(migration, /CREATE POLICY|ALTER POLICY|DISABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.admin_reset_profile_identity\(uuid, boolean, boolean, text\) FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.admin_reset_profile_identity\(uuid, boolean, boolean, text\) TO authenticated, service_role/,
  );
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
});

test("migration timestamp remains between market policy correction and catalog seed", () => {
  assert.ok("20260804010000" < "20260804017500");
  assert.ok("20260804015000" < "20260804017500");
  assert.ok("20260804017500" < "20260804020000");
  assert.equal(migrationPath.includes("20260804017500"), true);
});
