# Legendary Investor Completion

This pass completes the current Legendary Investor MVP. It keeps the existing
fourteen-achievement catalog, reputation formula, title enum, specialization
enum, and legacy-record templates intact.

## Achievement Catalog

The active catalog remains:

- `first_trade`
- `first_profit`
- `first_event`
- `hundred_trades`
- `hundred_k_profit`
- `streak_30`
- `millionaire`
- `top_100`
- `top_10`
- `largest_holder`
- `yonko_investor`
- `pirate_king`
- `market_prophet`
- `diamond_hands`

No achievement rows are added by this migration.

## Progression Refresh

`public.refresh_user_progression(uuid)` recalculates stats, checks achievements,
recalculates after newly granted achievements, and repeats in a bounded loop of
at most four iterations. This lets reputation from achievements apply in the
same operation, so title-based achievements such as Yonko Investor and Pirate
King Investor can unlock immediately when the new reputation total qualifies.

The function performs one final stats recalculation and then checks the existing
legacy-record rules.

## Activity Streaks

`public.record_user_daily_activity(uuid)` uses UTC calendar dates:

- Same UTC date: no streak increment.
- Previous UTC date: increment the streak by one.
- Any missed day: reset the streak to one.

The browser can only call `public.record_my_daily_activity()`, which uses
`auth.uid()` and accepts no user ID argument.

## Corrected Achievement Logic

First Market Event now unlocks when a published event exists with a
`published_at` timestamp on or after the profile creation time and no later than
the current server time.

Diamond Hands now uses the open `user_holdings.created_at` timestamp for current
positive holdings. A partial sale does not reset the holding age because the row
remains open. A complete sale followed by a later repurchase resets the clock
because the holding row is recreated.

Millionaire Pirate and rank achievements are evaluated by transaction-triggered
progression and by the daily progression pass, so price-only movement and daily
leaderboard updates can unlock them.

## Daily Schedule

The existing leaderboard refresh remains at 00:15 UTC. This pass adds
`legendary-progression-daily-refresh` at 00:20 UTC when `pg_cron` is available.
The job calls `public.refresh_all_user_progression()` and does not advance daily
activity streaks.

The migration idempotently attempts to unschedule a previous same-name job before
scheduling the replacement. If `pg_cron` is unavailable, scheduling is skipped.

## Legacy Log

Authenticated users get `/legacy-log`, which shows:

- Reputation, current title, next title, specialization, streak, and best rank.
- All fourteen achievements, including locked achievements and their criteria.
- Local filters for All, Unlocked, and Locked.
- The title ladder thresholds: 0, 100, 300, 600, 850, and 950.
- All seven dynamic specializations and their current conditions.
- Claimed first-to legacy records for the authenticated user.

The Legacy Log read function is read-only. It does not refresh progression or
write activity.

## Security and Grants

Internal progression functions are revoked from `PUBLIC`, `anon`, and
`authenticated`, and granted only to `service_role`.

`public.record_my_daily_activity()` is revoked from `PUBLIC` and `anon`, and
granted to `authenticated` and `service_role`.

All replaced `SECURITY DEFINER` functions use:

```sql
SET search_path = pg_catalog, public, pg_temp
```

## Migration Order

Apply `20260721030000_complete_legendary_investor_progression.sql` after the
existing Legendary Investor, public read RPC, starting-wallet, and exact-trade
accounting migrations.

The migration ends with a count-only `refresh_all_user_progression()` backfill.
That backfill may grant already-qualified achievements and legacy records, but
it does not write wallets, holdings, transactions, prices, game rewards, or
activity streak visits.

## Read-Only Verification

After applying in a safe environment, verify:

- `record_my_daily_activity()` is callable by authenticated users.
- Internal progression functions are not callable by `anon` or authenticated
  browser clients.
- `check_achievements(uuid)` returns the count of newly granted achievements.
- The daily cron job exists only when `pg_cron` is available.
- The Legacy Log page loads for a signed-in user.

## Rollback Notes

The migration replaces functions and may grant achievements during the one-time
backfill. Rolling back function definitions is possible with a new corrective
migration, but automatically ungranting achievements is not safe without a
separate incident-specific plan.

## Smoke Test Checklist

- Sign in and open any authenticated page once.
- Confirm the visit does not show a toast or interrupt navigation.
- Open `/legacy-log`.
- Confirm locked achievements remain visible.
- Confirm achievement count and title summary match the public profile.
- Make a small trade in a non-production environment and confirm progression
  refreshes without wallet, price, or reward side effects.

This completes the current Legendary Investor MVP. It does not add equipable
epithets, seasons, or a larger achievement expansion.
