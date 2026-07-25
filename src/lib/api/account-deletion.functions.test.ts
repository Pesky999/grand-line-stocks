/// <reference types="node" />

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

const source = read("src/lib/api/account-deletion.functions.ts");

test("account deletion server functions require auth and use the trusted admin client", () => {
  assert.match(
    source,
    /export const getMyAccountDeletionReadiness = createServerFn\(\{ method: "GET" \}\)/,
  );
  assert.match(source, /export const deleteMyAccount = createServerFn\(\{ method: "POST" \}\)/);
  assert.match(source, /\.middleware\(\[requireSupabaseAuth\]\)/g);
  assert.match(source, /await import\("@\/integrations\/supabase\/client\.server"\)/);
  assert.match(source, /return supabaseAdmin/);
  assert.doesNotMatch(source, /from "@\/integrations\/supabase\/client\.server"/);
});

test("deleteMyAccount accepts only exact username and confirmation phrase input", () => {
  const schema = sourceBetween(
    source,
    "const deleteMyAccountInputSchema",
    "class AccountDeletionError",
  );
  const deleteFunction = sourceBetween(
    source,
    "export const deleteMyAccount",
    "return { deleted: true } as const;",
  );

  assert.match(schema, /username: z\.string\(\)\.min\(1\)/);
  assert.match(schema, /confirmationPhrase: z\.string\(\)\.min\(1\)/);
  assert.match(schema, /\.strict\(\)/);
  assert.doesNotMatch(schema, /userId|email|password|provider|timestamp|force|admin/);
  assert.match(deleteFunction, /readCurrentProfileUsername\(db, context\.userId\)/);
  assert.match(deleteFunction, /data\.username !== currentUsername/);
  assert.match(deleteFunction, /data\.confirmationPhrase !== ACCOUNT_DELETION_CONFIRMATION_PHRASE/);
  assert.match(deleteFunction, /ACCOUNT_CONFIRMATION_MISMATCH/);
  assert.doesNotMatch(deleteFunction, /trim\(\)|toLowerCase\(\)/);
});

test("deleteMyAccount checks freshness, final admin, and storage before hard auth deletion", () => {
  const deleteFunction = sourceBetween(
    source,
    "export const deleteMyAccount",
    "return { deleted: true } as const;",
  );

  const freshnessIndex = deleteFunction.indexOf("getAccountDeletionReauthenticationState");
  const adminIndex = deleteFunction.indexOf("getAdminDeletionState(db, context.userId)");
  const storageIndex = deleteFunction.indexOf("accountOwnsStorageObjects(db, context.userId)");
  const authDeleteIndex = deleteFunction.indexOf("db.auth.admin.deleteUser(context.userId, false)");

  assert.ok(freshnessIndex > -1, "fresh AMR check should exist");
  assert.ok(adminIndex > freshnessIndex, "admin check should follow freshness");
  assert.ok(storageIndex > adminIndex, "storage preflight should follow final-admin check");
  assert.ok(authDeleteIndex > storageIndex, "Auth deletion should happen only after all checks");
  assert.match(deleteFunction, /REAUTHENTICATION_REQUIRED/);
  assert.match(deleteFunction, /LAST_ADMIN_ACCOUNT/);
  assert.match(deleteFunction, /ACCOUNT_STORAGE_BLOCKED/);
  assert.match(deleteFunction, /deleteUser\(context\.userId, false\)/);
  assert.doesNotMatch(
    deleteFunction,
    /shouldSoftDelete:\s*true|deleteUser\(context\.userId, true\)/,
  );
});

test("account deletion never accepts client identity or manually deletes app-owned rows", () => {
  const deleteFunction = sourceBetween(
    source,
    "export const deleteMyAccount",
    "return { deleted: true } as const;",
  );

  assert.doesNotMatch(deleteFunction, /data\.userId|data\.email|data\.password|data\.provider/);
  assert.doesNotMatch(
    deleteFunction,
    /\.from\("(?:profiles|user_wallets|user_holdings|transactions|user_stats|net_worth_snapshots|leaderboard_cache|user_achievements|legacy_records|wallet_ledger_entries|grand_line_guess_|daily_crew_|trivia_attempts)"\)[\s\S]*\.delete\(/,
  );
  assert.doesNotMatch(deleteFunction, /\.rpc\(".*delete|soft delete|tombstone/i);
});

test("last-admin readiness counts only active Auth users and repeats in delete path", () => {
  const adminState = sourceBetween(
    source,
    "async function getAdminDeletionState",
    "async function accountOwnsStorageObjects",
  );
  const readiness = sourceBetween(
    source,
    "async function getReadinessForUser",
    "export const getMyAccountDeletionReadiness",
  );
  const deleteFunction = sourceBetween(
    source,
    "export const deleteMyAccount",
    "return { deleted: true } as const;",
  );

  assert.match(adminState, /\.rpc\("has_role", \{/);
  assert.match(adminState, /\.from\("user_roles"\)[\s\S]*\.eq\("role", "admin"\)/);
  assert.match(adminState, /await authUserExists\(db, row\.user_id\)/);
  assert.match(adminState, /activeAdminCount <= 1/);
  assert.match(readiness, /isLastAdmin/);
  assert.match(deleteFunction, /if \(adminState\.isLastAdmin\)/);
});

test("storage ownership blocks deletion without returning paths", () => {
  const storage = sourceBetween(
    source,
    "async function accountOwnsStorageObjects",
    "async function getReadinessForUser",
  );
  const deleteFunction = sourceBetween(
    source,
    "export const deleteMyAccount",
    "return { deleted: true } as const;",
  );

  assert.match(storage, /\.schema\("storage"\)/);
  assert.match(storage, /\.from\("objects"\)/);
  assert.match(storage, /\.select\("id", \{ head: true, count: "exact" \}\)/);
  assert.match(storage, /\.eq\("owner_id", userId\)/);
  assert.match(storage, /\.eq\("owner", userId\)/);
  assert.match(storage, /ACCOUNT_STORAGE_BLOCKED/);
  assert.doesNotMatch(storage, /bucket_id|name|path|metadata|\*/);
  assert.match(deleteFunction, /if \(await accountOwnsStorageObjects\(db, context\.userId\)\)/);
});

test("bounded server logs avoid personal data", () => {
  const logger = sourceBetween(
    source,
    "function logAccountDeletionFailure",
    "async function readCurrentProfileUsername",
  );

  assert.match(logger, /console\.error/);
  assert.match(logger, /\{ stage, code \}/);
  assert.doesNotMatch(logger, /userId|email|username|password|token|confirmation|storage|berries/);
  assert.doesNotMatch(
    source,
    /console\.(?:log|info|warn|error)\([^)]*(?:currentUsername|data\.username|data\.confirmationPhrase|context\.userId|data\.email|password)/,
  );
});
