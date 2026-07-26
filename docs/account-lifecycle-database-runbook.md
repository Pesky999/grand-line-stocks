# Account Lifecycle Database Runbook

Lovable Cloud is the active hosted environment for Berry Street. Codex manages
repository changes and the migration history that records account signup,
public identity, onboarding, and account deletion behavior.

Direct Lovable SQL is emergency-only. Do not do direct database work unless the
live application is actually broken.

## Source Of Truth

- Current behavior must be represented by forward migrations in this repository.
- Historical migrations must not be edited after they are merged or applied.
- If emergency Lovable SQL is used, mirror the repair with a reviewed forward
  migration created through Codex.
- Repository contract tests should verify the migration text without requiring
  local database tooling, Lovable access, or a hosted database connection.

## Identity Policy

Public username and display-name moderation is intentionally narrow. It blocks
only explicit cuss words, explicit slurs, and clear deliberate obfuscations of
those same terms.

The policy must not block ordinary reserved-looking names, support/admin-style
terms, contact-like wording, general insults, threats, suspicious-looking text,
brand references, or harmless substrings inside normal words.

## Smoke Tests

After an account-lifecycle repair reaches Lovable Cloud through the approved
process:

- Create a disposable email/password account in Lovable with a valid available
  username.
- Confirm the profile keeps the requested public identity.
- Confirm onboarding appears for the account according to its new-user state.
- Delete a disposable non-admin account from the profile page by entering the
  exact current username twice.
- Confirm the deleted account cannot sign in.
- Confirm account-owned data no longer blocks deletion.
- Confirm shared pricing records, if any existed, remain while deleted user
  references are anonymized.

## Guardrails

- Account creation should stay simple: valid email, valid password, available
  username, username format, and the narrow cuss-word/slur check.
- Account deletion should stay simple: signed in, exact username, exact username
  repeated, then delete.
- Keep the final-active-admin deletion safeguard.
- Never delete or mutate wallets, holdings, transactions, prices, rewards,
  rankings, game progress, achievements, schedules, or unrelated product data as
  part of an identity/onboarding repair.
