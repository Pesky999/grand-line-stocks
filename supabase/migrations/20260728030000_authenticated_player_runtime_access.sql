BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_progress public.user_onboarding_progress%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_onboarding_progress (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_onboarding_progress
  SET stock_tutorial_offer = 'first_login',
      page_tips_disabled = false
  WHERE user_id = v_user_id
    AND stock_tutorial_status = 'not_started'
    AND stock_tutorial_last_step = 0
    AND stock_tutorial_offer IN ('soft', 'none')
    AND started_at IS NULL
    AND completed_at IS NULL
    AND skipped_at IS NULL;

  SELECT progress.*
  INTO STRICT v_progress
  FROM public.user_onboarding_progress AS progress
  WHERE progress.user_id = v_user_id;

  RETURN to_jsonb(v_progress) - 'created_at' - 'updated_at';
END;
$$;

CREATE OR REPLACE FUNCTION public.mutate_my_onboarding_progress(
  _mutation text,
  _step integer,
  _tip_id text,
  _tip_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.now();
  v_progress public.user_onboarding_progress%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.get_my_onboarding_progress();

  SELECT progress.*
  INTO STRICT v_progress
  FROM public.user_onboarding_progress AS progress
  WHERE progress.user_id = v_user_id
  FOR UPDATE;

  CASE _mutation
    WHEN 'start' THEN
      UPDATE public.user_onboarding_progress
      SET stock_tutorial_status = 'in_progress',
          stock_tutorial_offer = 'none',
          stock_tutorial_last_step = 1,
          started_at = CASE
            WHEN v_progress.stock_tutorial_status = 'skipped' THEN v_now
            ELSE COALESCE(v_progress.started_at, v_now)
          END,
          skipped_at = NULL
      WHERE user_id = v_user_id;
    WHEN 'restart' THEN
      UPDATE public.user_onboarding_progress
      SET stock_tutorial_status = 'in_progress',
          stock_tutorial_offer = 'none',
          stock_tutorial_last_step = 1,
          started_at = CASE
            WHEN v_progress.stock_tutorial_status = 'skipped' THEN v_now
            ELSE COALESCE(v_progress.started_at, v_now)
          END,
          skipped_at = NULL
      WHERE user_id = v_user_id;
    WHEN 'save_step' THEN
      IF _step IS NULL OR _step < 1 OR _step > 5 THEN
        RAISE EXCEPTION 'Invalid tutorial step' USING ERRCODE = '22023';
      END IF;

      UPDATE public.user_onboarding_progress
      SET stock_tutorial_status = CASE
            WHEN v_progress.stock_tutorial_status = 'completed' THEN 'completed'
            ELSE 'in_progress'
          END,
          stock_tutorial_offer = 'none',
          stock_tutorial_last_step = _step
      WHERE user_id = v_user_id;
    WHEN 'complete' THEN
      UPDATE public.user_onboarding_progress
      SET stock_tutorial_status = 'completed',
          stock_tutorial_offer = 'none',
          stock_tutorial_last_step = 5,
          completed_at = COALESCE(v_progress.completed_at, v_now),
          skipped_at = NULL
      WHERE user_id = v_user_id;
    WHEN 'skip' THEN
      UPDATE public.user_onboarding_progress
      SET stock_tutorial_status = 'skipped',
          stock_tutorial_offer = 'none',
          skipped_at = v_now
      WHERE user_id = v_user_id;
    WHEN 'dismiss_tip' THEN
      IF _tip_id IS NULL
         OR _tip_id NOT IN (
           'market.overview',
           'portfolio.overview',
           'portfolio.pnl',
           'market_bulletin.overview',
           'ranks.overview',
           'games.overview',
           'legacy.overview',
           'profile.overview'
         )
         OR _tip_version IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Invalid page tip' USING ERRCODE = '22023';
      END IF;

      UPDATE public.user_onboarding_progress
      SET page_tip_versions = pg_catalog.jsonb_set(
            COALESCE(page_tip_versions, '{}'::jsonb),
            ARRAY[_tip_id],
            pg_catalog.to_jsonb(_tip_version),
            true
          )
      WHERE user_id = v_user_id;
    WHEN 'skip_tips' THEN
      UPDATE public.user_onboarding_progress
      SET page_tips_disabled = true
      WHERE user_id = v_user_id;
    WHEN 'reset_tips' THEN
      UPDATE public.user_onboarding_progress
      SET page_tips_disabled = false,
          page_tip_versions = '{}'::jsonb
      WHERE user_id = v_user_id;
    ELSE
      RAISE EXCEPTION 'Invalid onboarding mutation' USING ERRCODE = '22023';
  END CASE;

  SELECT progress.*
  INTO STRICT v_progress
  FROM public.user_onboarding_progress AS progress
  WHERE progress.user_id = v_user_id;

  RETURN to_jsonb(v_progress) - 'created_at' - 'updated_at';
END;
$$;

CREATE OR REPLACE FUNCTION public.record_my_onboarding_event(
  _event_name text,
  _event_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_data jsonb := COALESCE(_event_data, '{}'::jsonb);
  v_step_key text;
  v_page_key text;
  v_metadata jsonb := '{}'::jsonb;
  v_dedupe_key text;
  v_restart boolean;
  v_data_key_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.jsonb_typeof(v_data) <> 'object' THEN
    RETURN false;
  END IF;

  SELECT count(*)::integer
  INTO v_data_key_count
  FROM pg_catalog.jsonb_object_keys(v_data);

  CASE _event_name
    WHEN 'onboarding_offer_seen' THEN
      IF v_data_key_count <> 1
         OR v_data->>'offer' NOT IN ('first_login', 'soft') THEN
        RETURN false;
      END IF;
      v_metadata := pg_catalog.jsonb_build_object('offer', v_data->>'offer');
      v_dedupe_key :=
        'onboarding_offer_seen:' || (v_data->>'offer') || ':v1';
    WHEN 'stock_tutorial_started' THEN
      IF v_data_key_count <> 2
         OR v_data->>'restart' NOT IN ('true', 'false')
         OR v_data->>'source' NOT IN ('welcome', 'portfolio', 'profile', 'resume') THEN
        RETURN false;
      END IF;
      v_restart := (v_data->>'restart')::boolean;
      v_metadata := pg_catalog.jsonb_build_object(
        'restart', v_restart,
        'source', v_data->>'source'
      );
      IF NOT v_restart THEN
        v_dedupe_key := 'stock_tutorial_started:v1';
      END IF;
    WHEN 'stock_tutorial_step_completed' THEN
      IF v_data_key_count <> 1
         OR v_data->>'step' NOT IN ('step_1', 'step_2', 'step_3', 'step_4', 'step_5') THEN
        RETURN false;
      END IF;
      v_step_key := v_data->>'step';
      v_dedupe_key := 'stock_tutorial_step_completed:' || v_step_key || ':v1';
    WHEN 'stock_tutorial_skipped' THEN
      IF v_data <> '{}'::jsonb THEN
        RETURN false;
      END IF;
      v_dedupe_key := 'stock_tutorial_skipped:v1';
    WHEN 'stock_tutorial_completed' THEN
      IF v_data <> '{}'::jsonb THEN
        RETURN false;
      END IF;
      v_dedupe_key := 'stock_tutorial_completed:v1';
    WHEN 'stock_tutorial_replayed' THEN
      IF v_data_key_count <> 1
         OR v_data->>'source' <> 'profile' THEN
        RETURN false;
      END IF;
      v_metadata := pg_catalog.jsonb_build_object('source', 'profile');
    WHEN 'first_live_trade_started' THEN
      IF v_data_key_count <> 1
         OR v_data->>'side' NOT IN ('buy', 'sell') THEN
        RETURN false;
      END IF;
      v_metadata := pg_catalog.jsonb_build_object('side', v_data->>'side');
      v_dedupe_key := 'first_live_trade_started';
    WHEN 'first_live_trade_completed' THEN
      IF v_data_key_count <> 1
         OR v_data->>'side' NOT IN ('buy', 'sell') THEN
        RETURN false;
      END IF;
      v_metadata := pg_catalog.jsonb_build_object('side', v_data->>'side');
      v_dedupe_key := 'first_live_trade_completed';
    WHEN 'page_tip_seen', 'page_tip_completed' THEN
      IF v_data_key_count <> 2
         OR v_data->>'tipId' NOT IN (
           'market.overview',
           'portfolio.overview',
           'portfolio.pnl',
           'market_bulletin.overview',
           'ranks.overview',
           'games.overview',
           'legacy.overview',
           'profile.overview'
         )
         OR v_data->>'version' <> '1' THEN
        RETURN false;
      END IF;
      v_page_key := v_data->>'tipId';
      v_dedupe_key := _event_name || ':' || v_page_key || ':v1';
    WHEN 'page_tips_skipped' THEN
      IF v_data <> '{}'::jsonb THEN
        RETURN false;
      END IF;
      v_dedupe_key := 'page_tips_skipped:v1';
    ELSE
      RETURN false;
  END CASE;

  INSERT INTO public.user_onboarding_events (
    user_id,
    event_name,
    tutorial_version,
    step_key,
    page_key,
    metadata,
    dedupe_key
  )
  VALUES (
    v_user_id,
    _event_name,
    1,
    v_step_key,
    v_page_key,
    v_metadata,
    v_dedupe_key
  )
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_legacy_log_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_profile_created_at timestamptz;
  v_stats jsonb;
  v_rank jsonb;
  v_catalog jsonb := '[]'::jsonb;
  v_unlocked jsonb := '[]'::jsonb;
  v_legacy_records jsonb := '[]'::jsonb;
  v_holdings jsonb := '[]'::jsonb;
  v_first_event_eligible boolean := false;
  v_glg_stats jsonb;
  v_glg_hints_free_count integer := 0;
  v_daily_crew_submissions jsonb := '[]'::jsonb;
  v_largest_holder_eligible boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT
    pg_catalog.jsonb_build_object(
      'id', profiles.id,
      'username', profiles.username,
      'display_name', profiles.display_name,
      'created_at', profiles.created_at
    ),
    profiles.created_at
  INTO v_profile, v_profile_created_at
  FROM public.profiles AS profiles
  WHERE profiles.id = v_user_id;

  SELECT pg_catalog.to_jsonb(stats)
  INTO v_stats
  FROM public.user_stats AS stats
  WHERE stats.user_id = v_user_id;

  SELECT pg_catalog.to_jsonb(rank_row)
  INTO v_rank
  FROM public.get_my_legacy_rank() AS rank_row
  LIMIT 1;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'code', achievements.code,
        'name', achievements.name,
        'description', achievements.description,
        'tier', achievements.tier,
        'category', achievements.category,
        'icon', achievements.icon,
        'reputation_reward', achievements.reputation_reward
      )
      ORDER BY achievements.tier ASC, achievements.code ASC
    ),
    '[]'::jsonb
  )
  INTO v_catalog
  FROM public.achievements AS achievements;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'unlocked_at', user_achievements.unlocked_at,
        'achievements', pg_catalog.jsonb_build_object(
          'code', achievements.code,
          'reputation_reward', achievements.reputation_reward
        )
      )
      ORDER BY user_achievements.unlocked_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_unlocked
  FROM public.user_achievements AS user_achievements
  JOIN public.achievements AS achievements
    ON achievements.id = user_achievements.achievement_id
  WHERE user_achievements.user_id = v_user_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'code', legacy_records.code,
        'title', legacy_records.title,
        'description', legacy_records.description,
        'value', legacy_records.value,
        'achieved_at', legacy_records.achieved_at,
        'character_id', legacy_records.character_id,
        'characters', CASE
          WHEN characters.id IS NULL THEN NULL
          ELSE pg_catalog.jsonb_build_object(
            'slug', characters.slug,
            'name', characters.name
          )
        END
      )
      ORDER BY legacy_records.achieved_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_legacy_records
  FROM public.legacy_records AS legacy_records
  LEFT JOIN public.characters AS characters
    ON characters.id = legacy_records.character_id
  WHERE legacy_records.user_id = v_user_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'character_id', holdings.character_id,
        'shares', holdings.shares,
        'created_at', holdings.created_at,
        'characters', CASE
          WHEN characters.id IS NULL THEN NULL
          ELSE pg_catalog.jsonb_build_object(
            'slug', characters.slug,
            'category', characters.category
          )
        END
      )
      ORDER BY holdings.created_at ASC, holdings.character_id ASC
    ),
    '[]'::jsonb
  )
  INTO v_holdings
  FROM public.user_holdings AS holdings
  LEFT JOIN public.characters AS characters
    ON characters.id = holdings.character_id
  WHERE holdings.user_id = v_user_id
    AND holdings.shares > 0;

  IF v_profile_created_at IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.market_events AS market_events
      WHERE market_events.status = 'published'::public.event_status
        AND market_events.published_at IS NOT NULL
        AND market_events.published_at >= v_profile_created_at
        AND market_events.published_at <= pg_catalog.now()
    )
    INTO v_first_event_eligible;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'games_won', stats.games_won,
    'one_shot_wins', stats.one_shot_wins,
    'best_streak', stats.best_streak
  )
  INTO v_glg_stats
  FROM public.grand_line_guess_stats AS stats
  WHERE stats.user_id = v_user_id;

  SELECT count(*)::integer
  INTO v_glg_hints_free_count
  FROM public.grand_line_guess_results AS results
  WHERE results.user_id = v_user_id
    AND results.solved IS TRUE
    AND results.hints_used = 0;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'score', submissions.score,
        'rank', submissions.rank,
        'daily_crew_missions', pg_catalog.jsonb_build_object(
          'max_score', missions.max_score
        )
      )
      ORDER BY submissions.submitted_at ASC, submissions.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_daily_crew_submissions
  FROM public.daily_crew_submissions AS submissions
  JOIN public.daily_crew_missions AS missions
    ON missions.id = submissions.mission_id
  WHERE submissions.user_id = v_user_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_holdings AS my_holdings
    WHERE my_holdings.user_id = v_user_id
      AND my_holdings.shares > 0
      AND my_holdings.shares >= (
        SELECT COALESCE(MAX(all_holdings.shares), 0)
        FROM public.user_holdings AS all_holdings
        WHERE all_holdings.character_id = my_holdings.character_id
          AND all_holdings.shares > 0
      )
  )
  INTO v_largest_holder_eligible;

  RETURN pg_catalog.jsonb_build_object(
    'profile', v_profile,
    'stats', v_stats,
    'rank', v_rank,
    'catalog', v_catalog,
    'unlocked', v_unlocked,
    'legacy_records', v_legacy_records,
    'holdings', v_holdings,
    'first_event_eligible', v_first_event_eligible,
    'glg_stats', v_glg_stats,
    'glg_hints_free_count', v_glg_hints_free_count,
    'daily_crew_submissions', v_daily_crew_submissions,
    'largest_holder_eligible', v_largest_holder_eligible
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_onboarding_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mutate_my_onboarding_progress(text, integer, text, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_my_onboarding_event(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_legacy_log_snapshot() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.get_my_onboarding_progress() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mutate_my_onboarding_progress(text, integer, text, integer)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_my_onboarding_event(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_legacy_log_snapshot() FROM anon;

GRANT EXECUTE ON FUNCTION public.get_my_onboarding_progress()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_my_onboarding_progress(text, integer, text, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_my_onboarding_event(text, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_legacy_log_snapshot()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
