# Stock Trading Onboarding

Berry Street includes an optional onboarding flow for the stock-trading loop. It is designed to
help new players understand browsing, buying, holding, and selling without changing any real player
state.

## First-Login Behavior

New accounts receive a `user_onboarding_progress` row when their profile is created.

Defaults for brand-new accounts:

- `stock_tutorial_version`: `1`
- `stock_tutorial_status`: `not_started`
- `stock_tutorial_offer`: `first_login`
- `stock_tutorial_last_step`: `0`
- `page_tips_disabled`: `false`
- `page_tip_versions`: `{}`

The shared shell redirects first-login users to `/onboarding` only when onboarding state can be read
successfully. If the read fails, the app fails open and normal browsing continues.

## Existing-Account Classification

The migration backfills current profiles exactly once.

- Existing accounts with at least one row in `public.transactions` receive `stock_tutorial_offer =
none` and `page_tips_disabled = true`.
- Existing accounts with no transaction rows receive `stock_tutorial_offer = soft` and
  `page_tips_disabled = false`.

The backfill emits a count-only notice for traded accounts, no-trade accounts, and total inserted
onboarding rows. It does not print usernames, emails, or IDs.

## Soft Offer Behavior

Soft-offer accounts are not redirected. They see an optional practice card on Portfolio. The card can
start, resume, restart, or skip the tutorial. Portfolio page tips are suppressed while that practice
card is visible so users do not see overlapping coaching.

## Practice Constants

The sandbox practice listing is deterministic:

- Listing: `Practice Listing`
- Symbol: `DEMO`
- Initial wallet: Berry symbol U+0E3F `5,000`
- Investment: Berry symbol U+0E3F `1,000`
- Buy price: Berry symbol U+0E3F `100`
- Shares purchased: `10`
- Balance after buy: Berry symbol U+0E3F `4,000`
- New price: Berry symbol U+0E3F `105`
- Position value: Berry symbol U+0E3F `1,050`
- Unrealized profit/loss: `+` Berry symbol U+0E3F `50`
- Sale proceeds: Berry symbol U+0E3F `1,050`
- Realized profit/loss: `+` Berry symbol U+0E3F `50`

## Practice Steps

1. `step_1`: Understand a stock.
2. `step_2`: Place a buy.
3. `step_3`: Review the order.
4. `step_4`: Portfolio movement.
5. `step_5`: Sell.

The tutorial is local practice only. It does not call `buyShares`, `sellShares`, or
`execute_trade_authenticated`.

## Status Behavior

- Start: moves `not_started` or `skipped` to `in_progress`, sets last step to `1`, clears
  `skipped_at`, and sets offer to `none`.
- Resume: continues from the saved last step.
- Restart: resets last step to `1` while preserving the original `started_at`.
- Exit tutorial: sets only a same-session bypass so users are not redirected again in that browser
  session.
- Skip: sets status to `skipped`, sets `skipped_at`, and disables future tutorial auto-offers.
- Complete: sets status to `completed`, last step to `5`, and `completed_at`.
- Replay after completion: runs locally, records `stock_tutorial_replayed`, and does not rewrite
  completion progress.

## Contextual Page Tips

Page tips are versioned with `PAGE_TIP_VERSION = 1`.

Current page-tip IDs:

- `market.overview`
- `portfolio.overview`
- `portfolio.pnl`
- `market_bulletin.overview`
- `ranks.overview`
- `games.overview`
- `legacy.overview`
- `profile.overview`

Users can dismiss one tip, move through tips, close a visible tip locally, skip all tips, or replay
tips from Profile.

## Analytics Events

Events are lightweight and best-effort. They store tutorial context only and never store email,
username, display name, character slug, share quantity, trade price, trade value, wallet balance,
storage data, or account-deletion data.

Approved event names:

- `onboarding_offer_seen`
- `stock_tutorial_started`
- `stock_tutorial_step_completed`
- `stock_tutorial_skipped`
- `stock_tutorial_completed`
- `stock_tutorial_replayed`
- `first_live_trade_started`
- `first_live_trade_completed`
- `page_tip_seen`
- `page_tip_completed`
- `page_tips_skipped`

First live trade events are recorded from the trusted server path before the first real buy/sell
attempt and after the first successful buy/sell. Analytics failures are swallowed after bounded
logging and never affect trading.

## Database Security

- RLS is enabled on onboarding tables.
- Authenticated users may select only their own progress row.
- Browser roles cannot directly insert, update, or delete progress rows.
- Browser roles cannot access onboarding events.
- Trusted server functions use the service-role client for writes.
- SECURITY DEFINER functions use `search_path = pg_catalog, public, pg_temp`.

## Fail-Open Behavior

If onboarding reads fail, the app does not redirect or block Market, Portfolio, Profile, or trading.
If onboarding writes fail, the UI shows a tutorial-specific error and does not claim success.
If a progress row is unexpectedly missing, the server recreates a soft-offer row and never restores
the first-login redirect gate from that recovery path.

## Accessibility

The tutorial uses normal buttons and links, has no automatic timers, keeps an Exit Tutorial action
available throughout the practice sequence, and moves focus to the current step heading after step
changes. Page coaching uses a labeled region with close, next, got-it, and skip controls.

## No Reward

Tutorial completion grants no Berries, no achievements, no reputation, and no progression. The
practice sequence cannot mutate wallets, holdings, transactions, prices, rewards, rankings, or game
state.

## Deployment Order

The application can be deployed before or after the migration. Before the migration exists, onboarding
reads fail open and normal app use continues. The migration must still be applied before onboarding
state persists.

## Manual Smoke-Test Checklist

1. Create a fresh account.
2. Confirm the first-login welcome appears.
3. Complete the full practice trade.
4. Verify the real wallet is unchanged.
5. Verify real holdings are unchanged.
6. Verify transactions are unchanged.
7. Verify statistics, achievements, reputation, and ranks are unchanged.
8. Skip from the welcome screen.
9. Resume an in-progress tutorial in a new browser session.
10. Exit and confirm no same-session redirect loop.
11. Replay after completion.
12. Verify the original completion timestamp is preserved.
13. Verify existing traded accounts are not interrupted.
14. Verify an existing no-trade account receives only the soft Portfolio card.
15. Verify page-tip Next, Got It, Close, and Skip Tips.
16. Replay page tips from Profile.
17. Verify mobile and keyboard behavior.
18. Verify account deletion still uses the username twice.
19. Verify no account-deletion phrase or reauthentication returns.
20. Verify onboarding failure does not block the application.
