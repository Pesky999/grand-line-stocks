/// <reference types="node" />

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function normalizedSha256(source: string) {
  return createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

const migrationPath = "supabase/migrations/20260724050000_harden_self_service_account_deletion.sql";
const migration = read(migrationPath);
const storagePreflightMigrationPath =
  "supabase/migrations/20260725010000_fix_account_deletion_storage_preflight.sql";
const storagePreflightMigration = read(storagePreflightMigrationPath);
const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations")).filter((file) =>
  file.endsWith(".sql"),
);

test("self-service deletion keeps the original hardening migration unchanged", () => {
  assert.equal(
    migrationFiles.filter((file) => file.includes("harden_self_service_account_deletion")).length,
    1,
  );
  assert.equal(
    migrationFiles.includes("20260724050000_harden_self_service_account_deletion.sql"),
    true,
  );
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.equal(
    normalizedSha256(migration),
    "1ed53d5ca09f6b1c3f3a261d01733cf83b6dab52b127581e0f877b057958473c",
  );
});

test("historical storage preflight migration remains present but this branch adds no migration", () => {
  assert.equal(
    migrationFiles.filter((file) => file.includes("fix_account_deletion_storage_preflight")).length,
    1,
  );
  assert.equal(
    migrationFiles.filter((file) => file.includes("simplify_account_deletion")).length,
    0,
  );
  assert.equal(
    migrationFiles.includes("20260725010000_fix_account_deletion_storage_preflight.sql"),
    true,
  );
  assert.match(storagePreflightMigration, /^BEGIN;/);
  assert.match(storagePreflightMigration, /COMMIT;\s*$/);
});

test("migration contains no data deletion, backfill, tombstone, or public deletion RPC", () => {
  const executable = migration.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /\bDELETE\s+FROM\b|\bUPDATE\s+public\./i);
  assert.doesNotMatch(executable, /\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(executable, /deleted_user|tombstone|soft_delete/i);
  assert.doesNotMatch(executable, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\..*delete/i);
  assert.doesNotMatch(executable, /GRANT\s+(?:DELETE|ALL).*TO\s+(?:anon|authenticated|PUBLIC)/i);
});

test("storage ownership RPC is a no-argument boolean auth.uid existence check", () => {
  const functionBlock = sourceBetween(
    storagePreflightMigration,
    "CREATE OR REPLACE FUNCTION public.my_account_owns_storage_objects()",
    "COMMENT ON FUNCTION public.my_account_owns_storage_objects()",
  );

  assert.match(functionBlock, /RETURNS boolean/i);
  assert.match(functionBlock, /LANGUAGE sql/i);
  assert.match(functionBlock, /STABLE/i);
  assert.match(functionBlock, /SECURITY DEFINER/i);
  assert.match(functionBlock, /SET search_path = pg_catalog, public, storage, pg_temp/i);
  assert.match(functionBlock, /WHEN auth\.uid\(\) IS NULL THEN false/i);
  assert.match(functionBlock, /EXISTS \(/i);
  assert.match(functionBlock, /FROM storage\.objects/i);
  assert.match(functionBlock, /storage\.objects\.owner_id = auth\.uid\(\)::text/i);
  assert.doesNotMatch(functionBlock, /my_account_owns_storage_objects\([^)]*(?:uuid|user_id)/i);
  assert.doesNotMatch(functionBlock, /SELECT\s+(?:bucket_id|name|path|metadata|owner_id)\b/i);
});

test("storage ownership RPC permissions expose only execute on the boolean function", () => {
  assert.match(
    storagePreflightMigration,
    /COMMENT ON FUNCTION public\.my_account_owns_storage_objects\(\)[\s\S]*read-only ownership existence check/i,
  );
  assert.match(
    storagePreflightMigration,
    /REVOKE EXECUTE ON FUNCTION public\.my_account_owns_storage_objects\(\) FROM PUBLIC;/i,
  );
  assert.match(
    storagePreflightMigration,
    /REVOKE EXECUTE ON FUNCTION public\.my_account_owns_storage_objects\(\) FROM anon;/i,
  );
  assert.match(
    storagePreflightMigration,
    /GRANT EXECUTE ON FUNCTION public\.my_account_owns_storage_objects\(\) TO authenticated;/i,
  );
  assert.doesNotMatch(
    storagePreflightMigration,
    /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*storage\.objects/i,
  );
  assert.match(storagePreflightMigration, /NOTIFY pgrst, 'reload schema';/);
});

test("storage preflight migration does not mutate storage rows or accept client identity", () => {
  const executable = storagePreflightMigration.replace(/--.*$/gm, "");

  assert.doesNotMatch(executable, /\bINSERT\s+INTO\s+storage\./i);
  assert.doesNotMatch(executable, /\bUPDATE\s+storage\./i);
  assert.doesNotMatch(executable, /\bDELETE\s+FROM\s+storage\./i);
  assert.doesNotMatch(executable, /\bALTER\s+TABLE\s+storage\./i);
  assert.doesNotMatch(executable, /my_account_owns_storage_objects\([^)]*(?:uuid|user_id)/i);
});

test("account-owned legacy and moderation profile records cascade", () => {
  for (const [constraint, table] of [
    ["legacy_records_user_id_fkey", "legacy_records"],
    ["identity_moderation_flags_profile_id_fkey", "identity_moderation_flags"],
    ["identity_moderation_actions_profile_id_fkey", "identity_moderation_actions"],
  ] as const) {
    const block = sourceBetween(
      migration,
      `ADD CONSTRAINT ${constraint}`,
      `COMMENT ON CONSTRAINT ${constraint}`,
    );
    assert.match(block, new RegExp(`ON DELETE CASCADE`, "i"), `${table} should cascade`);
  }
});

test("shared pricing audit actor references are anonymized with SET NULL", () => {
  for (const constraint of [
    "character_pricing_ratings_created_by_fkey",
    "character_pricing_ratings_updated_by_fkey",
    "character_pricing_ratings_approved_by_fkey",
  ]) {
    const block = sourceBetween(
      migration,
      `ADD CONSTRAINT ${constraint}`,
      `COMMENT ON CONSTRAINT ${constraint}`,
    );
    assert.match(block, /REFERENCES auth\.users\(id\)/);
    assert.match(block, /ON DELETE SET NULL/);
  }
});

test("shared editorial and moderation actor references are anonymized with SET NULL", () => {
  const migrationHistory = migrationFiles
    .map((file) => read(`supabase/migrations/${file}`))
    .join("\n");

  for (const [table, column] of [
    ["market_events", "created_by"],
    ["identity_moderation_terms", "created_by"],
    ["identity_moderation_flags", "reviewed_by"],
    ["identity_moderation_actions", "actor_user_id"],
  ] as const) {
    assert.match(
      migrationHistory,
      new RegExp(`${column}\\s+uuid\\s+REFERENCES auth\\.users\\(id\\) ON DELETE SET NULL`, "i"),
      `${table}.${column} should survive account deletion with the actor anonymized`,
    );
  }
});

test("orphan preflight exists before every replacement foreign key", () => {
  for (const [orphanCheck, constraint] of [
    ["Cannot harden legacy_records.user_id", "legacy_records_user_id_fkey"],
    [
      "Cannot harden identity_moderation_flags.profile_id",
      "identity_moderation_flags_profile_id_fkey",
    ],
    [
      "Cannot harden identity_moderation_actions.profile_id",
      "identity_moderation_actions_profile_id_fkey",
    ],
    [
      "Cannot harden character_pricing_ratings.created_by",
      "character_pricing_ratings_created_by_fkey",
    ],
    [
      "Cannot harden character_pricing_ratings.updated_by",
      "character_pricing_ratings_updated_by_fkey",
    ],
    [
      "Cannot harden character_pricing_ratings.approved_by",
      "character_pricing_ratings_approved_by_fkey",
    ],
  ] as const) {
    assert.ok(
      migration.indexOf(orphanCheck) < migration.indexOf(`ADD CONSTRAINT ${constraint}`),
      `${orphanCheck} should appear before ${constraint}`,
    );
  }
});

test("approved shared pricing records can survive account deletion with anonymized approver", () => {
  const check = sourceBetween(
    migration,
    "ADD CONSTRAINT character_pricing_ratings_approval_metadata_check",
    "COMMENT ON CONSTRAINT character_pricing_ratings_created_by_fkey",
  );

  assert.match(
    check,
    /ratings_status = 'draft'[\s\S]*approved_at IS NULL[\s\S]*approved_by IS NULL/,
  );
  assert.match(check, /ratings_status = 'approved'[\s\S]*approved_at IS NOT NULL/);
  assert.doesNotMatch(check, /ratings_status = 'approved'[\s\S]*approved_by IS NOT NULL/);
});

test("existing account-owned references already cascade in current migration history", () => {
  const migrationHistory = migrationFiles
    .map((file) => read(`supabase/migrations/${file}`))
    .join("\n");

  for (const table of [
    "profiles",
    "user_wallets",
    "user_holdings",
    "transactions",
    "trivia_attempts",
    "user_roles",
    "net_worth_snapshots",
    "user_stats",
    "leaderboard_cache",
    "user_achievements",
    "grand_line_guess_daily_puzzles",
    "grand_line_guess_attempts",
    "grand_line_guess_results",
    "grand_line_guess_stats",
    "daily_crew_submissions",
    "wallet_ledger_entries",
    "user_onboarding_progress",
    "user_onboarding_events",
  ]) {
    assert.match(
      migrationHistory,
      new RegExp(
        `CREATE TABLE(?: IF NOT EXISTS)? public\\.${table}[\\s\\S]*?REFERENCES auth\\.users\\(id\\) ON DELETE CASCADE`,
        "i",
      ),
      `${table} should have account-owned cascade in migration history`,
    );
  }
});

test("account-owned child rows cascade through owned parent tables", () => {
  const migrationHistory = migrationFiles
    .map((file) => read(`supabase/migrations/${file}`))
    .join("\n");

  assert.match(
    migrationHistory,
    /CREATE TABLE(?: IF NOT EXISTS)? public\.daily_crew_submission_roles[\s\S]*?FOREIGN KEY \(submission_id, mission_id\)[\s\S]*?REFERENCES public\.daily_crew_submissions\(id, mission_id\)[\s\S]*?ON DELETE CASCADE/i,
  );
  assert.match(
    migrationHistory,
    /CREATE TABLE(?: IF NOT EXISTS)? public\.grand_line_guess_attempts[\s\S]*?puzzle_id uuid NOT NULL REFERENCES public\.grand_line_guess_daily_puzzles\(id\) ON DELETE CASCADE/i,
  );
  assert.match(
    migrationHistory,
    /CREATE TABLE(?: IF NOT EXISTS)? public\.grand_line_guess_results[\s\S]*?puzzle_id uuid NOT NULL REFERENCES public\.grand_line_guess_daily_puzzles\(id\) ON DELETE CASCADE/i,
  );
});
