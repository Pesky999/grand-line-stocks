CREATE OR REPLACE FUNCTION public.get_public_leaderboard(
  _board_key text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  rank integer,
  prev_rank integer,
  value numeric,
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
    lc.value,
    COALESCE(p.username, 'anon')::text AS username,
    p.display_name,
    COALESCE(us.title, 'rookie_pirate'::public.investor_title) AS title
  FROM public.leaderboard_cache AS lc
  LEFT JOIN public.profiles AS p ON p.id = lc.user_id
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
          p.username ASC NULLS LAST,
          h.user_id ASC
      )::integer AS holder_rank,
      p.username,
      p.display_name,
      h.shares,
      (h.shares * c.current_price)::numeric AS position_value
    FROM public.characters AS c
    JOIN public.user_holdings AS h ON h.character_id = c.id
    LEFT JOIN public.profiles AS p ON p.id = h.user_id
    WHERE c.slug = v_slug
      AND h.shares > 0
  )
  SELECT
    ranked.holder_rank,
    COALESCE(ranked.username, 'anon')::text,
    ranked.display_name,
    ranked.shares,
    ranked.position_value
  FROM ranked
  ORDER BY ranked.holder_rank ASC
  LIMIT v_limit
  OFFSET v_offset;
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
      COALESCE(p.username, 'anon')::text AS username
    FROM public.leaderboard_cache AS lc
    LEFT JOIN public.profiles AS p ON p.id = lc.user_id
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
  IF v_username IS NOT NULL AND v_username !~ '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$' THEN
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
  LEFT JOIN public.profiles AS p ON p.id = lr.user_id
  WHERE v_username IS NULL OR p.username = v_username
  ORDER BY lr.achieved_at DESC, lr.code ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_leaderboard(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_character_top_holders(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_leaderboard_movers(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_legacy_records(text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_top_holders(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_movers(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_legacy_records(text, integer, integer) TO anon, authenticated;
