/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  ACCOUNT_DELETION_RECENT_AUTH_MS,
  accountDeletionMessageForCode,
  getAccountDeletionReauthenticationState,
  isExactAccountDeletionConfirmation,
} from "./security.ts";

const nowMs = Date.UTC(2026, 6, 24, 12, 0, 0);
const recentTimestampSeconds = Math.floor((nowMs - ACCOUNT_DELETION_RECENT_AUTH_MS + 1_000) / 1000);
const staleTimestampSeconds = Math.floor((nowMs - ACCOUNT_DELETION_RECENT_AUTH_MS - 1_000) / 1000);
const excessiveFutureTimestampSeconds = Math.floor((nowMs + 120_000) / 1000);

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

const nonPrimaryAuthenticationMethods = [
  "token_refresh",
  "email/signup",
  "recovery",
  "magiclink",
  "invite",
  "otp",
  "totp",
  "email_change",
  "anonymous",
  "some_future_method",
] as const;

for (const method of nonPrimaryAuthenticationMethods) {
  test(`recent ${method} AMR does not authorize account deletion`, () => {
    const result = getAccountDeletionReauthenticationState(
      {
        amr: [{ method, timestamp: recentTimestampSeconds }],
        app_metadata: { provider: "email" },
      },
      nowMs,
    );

    assert.equal(result.requiresReauthentication, true);
  });
}

test("stale password plus recent token_refresh still requires reauthentication", () => {
  const result = getAccountDeletionReauthenticationState(
    {
      amr: [
        { method: "password", timestamp: staleTimestampSeconds },
        { method: "token_refresh", timestamp: recentTimestampSeconds },
      ],
    },
    nowMs,
  );

  assert.equal(result.requiresReauthentication, true);
});

test("stale OAuth plus recent token_refresh still requires reauthentication", () => {
  const result = getAccountDeletionReauthenticationState(
    {
      amr: [
        { method: "oauth", provider: "google", timestamp: staleTimestampSeconds },
        { method: "token_refresh", provider: "google", timestamp: recentTimestampSeconds },
      ],
    },
    nowMs,
  );

  assert.equal(result.requiresReauthentication, true);
});

test("recent password plus recent token_refresh allows account deletion", () => {
  const result = getAccountDeletionReauthenticationState(
    {
      amr: [
        { method: "password", timestamp: recentTimestampSeconds },
        { method: "token_refresh", timestamp: recentTimestampSeconds },
      ],
    },
    nowMs,
  );

  assert.equal(result.requiresReauthentication, false);
});

test("recent OAuth plus recent token_refresh allows account deletion", () => {
  const result = getAccountDeletionReauthenticationState(
    {
      amr: [
        { method: "oauth", provider: "google", timestamp: recentTimestampSeconds },
        { method: "token_refresh", provider: "google", timestamp: recentTimestampSeconds },
      ],
    },
    nowMs,
  );

  assert.equal(result.requiresReauthentication, false);
});

test("stale, missing, timestamp-free, or excessively future-dated AMR fails safely", () => {
  const invalidClaims = [
    { amr: [{ method: "password", timestamp: staleTimestampSeconds }] },
    { amr: [{ method: "oauth" }] },
    { app_metadata: { provider: "email" } },
    { amr: [{ method: "password", timestamp: excessiveFutureTimestampSeconds }] },
    null,
  ];

  for (const claims of invalidClaims) {
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

test("storage ownership check failure has a safe user-facing message", () => {
  assert.equal(
    accountDeletionMessageForCode("ACCOUNT_STORAGE_CHECK_FAILED"),
    "Could not verify uploaded-file ownership. Please refresh and try again.",
  );
});
