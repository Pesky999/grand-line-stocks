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

## Public Identity Policy

Usernames are 3-20 lowercase ASCII letters, numbers, and underscores. They must start and end with a
letter or number, cannot use consecutive underscores, and cannot change after account creation except
through the admin reset workflow.

Display names are trimmed to 1-40 characters. They allow ordinary letters, numbers, spaces, and
common punctuation, while rejecting invisible/control characters, contact details, extreme repeated
characters, and private policy matches.

Public rejection messages stay generic. They never reveal which rule, category, or term matched.

## Normalization And Evasion

The browser and database compare several forms of the proposed identity without changing the stored
value: lowercase, zero-width/control stripped, separator-normalized, compact alphanumeric, repeated
characters reduced, common leetspeak substitutions, and a limited set of common lookalike characters.

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
- scans existing profiles once and safely remediates any invalid public identities;
- exposes an admin reset RPC that performs its own admin-role check.

The latest signup side effects are preserved: profile creation still occurs in `handle_new_user()`,
and wallet creation still inserts only `user_id`, so the current database default supplies the
starting Berry balance.

## Signup And Profile Editing

Email/password signup now requires a username. The UI validates basic format and calls the server
precheck before creating the account. Invalid usernames are rejected as submitted instead of being
silently rewritten.

Google/OAuth signup still works. If provider metadata cannot safely become a public username, the
database trigger assigns a safe fallback handle.

The precheck is advisory rather than a reservation. If another account claims the same handle before
the auth trigger runs, `handle_new_user()` deliberately assigns a collision-safe suffixed handle or a
neutral fallback instead of leaving an Auth user without a valid profile.

Display names remain editable from the profile page, but the server validates every update before
writing through the trusted path. User-facing errors stay generic.

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
role server-side, so route protection is not the only guard.

## Deployment Notes

The migration is intentionally not applied by this branch. Apply it through the normal production
migration process after review. Recommended order:

1. Merge the application and migration together.
2. Apply the migration once.
3. Refresh PostgREST schema cache through the included notification.
4. Smoke-test signup, display-name edit, public profile reads, and the admin reset RPC.

After applying, verify:

- public profiles remain readable;
- direct authenticated profile writes are blocked;
- signup creates a profile and a wallet using the existing wallet default;
- admin reset works only for admins;
- moderation tables remain private.

## Known Limitations

This is not a full trust-and-safety system. It does not add suspensions, appeals, user reporting,
CAPTCHA, external moderation services, chat moderation, or automated punishment. The seeded policy is
curated but still benefits from admin review over time; supplemental terms and allowlist entries are
the intended way to tune false positives and new abuse patterns after launch.
