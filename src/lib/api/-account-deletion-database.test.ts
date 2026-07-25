/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

const migrationPath = "supabase/migrations/20260724050000_harden_self_service_account_deletion.sql";
const migration = read(migrationPath);
const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations")).filter((file) =>
  file.endsWith(".sql"),
);

test("self-service deletion adds exactly one forward migration", () => {
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
});

test("migration contains no data deletion, backfill, tombstone, or public deletion RPC", () => {
  const executable = migration.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /\bDELETE\s+FROM\b|\bUPDATE\s+public\./i);
  assert.doesNotMatch(executable, /\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(executable, /deleted_user|tombstone|soft_delete/i);
  assert.doesNotMatch(executable, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\..*delete/i);
  assert.doesNotMatch(executable, /GRANT\s+(?:DELETE|ALL).*TO\s+(?:anon|authenticated|PUBLIC)/i);
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
