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
const adminClientSource = read("src/integrations/supabase/client.server.ts");
const serverSecretSource = read("src/integrations/supabase/server-secret.server.ts");

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

test("readiness reports only final-admin deletion blocking state", () => {
  const readinessType = sourceBetween(
    source,
    "type AccountDeletionReadiness",
    "type AuthDeletionErrorLike",
  );
  const readiness = sourceBetween(
    source,
    "async function getReadinessForUser",
    "export const getMyAccountDeletionReadiness",
  );
  const handler = sourceBetween(
    source,
    "export const getMyAccountDeletionReadiness",
    "export const deleteMyAccount",
  );

  assert.match(readinessType, /canDelete: boolean/);
  assert.match(readinessType, /available: boolean/);
  assert.match(readinessType, /isAdmin: boolean \| null/);
  assert.match(readinessType, /isLastAdmin: boolean \| null/);
  assert.match(readinessType, /reasonCode: AccountDeletionReasonCode \| null/);
  assert.doesNotMatch(
    readinessType,
    /requiresReauthentication|providerCategory|storageBlocked|storageCheckFailed/,
  );
  assert.match(readiness, /const adminState = await getAdminDeletionState\(db, userId\)/);
  assert.match(readiness, /adminState\.isLastAdmin[\s\S]*\? "LAST_ADMIN_ACCOUNT"[\s\S]*: null/);
  assert.match(readiness, /available: true/);
  assert.match(readiness, /canDelete: reasonCode === null/);
  assert.match(handler, /return await getReadinessForUser\(db, context\.userId\)/);
  assert.doesNotMatch(handler, /context\.supabase|context\.claims/);
});

test("readiness fails closed when server configuration or verification is unavailable", () => {
  const unavailable = sourceBetween(
    source,
    "function unavailableAccountDeletionReadiness",
    "async function readCurrentProfileUsername",
  );
  const handler = sourceBetween(
    source,
    "export const getMyAccountDeletionReadiness",
    "export const deleteMyAccount",
  );

  assert.match(unavailable, /available: false/);
  assert.match(unavailable, /canDelete: false/);
  assert.match(unavailable, /isAdmin: null/);
  assert.match(unavailable, /isLastAdmin: null/);
  assert.match(handler, /try \{/);
  assert.match(handler, /catch \{/);
  assert.match(handler, /code: "ACCOUNT_DELETION_READINESS_UNAVAILABLE"/);
  assert.match(handler, /return unavailableAccountDeletionReadiness\(\)/);
  assert.doesNotMatch(handler, /error\.message|console\.(?:log|info|warn)\(/);
});

test("missing admin configuration names accepted server-only variables without leaking values", () => {
  assert.match(serverSecretSource, /BERRY_STREET_SUPABASE_SERVER_SECRET/);
  assert.match(serverSecretSource, /SUPABASE_SECRET_KEY/);
  assert.match(serverSecretSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(serverSecretSource, /Accepted server secret variables, in priority order/);
  assert.doesNotMatch(adminClientSource + serverSecretSource, /console\.(?:log|info|warn|error)\(/);
  assert.doesNotMatch(adminClientSource + serverSecretSource, /VITE_.*(?:SECRET|SERVICE_ROLE)/);
});

test("deleteMyAccount accepts only exact double-username confirmation input", () => {
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
  assert.match(schema, /confirmationUsername: z\.string\(\)\.min\(1\)/);
  assert.match(schema, /\.strict\(\)/);
  assert.doesNotMatch(
    schema,
    /confirmationPhrase|userId|email|password|provider|timestamp|force|admin/,
  );
  assert.match(deleteFunction, /readCurrentProfileUsername\(db, context\.userId\)/);
  assert.match(deleteFunction, /data\.username !== currentUsername/);
  assert.match(deleteFunction, /data\.confirmationUsername !== currentUsername/);
  assert.match(deleteFunction, /data\.username !== data\.confirmationUsername/);
  assert.match(deleteFunction, /ACCOUNT_CONFIRMATION_MISMATCH/);
  assert.doesNotMatch(
    deleteFunction,
    /ACCOUNT_DELETION_CONFIRMATION_PHRASE|confirmationPhrase|trim\(\)|toLowerCase\(\)/,
  );
});

test("deleteMyAccount checks final admin immediately before hard auth deletion", () => {
  const deleteFunction = sourceBetween(
    source,
    "export const deleteMyAccount",
    "return { deleted: true } as const;",
  );

  const usernameIndex = deleteFunction.indexOf("readCurrentProfileUsername(db, context.userId)");
  const confirmationIndex = deleteFunction.indexOf("ACCOUNT_CONFIRMATION_MISMATCH");
  const adminIndex = deleteFunction.indexOf("getAdminDeletionState(db, context.userId)");
  const authDeleteIndex = deleteFunction.indexOf("db.auth.admin.deleteUser(context.userId, false)");

  assert.ok(usernameIndex > -1, "current username should be read server-side");
  assert.ok(confirmationIndex > usernameIndex, "exact confirmation should follow profile lookup");
  assert.ok(adminIndex > confirmationIndex, "final-admin check should follow confirmation");
  assert.ok(
    authDeleteIndex > adminIndex,
    "Auth deletion should happen only after final-admin check",
  );
  assert.match(deleteFunction, /LAST_ADMIN_ACCOUNT/);
  assert.match(deleteFunction, /deleteUser\(context\.userId, false\)/);
  assert.doesNotMatch(deleteFunction, /REAUTHENTICATION_REQUIRED/);
  assert.doesNotMatch(deleteFunction, /checkAccountStorageOwnership|ACCOUNT_STORAGE_CHECK_FAILED/);
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
    "async function getReadinessForUser",
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

test("runtime code no longer performs custom storage ownership preflight", () => {
  assert.doesNotMatch(source, /my_account_owns_storage_objects/);
  assert.doesNotMatch(source, /checkAccountStorageOwnership/);
  assert.doesNotMatch(source, /\.schema\("storage"\)\.from\("objects"\)/);
  assert.doesNotMatch(source, /\.from\("objects"\)[\s\S]*owner_id/);
  assert.doesNotMatch(source, /storageBlocked|storageCheckFailed|ACCOUNT_STORAGE_CHECK_FAILED/);
});

test("Auth deletion storage ownership errors are mapped conservatively after deleteUser fails", () => {
  const mapper = sourceBetween(
    source,
    "function isStorageOwnershipDeletionError",
    "function logAccountDeletionFailure",
  );
  const deleteFunction = sourceBetween(
    source,
    "export const deleteMyAccount",
    "return { deleted: true } as const;",
  );

  assert.match(mapper, /candidate\.code/);
  assert.match(mapper, /candidate\.message/);
  assert.match(mapper, /candidate\.status/);
  assert.match(mapper, /haystack\.includes\("storage"\)/);
  assert.match(mapper, /haystack\.includes\("object"\)/);
  assert.match(mapper, /haystack\.includes\("owner"\)/);
  assert.match(mapper, /haystack\.includes\("ownership"\)/);
  assert.doesNotMatch(mapper, /bucket|name|path|metadata|userId|email|username/);
  assert.match(deleteFunction, /const \{ error \} = await db\.auth\.admin\.deleteUser/);
  assert.match(deleteFunction, /isStorageOwnershipDeletionError\(error\)/);
  assert.match(deleteFunction, /\? "ACCOUNT_STORAGE_BLOCKED"[\s\S]*: "ACCOUNT_DELETION_FAILED"/);
  assert.match(deleteFunction, /logAccountDeletionFailure\("auth_delete", code\)/);
  assert.match(deleteFunction, /throw new AccountDeletionError\(code\)/);
});

test("bounded server logs avoid personal data and raw Auth errors", () => {
  const logger = sourceBetween(
    source,
    "function logAccountDeletionFailure",
    "async function readCurrentProfileUsername",
  );

  assert.match(logger, /console\.error/);
  assert.match(logger, /\{ stage, code \}/);
  assert.doesNotMatch(logger, /userId|email|username|password|token|confirmation|storage/);
  assert.doesNotMatch(
    source,
    /console\.(?:log|info|warn|error)\([^)]*(?:currentUsername|data\.username|data\.confirmationUsername|data\.confirmationPhrase|context\.userId|data\.email|password|error)/,
  );
});
