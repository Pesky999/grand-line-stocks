/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  canRequestEmailConfirmationResend,
  EMAIL_CONFIRMATION_RESEND_COOLDOWN_MS,
  getEmailConfirmationCooldownSeconds,
  isEmailNotConfirmedError,
  requestSignupConfirmationEmail,
} from "./email-confirmation.ts";

test("email-not-confirmed detection is specific to the confirmation failure", () => {
  assert.equal(isEmailNotConfirmedError({ code: "email_not_confirmed" }), true);
  assert.equal(isEmailNotConfirmedError(new Error("Email not confirmed")), true);
  assert.equal(isEmailNotConfirmedError(new Error("Invalid login credentials")), false);
  assert.equal(isEmailNotConfirmedError(null), false);
});

test("successful signup resend uses only the signup type and retained email", async () => {
  const calls: Array<{ type: "signup"; email: string }> = [];
  const result = await requestSignupConfirmationEmail({
    email: "  pirate@example.com  ",
    now: 1_000,
    resend: async (input) => {
      calls.push(input);
      return { error: null };
    },
  });

  assert.deepEqual(calls, [{ type: "signup", email: "pirate@example.com" }]);
  assert.deepEqual(result, {
    status: "sent",
    cooldownUntil: 1_000 + EMAIL_CONFIRMATION_RESEND_COOLDOWN_MS,
  });
});

test("resend failures and provider rate limits remain contained", async () => {
  const providerFailure = await requestSignupConfirmationEmail({
    email: "pirate@example.com",
    now: 5_000,
    resend: async () => ({ error: new Error("internal provider detail") }),
  });
  const networkFailure = await requestSignupConfirmationEmail({
    email: "pirate@example.com",
    now: 6_000,
    resend: async () => {
      throw new Error("network detail");
    },
  });
  const rateLimited = await requestSignupConfirmationEmail({
    email: "pirate@example.com",
    now: 7_000,
    resend: async () => ({
      error: { code: "over_email_send_rate_limit", status: 429 },
    }),
  });

  assert.equal(providerFailure.status, "failed");
  assert.equal(networkFailure.status, "failed");
  assert.equal(rateLimited.status, "rate_limited");
  assert.equal(providerFailure.cooldownUntil, 5_000 + EMAIL_CONFIRMATION_RESEND_COOLDOWN_MS);
  assert.equal(networkFailure.cooldownUntil, 6_000 + EMAIL_CONFIRMATION_RESEND_COOLDOWN_MS);
  assert.equal(rateLimited.cooldownUntil, 7_000 + EMAIL_CONFIRMATION_RESEND_COOLDOWN_MS);
});

test("missing email does not call Supabase or start a cooldown", async () => {
  let callCount = 0;
  const result = await requestSignupConfirmationEmail({
    email: " ",
    resend: async () => {
      callCount += 1;
      return { error: null };
    },
  });

  assert.equal(callCount, 0);
  assert.deepEqual(result, { status: "missing_email", cooldownUntil: null });
});

test("cooldown and busy state prevent repeated resend requests", async () => {
  let callCount = 0;
  const first = await requestSignupConfirmationEmail({
    email: "pirate@example.com",
    now: 10_000,
    resend: async () => {
      callCount += 1;
      return { error: null };
    },
  });

  assert.equal(
    canRequestEmailConfirmationResend({
      busy: false,
      cooldownUntil: first.cooldownUntil,
      now: 10_001,
    }),
    false,
  );
  assert.equal(
    canRequestEmailConfirmationResend({
      busy: true,
      cooldownUntil: null,
      now: 10_001,
    }),
    false,
  );
  assert.equal(getEmailConfirmationCooldownSeconds(first.cooldownUntil, 10_001), 60);
  assert.equal(
    canRequestEmailConfirmationResend({
      busy: false,
      cooldownUntil: first.cooldownUntil,
      now: 10_000 + EMAIL_CONFIRMATION_RESEND_COOLDOWN_MS,
    }),
    true,
  );
  assert.equal(callCount, 1);
});
