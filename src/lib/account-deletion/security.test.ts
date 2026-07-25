/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  ACCOUNT_DELETION_RECENT_AUTH_MS,
  getAccountDeletionReauthenticationState,
  isExactAccountDeletionConfirmation,
} from "./security.ts";

const nowMs = Date.UTC(2026, 6, 24, 12, 0, 0);
const recentTimestampSeconds = Math.floor((nowMs - ACCOUNT_DELETION_RECENT_AUTH_MS + 1_000) / 1000);
const staleTimestampSeconds = Math.floor((nowMs - ACCOUNT_DELETION_RECENT_AUTH_MS - 1_000) / 1000);

test("recent password AMR allows account deletion reauthentication", () => {
  const result = getAccountDeletionReauthenticationState(
    {
      amr: [{ method: "password", timestamp: recentTimestampSeconds }],
      app_metadata: { provider: "email" },
    },
    nowMs,
  );

  assert.equal(result.providerCategory, "password");
  assert.equal(result.requiresReauthentication, false);
});

test("recent OAuth AMR allows account deletion reauthentication", () => {
  const result = getAccountDeletionReauthenticationState(
    {
      amr: [{ method: "oauth", provider: "google", timestamp: recentTimestampSeconds }],
      app_metadata: { provider: "google" },
    },
    nowMs,
  );

  assert.equal(result.providerCategory, "oauth");
  assert.equal(result.requiresReauthentication, false);
});

test("stale, missing, or timestamp-free AMR fails safely", () => {
  for (const claims of [
    { amr: [{ method: "password", timestamp: staleTimestampSeconds }] },
    { amr: [{ method: "oauth" }] },
    { app_metadata: { provider: "email" } },
    null,
  ]) {
    assert.equal(
      getAccountDeletionReauthenticationState(claims, nowMs).requiresReauthentication,
      true,
    );
  }
});

test("provider category can be inferred without trusting it for freshness", () => {
  assert.equal(
    getAccountDeletionReauthenticationState({ app_metadata: { provider: "email" } }, nowMs)
      .providerCategory,
    "password",
  );
  assert.equal(
    getAccountDeletionReauthenticationState({ app_metadata: { providers: ["google"] } }, nowMs)
      .providerCategory,
    "oauth",
  );
});

test("account deletion confirmation is exact and case-sensitive", () => {
  assert.equal(
    isExactAccountDeletionConfirmation("luffy", "luffy", ACCOUNT_DELETION_CONFIRMATION_PHRASE),
    true,
  );
  assert.equal(
    isExactAccountDeletionConfirmation("luffy", " Luffy ", ACCOUNT_DELETION_CONFIRMATION_PHRASE),
    false,
  );
  assert.equal(isExactAccountDeletionConfirmation("luffy", "luffy", "delete my account"), false);
  assert.equal(
    isExactAccountDeletionConfirmation(
      "luffy",
      "luffy",
      `${ACCOUNT_DELETION_CONFIRMATION_PHRASE} `,
    ),
    false,
  );
});
