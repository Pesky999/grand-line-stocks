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
  assert.match(profileSource, /Enter the same username again to confirm\./);
  assert.match(profileSource, /Current username:/);
  assert.match(profileSource, /Exact current username/);
  assert.match(profileSource, /Retype current username/);
  assert.match(profileSource, /Matching is case-sensitive\./);
  assert.doesNotMatch(profileSource, /Reauthenticate your account\./);
  assert.match(profileSource, /deleteUsername === username/);
  assert.match(profileSource, /deleteConfirmationUsername === username/);
  assert.match(profileSource, /deleteUsername === deleteConfirmationUsername/);
  assert.match(profileSource, /readiness\?\.canDelete === true/);
  assert.match(profileSource, /disabled=\{!finalDeletionEnabled\}/);
  assert.match(profileSource, /PERMANENTLY DELETE ACCOUNT/);
  assert.doesNotMatch(profileSource, /DELETE MY\s+ACCOUNT/);
  assert.doesNotMatch(profileSource, /ACCOUNT_DELETION_CONFIRMATION_PHRASE/);
  assert.doesNotMatch(profileSource, /deletePhrase/);
  assert.doesNotMatch(profileSource, /Confirmation phrase/);
  assert.doesNotMatch(profileSource, /autoFocus/);
  assert.doesNotMatch(profileSource, /<form|onSubmit/);
});

test("account deletion UI no longer performs explicit reauthentication", () => {
  assert.doesNotMatch(profileSource, /Current Password/);
  assert.doesNotMatch(profileSource, /signInWithPassword/);
  assert.doesNotMatch(profileSource, /signInWithOAuth/);
  assert.doesNotMatch(profileSource, /lovable\.auth/);
  assert.doesNotMatch(profileSource, /ACCOUNT_DELETION_INTENT_KEY/);
  assert.doesNotMatch(profileSource, /handlePasswordReauthentication/);
  assert.doesNotMatch(profileSource, /handleOAuthReauthentication/);
  assert.doesNotMatch(profileSource, /reauthenticating|requiresReauthentication|providerCategory/);
});

test("delete call sends only the exact username twice", () => {
  const deleteAccount = sourceBetween(
    profileSource,
    "async function handleDeleteAccount",
    "return (",
  );

  assert.match(deleteAccount, /deleteMyAccount\(\{[\s\S]*username: deleteUsername/);
  assert.match(deleteAccount, /confirmationUsername: deleteConfirmationUsername/);
  assert.doesNotMatch(deleteAccount, /currentPassword|password|email|provider|timestamp|userId/);
});

test("readiness and safe errors remain visible without preemptive storage warnings", () => {
  assert.match(profileSource, /getMyAccountDeletionReadiness/);
  assert.match(profileSource, /readiness\?\.isLastAdmin/);
  assert.match(profileSource, /readiness\?\.canDelete === true/);
  assert.match(
    profileSource,
    /This is the final administrator account\.[\s\S]*Assign another administrator before[\s\S]*deleting it\./,
  );
  assert.match(profileSource, /extractAccountDeletionReasonCode/);
  assert.match(profileSource, /accountDeletionMessageForCode/);
  assert.match(profileSource, /deletionError/);
  assert.doesNotMatch(profileSource, /storageBlocked|storageCheckFailed/);
  assert.doesNotMatch(
    profileSource,
    /Could not verify uploaded-file ownership\. Please refresh and try again\./,
  );
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
  assert.doesNotMatch(cleanup, /ACCOUNT_DELETION_INTENT_KEY/);
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
  assert.match(profileSource, /Help & Tutorials/);
  assert.match(profileSource, /Replay practice trade/);
  assert.match(profileSource, /validateDisplayNameFormat/);
  assert.match(profileSource, /updateProfile/);
  assert.match(profileSource, /Prestige/);
  assert.match(profileSource, /Achievements \(\{ach\.length\}\)/);
  assert.match(profileSource, /Portfolio Value/);
  assert.match(profileSource, /Positions \(\{data\.holdings\.length\}\)/);
  assert.match(profileSource, /handleSignOut/);
});
