# Account Lifecycle Database Runbook

Migrations are the source of truth for account signup, public identity,
onboarding, and account deletion behavior.

Direct production SQL is emergency-only. Any emergency SQL repair must be
followed by a reviewed forward migration and a regression test that proves the
repair replays from a clean database.

## Local Verification

Database replay requires Docker and the Supabase CLI.

```bash
supabase start
supabase db reset
supabase test db
```

Stop the local stack after testing:

```bash
supabase stop --no-backup
```

Never run a linked `supabase db reset` against production.

## Migration History Checks

Use local migration files as the reviewed source of truth:

```bash
ls supabase/migrations
```

When comparing a local checkout with a remote project, use read-only migration
history commands and confirm the linked project before taking any action. If
remote history differs from the repository, stop and reconcile with a forward
migration instead of editing historical migrations.

## Production Smoke Tests

After an account-lifecycle migration is applied through the approved production
process, run these smoke checks:

- Create a new email/password account with an explicit valid username.
- Confirm the new profile appears with the requested public identity.
- Confirm an onboarding progress row exists and the stock tutorial/page-tip
  offer appears according to the expected new-user state.
- Confirm Replay Page Tips can reset completed page tips.
- Delete a disposable test account through the self-service profile flow.
- Confirm the deleted account cannot sign in.
- Confirm account-owned profile and onboarding data are gone.
- Confirm shared pricing records, if any existed, were preserved with deleted
  audit actors anonymized.

## Emergency Repair Policy

- Production SQL repairs must be as narrow as possible and count/report their
  effect.
- Never delete wallets, holdings, transactions, prices, rewards, rankings, game
  progress, or achievements as part of an identity/onboarding repair.
- Every production repair gets a matching forward migration.
- Every repair migration gets an executable database test.
- Historical migrations that may already have been applied are not edited.
