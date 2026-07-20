# Public Identity Moderation

Berry Street public identity is made of two profile fields:

- `username`: permanent public handle used in profile URLs and mentions.
- `display_name`: editable public label shown on profile surfaces.

This package moves public identity writes behind a narrow profanity-and-slur policy and adds an
admin moderation console for review and controlled resets.

## Threat Model

The moderation layer is not a general identity trust-and-safety system. It blocks only approved
profanity and slur categories when a new username is selected or a display name is changed in the
future. Existing accounts are grandfathered, never automatically renamed, and may be flagged for
administrator review instead of mutated.

## Architecture

- Browser-safe helpers live in `src/lib/moderation/public-identity.ts`.
- Server-only policy loading lives in `src/lib/moderation/public-identity.server.ts`.
- Public username precheck and admin actions live in
  `src/lib/api/identity-moderation.functions.ts`.
- The admin console route is `/identity-moderation-admin`.
- Database safeguards are defined by
  `supabase/migrations/20260719040000_public_identity_moderation.sql`, then corrected by
  `supabase/migrations/20260720020000_restore_profile_identities.sql`.

The browser utility validates public format and returns generic messages. It does not ship the
private production lexicon. Active moderation terms are private database rows loaded only on trusted
server paths, and the enforcement path honors only approved profanity/slur categories.

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
obfuscated profanity or slurs, and they must never be rewritten into letters for the stored username.

The same incident also changed `display_name` as a side effect of username remediation when the
display name was empty or equal to the original username. That side effect did not always produce a
separate display-name audit action, so the restoration hotfix repairs both explicit display-name
actions and username-derived display-name side effects.

## Public Identity Policy

Usernames are 3-20 lowercase ASCII letters, numbers, and underscores. They must start and end with a
letter or number, cannot use consecutive underscores, and cannot change after account creation except
through the admin reset workflow.

Display names are trimmed to 1-40 characters. They allow ordinary letters, numbers, spaces, and
common punctuation, while rejecting invisible/control characters, extreme repeated characters, and
approved profanity/slur policy matches.

Reserved-name filtering, contact-information filtering, broad threat terms, harassment terms,
privacy-abuse terms, hate-group branding terms, and sexual-content-only categories are disabled by
the hotfix. Rows are kept for audit history, but inactive or non-approved categories do not block the
current enforcement path.

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
- keeps rescans flag-only without changing existing identities;
- exposes an admin reset RPC that performs its own admin-role check.

The hotfix migration
`supabase/migrations/20260720020000_restore_profile_identities.sql` corrects the canonical versus
moderation split, disables the mutating automatic remediation function, and restores identities that
were changed by the July 19 incident when the profile still contains the incident-generated value.
It also deactivates non-approved blocked/reserved categories and makes the evaluator enforce only:

- `common_profanity`
- `severe_profanity`
- `racial_ethnic_slur`
- `religious_slur`
- `nationality_slur`
- `sex_gender_slur`
- `sexual_orientation_slur`
- `disability_slur`

The latest signup side effects are preserved: profile creation still occurs in `handle_new_user()`,
and wallet creation still inserts only `user_id`, so the current database default supplies the
starting Berry balance.

## Signup And Profile Editing

Email/password signup now requires a username. The UI validates basic format and calls the server
precheck before creating the account. Invalid usernames are rejected as submitted instead of being
silently rewritten.

Google/OAuth signup still works. If provider metadata cannot safely become a public username because
it is malformed, duplicated, or matches the active profanity/slur policy, the database trigger
assigns a safe fallback handle. Legitimate provider-derived digits are preserved.

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

The original migration seeded a private core English policy across broader categories. The hotfix
narrows active enforcement to approved profanity and slur categories only. Reserved names,
contact-info markers, threat, hate-group, harassment, privacy-abuse, and sexual-content-only rows are
left in the private tables for history but deactivated or ignored by the enforcement predicate.

Admins can add supplemental allowlist entries and supplemental blocked entries only for approved
profanity/slur categories. Core rules cannot be deactivated from the admin UI. Allowlist rules apply
only to a complete normalized identity; they do not globally allow prohibited substrings inside
arbitrary names.

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
the replacement value under the current new-identity policy.

## Incident Restoration

The restoration migration uses `identity_moderation_actions` audit history as its source of truth.
It considers the earliest July 19 `auto_remediate` action for each affected profile and field. The
audit row's `previous_value` is the exact pre-incident identity and the row's `new_value` is the
incident-generated replacement.

Username restoration writes the exact audit-sourced `previous_value` back only when the current
username still equals the generated `new_value`, no later username admin reset or successful
incident restoration supersedes the action, and no other profile currently owns the exact original
username. The restore path does not lowercase, trim, shorten, sanitize, run current moderation, or
apply the 3-20-character new-account format policy to historical usernames.

Display-name restoration has two sources:

- explicit display-name `auto_remediate` actions;
- derived display-name side effects from username remediation, when the current display name still
  equals the generated username and no explicit display-name action is responsible for the field.

Explicit display-name actions take precedence over derived side-effect restoration. The historical
audit value is restored exactly. Later administrator resets and later successful incident
restorations supersede automatic restoration. If another profile currently owns a historical
username, the restore leaves both profiles unchanged and records a private conflict for manual
administrator review.

The incident audit history is preserved. Successful restorations add `incident_restore` action
history. Conflicts add `incident_restore_conflict` action history. The original incident actions and
flags are not deleted or rewritten.

One limitation is unavoidable: when username remediation changed a `NULL` display name or a display
name equal to the original username, the audit row does not distinguish those two historical states.
Restoring the original username as the visible display identity recovers the public-facing identity
in either case.

## Deployment Notes

The migrations are intentionally not applied by this branch. Apply them through the normal
production migration process after review. Recommended order:

1. Merge the application and migration together.
2. Apply the public identity migration if it has not already been applied.
3. Apply the restoration hotfix migration once.
4. Refresh PostgREST schema cache through the included notification.
5. Smoke-test digit-bearing signup, reserved-looking signup, contact-looking display names,
   display-name edit on a grandfathered profile, public profile reads, and the admin reset RPC.

After applying, verify:

- public profiles remain readable;
- direct authenticated profile writes are blocked;
- signup creates a profile and a wallet using the existing wallet default;
- admin reset works only for admins;
- moderation tables remain private.
- the mutating automatic remediation function is absent;
- active blocked/reserved rows outside approved profanity/slur categories are inactive;
- restoration action counts match restored identity counts;
- unresolved restore candidates have private conflict actions.

Read-only verification query outline:

```sql
select
  to_regprocedure('public.identity_username_canonical(text)') is not null as canonical_exists,
  (select allowed from public.evaluate_public_identity('wesley123', 'username') limit 1) as digit_username_allowed,
  exists (
    select 1
    from pg_trigger
    where tgname = 'enforce_public_identity_profile_trigger'
  ) as profile_trigger_exists,
  to_regprocedure('public.remediate_existing_public_identities()') is null as auto_remediation_absent,
  has_function_privilege('anon', 'public.restore_public_identity_remediation_incident()', 'execute') as anon_can_restore,
  has_function_privilege('authenticated', 'public.restore_public_identity_remediation_incident()', 'execute') as authenticated_can_restore,
  has_function_privilege('service_role', 'public.restore_public_identity_remediation_incident()', 'execute') as service_role_can_restore,
  not exists (
    select 1
    from public.identity_moderation_terms
    where active
      and kind in ('blocked', 'reserved')
      and (
        kind = 'reserved'
        or category not in (
          'common_profanity',
          'severe_profanity',
          'racial_ethnic_slur',
          'religious_slur',
          'nationality_slur',
          'sex_gender_slur',
          'sexual_orientation_slur',
          'disability_slur'
        )
      )
  ) as non_approved_categories_inactive,
  exists (
    select 1
    from public.identity_moderation_terms
    where active
      and kind = 'blocked'
      and category in (
        'common_profanity',
        'severe_profanity',
        'racial_ethnic_slur',
        'religious_slur',
        'nationality_slur',
        'sex_gender_slur',
        'sexual_orientation_slur',
        'disability_slur'
      )
  ) as approved_categories_active,
  not has_table_privilege('authenticated', 'public.profiles', 'insert') as authenticated_profile_insert_revoked,
  not has_table_privilege('authenticated', 'public.profiles', 'update') as authenticated_profile_update_revoked,
  has_table_privilege('anon', 'public.profiles', 'select') as public_profile_reads_available,
  (
    select count(*)
    from public.identity_moderation_actions
    where action_type = 'incident_restore'
  ) as incident_restore_actions,
  (
    select count(*)
    from public.identity_moderation_actions
    where action_type = 'incident_restore_conflict'
  ) as incident_restore_conflicts;
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
