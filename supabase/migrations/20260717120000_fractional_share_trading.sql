BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_request_id_unique_idx
  ON public.transactions (user_id, request_id)
  WHERE request_id IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_shares_minimum_chk
    CHECK (shares >= 0.01) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_shares_maximum_chk
    CHECK (shares <= 10000) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_shares_two_decimal_chk
    CHECK (shares = round(shares, 2)) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.user_holdings
    ADD CONSTRAINT user_holdings_shares_positive_chk
    CHECK (shares > 0) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.user_holdings
    ADD CONSTRAINT user_holdings_shares_two_decimal_chk
    CHECK (shares = round(shares, 2)) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_shares_minimum_chk;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_shares_maximum_chk;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_shares_two_decimal_chk;
ALTER TABLE public.user_holdings VALIDATE CONSTRAINT user_holdings_shares_positive_chk;
ALTER TABLE public.user_holdings VALIDATE CONSTRAINT user_holdings_shares_two_decimal_chk;

DO $$
BEGIN
  IF to_regprocedure('public.execute_trade_authenticated(text,text,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.execute_trade_authenticated(text, text, integer)
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;

  IF to_regprocedure('public.execute_trade_authenticated(text,text,numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.execute_trade_authenticated(text, text, numeric)
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;

  IF to_regprocedure('public.execute_trade(uuid,text,text,numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.execute_trade(uuid, text, text, numeric)
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.execute_trade_authenticated(text, text, integer);
DROP FUNCTION IF EXISTS public.execute_trade_authenticated(text, text, numeric);
DROP FUNCTION IF EXISTS public.execute_trade(uuid, text, text, numeric);

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
  v_new_shares numeric;
  v_new_avg numeric;
  v_new_balance numeric;
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

  SELECT shares, avg_cost
    INTO v_held_shares, v_held_avg
  FROM public.user_holdings
  WHERE user_id = _user_id
    AND character_id = v_char_id
  FOR UPDATE;

  v_held_shares := COALESCE(v_held_shares, 0);
  v_held_avg := COALESCE(v_held_avg, 0);
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
    v_new_avg := CASE
      WHEN v_new_shares = 0 THEN 0
      ELSE ((v_held_avg * v_held_shares) + v_total) / v_new_shares
    END;
  ELSE
    IF v_held_shares < _shares THEN
      RAISE EXCEPTION 'Insufficient shares' USING ERRCODE = 'P0001';
    END IF;

    v_new_balance := v_balance + v_total;
    v_new_shares := round(v_held_shares - _shares, 2);
    v_new_avg := v_held_avg;

    IF v_new_shares < 0 OR (v_new_shares > 0 AND v_new_shares < 0.01) THEN
      RAISE EXCEPTION 'Invalid remaining share quantity' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.user_wallets
    SET berries = v_new_balance,
        updated_at = now()
  WHERE user_id = _user_id;

  IF v_held_shares = 0 AND v_side = 'buy' THEN
    INSERT INTO public.user_holdings (user_id, character_id, shares, avg_cost)
    VALUES (_user_id, v_char_id, v_new_shares, v_new_avg);
  ELSIF v_new_shares = 0 THEN
    DELETE FROM public.user_holdings
    WHERE user_id = _user_id
      AND character_id = v_char_id;
  ELSE
    UPDATE public.user_holdings
      SET shares = v_new_shares,
          avg_cost = v_new_avg,
          updated_at = now()
    WHERE user_id = _user_id
      AND character_id = v_char_id;
  END IF;

  INSERT INTO public.transactions
    (user_id, character_id, side, shares, price, total, balance_after, request_id)
  VALUES
    (_user_id, v_char_id, v_side, _shares, v_price, v_total, v_new_balance, _request_id)
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

COMMIT;

NOTIFY pgrst, 'reload schema';
