# Self-Service Account Deletion

This feature lets an authenticated Berry Street player permanently delete their own account from
Profile. It is for true account deletion, not an account reset.

## User Experience

Profile includes a `DELETE ACCOUNT` danger zone near the bottom of the page. The confirmation dialog
requires all of the following:

- a recent password or OAuth reauthentication event from the current provider
- the exact current username, matched case-sensitively
- the exact phrase `DELETE MY ACCOUNT`

The final button remains disabled until both text confirmations match exactly. Leading or trailing
spaces are not accepted.

## Reauthentication

The browser can help the player reauthenticate, but the server is authoritative.

- Email/password accounts use Supabase `signInWithPassword` in the browser. The password is never
  sent to a Berry Street server function.
- Google/OAuth accounts use the existing Lovable OAuth integration and redirect back to Profile.
  Session storage stores only a non-sensitive boolean intent so the dialog can reopen after return.
- The server inspects verified JWT `amr` claims and requires a `password` or `oauth`
  authentication timestamp no older than ten minutes. Other AMR methods, including token refreshes,
  magic links, recovery, invite, OTP/TOTP, email-change, anonymous, or unknown methods, do not
  independently authorize deletion. Client timestamps, provider names, local storage, session
  storage, and user metadata are not authorization inputs.

## Server Deletion Sequence

`deleteMyAccount` accepts only `{ username, confirmationPhrase }`.

1. Authenticate the request.
2. Read the current profile username for the authenticated user.
3. Verify the username and confirmation phrase exactly.
4. Verify a fresh `password` or `oauth` AMR authentication timestamp.
5. Reject deletion if this is the final active administrator account.
6. Reject deletion if the account owns Supabase Storage objects.
7. Call the service-role Auth Admin API with `deleteUser(authenticatedUserId, false)`.
8. Return `{ deleted: true }`.

The operation does not manually delete app-owned rows before Auth deletion. If Auth deletion fails,
the account and app data remain intact.

## Last-Admin Protection

Admins can self-delete only when at least one other active Auth user still has the admin role.
Deleted or missing Auth users are not counted as active administrators. The browser cannot bypass
this because the final deletion function repeats the check.

## Storage Preflight

Berry Street does not currently expose a public user upload workflow, but deletion still performs a
trusted server-side preflight against Supabase Storage ownership. If owned objects exist, deletion is
blocked with `ACCOUNT_STORAGE_BLOCKED`. The client receives no bucket names or object paths.

Storage rows are not deleted by this feature because there is no existing app-level upload ownership
model to safely coordinate generic bucket cleanup.

## Session Cleanup

After `{ deleted: true }`, the browser:

- cancels and clears React Query caches
- attempts local Supabase sign-out
- clears the deletion intent marker
- clears local trade request IDs
- stores a one-time success marker
- performs a full navigation to `/auth`

The Auth page consumes the success marker once and shows `Account deleted successfully.`

## Ownership Inventory

### Deleted With The Auth User

These records are account-owned and should use `ON DELETE CASCADE` directly or through an owned
parent row:

| Table                            | Reference                                                 | Strategy |
| -------------------------------- | --------------------------------------------------------- | -------- |
| `profiles`                       | `id -> auth.users(id)`                                    | CASCADE  |
| `user_wallets`                   | `user_id -> auth.users(id)`                               | CASCADE  |
| `user_holdings`                  | `user_id -> auth.users(id)`                               | CASCADE  |
| `transactions`                   | `user_id -> auth.users(id)`                               | CASCADE  |
| `trivia_attempts`                | `user_id -> auth.users(id)`                               | CASCADE  |
| `user_roles`                     | `user_id -> auth.users(id)`                               | CASCADE  |
| `net_worth_snapshots`            | `user_id -> auth.users(id)`                               | CASCADE  |
| `user_stats`                     | `user_id -> auth.users(id)`                               | CASCADE  |
| `leaderboard_cache`              | `user_id -> auth.users(id)`                               | CASCADE  |
| `user_achievements`              | `user_id -> auth.users(id)`                               | CASCADE  |
| `legacy_records`                 | `user_id -> auth.users(id)`                               | CASCADE  |
| `grand_line_guess_daily_puzzles` | `user_id -> auth.users(id)`                               | CASCADE  |
| `grand_line_guess_attempts`      | `user_id -> auth.users(id)`                               | CASCADE  |
| `grand_line_guess_results`       | `user_id -> auth.users(id)`                               | CASCADE  |
| `grand_line_guess_stats`         | `user_id -> auth.users(id)`                               | CASCADE  |
| `daily_crew_submissions`         | `user_id -> auth.users(id)`                               | CASCADE  |
| `daily_crew_submission_roles`    | `submission_id -> daily_crew_submissions(id, mission_id)` | CASCADE  |
| `wallet_ledger_entries`          | `user_id -> auth.users(id)`                               | CASCADE  |
| `identity_moderation_flags`      | `profile_id -> profiles(id)`                              | CASCADE  |
| `identity_moderation_actions`    | `profile_id -> profiles(id)`                              | CASCADE  |

Deleting the profile frees the username; no public tombstone is created.

### Preserved With Anonymized Actor References

These records are shared administrative, editorial, or audit records. They remain, but actor
references are nullable so a deleted account does not block deletion or expose identity:

| Table                         | Reference                         | Strategy |
| ----------------------------- | --------------------------------- | -------- |
| `market_events`               | `created_by -> auth.users(id)`    | SET NULL |
| `identity_moderation_terms`   | `created_by -> auth.users(id)`    | SET NULL |
| `identity_moderation_flags`   | `reviewed_by -> auth.users(id)`   | SET NULL |
| `identity_moderation_actions` | `actor_user_id -> auth.users(id)` | SET NULL |
| `character_pricing_ratings`   | `created_by -> auth.users(id)`    | SET NULL |
| `character_pricing_ratings`   | `updated_by -> auth.users(id)`    | SET NULL |
| `character_pricing_ratings`   | `approved_by -> auth.users(id)`   | SET NULL |

Shared records must not publicly join back to the deleted username, display name, email, or user ID.

## Migration Behavior

`20260724050000_harden_self_service_account_deletion.sql` is a forward, transactional migration.
It changes constraints only. It does not update, delete, insert, backfill, or repair player data.

Before each changed foreign key is replaced, the migration checks for orphan references and raises a
table-specific exception if any are found.

The migration is not executed by implementation work. Apply it only through the normal reviewed
database deployment path before enabling real self-service deletion.

## Why There Is No Reset

Resetting an account would need to clear wallet, holdings, trades, cost basis, snapshots,
leaderboards, achievements, games, and public reputation without corrupting shared historical
systems. Hard deletion plus fresh signup is simpler and safer.

## Deployment Order

1. Merge the application and migration.
2. Apply the migration through the normal reviewed database path.
3. Smoke-test deletion with test accounts only.
4. Keep service-role deletion server-only.

## Manual Smoke-Test Checklist

1. Delete a non-admin email/password test account.
2. Recreate an account with the same email.
3. Reuse the deleted username.
4. Confirm wallet starts at the normal new-account amount.
5. Confirm no former holdings or transactions appear.
6. Confirm no old achievements or game progress appear.
7. Confirm stale browser tabs cannot restore the deleted account.
8. Delete an OAuth test account.
9. Confirm the last admin cannot delete itself.
10. Confirm a non-final admin can delete itself.
11. Confirm cancellation makes no changes.
12. Confirm wrong username and confirmation phrase are rejected.
13. Confirm stale authentication is rejected.
14. Confirm Storage ownership blocks deletion safely.
