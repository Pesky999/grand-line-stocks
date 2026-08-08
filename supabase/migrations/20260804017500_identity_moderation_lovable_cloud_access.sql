BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_identity_moderation_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'openFlags', (SELECT count(*) FROM public.identity_moderation_flags WHERE status = 'open'),
    'reviewedFlags', (SELECT count(*) FROM public.identity_moderation_flags WHERE status = 'reviewed'),
    'resolvedFlags', (SELECT count(*) FROM public.identity_moderation_flags WHERE status = 'resolved'),
    'activeRules', (SELECT count(*) FROM public.identity_moderation_terms WHERE active),
    'supplementalBlockedTerms', (
      SELECT count(*)
      FROM public.identity_moderation_terms
      WHERE kind = 'blocked' AND NOT is_core
    ),
    'reservedTerms', (SELECT count(*) FROM public.identity_moderation_terms WHERE kind = 'reserved'),
    'allowlistTerms', (SELECT count(*) FROM public.identity_moderation_terms WHERE kind = 'allow'),
    'recentActions', (SELECT count(*) FROM public.identity_moderation_actions)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_search_identity_moderation_profiles(
  _query text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_query text := left(btrim(coalesce(_query, '')), 80);
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(rows.item ORDER BY rows.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      profiles.created_at,
      jsonb_build_object(
        'id', profiles.id,
        'username', profiles.username,
        'display_name', profiles.display_name,
        'created_at', profiles.created_at,
        'updated_at', profiles.updated_at
      ) AS item
    FROM public.profiles
    WHERE (
      v_query = ''
      OR (
        v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND profiles.id::text = lower(v_query)
      )
      OR position(lower(v_query) IN lower(profiles.username)) > 0
      OR position(lower(v_query) IN lower(coalesce(profiles.display_name, ''))) > 0
    )
    ORDER BY profiles.created_at DESC
    LIMIT 25
  ) AS rows;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_identity_moderation_flags(
  _status text DEFAULT 'open',
  _limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_status text := coalesce(_status, 'open');
  v_limit integer := least(greatest(coalesce(_limit, 50), 1), 100);
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('open', 'reviewed', 'resolved', 'dismissed', 'all') THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_FLAG_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(rows.item ORDER BY rows.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      flags.created_at,
      jsonb_build_object(
        'id', flags.id,
        'profile_id', flags.profile_id,
        'field', flags.field,
        'observed_value', flags.observed_value,
        'normalized_value', flags.normalized_value,
        'violation_code', flags.violation_code,
        'category', flags.category,
        'status', flags.status,
        'created_at', flags.created_at,
        'profiles', jsonb_build_object(
          'username', profiles.username,
          'display_name', profiles.display_name
        )
      ) AS item
    FROM public.identity_moderation_flags AS flags
    JOIN public.profiles AS profiles ON profiles.id = flags.profile_id
    WHERE v_status = 'all' OR flags.status = v_status
    ORDER BY flags.created_at DESC
    LIMIT v_limit
  ) AS rows;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_identity_moderation_rules()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    jsonb_agg(rows.item ORDER BY rows.active DESC, rows.category ASC, rows.term ASC),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      terms.active,
      terms.category,
      terms.term,
      jsonb_build_object(
        'id', terms.id,
        'term', terms.term,
        'normalized_term', terms.normalized_term,
        'kind', terms.kind,
        'category', terms.category,
        'match_mode', terms.match_mode,
        'severity', terms.severity,
        'notes', terms.notes,
        'is_core', terms.is_core,
        'active', terms.active,
        'created_at', terms.created_at,
        'updated_at', terms.updated_at
      ) AS item
    FROM public.identity_moderation_terms AS terms
    WHERE NOT (terms.is_core AND terms.kind = 'blocked')
  ) AS rows;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_identity_moderation_actions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(rows.item ORDER BY rows.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      actions.created_at,
      jsonb_build_object(
        'id', actions.id,
        'profile_id', actions.profile_id,
        'actor_user_id', actions.actor_user_id,
        'action_type', actions.action_type,
        'field', actions.field,
        'previous_value', actions.previous_value,
        'new_value', actions.new_value,
        'reason', actions.reason,
        'created_at', actions.created_at,
        'profiles', CASE
          WHEN profiles.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'username', profiles.username,
            'display_name', profiles.display_name
          )
        END
      ) AS item
    FROM public.identity_moderation_actions AS actions
    LEFT JOIN public.profiles AS profiles ON profiles.id = actions.profile_id
    ORDER BY actions.created_at DESC
    LIMIT 50
  ) AS rows;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_identity_moderation_flag_reviewed(
  _flag_id uuid,
  _status text,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF _status NOT IN ('reviewed', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_FLAG_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;

  IF _note IS NOT NULL AND char_length(_note) > 500 THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  SELECT flags.profile_id
  INTO v_profile_id
  FROM public.identity_moderation_flags AS flags
  WHERE flags.id = _flag_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  UPDATE public.identity_moderation_flags
  SET status = _status,
      reviewed_by = v_actor,
      reviewed_at = now(),
      resolution_note = _note,
      updated_at = now()
  WHERE id = _flag_id;

  INSERT INTO public.identity_moderation_actions
    (profile_id, actor_user_id, action_type, reason)
  VALUES
    (v_profile_id, v_actor, 'flag_review', coalesce(_note, format('Flag %s marked %s.', _flag_id, _status)));

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_identity_moderation_rule(
  _term text,
  _kind text,
  _category text,
  _match_mode text,
  _severity integer,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_term text := btrim(coalesce(_term, ''));
  v_category text := btrim(coalesce(_category, ''));
  v_normalized text;
  v_words text := public.identity_moderation_words(v_term);
  v_compact text := public.identity_moderation_compact(v_term);
  v_reduced text := public.identity_moderation_reduce_repeats(v_words);
  v_reduced_compact text := regexp_replace(
    public.identity_moderation_reduce_repeats(v_compact),
    '[^[:alnum:]]+',
    '',
    'g'
  );
  v_conflicts_with_core boolean := false;
  v_term_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_term) NOT BETWEEN 1 AND 120
     OR char_length(v_category) NOT BETWEEN 1 AND 80
     OR _kind NOT IN ('blocked', 'reserved', 'allow')
     OR _match_mode NOT IN ('exact', 'word', 'substring', 'compact_substring')
     OR _severity NOT BETWEEN 1 AND 4
     OR (_notes IS NOT NULL AND char_length(_notes) > 500) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;

  v_normalized := CASE _match_mode
    WHEN 'compact_substring' THEN v_compact
    WHEN 'word' THEN coalesce(nullif(v_words, ''), v_compact)
    WHEN 'substring' THEN coalesce(nullif(v_words, ''), v_compact)
    ELSE public.identity_moderation_normalize(v_term)
  END;

  IF v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'empty');
  END IF;

  IF _kind = 'allow' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.identity_moderation_terms AS terms
      WHERE terms.active
        AND terms.is_core
        AND terms.kind = 'blocked'
        AND terms.category IN (
          'severe_profanity',
          'racial_ethnic_slur',
          'religious_slur',
          'nationality_slur',
          'sex_gender_slur',
          'sexual_orientation_slur',
          'disability_slur'
        )
        AND (
          (
            terms.match_mode = 'exact'
            AND terms.normalized_term IN (
              public.identity_moderation_normalize(v_term),
              v_words,
              v_compact
            )
          )
          OR (
            terms.match_mode = 'word'
            AND terms.normalized_term = ANY (regexp_split_to_array(v_words, '[[:space:]]+'))
          )
          OR (
            terms.match_mode IN ('substring', 'compact_substring')
            AND terms.normalized_term = ANY (
              ARRAY(
                SELECT DISTINCT candidates.candidate
                FROM unnest(ARRAY[
                  public.identity_moderation_normalize(v_term),
                  v_words,
                  v_compact,
                  v_reduced,
                  v_reduced_compact
                ]) AS candidates(candidate)
                WHERE candidates.candidate <> ''
              )
            )
          )
        )
    )
    INTO v_conflicts_with_core;

    IF v_conflicts_with_core THEN
      RETURN jsonb_build_object('ok', false, 'code', 'protected_conflict');
    END IF;
  ELSIF _kind <> 'blocked' OR v_category NOT IN (
    'severe_profanity',
    'racial_ethnic_slur',
    'religious_slur',
    'nationality_slur',
    'sex_gender_slur',
    'sexual_orientation_slur',
    'disability_slur'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'category');
  END IF;

  INSERT INTO public.identity_moderation_terms
    (term, normalized_term, kind, category, match_mode, severity, notes, is_core, active, created_by)
  VALUES
    (v_term, v_normalized, _kind, v_category, _match_mode, _severity, _notes, false, true, v_actor)
  RETURNING id INTO v_term_id;

  INSERT INTO public.identity_moderation_actions
    (actor_user_id, action_type, reason, term_id)
  VALUES
    (v_actor, 'rule_create', 'Supplemental moderation rule created.', v_term_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_identity_moderation_rule_active(
  _term_id uuid,
  _active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_rule public.identity_moderation_terms%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_rule
  FROM public.identity_moderation_terms
  WHERE id = _term_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_rule.is_core THEN
    RETURN jsonb_build_object('ok', false, 'code', 'core');
  END IF;

  IF _active
     AND NOT (
       v_rule.kind = 'allow'
       OR (
         v_rule.kind = 'blocked'
         AND v_rule.category IN (
           'severe_profanity',
           'racial_ethnic_slur',
           'religious_slur',
           'nationality_slur',
           'sex_gender_slur',
           'sexual_orientation_slur',
           'disability_slur'
         )
       )
     ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'category');
  END IF;

  UPDATE public.identity_moderation_terms
  SET active = _active,
      updated_at = now()
  WHERE id = _term_id;

  INSERT INTO public.identity_moderation_actions
    (actor_user_id, action_type, reason, term_id)
  VALUES
    (
      v_actor,
      'rule_update',
      CASE WHEN _active THEN 'Rule reactivated.' ELSE 'Rule deactivated.' END,
      _term_id
    );

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rescan_identity_moderation_profiles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile record;
  v_field text;
  v_value text;
  v_allowed boolean;
  v_code text;
  v_category text;
  v_term_id uuid;
  v_scanned integer := 0;
  v_flagged integer := 0;
  v_active_rules integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('identity_moderation_profile_rescan', 0));

  SELECT count(*) INTO v_active_rules
  FROM public.identity_moderation_terms
  WHERE active;

  FOR v_profile IN
    SELECT id, username, display_name
    FROM public.profiles
    ORDER BY created_at ASC
    LIMIT 1000
  LOOP
    v_scanned := v_scanned + 1;

    FOREACH v_field IN ARRAY ARRAY['username', 'display_name'] LOOP
      v_value := CASE WHEN v_field = 'username' THEN v_profile.username ELSE v_profile.display_name END;
      IF v_value IS NULL OR v_value = '' THEN
        CONTINUE;
      END IF;

      SELECT allowed, violation_code, category, term_id
      INTO v_allowed, v_code, v_category, v_term_id
      FROM public.evaluate_public_identity(v_value, v_field)
      LIMIT 1;

      IF coalesce(v_allowed, false) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.identity_moderation_flags AS flags
        WHERE flags.profile_id = v_profile.id
          AND flags.field = v_field
          AND flags.violation_code = v_code
          AND flags.term_id IS NOT DISTINCT FROM v_term_id
          AND flags.status IN ('open', 'reviewed')
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.identity_moderation_flags
        (profile_id, field, observed_value, normalized_value, term_id, violation_code, category, status)
      VALUES
        (
          v_profile.id,
          v_field,
          v_value,
          public.identity_moderation_compact(v_value),
          v_term_id,
          coalesce(v_code, 'blocked'),
          coalesce(v_category, 'moderation'),
          'open'
        );

      v_flagged := v_flagged + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'flagged', v_flagged,
    'activeRules', v_active_rules
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_public_username_policy_and_availability(
  _username text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_allowed boolean := false;
  v_username text := btrim(coalesce(_username, ''));
BEGIN
  SELECT allowed
  INTO v_allowed
  FROM public.evaluate_public_identity(v_username, 'username')
  LIMIT 1;

  IF NOT coalesce(v_allowed, false) THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(v_username)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_public_display_name_policy(
  _display_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_allowed boolean := false;
BEGIN
  SELECT allowed
  INTO v_allowed
  FROM public.evaluate_public_identity(_display_name, 'display_name')
  LIMIT 1;

  RETURN coalesce(v_allowed, false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_public_display_name(
  _display_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_allowed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MODERATION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT allowed
  INTO v_allowed
  FROM public.evaluate_public_identity(_display_name, 'display_name')
  LIMIT 1;

  IF NOT coalesce(v_allowed, false) THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET display_name = _display_name
  WHERE id = v_actor;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_identity_moderation_overview() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_search_identity_moderation_profiles(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_identity_moderation_flags(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_identity_moderation_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_identity_moderation_actions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_identity_moderation_flag_reviewed(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_identity_moderation_rule(text, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_identity_moderation_rule_active(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_rescan_identity_moderation_profiles() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_get_identity_moderation_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_identity_moderation_profiles(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_identity_moderation_flags(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_identity_moderation_rules() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_identity_moderation_actions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_identity_moderation_flag_reviewed(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_identity_moderation_rule(text, text, text, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_identity_moderation_rule_active(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rescan_identity_moderation_profiles() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_public_username_policy_and_availability(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_public_display_name_policy(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_public_username_policy_and_availability(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_public_display_name_policy(text) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_my_public_display_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_public_display_name(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_reset_profile_identity(uuid, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_profile_identity(uuid, boolean, boolean, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
