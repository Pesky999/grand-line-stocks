# Self-Service Account Deletion

This feature lets an authenticated Berry Street player permanently delete their own account from
Profile. It is for true account deletion, not an account reset.

## User Experience

Profile includes a `DELETE ACCOUNT` danger zone near the bottom of the page. The confirmation dialog
requires both of the following:

- the exact current username in the first confirmation field
- the same exact current username in the second confirmation field

Both entries must match the authenticated profile username and each other. Matching is
case-sensitive. Leading or trailing spaces are not trimmed or accepted. No separate confirmation
phrase is required.

The final button remains disabled until deletion readiness is clear and both username confirmations
match exactly.

Berry Street no longer asks the player to explicitly reauthenticate inside the deletion dialog.
Supabase still requires an active authenticated session before either deletion-readiness or final
deletion server functions can run.

## Server Deletion Sequence

`deleteMyAccount` accepts only `{ username, confirmationUsername }`.

1. Authenticate the request.
2. Read the current profile username for the authenticated user.
3. Verify both username fields exactly match the current profile username.
4. Reject deletion if this is the final active administrator account.
5. Call the service-role Auth Admin API with `deleteUser(authenticatedUserId, false)`.
6. If the Auth Admin deletion error clearly indicates Supabase Storage object ownership, return
   `ACCOUNT_STORAGE_BLOCKED`.
7. Otherwise return `ACCOUNT_DELETION_FAILED` for Auth deletion errors.
8. Return `{ deleted: true }` only after Auth deletion succeeds.

The operation does not manually delete app-owned rows before Auth deletion. If Auth deletion fails,
the account and app data remain intact.

## Last-Admin Protection

Admins can self-delete only when at least one other active Auth user still has the admin role.
Deleted or missing Auth users are not counted as active administrators. The browser cannot bypass
this because the final deletion function repeats the check immediately before Auth deletion.

## Storage Ownership

Berry Street does not run a custom Storage ownership preflight during readiness checks or before the
delete attempt. This avoids falsely telling players they own uploaded files when a separate
preflight check fails because of infrastructure or schema-exposure issues.

If Supabase Auth Admin deletion itself returns an error that clearly indicates Storage object
ownership, the server maps it to `ACCOUNT_STORAGE_BLOCKED`. The browser then shows the uploaded-files
warning in the normal error area. Unrelated Auth deletion failures remain `ACCOUNT_DELETION_FAILED`.

Storage rows are never deleted through SQL by this feature. Actual file deletion must continue to use
the Storage API so object data and metadata are removed through the storage system's own lifecycle.

## Session Cleanup

After `{ deleted: true }`, the browser:

- cancels and clears React Query caches
- attempts local Supabase sign-out
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

`20260725010000_fix_account_deletion_storage_preflight.sql` added a read-only authenticated Storage
ownership RPC. The simplified application flow no longer calls this RPC, but the historical migration
remains unchanged. It does not grant direct access to `storage.objects`, alter Storage tables, or
insert, update, delete, or backfill rows.

The migrations are not executed by implementation work. Apply database changes only through the
normal reviewed database deployment path.

The double-username confirmation change is application-only and requires no new migration.

## Why There Is No Reset

Resetting an account would need to clear wallet, holdings, trades, cost basis, snapshots,
leaderboards, achievements, games, and public reputation without corrupting shared historical
systems. Hard deletion plus fresh signup is simpler and safer.

## Deployment Order

1. Merge the application and migrations.
2. Apply migrations through the normal reviewed database path.
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
12. Confirm the correct username entered twice succeeds.
13. Confirm an incorrect first username fails.
14. Confirm an incorrect second username fails.
15. Confirm different capitalization fails.
16. Confirm leading or trailing spaces fail.
17. Confirm two matching usernames that do not match the actual account fail.
18. Confirm a signed-out request cannot delete an account.
19. Confirm a Storage-ownership Auth deletion failure shows the uploaded-files warning.
