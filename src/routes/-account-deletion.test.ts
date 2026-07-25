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

const profileSource = read("src/routes/_authenticated/profile.tsx");
const authSource = read("src/routes/auth.tsx");

test("Profile includes the self-service account deletion danger zone", () => {
  assert.match(profileSource, /DELETE ACCOUNT/);
  assert.match(
    profileSource,
    /Permanently delete your Berry Street account and all associated player data\./,
  );
  for (const item of [
    "Public profile and username",
    "Berry wallet",
    "Character holdings",
    "Trade history",
    "Cost basis and realized profit records",
    "Portfolio and net-worth snapshots",
    "Leaderboard and ranking data",
    "User statistics and reputation",
    "Achievements and Legacy progress",
    "Grand Line Guess activity",
    "Daily Crew activity",
    "Trivia activity",
    "Roles and account-specific preferences",
  ]) {
    assert.match(profileSource, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(profileSource, /This cannot be undone\./);
  assert.doesNotMatch(profileSource, /to="\/admin"|to="\/identity-moderation-admin"/);
});

test("account deletion dialog is accessible and requires exact confirmations", () => {
  assert.match(profileSource, /<Dialog[\s\S]*open=\{deleteOpen\}/);
  assert.match(profileSource, /<DialogTitle[^>]*>PERMANENT ACCOUNT DELETION<\/DialogTitle>/);
  assert.match(
    profileSource,
    /<DialogDescription>[\s\S]*This action cannot be undone\.[\s\S]*permanently removed\./,
  );
  assert.match(profileSource, /Enter your exact username\./);
  assert.match(profileSource, /Type DELETE MY ACCOUNT\./);
  assert.match(profileSource, /deleteUsername === username/);
  assert.match(profileSource, /deletePhrase === ACCOUNT_DELETION_CONFIRMATION_PHRASE/);
  assert.match(profileSource, /disabled=\{!finalDeletionEnabled\}/);
  assert.match(profileSource, /PERMANENTLY DELETE ACCOUNT/);
  assert.doesNotMatch(profileSource, /autoFocus/);
  assert.doesNotMatch(profileSource, /<form|onSubmit/);
});

test("password reauthentication stays browser-side and is never sent to the server function", () => {
  const passwordReauth = sourceBetween(
    profileSource,
    "async function handlePasswordReauthentication",
    "async function handleOAuthReauthentication",
  );
  const deleteAccount = sourceBetween(
    profileSource,
    "async function handleDeleteAccount",
    "return (",
  );

  assert.match(passwordReauth, /supabase\.auth\.signInWithPassword/);
  assert.match(passwordReauth, /email: accountEmail/);
  assert.match(passwordReauth, /password: currentPassword/);
  assert.match(passwordReauth, /Could not reauthenticate\. Check your password and try again\./);
  assert.doesNotMatch(deleteAccount, /currentPassword|password|email|provider|timestamp|userId/);
  assert.match(deleteAccount, /deleteMyAccount\(\{[\s\S]*username: deleteUsername/);
  assert.match(deleteAccount, /confirmationPhrase: deletePhrase/);
});

test("OAuth reauthentication restores intent but never auto-deletes", () => {
  const oauthReauth = sourceBetween(
    profileSource,
    "async function handleOAuthReauthentication",
    "async function handleDeleteAccount",
  );
  const intentEffect = sourceBetween(profileSource, "useEffect(() => {", "if (isLoading || !data)");

  assert.match(oauthReauth, /safeSessionSet\(ACCOUNT_DELETION_INTENT_KEY, "1"\)/);
  assert.match(oauthReauth, /lovable\.auth\.signInWithOAuth\("google"/);
  assert.match(oauthReauth, /redirect_uri: `\$\{window\.location\.origin\}\/profile`/);
  assert.match(intentEffect, /safeSessionHas\(ACCOUNT_DELETION_INTENT_KEY\)/);
  assert.match(intentEffect, /setDeleteOpen\(true\)/);
  assert.doesNotMatch(intentEffect, /deleteMyAccount|handleDeleteAccount/);
});

test("readiness warnings and safe errors are visible", () => {
  assert.match(profileSource, /getMyAccountDeletionReadiness/);
  assert.match(profileSource, /readiness\?\.isLastAdmin/);
  assert.match(profileSource, /readiness\?\.storageBlocked/);
  assert.match(profileSource, /readiness\?\.requiresReauthentication/);
  assert.match(
    profileSource,
    /This is the final administrator account\.[\s\S]*Assign another administrator before[\s\S]*deleting it\./,
  );
  assert.match(
    profileSource,
    /This account owns uploaded files that must be removed before deletion\.[\s\S]*Contact an[\s\S]*administrator\./,
  );
  assert.match(profileSource, /extractAccountDeletionReasonCode/);
  assert.match(profileSource, /accountDeletionMessageForCode/);
});

test("successful deletion clears local account state and performs full auth navigation", () => {
  const cleanup = sourceBetween(
    profileSource,
    "async function cleanupAfterConfirmedAccountDeletion",
    "function Profile()",
  );

  assert.match(cleanup, /queryClient\.cancelQueries\(\)/);
  assert.match(cleanup, /queryClient\.clear\(\)/);
  assert.match(cleanup, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(cleanup, /safeSessionRemove\(ACCOUNT_DELETION_INTENT_KEY\)/);
  assert.match(cleanup, /TRADE_REQUEST_STORAGE_PREFIX/);
  assert.match(cleanup, /safeSessionSet\(ACCOUNT_DELETION_SUCCESS_KEY, "1"\)/);
  assert.match(cleanup, /window\.location\.assign\("\/auth"\)/);
});

test("Auth page consumes the one-time account deleted success marker", () => {
  const successMarkerEffect = sourceBetween(
    authSource,
    "window.sessionStorage.getItem(ACCOUNT_DELETION_SUCCESS_KEY)",
    "  useEffect(() => {\n    supabase.auth.getUser()",
  );

  assert.match(authSource, /ACCOUNT_DELETION_SUCCESS_KEY/);
  assert.match(authSource, /window\.sessionStorage\.getItem\(ACCOUNT_DELETION_SUCCESS_KEY\)/);
  assert.match(authSource, /window\.sessionStorage\.removeItem\(ACCOUNT_DELETION_SUCCESS_KEY\)/);
  assert.match(authSource, /toast\.success\("Account deleted successfully\."\)/);
  assert.doesNotMatch(successMarkerEffect, /navigate\(/);
});

test("existing Profile functionality remains present", () => {
  assert.match(profileSource, /validateDisplayNameFormat/);
  assert.match(profileSource, /updateProfile/);
  assert.match(profileSource, /Prestige/);
  assert.match(profileSource, /Achievements \(\{ach\.length\}\)/);
  assert.match(profileSource, /Portfolio Value/);
  assert.match(profileSource, /Positions \(\{data\.holdings\.length\}\)/);
  assert.match(profileSource, /handleSignOut/);
});
