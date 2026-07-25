/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_DELETION_REASON_CODES,
  accountDeletionMessageForCode,
  extractAccountDeletionReasonCode,
  isExactAccountDeletionConfirmation,
} from "./security.ts";

test("account deletion confirmation requires the exact current username twice", () => {
  assert.equal(isExactAccountDeletionConfirmation("luffy", "luffy", "luffy"), true);

  for (const [usernameInput, confirmationInput] of [
    ["zoro", "luffy"],
    ["luffy", "zoro"],
    ["zoro", "zoro"],
    ["Luffy", "Luffy"],
    [" luffy", "luffy"],
    ["luffy", "luffy "],
    ["", "luffy"],
    ["luffy", ""],
  ] as const) {
    assert.equal(
      isExactAccountDeletionConfirmation("luffy", usernameInput, confirmationInput),
      false,
      `${JSON.stringify([usernameInput, confirmationInput])} should not confirm deletion`,
    );
  }
});

test("account deletion reason codes no longer include reauth or storage preflight failures", () => {
  assert.deepEqual(ACCOUNT_DELETION_REASON_CODES, [
    "LAST_ADMIN_ACCOUNT",
    "ACCOUNT_STORAGE_BLOCKED",
    "ACCOUNT_CONFIRMATION_MISMATCH",
    "ACCOUNT_PROFILE_NOT_FOUND",
    "ACCOUNT_DELETION_FAILED",
  ]);
  assert.equal(
    ACCOUNT_DELETION_REASON_CODES.includes("ACCOUNT_STORAGE_CHECK_FAILED" as never),
    false,
  );
  assert.equal(ACCOUNT_DELETION_REASON_CODES.includes("REAUTHENTICATION_REQUIRED" as never), false);
});

test("account deletion error messages stay safe and user-facing", () => {
  assert.equal(
    accountDeletionMessageForCode("LAST_ADMIN_ACCOUNT"),
    "This is the final administrator account. Assign another administrator before deleting it.",
  );
  assert.equal(
    accountDeletionMessageForCode("ACCOUNT_STORAGE_BLOCKED"),
    "This account owns uploaded files that must be removed before deletion. Contact an administrator.",
  );
  assert.equal(
    accountDeletionMessageForCode("ACCOUNT_CONFIRMATION_MISMATCH"),
    "Enter your exact username in both confirmation fields.",
  );
  assert.equal(
    accountDeletionMessageForCode("ACCOUNT_PROFILE_NOT_FOUND"),
    "Could not confirm this account profile. Please refresh and try again.",
  );
  assert.equal(
    accountDeletionMessageForCode("ACCOUNT_DELETION_FAILED"),
    "Could not delete the account. Please try again or contact an administrator.",
  );
  assert.equal(
    accountDeletionMessageForCode(null),
    "Could not delete the account. Please try again or contact an administrator.",
  );
});

test("account deletion extracts only supported reason codes", () => {
  assert.equal(
    extractAccountDeletionReasonCode(
      new Error("ACCOUNT_STORAGE_BLOCKED: storage object ownership blocks deletion"),
    ),
    "ACCOUNT_STORAGE_BLOCKED",
  );
  assert.equal(
    extractAccountDeletionReasonCode(new Error("ACCOUNT_STORAGE_CHECK_FAILED: old code")),
    null,
  );
  assert.equal(extractAccountDeletionReasonCode(new Error("REAUTHENTICATION_REQUIRED")), null);
});
