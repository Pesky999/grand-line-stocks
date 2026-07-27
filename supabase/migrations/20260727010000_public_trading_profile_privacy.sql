BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_trading_profile boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.public_trading_profile IS
  'Controls whether the player public profile exposes trading details. Rankings remain public for active accounts.';

CREATE OR REPLACE FUNCTION public.set_my_public_trading_profile(_is_public boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_setting boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.profiles
  SET public_trading_profile = COALESCE(_is_public, true)
  WHERE id = v_user_id
  RETURNING public_trading_profile INTO v_setting;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated profile not found' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_setting;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_investor_profile(_username text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_username text := NULLIF(btrim(COALESCE(_username, '')), '');
  v_profile record;
  v_stats jsonb := NULL;
  v_holdings jsonb := '[]'::jsonb;
  v_achievements jsonb := '[]'::jsonb;
  v_snapshots jsonb := '[]'::jsonb;
  v_cash numeric := NULL;
  v_equity numeric := NULL;
  v_net_worth numeric := NULL;
BEGIN
  IF v_username IS NULL OR length(v_username) > 64 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT
    p.id,
    p.username,
    p.display_name,
    p.created_at,
    p.public_trading_profile,
    lc.rank,
    lc.prev_rank,
    us.title,
    us.specialization
  INTO v_profile
  FROM public.profiles AS p
  LEFT JOIN public.leaderboard_cache AS lc
    ON lc.user_id = p.id
   AND lc.board_key = 'net_worth_all_time'
  LEFT JOIN public.user_stats AS us
    ON us.user_id = p.id
  WHERE p.username = v_username;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_profile.public_trading_profile IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'found', true,
      'is_public', false,
      'profile', jsonb_build_object(
        'username', v_profile.username,
        'display_name', v_profile.display_name,
        'created_at', v_profile.created_at
      ),
      'title', COALESCE(v_profile.title, 'rookie_pirate'::public.investor_title),
      'specialization', NULL,
      'rank', v_profile.rank,
      'prev_rank', v_profile.prev_rank,
      'stats', NULL,
      'cash', NULL,
      'equity', NULL,
      'net_worth', NULL,
      'holdings', '[]'::jsonb,
      'achievements', '[]'::jsonb,
      'snapshots', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(w.berries, 0)
  INTO v_cash
  FROM public.user_wallets AS w
  WHERE w.user_id = v_profile.id;

  v_cash := COALESCE(v_cash, 0);

  SELECT COALESCE(SUM(h.shares * c.current_price), 0)
  INTO v_equity
  FROM public.user_holdings AS h
  JOIN public.characters AS c ON c.id = h.character_id
  WHERE h.user_id = v_profile.id
    AND h.shares > 0;

  v_equity := COALESCE(v_equity, 0);
  v_net_worth := v_cash + v_equity;

  SELECT jsonb_build_object(
    'title', COALESCE(us.title, 'rookie_pirate'::public.investor_title),
    'specialization', COALESCE(us.specialization, 'generalist'::public.investor_specialization),
    'days_active', us.days_active,
    'reputation_score', us.reputation_score,
    'wins', us.wins,
    'losses', us.losses,
    'total_trades', us.total_trades,
    'total_buys', us.total_buys,
    'total_sells', us.total_sells,
    'total_volume', us.total_volume,
    'realized_pnl', us.realized_pnl,
    'avg_holding_days', us.avg_holding_days,
    'best_trade_slug', us.best_trade_slug,
    'best_trade_pnl', us.best_trade_pnl,
    'worst_trade_slug', us.worst_trade_slug,
    'worst_trade_pnl', us.worst_trade_pnl,
    'largest_position_slug', us.largest_position_slug,
    'largest_position_value', us.largest_position_value,
    'highest_rank', us.highest_rank,
    'current_rank', us.current_rank
  )
  INTO v_stats
  FROM public.user_stats AS us
  WHERE us.user_id = v_profile.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slug', c.slug,
        'name', c.name,
        'shares', h.shares,
        'avgCost', h.avg_cost,
        'currentPrice', c.current_price,
        'value', h.shares * c.current_price
      )
      ORDER BY h.shares * c.current_price DESC, c.slug ASC
    ),
    '[]'::jsonb
  )
  INTO v_holdings
  FROM public.user_holdings AS h
  JOIN public.characters AS c ON c.id = h.character_id
  WHERE h.user_id = v_profile.id
    AND h.shares > 0;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'unlocked_at', ua.unlocked_at,
        'achievements', jsonb_build_object(
          'code', a.code,
          'name', a.name,
          'description', a.description,
          'tier', a.tier,
          'icon', a.icon
        )
      )
      ORDER BY ua.unlocked_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_achievements
  FROM public.user_achievements AS ua
  JOIN public.achievements AS a ON a.id = ua.achievement_id
  WHERE ua.user_id = v_profile.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'snapshot_date', nws.snapshot_date,
        'net_worth', nws.net_worth,
        'return_pct', nws.return_pct
      )
      ORDER BY nws.snapshot_date ASC
    ),
    '[]'::jsonb
  )
  INTO v_snapshots
  FROM (
    SELECT snapshot_date, net_worth, return_pct
    FROM public.net_worth_snapshots
    WHERE user_id = v_profile.id
    ORDER BY snapshot_date DESC
    LIMIT 120
  ) AS nws;

  RETURN jsonb_build_object(
    'found', true,
    'is_public', true,
    'profile', jsonb_build_object(
      'username', v_profile.username,
      'display_name', v_profile.display_name,
      'created_at', v_profile.created_at
    ),
    'title', COALESCE(v_profile.title, 'rookie_pirate'::public.investor_title),
    'specialization', COALESCE(v_profile.specialization, 'generalist'::public.investor_specialization),
    'rank', v_profile.rank,
    'prev_rank', v_profile.prev_rank,
    'stats', v_stats,
    'cash', v_cash,
    'equity', v_equity,
    'net_worth', v_net_worth,
    'holdings', v_holdings,
    'achievements', v_achievements,
    'snapshots', v_snapshots
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_leaderboard(
  _board_key text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  rank integer,
  prev_rank integer,
  value numeric,
  is_public boolean,
  username text,
  display_name text,
  title public.investor_title
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_limit integer := COALESCE(_limit, 50);
  v_offset integer := COALESCE(_offset, 0);
  v_board_key text := btrim(COALESCE(_board_key, ''));
BEGIN
  IF v_board_key NOT IN (
    'net_worth_all_time',
    'return_all_time',
    'return_30d',
    'return_7d',
    'most_active',
    'most_profitable',
    'most_accurate'
  ) THEN
    RAISE EXCEPTION 'Unsupported leaderboard board: %', _board_key USING ERRCODE = '22023';
  END IF;

  IF v_limit < 1 OR v_limit > 200 THEN
    RAISE EXCEPTION 'Leaderboard limit must be between 1 and 200' USING ERRCODE = '22023';
  END IF;

  IF v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Leaderboard offset must be between 0 and 10000' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    lc.rank,
    lc.prev_rank,
    CASE WHEN p.public_trading_profile IS TRUE THEN lc.value ELSE NULL END AS value,
    p.public_trading_profile IS TRUE AS is_public,
    p.username,
    p.display_name,
    COALESCE(us.title, 'rookie_pirate'::public.investor_title) AS title
  FROM public.leaderboard_cache AS lc
  JOIN public.profiles AS p ON p.id = lc.user_id
  LEFT JOIN public.user_stats AS us ON us.user_id = lc.user_id
  WHERE lc.board_key = v_board_key
  ORDER BY lc.rank ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_character_top_holders(
  _slug text,
  _limit integer DEFAULT 5,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  rank integer,
  username text,
  display_name text,
  shares numeric,
  value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_limit integer := COALESCE(_limit, 5);
  v_offset integer := COALESCE(_offset, 0);
  v_slug text := lower(btrim(COALESCE(_slug, '')));
BEGIN
  IF v_slug = '' OR v_slug !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'Invalid character slug' USING ERRCODE = '22023';
  END IF;

  IF v_limit < 1 OR v_limit > 20 THEN
    RAISE EXCEPTION 'Top holders limit must be between 1 and 20' USING ERRCODE = '22023';
  END IF;

  IF v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Top holders offset must be between 0 and 10000' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY
          h.shares DESC,
          p.username ASC,
          h.user_id ASC
      )::integer AS holder_rank,
      p.username,
      p.display_name,
      h.shares,
      (h.shares * c.current_price)::numeric AS position_value
    FROM public.characters AS c
    JOIN public.user_holdings AS h ON h.character_id = c.id
    JOIN public.profiles AS p ON p.id = h.user_id
    WHERE c.slug = v_slug
      AND h.shares > 0
      AND p.public_trading_profile IS TRUE
  )
  SELECT
    ranked.holder_rank,
    ranked.username,
    ranked.display_name,
    ranked.shares,
    ranked.position_value
  FROM ranked
  ORDER BY ranked.holder_rank ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_my_character_largest_holder(_slug text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_slug text := lower(btrim(COALESCE(_slug, '')));
  v_character_id uuid;
  v_my_shares numeric := 0;
  v_max_shares numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_slug = '' OR v_slug !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'Invalid character slug' USING ERRCODE = '22023';
  END IF;

  SELECT c.id
  INTO v_character_id
  FROM public.characters AS c
  WHERE c.slug = v_slug;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT h.shares
  INTO v_my_shares
  FROM public.user_holdings AS h
  WHERE h.user_id = v_user_id
    AND h.character_id = v_character_id
    AND h.shares > 0;

  IF COALESCE(v_my_shares, 0) <= 0 THEN
    RETURN false;
  END IF;

  SELECT COALESCE(MAX(h.shares), 0)
  INTO v_max_shares
  FROM public.user_holdings AS h
  WHERE h.character_id = v_character_id
    AND h.shares > 0;

  RETURN v_my_shares >= v_max_shares;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_leaderboard_movers(
  _limit integer DEFAULT 5
)
RETURNS TABLE (
  direction text,
  rank integer,
  delta integer,
  username text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_limit integer := COALESCE(_limit, 5);
BEGIN
  IF v_limit < 1 OR v_limit > 20 THEN
    RAISE EXCEPTION 'Movement limit must be between 1 and 20' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH moved AS (
    SELECT
      lc.rank,
      (lc.prev_rank - lc.rank)::integer AS delta,
      p.username
    FROM public.leaderboard_cache AS lc
    JOIN public.profiles AS p ON p.id = lc.user_id
    WHERE lc.board_key = 'net_worth_all_time'
      AND lc.prev_rank IS NOT NULL
      AND lc.prev_rank <> lc.rank
  ),
  ranked AS (
    SELECT
      CASE WHEN moved.delta > 0 THEN 'climber' ELSE 'faller' END AS direction,
      moved.rank,
      moved.delta,
      moved.username,
      row_number() OVER (
        PARTITION BY CASE WHEN moved.delta > 0 THEN 'climber' ELSE 'faller' END
        ORDER BY
          CASE WHEN moved.delta > 0 THEN moved.delta END DESC NULLS LAST,
          CASE WHEN moved.delta < 0 THEN moved.delta END ASC NULLS LAST,
          moved.rank ASC,
          moved.username ASC
      ) AS movement_rank
    FROM moved
  )
  SELECT
    ranked.direction,
    ranked.rank,
    ranked.delta,
    ranked.username
  FROM ranked
  WHERE ranked.movement_rank <= v_limit
  ORDER BY
    CASE WHEN ranked.direction = 'climber' THEN 0 ELSE 1 END,
    ranked.movement_rank ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_legacy_records(
  _username text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  code text,
  title text,
  description text,
  value numeric,
  achieved_at timestamptz,
  username text,
  display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_limit integer := COALESCE(_limit, 50);
  v_offset integer := COALESCE(_offset, 0);
  v_username text := NULLIF(btrim(COALESCE(_username, '')), '');
BEGIN
  IF v_username IS NOT NULL AND length(v_username) > 64 THEN
    RAISE EXCEPTION 'Invalid username' USING ERRCODE = '22023';
  END IF;

  IF v_limit < 1 OR v_limit > 100 THEN
    RAISE EXCEPTION 'Legacy limit must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  IF v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Legacy offset must be between 0 and 10000' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    lr.code,
    lr.title,
    lr.description,
    lr.value,
    lr.achieved_at,
    p.username,
    p.display_name
  FROM public.legacy_records AS lr
  JOIN public.profiles AS p ON p.id = lr.user_id
  WHERE p.public_trading_profile IS TRUE
    AND (v_username IS NULL OR p.username = v_username)
  ORDER BY lr.achieved_at DESC, lr.code ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_public_trading_profile(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_investor_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_leaderboard(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_character_top_holders(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_my_character_largest_holder(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_leaderboard_movers(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_legacy_records(text, integer, integer) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.set_my_public_trading_profile(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_my_character_largest_holder(text) FROM anon;

GRANT EXECUTE ON FUNCTION public.set_my_public_trading_profile(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_investor_profile(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_character_top_holders(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_my_character_largest_holder(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_movers(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_legacy_records(text, integer, integer) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
