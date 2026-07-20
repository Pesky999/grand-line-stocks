# Public Identity Moderation

Berry Street public identity is made of two profile fields:

- `username`: permanent public handle used in profile URLs and mentions.
- `display_name`: editable public label shown on profile surfaces.

This package moves public identity writes behind shared moderation policy and adds an admin
moderation console for review and remediation.

## Threat Model

The moderation layer is aimed at public identity abuse, not account punishment. It blocks public
handles and display names that attempt profanity, hate language, sexualized terms, staff
impersonation, URLs, contact details, or deliberate obfuscation. It also protects older clients and
direct API/database attempts by enforcing the same rules in the database.

## Architecture

- Browser-safe helpers live in `src/lib/moderation/public-identity.ts`.
- Server-only policy loading lives in `src/lib/moderation/public-identity.server.ts`.
- Public username precheck and admin actions live in
  `src/lib/api/identity-moderation.functions.ts`.
- The admin console route is `/identity-moderation-admin`.
- Database safeguards are defined by
  `supabase/migrations/20260719040000_public_identity_moderation.sql`.

The browser utility validates public format and returns generic messages. It does not ship the
database policy list. Active moderation terms are private database rows loaded only on trusted
server paths.

The public username availability precheck returns only `{ available }`. It does not return the
normalized handle, matched category, rule ID, severity, or rejection reason.

## July 19, 2026 Incident Hotfix

The first production migration automatically scanned existing profiles and renamed identities that
failed the new policy. That was incorrect. Existing player usernames and display names are
grandfathered and must not be changed automatically.

The root cause was mixing two separate concepts:

- canonical username formatting, which preserves valid lowercase letters, digits, and underscores;
- moderation matching, which may compare leetspeak, separators, repeated characters, and limited
  lookalike characters to private blocked or reserved terms.

Digits are valid username characters. They are used for moderation comparisons only when looking for
obfuscated abuse, and they must never be rewritten into letters for the stored username.

## Public Identity Policy

Usernames are 3-20 lowercase ASCII letters, numbers, and underscores. They must start and end with a
letter or number, cannot use consecutive underscores, and cannot change after account creation except
through the admin reset workflow.

Display names are trimmed to 1-40 characters. They allow ordinary letters, numbers, spaces, and
common punctuation, while rejecting invisible/control characters, contact details, extreme repeated
characters, and private policy matches.

Public rejection messages stay generic. They never reveal which rule, category, or term matched.

## Normalization And Evasion

The browser and database first calculate a canonical username by applying Unicode normalization,
removing unsafe invisible/control characters, lowercasing, and trimming. This canonical formatting
preserves digits and underscores.

Moderation then compares several derived forms without changing the stored value: separator-
normalized, compact alphanumeric, repeated-character-reduced, common leetspeak substitutions, and a
limited set of common lookalike characters.

The policy uses exact, whole-word, substring, and compact-substring matching. Compact matching is
reserved for severe or deliberately obfuscated terms; short ambiguous terms use exact or word
matching to reduce false positives.

## Database Safeguards

The migration adds private moderation tables for policy terms, flags, and actions. It enables RLS,
revokes public access from `anon` and `authenticated`, and grants table access to `service_role`.

The migration also:

- replaces `handle_new_user()` while preserving wallet creation through the database default;
- validates usernames and display names before profile inserts or updates;
- makes usernames immutable except for trusted remediation paths;
- removes direct authenticated profile insert/update access;
- preserves public `profiles` reads;
- flags existing questionable profiles for admin review without changing their identities;
- exposes an admin reset RPC that performs its own admin-role check.

The hotfix migration
`supabase/migrations/20260720020000_restore_profile_identities.sql` corrects the canonical versus
moderation split, disables the mutating automatic remediation function, and restores identities that
were changed by the July 19 incident when the profile still contains the incident-generated value.

The latest signup side effects are preserved: profile creation still occurs in `handle_new_user()`,
and wallet creation still inserts only `user_id`, so the current database default supplies the
starting Berry balance.

## Signup And Profile Editing

Email/password signup now requires a username. The UI validates basic format and calls the server
precheck before creating the account. Invalid usernames are rejected as submitted instead of being
silently rewritten.

Google/OAuth signup still works. If provider metadata cannot safely become a public username, the
database trigger assigns a safe fallback handle.

The precheck is advisory rather than a reservation. Email signup rejects an explicitly unavailable
username before profile creation. If a username becomes unavailable during a concurrent signup race,
`handle_new_user()` retries bounded candidate allocation so the Auth user is not left without a
valid profile. OAuth-derived unsafe identities use a neutral fallback instead of failing the account
creation.

Display names remain editable from the profile page, but the server validates every update before
writing through the trusted path. Editing a display name does not revalidate or rewrite an unchanged
username, so grandfathered usernames do not block normal profile use. User-facing errors stay
generic.

## Core And Supplemental Rules

The migration seeds a private core English policy across reserved names, contact-info markers,
threats, hate-group identity branding, profanity, harassment, privacy abuse, slur categories, and
sexual profanity. The complete term list intentionally stays out of browser bundles and docs.

Admins can add supplemental blocked, reserved, or allowlist entries. Core rules cannot be deactivated
from the admin UI. Allowlist rules apply only to a complete normalized identity; they do not globally
allow prohibited substrings inside arbitrary names.

The admin UI can display supplemental rules and non-blocked core/reserved entries for operations, but
it does not list the protected core blocked lexicon by default. Supplemental allowlist entries are
also rejected if they would conflict with a protected core blocked or reserved rule.

## Admin Workflow

Admins can use `/identity-moderation-admin` to:

- view open public-identity flags;
- filter flags by status;
- search public profiles by username, display name, or profile ID;
- reset a profile's public identity to a safe fallback;
- add supplemental policy terms;
- review recent moderation actions;
- rescan profiles after policy changes.

The admin console route uses the existing admin check pattern. The reset RPC also checks the admin
role server-side, so route protection is not the only guard. Reset requests that would leave the
selected fields unchanged are rejected as no-ops and do not resolve flags or create action history.

Rescans are non-mutating. A rescan can create open review flags and skips duplicate active findings,
but it must never change a username or display name. Controlled admin resets continue to validate
the replacement value under the current policy.

## Incident Restoration

The restoration migration uses `identity_moderation_actions` audit history as its source of truth.
It considers the earliest July 19 `auto_remediate` action for each affected profile and field. It
restores an original value only when the current profile value still equals the recorded
incident-generated replacement.

Username restoration is skipped when the original username is now owned by another profile or no
longer matches the corrected legacy username format. Display-name restoration is skipped when a
later administrator display-name reset exists. Skipped or conflicted rows remain unchanged and are
recorded for manual review without exposing original names through public APIs.

Successful restorations add `incident_restore` action history. The original incident actions and
flags are preserved for auditability.

## Deployment Notes

The migrations are intentionally not applied by this branch. Apply them through the normal
production migration process after review. Recommended order:

1. Merge the application and migration together.
2. Apply the public identity migration if it has not already been applied.
3. Apply the restoration hotfix migration once.
4. Refresh PostgREST schema cache through the included notification.
5. Smoke-test digit-bearing signup, display-name edit on a grandfathered profile, public profile
   reads, and the admin reset RPC.

After applying, verify:

- public profiles remain readable;
- direct authenticated profile writes are blocked;
- signup creates a profile and a wallet using the existing wallet default;
- admin reset works only for admins;
- moderation tables remain private.
- the mutating automatic remediation function is absent;
- restoration action counts match restored identity counts.

Read-only verification query outline:

```sql
select
  to_regprocedure('public.identity_username_canonical(text)') is not null as canonical_exists,
  exists (
    select 1
    from pg_trigger
    where tgname = 'enforce_public_identity_profile_trigger'
  ) as profile_trigger_exists,
  to_regprocedure('public.remediate_existing_public_identities()') is null as auto_remediation_absent,
  has_function_privilege('anon', 'public.restore_public_identity_remediation_incident()', 'execute') as anon_can_restore,
  has_function_privilege('authenticated', 'public.restore_public_identity_remediation_incident()', 'execute') as authenticated_can_restore;
```

Conflict inspection should be performed only by an administrator with direct access to private
moderation action rows. Do not include original identities in public reports or dashboards.

Rollback limitation: once restored values are written, rolling back the migration file itself does
not reconstruct the incident-generated replacement values. Use the preserved action history for any
manual follow-up.

## Known Limitations

This is not a full trust-and-safety system. It does not add suspensions, appeals, user reporting,
CAPTCHA, external moderation services, chat moderation, or automated punishment. The seeded policy is
curated but still benefits from admin review over time; supplemental terms and allowlist entries are
the intended way to tune false positives and new abuse patterns after launch.

Existing identities can remain grandfathered even if they would be flagged by a future policy scan.
That is intentional; administrator review and controlled resets are the escalation path.
