import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const authSource = readFileSync(join(process.cwd(), "src/routes/auth.tsx"), "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

test("unconfirmed password sign-in retains email and opens the resend state", () => {
  const signInBlock = sourceBetween(
    authSource,
    "const { error } = await supabase.auth.signInWithPassword",
    'toast.success("Welcome back, pirate.")',
  );

  assert.match(signInBlock, /isEmailNotConfirmedError\(error\)/);
  assert.match(signInBlock, /setConfirmationSource\("signin"\)/);
  assert.match(signInBlock, /setMode\("confirmation"\)/);
  assert.doesNotMatch(signInBlock, /setEmail\(/);
  assert.match(authSource, />Email not confirmed</);
  assert.match(authSource, /"Resend confirmation email"/);
});

test("signup without a session opens a clear confirmation-pending state", () => {
  const signupBlock = sourceBetween(
    authSource,
    'if (mode === "signup") {',
    '} else if (mode === "forgot")',
  );

  assert.match(signupBlock, /if \(data\.session\)/);
  assert.match(signupBlock, /setConfirmationSource\("signup"\)/);
  assert.match(signupBlock, /setMode\("confirmation"\)/);
  assert.doesNotMatch(signupBlock, /Check your email to confirm your account before signing in/);
  assert.match(authSource, /Your account was created and is waiting for email confirmation/);
  assert.match(authSource, /Check your inbox and spam folder/);
  assert.match(authSource, /Back to sign in/);
});

test("resend uses the browser Supabase signup resend without redirect options", () => {
  const resendBlock = sourceBetween(
    authSource,
    "async function handleResendConfirmation()",
    "async function handleGoogle()",
  );

  assert.match(
    resendBlock,
    /supabase\.auth\.resend\(\{\s*type: "signup",\s*email: resendEmail,\s*\}\)/,
  );
  assert.doesNotMatch(resendBlock, /emailRedirectTo|redirectTo|redirect_uri/);
  assert.match(
    resendBlock,
    /If an unconfirmed account exists for that email, a new confirmation message has been sent/,
  );
  assert.doesNotMatch(resendBlock, /getErrorMessage|error\.message|console\./);
});

test("resend failures stay contained and cooldown prevents repeated requests", () => {
  const resendBlock = sourceBetween(
    authSource,
    "async function handleResendConfirmation()",
    "async function handleGoogle()",
  );

  assert.match(resendBlock, /resendRequestInFlight\.current/);
  assert.match(resendBlock, /canRequestEmailConfirmationResend/);
  assert.match(resendBlock, /resendCooldownUntilRef\.current/);
  assert.match(resendBlock, /result\.status === "rate_limited"/);
  assert.match(resendBlock, /result\.status === "missing_email"/);
  assert.match(resendBlock, /emailInputRef\.current\?\.focus\(\)/);
  assert.match(resendBlock, /Check your connection and try again/);
  assert.match(authSource, /const resendDisabled = resendBusy \|\| resendCooldownSeconds > 0/);
  assert.match(authSource, /const resendButtonLabel = resendBusy/);
  assert.match(authSource, /`Resend available in \$\{resendCooldownSeconds\}s`/);
});

test("normal sign-in exposes resend without submitting a password", () => {
  const signInControls = sourceBetween(
    authSource,
    '{mode === "signin" && (',
    '{mode === "forgot" && (',
  );

  assert.match(signInControls, /Forgot password\?/);
  assert.match(signInControls, /onClick=\{handleResendConfirmation\}/);
  assert.match(signInControls, /type="button"/);
  assert.doesNotMatch(signInControls, /type="submit"|handleSubmit|signInWithPassword/);
  assert.match(signInControls, /disabled=\{resendDisabled\}/);
  assert.match(signInControls, /\{resendButtonLabel\}/);
  assert.match(authSource, /ref=\{emailInputRef\}/);
});

test("normal sign-in and confirmation state share one resend handler and cooldown", () => {
  assert.equal(authSource.match(/onClick=\{handleResendConfirmation\}/g)?.length, 2);
  assert.equal(authSource.match(/disabled=\{resendDisabled\}/g)?.length, 2);
  assert.equal(authSource.match(/\{resendButtonLabel\}/g)?.length, 2);
  assert.equal(authSource.match(/async function handleResendConfirmation\(\)/g)?.length, 1);
  assert.match(authSource, /if \(mode === "confirmation"\)/);
  assert.match(authSource, />Email not confirmed</);
  assert.match(authSource, /Check your inbox and spam folder/);
});

test("confirmed password and Google sign-in behavior remains unchanged", () => {
  const normalSignIn = sourceBetween(
    authSource,
    "const { error } = await supabase.auth.signInWithPassword",
    "async function handleResendConfirmation()",
  );
  const googleSignIn = sourceBetween(
    authSource,
    "async function handleGoogle()",
    'if (mode === "confirmation")',
  );

  assert.match(normalSignIn, /toast\.success\("Welcome back, pirate\."\)/);
  assert.match(normalSignIn, /navigate\(\{ to: "\/portfolio" \}\)/);
  assert.match(googleSignIn, /lovable\.auth\.signInWithOAuth\("google"/);
  assert.match(googleSignIn, /navigate\(\{ to: "\/portfolio" \}\)/);
});
