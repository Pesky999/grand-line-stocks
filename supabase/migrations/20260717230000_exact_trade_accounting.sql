BEGIN;

ALTER TABLE public.user_holdings
  ADD COLUMN IF NOT EXISTS total_cost_basis numeric;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS cost_basis numeric,
  ADD COLUMN IF NOT EXISTS realized_pnl numeric,
  ADD COLUMN IF NOT EXISTS holding_shares_before numeric,
  ADD COLUMN IF NOT EXISTS holding_shares_after numeric,
  ADD COLUMN IF NOT EXISTS holding_cost_basis_before numeric,
  ADD COLUMN IF NOT EXISTS holding_cost_basis_after numeric,
  ADD COLUMN IF NOT EXISTS holding_avg_cost_before numeric,
  ADD COLUMN IF NOT EXISTS holding_avg_cost_after numeric;

DO $exact_trade_accounting_backfill$
DECLARE
  v_tx RECORD;
  v_before_shares numeric;
  v_before_basis numeric;
  v_before_avg numeric;
  v_after_shares numeric;
  v_after_basis numeric;
  v_after_avg numeric;
  v_sold_basis numeric;
  v_realized numeric;
  v_open_missing_count integer;
  v_current_missing_count integer;
  v_share_mismatch_count integer;
  v_basis_mismatch_count integer;
  v_negative_state_count integer;
BEGIN
  CREATE TEMP TABLE exact_trade_replay_positions (
    user_id uuid NOT NULL,
    character_id uuid NOT NULL,
    shares numeric NOT NULL DEFAULT 0,
    total_cost_basis numeric NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, character_id)
  ) ON COMMIT DROP;

  FOR v_tx IN
    SELECT t.*
    FROM public.transactions t
    ORDER BY t.user_id ASC, t.character_id ASC, t.created_at ASC, t.id ASC
  LOOP
    INSERT INTO exact_trade_replay_positions (user_id, character_id)
    VALUES (v_tx.user_id, v_tx.character_id)
    ON CONFLICT (user_id, character_id) DO NOTHING;

    SELECT shares, total_cost_basis
      INTO v_before_shares, v_before_basis
    FROM exact_trade_replay_positions
    WHERE user_id = v_tx.user_id
      AND character_id = v_tx.character_id
    FOR UPDATE;

    v_before_shares := COALESCE(v_before_shares, 0);
    v_before_basis := COALESCE(v_before_basis, 0);
    v_before_avg := CASE
      WHEN v_before_shares > 0 THEN v_before_basis / v_before_shares
      ELSE 0
    END;

    IF v_tx.side = 'buy' THEN
      v_after_shares := round(v_before_shares + v_tx.shares, 2);
      v_after_basis := round(v_before_basis + v_tx.total, 2);
      v_after_avg := CASE
        WHEN v_after_shares > 0 THEN v_after_basis / v_after_shares
        ELSE 0
      END;
      v_sold_basis := NULL;
      v_realized := NULL;
    ELSIF v_tx.side = 'sell' THEN
      IF v_before_shares < v_tx.shares THEN
        RAISE EXCEPTION
          'Exact trade accounting replay failed: sell transaction % exceeds replayed shares for user %, character %',
          v_tx.id, v_tx.user_id, v_tx.character_id
          USING ERRCODE = 'P0001';
      END IF;

      IF v_before_basis <= 0 THEN
        RAISE EXCEPTION
          'Exact trade accounting replay failed: transaction % has invalid open cost basis %',
          v_tx.id, v_before_basis
          USING ERRCODE = 'P0001';
      END IF;

      v_after_shares := round(v_before_shares - v_tx.shares, 2);
      IF v_after_shares < 0 OR (v_after_shares > 0 AND v_after_shares < 0.01) THEN
        RAISE EXCEPTION
          'Exact trade accounting replay failed: transaction % leaves invalid remaining shares %',
          v_tx.id, v_after_shares
          USING ERRCODE = 'P0001';
      END IF;

      IF v_after_shares = 0 THEN
        v_sold_basis := v_before_basis;
        v_after_basis := 0;
      ELSE
        v_sold_basis := round(v_before_basis * v_tx.shares / v_before_shares, 2);
        IF v_sold_basis >= v_before_basis THEN
          v_sold_basis := v_before_basis - 0.01;
        END IF;
        v_after_basis := round(v_before_basis - v_sold_basis, 2);
      END IF;

      IF v_sold_basis < 0 OR v_after_basis < 0 OR (v_after_shares > 0 AND v_after_basis <= 0) THEN
        RAISE EXCEPTION
          'Exact trade accounting replay failed: transaction % produced negative cost basis',
          v_tx.id
          USING ERRCODE = 'P0001';
      END IF;

      v_realized := round(v_tx.total - v_sold_basis, 2);
      v_after_avg := CASE
        WHEN v_after_shares > 0 THEN v_after_basis / v_after_shares
        ELSE 0
      END;
    ELSE
      RAISE EXCEPTION
        'Exact trade accounting replay failed: transaction % has unsupported side %',
        v_tx.id, v_tx.side
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.transactions
      SET cost_basis = v_sold_basis,
          realized_pnl = v_realized,
          holding_shares_before = v_before_shares,
          holding_shares_after = v_after_shares,
          holding_cost_basis_before = v_before_basis,
          holding_cost_basis_after = v_after_basis,
          holding_avg_cost_before = v_before_avg,
          holding_avg_cost_after = v_after_avg
    WHERE id = v_tx.id;

    UPDATE exact_trade_replay_positions
      SET shares = v_after_shares,
          total_cost_basis = v_after_basis
    WHERE user_id = v_tx.user_id
      AND character_id = v_tx.character_id;
  END LOOP;

  SELECT COUNT(*)
    INTO v_negative_state_count
  FROM exact_trade_replay_positions
  WHERE shares < 0
    OR total_cost_basis < 0
    OR (shares > 0 AND total_cost_basis <= 0)
    OR (shares > 0 AND shares < 0.01)
    OR shares <> round(shares, 2)
    OR total_cost_basis <> round(total_cost_basis, 2);

  SELECT COUNT(*)
    INTO v_open_missing_count
  FROM exact_trade_replay_positions r
  LEFT JOIN public.user_holdings h
    ON h.user_id = r.user_id
   AND h.character_id = r.character_id
  WHERE r.shares > 0
    AND h.id IS NULL;

  SELECT COUNT(*)
    INTO v_current_missing_count
  FROM public.user_holdings h
  LEFT JOIN exact_trade_replay_positions r
    ON r.user_id = h.user_id
   AND r.character_id = h.character_id
   AND r.shares > 0
  WHERE r.user_id IS NULL;

  SELECT COUNT(*)
    INTO v_share_mismatch_count
  FROM exact_trade_replay_positions r
  JOIN public.user_holdings h
    ON h.user_id = r.user_id
   AND h.character_id = r.character_id
  WHERE r.shares > 0
    AND r.shares <> h.shares;

  SELECT COUNT(*)
    INTO v_basis_mismatch_count
  FROM exact_trade_replay_positions r
  JOIN public.user_holdings h
    ON h.user_id = r.user_id
   AND h.character_id = r.character_id
  WHERE r.shares > 0
    AND r.total_cost_basis <> round(h.avg_cost * h.shares, 2);

  IF v_negative_state_count > 0
    OR v_open_missing_count > 0
    OR v_current_missing_count > 0
    OR v_share_mismatch_count > 0
    OR v_basis_mismatch_count > 0 THEN
    RAISE EXCEPTION
      'Exact trade accounting reconciliation failed: negative_state=%, replay_open_missing_current=%, current_missing_replay_open=%, share_mismatch=%, basis_mismatch=%',
      v_negative_state_count,
      v_open_missing_count,
      v_current_missing_count,
      v_share_mismatch_count,
      v_basis_mismatch_count
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_holdings h
    SET total_cost_basis = r.total_cost_basis
  FROM exact_trade_replay_positions r
  WHERE h.user_id = r.user_id
    AND h.character_id = r.character_id
    AND r.shares > 0;
END;
$exact_trade_accounting_backfill$;

ALTER TABLE public.user_holdings
  ALTER COLUMN total_cost_basis SET DEFAULT 0;

UPDATE public.user_holdings
  SET total_cost_basis = COALESCE(total_cost_basis, round(avg_cost * shares, 2))
WHERE total_cost_basis IS NULL;

ALTER TABLE public.user_holdings
  ALTER COLUMN total_cost_basis SET NOT NULL;

ALTER TABLE public.transactions
  ALTER COLUMN holding_shares_before SET NOT NULL,
  ALTER COLUMN holding_shares_after SET NOT NULL,
  ALTER COLUMN holding_cost_basis_before SET NOT NULL,
  ALTER COLUMN holding_cost_basis_after SET NOT NULL,
  ALTER COLUMN holding_avg_cost_before SET NOT NULL,
  ALTER COLUMN holding_avg_cost_after SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.user_holdings
    ADD CONSTRAINT user_holdings_total_cost_basis_cents_chk
    CHECK (total_cost_basis > 0 AND total_cost_basis = round(total_cost_basis, 2)) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_accounting_snapshot_required_chk
    CHECK (
      holding_shares_before IS NOT NULL
      AND holding_shares_after IS NOT NULL
      AND holding_cost_basis_before IS NOT NULL
      AND holding_cost_basis_after IS NOT NULL
      AND holding_avg_cost_before IS NOT NULL
      AND holding_avg_cost_after IS NOT NULL
    ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_accounting_shares_valid_chk
    CHECK (
      holding_shares_before >= 0
      AND holding_shares_after >= 0
      AND holding_shares_before = round(holding_shares_before, 2)
      AND holding_shares_after = round(holding_shares_after, 2)
      AND (holding_shares_after = 0 OR holding_shares_after >= 0.01)
    ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_accounting_basis_cents_chk
    CHECK (
      holding_cost_basis_before >= 0
      AND holding_cost_basis_after >= 0
      AND holding_cost_basis_before = round(holding_cost_basis_before, 2)
      AND holding_cost_basis_after = round(holding_cost_basis_after, 2)
      AND (holding_shares_before = 0 OR holding_cost_basis_before > 0)
      AND (holding_shares_after = 0 OR holding_cost_basis_after > 0)
      AND (cost_basis IS NULL OR (cost_basis >= 0 AND cost_basis = round(cost_basis, 2)))
      AND (realized_pnl IS NULL OR realized_pnl = round(realized_pnl, 2))
    ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_accounting_side_fields_chk
    CHECK (
      (side = 'buy' AND cost_basis IS NULL AND realized_pnl IS NULL)
      OR
      (side = 'sell' AND cost_basis IS NOT NULL AND realized_pnl IS NOT NULL)
    ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_realized_pnl_matches_cost_basis_chk
    CHECK (
      side <> 'sell'
      OR realized_pnl = round(total - cost_basis, 2)
    ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.user_holdings VALIDATE CONSTRAINT user_holdings_total_cost_basis_cents_chk;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_accounting_snapshot_required_chk;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_accounting_shares_valid_chk;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_accounting_basis_cents_chk;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_accounting_side_fields_chk;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_realized_pnl_matches_cost_basis_chk;

CREATE OR REPLACE FUNCTION public.execute_trade(
  _user_id uuid,
  _slug text,
  _side text,
  _shares numeric,
  _request_id uuid
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_slug text := lower(btrim(COALESCE(_slug, '')));
  v_side text := lower(btrim(COALESCE(_side, '')));
  v_char_id uuid;
  v_price numeric;
  v_balance numeric;
  v_total numeric;
  v_held_shares numeric := 0;
  v_held_avg numeric := 0;
  v_held_basis numeric := 0;
  v_new_shares numeric;
  v_new_avg numeric;
  v_new_basis numeric;
  v_new_balance numeric;
  v_sold_basis numeric := NULL;
  v_realized numeric := NULL;
  v_existing_tx public.transactions;
  v_tx public.transactions;
  v_recent_minute_count integer;
  v_today_count integer;
  v_utc_day_start timestamptz;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required' USING ERRCODE = '22023';
  END IF;

  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'Trade request ID is required' USING ERRCODE = '22023';
  END IF;

  IF v_slug = '' THEN
    RAISE EXCEPTION 'Character slug is required' USING ERRCODE = '22023';
  END IF;

  IF v_side NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'Invalid side' USING ERRCODE = '22023';
  END IF;

  IF _shares IS NULL OR _shares::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Shares must be a finite number' USING ERRCODE = '22023';
  END IF;

  IF _shares < 0.01 OR _shares > 10000 OR _shares <> round(_shares, 2) THEN
    RAISE EXCEPTION 'Shares must be from 0.01 through 10000 with at most two decimals'
      USING ERRCODE = '22023';
  END IF;

  SELECT berries
    INTO v_balance
  FROM public.user_wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, current_price
    INTO v_char_id, v_price
  FROM public.characters
  WHERE slug = v_slug
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_price IS NULL OR v_price::text IN ('NaN', 'Infinity', '-Infinity') OR v_price <= 0 THEN
    RAISE EXCEPTION 'Character price must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_existing_tx
  FROM public.transactions
  WHERE user_id = _user_id
    AND request_id = _request_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_tx.character_id = v_char_id
      AND v_existing_tx.side = v_side
      AND v_existing_tx.shares = _shares THEN
      RETURN v_existing_tx;
    END IF;

    RAISE EXCEPTION 'Trade request ID was already used for a different trade'
      USING ERRCODE = '23505';
  END IF;

  SELECT COUNT(*)
    INTO v_recent_minute_count
  FROM public.transactions
  WHERE user_id = _user_id
    AND created_at >= now() - interval '1 minute';

  v_utc_day_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  SELECT COUNT(*)
    INTO v_today_count
  FROM public.transactions
  WHERE user_id = _user_id
    AND created_at >= v_utc_day_start;

  IF v_recent_minute_count >= 30 OR v_today_count >= 500 THEN
    RAISE EXCEPTION 'Trade limit reached. Try again later.' USING ERRCODE = 'P0001';
  END IF;

  SELECT shares, avg_cost, total_cost_basis
    INTO v_held_shares, v_held_avg, v_held_basis
  FROM public.user_holdings
  WHERE user_id = _user_id
    AND character_id = v_char_id
  FOR UPDATE;

  v_held_shares := COALESCE(v_held_shares, 0);
  v_held_avg := CASE
    WHEN v_held_shares > 0 THEN COALESCE(v_held_basis, round(v_held_avg * v_held_shares, 2)) / v_held_shares
    ELSE 0
  END;
  v_held_basis := COALESCE(v_held_basis, round(v_held_avg * v_held_shares, 2), 0);
  v_total := round(v_price * _shares, 2);

  IF v_total < 1 THEN
    RAISE EXCEPTION 'Trade value must be at least 1 Berry' USING ERRCODE = '22023';
  END IF;

  IF v_side = 'buy' THEN
    IF v_balance < v_total THEN
      RAISE EXCEPTION 'Insufficient Berries' USING ERRCODE = 'P0001';
    END IF;

    v_new_balance := v_balance - v_total;
    v_new_shares := round(v_held_shares + _shares, 2);
    v_new_basis := round(v_held_basis + v_total, 2);
    v_new_avg := CASE
      WHEN v_new_shares = 0 THEN 0
      ELSE v_new_basis / v_new_shares
    END;
  ELSE
    IF v_held_shares < _shares THEN
      RAISE EXCEPTION 'Insufficient shares' USING ERRCODE = 'P0001';
    END IF;

    IF v_held_basis <= 0 THEN
      RAISE EXCEPTION 'Invalid trade cost basis' USING ERRCODE = '22023';
    END IF;

    v_new_balance := v_balance + v_total;
    v_new_shares := round(v_held_shares - _shares, 2);

    IF v_new_shares < 0 OR (v_new_shares > 0 AND v_new_shares < 0.01) THEN
      RAISE EXCEPTION 'Invalid remaining share quantity' USING ERRCODE = '22023';
    END IF;

    IF v_new_shares = 0 THEN
      v_sold_basis := v_held_basis;
      v_new_basis := 0;
    ELSE
      v_sold_basis := round(v_held_basis * _shares / v_held_shares, 2);
      IF v_sold_basis >= v_held_basis THEN
        v_sold_basis := v_held_basis - 0.01;
      END IF;
      v_new_basis := round(v_held_basis - v_sold_basis, 2);
    END IF;

    IF v_sold_basis < 0 OR v_new_basis < 0 OR (v_new_shares > 0 AND v_new_basis <= 0) THEN
      RAISE EXCEPTION 'Invalid trade cost basis' USING ERRCODE = '22023';
    END IF;

    v_realized := round(v_total - v_sold_basis, 2);
    v_new_avg := CASE
      WHEN v_new_shares = 0 THEN 0
      ELSE v_new_basis / v_new_shares
    END;
  END IF;

  UPDATE public.user_wallets
    SET berries = v_new_balance,
        updated_at = now()
  WHERE user_id = _user_id;

  IF v_held_shares = 0 AND v_side = 'buy' THEN
    INSERT INTO public.user_holdings (user_id, character_id, shares, avg_cost, total_cost_basis)
    VALUES (_user_id, v_char_id, v_new_shares, v_new_avg, v_new_basis);
  ELSIF v_new_shares = 0 THEN
    DELETE FROM public.user_holdings
    WHERE user_id = _user_id
      AND character_id = v_char_id;
  ELSE
    UPDATE public.user_holdings
      SET shares = v_new_shares,
          avg_cost = v_new_avg,
          total_cost_basis = v_new_basis,
          updated_at = now()
    WHERE user_id = _user_id
      AND character_id = v_char_id;
  END IF;

  INSERT INTO public.transactions (
    user_id,
    character_id,
    side,
    shares,
    price,
    total,
    balance_after,
    request_id,
    cost_basis,
    realized_pnl,
    holding_shares_before,
    holding_shares_after,
    holding_cost_basis_before,
    holding_cost_basis_after,
    holding_avg_cost_before,
    holding_avg_cost_after
  )
  VALUES (
    _user_id,
    v_char_id,
    v_side,
    _shares,
    v_price,
    v_total,
    v_new_balance,
    _request_id,
    v_sold_basis,
    v_realized,
    v_held_shares,
    v_new_shares,
    v_held_basis,
    v_new_basis,
    v_held_avg,
    v_new_avg
  )
  RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_trade(uuid, text, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_trade(uuid, text, text, numeric, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.execute_trade_authenticated(
  _slug text,
  _side text,
  _shares numeric,
  _request_id uuid
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_slug text := lower(btrim(COALESCE(_slug, '')));
  v_side text := lower(btrim(COALESCE(_side, '')));
  v_tx public.transactions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'Trade request ID is required' USING ERRCODE = '22023';
  END IF;

  IF v_slug = '' THEN
    RAISE EXCEPTION 'Character slug is required' USING ERRCODE = '22023';
  END IF;

  IF v_side NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'Invalid side' USING ERRCODE = '22023';
  END IF;

  IF _shares IS NULL OR _shares::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Shares must be a finite number' USING ERRCODE = '22023';
  END IF;

  IF _shares < 0.01 OR _shares > 10000 OR _shares <> round(_shares, 2) THEN
    RAISE EXCEPTION 'Shares must be from 0.01 through 10000 with at most two decimals'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_tx
  FROM public.execute_trade(v_user, v_slug, v_side, _shares, _request_id);

  RETURN v_tx;
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_trade_authenticated(text, text, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_trade_authenticated(text, text, numeric, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalc_user_stats(_user_id uuid)
RETURNS public.user_stats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cash numeric;
  v_equity numeric;
  v_net numeric;
  v_total int;
  v_buys int;
  v_sells int;
  v_vol numeric;
  v_wins int;
  v_losses int;
  v_best numeric := 0;
  v_best_slug text;
  v_worst numeric := 0;
  v_worst_slug text;
  v_largest_val numeric := 0;
  v_largest_slug text;
  v_avg_hold numeric := 0;
  v_realized numeric := 0;
  v_spec public.investor_specialization := 'generalist';
  v_meme_pct numeric;
  v_blue_pct numeric;
  v_growth_pct numeric;
  v_spec_pct numeric;
  v_pos_count int;
  v_avg_pos numeric;
  v_event_trades int;
  v_total_buy_vol numeric;
  v_rep int;
  v_title public.investor_title := 'rookie_pirate';
  v_account_age_days int;
  v_row public.user_stats;
BEGIN
  SELECT COALESCE(berries,0) INTO v_cash FROM public.user_wallets WHERE user_id = _user_id;
  IF v_cash IS NULL THEN v_cash := 0; END IF;
  v_equity := public.user_equity(_user_id);
  v_net := v_cash + v_equity;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE side='buy'), COUNT(*) FILTER (WHERE side='sell'),
         COALESCE(SUM(total),0)
    INTO v_total, v_buys, v_sells, v_vol
    FROM public.transactions WHERE user_id = _user_id;

  SELECT COALESCE(SUM(realized_pnl), 0),
         COUNT(*) FILTER (WHERE realized_pnl > 0),
         COUNT(*) FILTER (WHERE realized_pnl < 0)
    INTO v_realized, v_wins, v_losses
    FROM public.transactions
    WHERE user_id = _user_id
      AND side = 'sell';

  SELECT t.realized_pnl, c.slug
    INTO v_best, v_best_slug
  FROM public.transactions t
  JOIN public.characters c ON c.id = t.character_id
  WHERE t.user_id = _user_id
    AND t.side = 'sell'
  ORDER BY t.realized_pnl DESC NULLS LAST, t.created_at ASC, t.id ASC
  LIMIT 1;

  SELECT t.realized_pnl, c.slug
    INTO v_worst, v_worst_slug
  FROM public.transactions t
  JOIN public.characters c ON c.id = t.character_id
  WHERE t.user_id = _user_id
    AND t.side = 'sell'
  ORDER BY t.realized_pnl ASC NULLS LAST, t.created_at ASC, t.id ASC
  LIMIT 1;

  SELECT (h.shares*c.current_price), c.slug INTO v_largest_val, v_largest_slug
  FROM public.user_holdings h JOIN public.characters c ON c.id = h.character_id
  WHERE h.user_id = _user_id ORDER BY h.shares*c.current_price DESC LIMIT 1;
  v_largest_val := COALESCE(v_largest_val, 0);

  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (s.created_at - b_first.created_at))/86400.0),0)
    INTO v_avg_hold
  FROM public.transactions s
  LEFT JOIN LATERAL (
    SELECT MIN(created_at) AS created_at FROM public.transactions b
    WHERE b.user_id=s.user_id AND b.character_id=s.character_id AND b.side='buy' AND b.created_at<s.created_at
  ) b_first ON true
  WHERE s.user_id=_user_id AND s.side='sell';

  SELECT
    COALESCE(SUM(CASE WHEN c.category='meme' THEN t.total END),0),
    COALESCE(SUM(CASE WHEN c.category='blue_chip' THEN t.total END),0),
    COALESCE(SUM(CASE WHEN c.category='growth' THEN t.total END),0),
    COALESCE(SUM(CASE WHEN c.category='speculative' THEN t.total END),0),
    COALESCE(SUM(t.total),0)
  INTO v_meme_pct, v_blue_pct, v_growth_pct, v_spec_pct, v_total_buy_vol
  FROM public.transactions t JOIN public.characters c ON c.id=t.character_id
  WHERE t.user_id=_user_id AND t.side='buy';

  SELECT COUNT(*), COALESCE(AVG(h.shares*c.current_price),0)
    INTO v_pos_count, v_avg_pos
  FROM public.user_holdings h JOIN public.characters c ON c.id=h.character_id
  WHERE h.user_id=_user_id;

  SELECT COUNT(*) INTO v_event_trades
  FROM public.transactions t
  WHERE t.user_id=_user_id
    AND EXISTS (
      SELECT 1 FROM public.market_events e
      WHERE e.published_at IS NOT NULL
        AND t.created_at BETWEEN e.published_at AND e.published_at + interval '2 hours'
    );

  IF v_total_buy_vol > 0 THEN
    IF v_meme_pct / v_total_buy_vol > 0.4 THEN v_spec := 'meme_investor';
    ELSIF v_spec_pct / v_total_buy_vol > 0.5 THEN v_spec := 'speculator';
    ELSIF v_blue_pct / v_total_buy_vol > 0.5 THEN v_spec := 'value_investor';
    ELSIF v_growth_pct / v_total_buy_vol > 0.5 THEN v_spec := 'growth_investor';
    END IF;
  END IF;
  IF v_total >= 10 AND v_event_trades::numeric / GREATEST(v_total,1) > 0.3 THEN
    v_spec := 'event_trader';
  END IF;
  IF v_avg_pos > 250000 OR v_net > 5000000 THEN v_spec := 'whale'; END IF;

  SELECT GREATEST(1, (now()::date - p.created_at::date))::int INTO v_account_age_days
  FROM public.profiles p WHERE p.id=_user_id;
  IF v_account_age_days IS NULL THEN v_account_age_days := 1; END IF;

  v_rep := LEAST(1000, GREATEST(0,
      LEAST(300, (v_net / 10000)::int)
    + LEAST(200, (v_realized / 5000)::int)
    + LEAST(150, v_total * 2)
    + LEAST(100, v_account_age_days)
    + LEAST(150, CASE WHEN (v_wins+v_losses) >= 10
        THEN (v_wins * 150 / GREATEST(v_wins+v_losses,1))
        ELSE 0 END)
    + LEAST(100, COALESCE((SELECT SUM(a.reputation_reward) FROM public.user_achievements ua JOIN public.achievements a ON a.id=ua.achievement_id WHERE ua.user_id=_user_id),0)/3)
  ));

  v_title := CASE
    WHEN v_rep >= 950 THEN 'pirate_king_investor'
    WHEN v_rep >= 850 THEN 'yonko_investor'
    WHEN v_rep >= 600 THEN 'warlord_investor'
    WHEN v_rep >= 300 THEN 'grand_line_investor'
    WHEN v_rep >= 100 THEN 'east_blue_trader'
    ELSE 'rookie_pirate'
  END::public.investor_title;

  INSERT INTO public.user_stats (
    user_id, total_trades, total_buys, total_sells, total_volume,
    realized_pnl, wins, losses, best_trade_pnl, best_trade_slug,
    worst_trade_pnl, worst_trade_slug, largest_position_value, largest_position_slug,
    avg_holding_days, current_net_worth, highest_net_worth, days_active,
    reputation_score, title, specialization, updated_at
  ) VALUES (
    _user_id, v_total, v_buys, v_sells, v_vol,
    v_realized, v_wins, v_losses, COALESCE(v_best,0), v_best_slug,
    COALESCE(v_worst,0), v_worst_slug, v_largest_val, v_largest_slug,
    v_avg_hold, v_net, v_net, v_account_age_days,
    v_rep, v_title, v_spec, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_trades = EXCLUDED.total_trades,
    total_buys = EXCLUDED.total_buys,
    total_sells = EXCLUDED.total_sells,
    total_volume = EXCLUDED.total_volume,
    realized_pnl = EXCLUDED.realized_pnl,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    best_trade_pnl = EXCLUDED.best_trade_pnl,
    best_trade_slug = EXCLUDED.best_trade_slug,
    worst_trade_pnl = EXCLUDED.worst_trade_pnl,
    worst_trade_slug = EXCLUDED.worst_trade_slug,
    largest_position_value = EXCLUDED.largest_position_value,
    largest_position_slug = EXCLUDED.largest_position_slug,
    avg_holding_days = EXCLUDED.avg_holding_days,
    current_net_worth = EXCLUDED.current_net_worth,
    highest_net_worth = GREATEST(public.user_stats.highest_net_worth, EXCLUDED.current_net_worth),
    days_active = EXCLUDED.days_active,
    reputation_score = EXCLUDED.reputation_score,
    title = EXCLUDED.title,
    specialization = EXCLUDED.specialization,
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN
    SELECT user_id FROM public.user_wallets
    UNION
    SELECT user_id FROM public.transactions
  LOOP
    PERFORM public.recalc_user_stats(v_user.user_id);
  END LOOP;

  PERFORM public.refresh_leaderboards();
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
