BEGIN;

CREATE OR REPLACE FUNCTION public.grant_achievement(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_inserted_count integer := 0;
BEGIN
  SELECT id
    INTO v_id
  FROM public.achievements
  WHERE code = _code;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (_user_id, v_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  s public.user_stats;
  v_count integer := 0;
  v_profile_created_at timestamptz;
  v_is_largest boolean := false;
  v_rank integer;
  v_win_rate numeric := 0;
  v_closed integer := 0;
BEGIN
  SELECT *
    INTO s
  FROM public.user_stats
  WHERE user_id = _user_id;

  IF s IS NULL THEN
    RETURN 0;
  END IF;

  SELECT created_at
    INTO v_profile_created_at
  FROM public.profiles
  WHERE id = _user_id;

  IF s.total_trades >= 1 AND public.grant_achievement(_user_id, 'first_trade') THEN
    v_count := v_count + 1;
  END IF;

  IF s.realized_pnl > 0 AND public.grant_achievement(_user_id, 'first_profit') THEN
    v_count := v_count + 1;
  END IF;

  IF v_profile_created_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.market_events AS event
      WHERE event.status = 'published'::public.event_status
        AND event.published_at IS NOT NULL
        AND event.published_at >= v_profile_created_at
        AND event.published_at <= pg_catalog.now()
    )
    AND public.grant_achievement(_user_id, 'first_event')
  THEN
    v_count := v_count + 1;
  END IF;

  IF s.total_trades >= 100 AND public.grant_achievement(_user_id, 'hundred_trades') THEN
    v_count := v_count + 1;
  END IF;

  IF s.realized_pnl >= 100000 AND public.grant_achievement(_user_id, 'hundred_k_profit') THEN
    v_count := v_count + 1;
  END IF;

  IF s.login_streak >= 30 AND public.grant_achievement(_user_id, 'streak_30') THEN
    v_count := v_count + 1;
  END IF;

  IF s.current_net_worth >= 1000000 AND public.grant_achievement(_user_id, 'millionaire') THEN
    v_count := v_count + 1;
  END IF;

  SELECT rank
    INTO v_rank
  FROM public.leaderboard_cache
  WHERE board_key = 'net_worth_all_time'
    AND user_id = _user_id;

  IF v_rank IS NOT NULL
    AND v_rank <= 100
    AND public.grant_achievement(_user_id, 'top_100')
  THEN
    v_count := v_count + 1;
  END IF;

  IF v_rank IS NOT NULL
    AND v_rank <= 10
    AND public.grant_achievement(_user_id, 'top_10')
  THEN
    v_count := v_count + 1;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_holdings AS h1
    WHERE h1.user_id = _user_id
      AND h1.shares > 0
      AND h1.shares = (
        SELECT MAX(h2.shares)
        FROM public.user_holdings AS h2
        WHERE h2.character_id = h1.character_id
          AND h2.shares > 0
      )
  )
  INTO v_is_largest;

  IF v_is_largest AND public.grant_achievement(_user_id, 'largest_holder') THEN
    v_count := v_count + 1;
  END IF;

  IF s.reputation_score >= 850 AND public.grant_achievement(_user_id, 'yonko_investor') THEN
    v_count := v_count + 1;
  END IF;

  IF s.reputation_score >= 950 AND public.grant_achievement(_user_id, 'pirate_king') THEN
    v_count := v_count + 1;
  END IF;

  v_closed := s.wins + s.losses;
  IF v_closed >= 50 THEN
    v_win_rate := s.wins::numeric * 100 / v_closed;
    IF v_win_rate >= 70 AND public.grant_achievement(_user_id, 'market_prophet') THEN
      v_count := v_count + 1;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_holdings AS h
    WHERE h.user_id = _user_id
      AND h.shares > 0
      AND h.created_at <= pg_catalog.now() - interval '60 days'
  )
    AND public.grant_achievement(_user_id, 'diamond_hands')
  THEN
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_user_progression(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_iterations integer := 0;
  v_new integer := 0;
  v_total_new integer := 0;
  v_stats public.user_stats;
BEGIN
  LOOP
    v_iterations := v_iterations + 1;
    SELECT *
      INTO v_stats
    FROM public.recalc_user_stats(_user_id);

    v_new := public.check_achievements(_user_id);
    v_total_new := v_total_new + COALESCE(v_new, 0);

    EXIT WHEN COALESCE(v_new, 0) = 0 OR v_iterations >= 4;
  END LOOP;

  SELECT *
    INTO v_stats
  FROM public.recalc_user_stats(_user_id);

  PERFORM public.check_legacy_for_user(_user_id);

  RETURN jsonb_build_object(
    'userId', _user_id,
    'newAchievements', v_total_new,
    'reputationScore', COALESCE(v_stats.reputation_score, 0),
    'title', COALESCE(v_stats.title::text, 'rookie_pirate'),
    'iterations', v_iterations
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_user_daily_activity(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_today date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_last_active date;
  v_streak integer := 1;
BEGIN
  SELECT last_active_date, login_streak
    INTO v_last_active, v_streak
  FROM public.user_stats
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.recalc_user_stats(_user_id);

    SELECT last_active_date, login_streak
      INTO v_last_active, v_streak
    FROM public.user_stats
    WHERE user_id = _user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Could not create user stats for daily activity'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_last_active = v_today THEN
    RETURN COALESCE(v_streak, 1);
  ELSIF v_last_active = v_today - 1 THEN
    v_streak := COALESCE(v_streak, 0) + 1;
  ELSE
    v_streak := 1;
  END IF;

  UPDATE public.user_stats
  SET login_streak = v_streak,
      last_active_date = v_today,
      updated_at = pg_catalog.now()
  WHERE user_id = _user_id;

  RETURN v_streak;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_my_daily_activity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_streak integer;
  v_progression jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  v_streak := public.record_user_daily_activity(v_user_id);
  v_progression := public.refresh_user_progression(v_user_id);

  RETURN jsonb_build_object(
    'streak', v_streak,
    'progression', v_progression
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.after_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.record_user_daily_activity(NEW.user_id);
  PERFORM public.refresh_user_progression(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_user_progression()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user RECORD;
  v_progression jsonb;
  v_processed integer := 0;
  v_new_achievements integer := 0;
BEGIN
  FOR v_user IN
    SELECT user_id
    FROM public.user_wallets
    ORDER BY user_id
  LOOP
    v_progression := public.refresh_user_progression(v_user.user_id);
    v_processed := v_processed + 1;
    v_new_achievements := v_new_achievements + COALESCE((v_progression->>'newAchievements')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'processedUsers', v_processed,
    'newAchievements', v_new_achievements
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_achievement(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_achievement(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_achievements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_achievements(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_legacy_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_legacy_for_user(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.after_transaction() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.after_transaction() TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_user_progression(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_progression(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_user_daily_activity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_daily_activity(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_all_user_progression() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_all_user_progression() TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_my_daily_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_my_daily_activity() TO authenticated, service_role;

DO $legendary_progression_cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('legendary-progression-daily-refresh');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'legendary-progression-daily-refresh',
      '20 0 * * *',
      $cron$ SELECT public.refresh_all_user_progression(); $cron$
    );
  END IF;
END;
$legendary_progression_cron$;

SELECT public.refresh_all_user_progression() AS legendary_progression_backfill;

COMMIT;

NOTIFY pgrst, 'reload schema';
