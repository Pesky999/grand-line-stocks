BEGIN;

ALTER TABLE public.identity_moderation_actions
DROP CONSTRAINT IF EXISTS identity_moderation_actions_action_type_check;

ALTER TABLE public.identity_moderation_actions
ADD CONSTRAINT identity_moderation_actions_action_type_check CHECK (
  action_type IN (
    'auto_flag',
    'auto_remediate',
    'admin_reset',
    'rule_create',
    'rule_update',
    'flag_review',
    'incident_restore',
    'incident_restore_conflict'
  )
);

CREATE OR REPLACE FUNCTION public.identity_username_canonical(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT btrim(
    regexp_replace(
      translate(
        lower(normalize(coalesce(_value, ''), NFKC)),
        U&'\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\FEFF',
        ''
      ),
      '[[:cntrl:]]+',
      '',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.identity_username_legacy_format_valid(_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.identity_username_canonical(_value) = btrim(coalesce(_value, ''))
    AND char_length(public.identity_username_canonical(_value)) BETWEEN 3 AND 20
    AND public.identity_username_canonical(_value) ~ '^[a-z0-9]([a-z0-9_]{1,18}[a-z0-9])$'
    AND public.identity_username_canonical(_value) NOT LIKE '%__%'
    AND public.identity_username_canonical(_value) !~ '(.)\1{9,}';
$$;

CREATE OR REPLACE FUNCTION public.identity_moderation_normalize(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT btrim(
    translate(
      translate(
        public.identity_username_canonical(_value),
        U&'\03B1\0430\03BF\043E\0441\0440\0435\0445\0443\0456',
        'aaoocpexyi'
      ),
      '0134578@$!',
      'oieastbasi'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.identity_moderation_words(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(public.identity_moderation_normalize(_value), '[^[:alnum:]]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.identity_moderation_compact(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT regexp_replace(public.identity_moderation_normalize(_value), '[^[:alnum:]]+', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.evaluate_public_identity(
  _value text,
  _field text
)
RETURNS TABLE (
  allowed boolean,
  violation_code text,
  category text,
  term_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_value text := coalesce(_value, '');
  v_canonical text := public.identity_username_canonical(v_value);
  v_normalized text := public.identity_moderation_normalize(v_value);
  v_words text := public.identity_moderation_words(v_value);
  v_compact text := public.identity_moderation_compact(v_value);
  v_reduced text := public.identity_moderation_reduce_repeats(v_words);
  v_reduced_compact text := regexp_replace(public.identity_moderation_reduce_repeats(v_compact), '[^[:alnum:]]+', '', 'g');
  v_display_value text := public.identity_moderation_clean_display(v_value);
  v_rule public.identity_moderation_terms%ROWTYPE;
BEGIN
  IF _field NOT IN ('username', 'display_name') THEN
    RETURN QUERY SELECT false, 'invalid_format'::text, 'format'::text, NULL::uuid;
    RETURN;
  END IF;

  IF _field = 'username' THEN
    IF v_canonical = '' THEN
      RETURN QUERY SELECT false, 'empty'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF char_length(v_canonical) < 3 THEN
      RETURN QUERY SELECT false, 'too_short'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF char_length(v_canonical) > 20 THEN
      RETURN QUERY SELECT false, 'too_long'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF v_canonical <> btrim(v_value)
       OR v_canonical !~ '^[a-z0-9]([a-z0-9_]{1,18}[a-z0-9])$'
       OR v_canonical LIKE '%__%'
       OR v_canonical ~ '(.)\1{9,}' THEN
      RETURN QUERY SELECT false, 'invalid_format'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;
  ELSE
    IF v_display_value = '' THEN
      RETURN QUERY SELECT false, 'empty'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF char_length(v_display_value) > 40 THEN
      RETURN QUERY SELECT false, 'too_long'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF v_display_value ~ '(.)\1{9,}' THEN
      RETURN QUERY SELECT false, 'invalid_format'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF translate(v_display_value, chr(8217), '''') ~ '[^[:alnum:][:space:].,''_!?&() -]' THEN
      RETURN QUERY SELECT false, 'invalid_format'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;
  END IF;

  SELECT *
  INTO v_rule
  FROM public.identity_moderation_terms
  WHERE active
    AND kind = 'allow'
    AND (
      normalized_term = v_normalized
      OR normalized_term = v_words
      OR normalized_term = v_compact
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, NULL::text, NULL::text, v_rule.id;
    RETURN;
  END IF;

  SELECT *
  INTO v_rule
  FROM public.identity_moderation_terms
  WHERE active
    AND kind = 'blocked'
    AND category IN (
      'common_profanity',
      'severe_profanity',
      'racial_ethnic_slur',
      'religious_slur',
      'nationality_slur',
      'sex_gender_slur',
      'sexual_orientation_slur',
      'disability_slur'
    )
    AND (
      (match_mode = 'exact' AND normalized_term IN (v_normalized, v_words, v_compact))
      OR (match_mode = 'word' AND normalized_term = ANY (regexp_split_to_array(v_words, '[[:space:]]+')))
      OR (match_mode = 'substring' AND (v_normalized LIKE '%' || normalized_term || '%' OR v_words LIKE '%' || normalized_term || '%' OR v_reduced LIKE '%' || normalized_term || '%'))
      OR (match_mode = 'compact_substring' AND (v_compact LIKE '%' || normalized_term || '%' OR v_reduced_compact LIKE '%' || normalized_term || '%'))
    )
  ORDER BY severity DESC, created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      false,
      'blocked'::text,
      v_rule.category,
      v_rule.id;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_moderation_next_username(
  _base text,
  _profile_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_base text := regexp_replace(public.identity_username_canonical(_base), '[^a-z0-9_]+', '', 'g');
  v_candidate text;
  v_suffix integer := 0;
BEGIN
  v_base := regexp_replace(v_base, '_+', '_', 'g');

  IF v_base = '' OR char_length(v_base) < 3 OR v_base !~ '^[a-z0-9]' THEN
    v_base := 'pirate_' || left(replace(_profile_id::text, '-', ''), 8);
  END IF;

  v_base := left(regexp_replace(v_base, '^_+|_+$', '', 'g'), 20);
  IF char_length(v_base) < 3 THEN
    v_base := 'pirate_' || left(replace(_profile_id::text, '-', ''), 8);
  END IF;

  LOOP
    IF v_suffix = 0 THEN
      v_candidate := left(v_base, 20);
    ELSE
      v_candidate := left(v_base, greatest(3, 20 - char_length(v_suffix::text) - 1)) || '_' || v_suffix::text;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE username = v_candidate
        AND id IS DISTINCT FROM _profile_id
    ) THEN
      RETURN v_candidate;
    END IF;

    v_suffix := v_suffix + 1;
    IF v_suffix > 9999 THEN
      RAISE EXCEPTION 'IDENTITY_USERNAME_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_public_identity_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_allowed boolean;
  v_code text;
  v_category text;
  v_override text := coalesce(current_setting('app.identity_moderation_username_override', true), '');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.username IS DISTINCT FROM OLD.username
       AND NOT (
         v_override = 'restore_incident'
         OR (
           v_override = 'admin_reset'
           AND auth.uid() IS NOT NULL
           AND public.has_role(auth.uid(), 'admin'::public.app_role)
         )
       ) THEN
      RAISE EXCEPTION 'IDENTITY_USERNAME_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.username IS DISTINCT FROM OLD.username) THEN
    IF v_override <> 'restore_incident' THEN
      SELECT allowed, violation_code, category
      INTO v_allowed, v_code, v_category
      FROM public.evaluate_public_identity(NEW.username, 'username')
      LIMIT 1;

      IF NOT v_allowed THEN
        RAISE EXCEPTION 'IDENTITY_USERNAME_REJECTED' USING ERRCODE = 'P0001', DETAIL = v_code, HINT = v_category;
      END IF;
    END IF;
  END IF;

  IF NEW.display_name IS NOT NULL
     AND v_override <> 'restore_incident'
     AND (
       TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND NEW.display_name IS DISTINCT FROM OLD.display_name)
     ) THEN
    NEW.display_name := public.identity_moderation_clean_display(NEW.display_name);

    SELECT allowed, violation_code, category
    INTO v_allowed, v_code, v_category
    FROM public.evaluate_public_identity(NEW.display_name, 'display_name')
    LIMIT 1;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'IDENTITY_DISPLAY_NAME_REJECTED' USING ERRCODE = 'P0001', DETAIL = v_code, HINT = v_category;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_provider text;
  v_metadata_username text;
  v_metadata_canonical text;
  v_email_prefix text;
  v_raw_username text;
  v_raw_display_name text;
  v_candidate_base text;
  v_candidate text;
  v_clean_display_name text;
  v_display_name text;
  v_allowed boolean;
  v_attempt integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    INSERT INTO public.user_wallets (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  END IF;

  v_provider := lower(coalesce(NEW.raw_app_meta_data ->> 'provider', 'email'));
  v_metadata_username := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'username', '')), '');
  v_metadata_canonical := public.identity_username_canonical(v_metadata_username);
  v_email_prefix := split_part(coalesce(NEW.email, ''), '@', 1);

  IF v_provider = 'email' THEN
    IF v_metadata_username IS NULL THEN
      RAISE EXCEPTION 'IDENTITY_USERNAME_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    SELECT allowed INTO v_allowed
    FROM public.evaluate_public_identity(v_metadata_username, 'username')
    LIMIT 1;

    IF NOT coalesce(v_allowed, false) THEN
      RAISE EXCEPTION 'IDENTITY_USERNAME_REJECTED' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE username = v_metadata_canonical
        AND id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'IDENTITY_USERNAME_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    v_candidate_base := v_metadata_canonical;
  ELSIF v_metadata_username IS NOT NULL THEN
    v_raw_username := v_metadata_username;
  ELSE
    v_raw_username := regexp_replace(public.identity_username_canonical(v_email_prefix), '[^a-z0-9]+', '_', 'g');
    v_raw_username := regexp_replace(v_raw_username, '_+', '_', 'g');
    v_raw_username := regexp_replace(v_raw_username, '^_+|_+$', '', 'g');
  END IF;

  IF v_provider <> 'email' THEN
    SELECT allowed INTO v_allowed
    FROM public.evaluate_public_identity(v_raw_username, 'username')
    LIMIT 1;

    IF coalesce(v_allowed, false) THEN
      v_candidate_base := public.identity_username_canonical(v_raw_username);
    ELSE
      v_candidate_base := 'pirate_' || left(replace(NEW.id::text, '-', ''), 8);
    END IF;
  END IF;

  v_raw_display_name := coalesce(NEW.raw_user_meta_data ->> 'display_name', v_candidate_base);
  SELECT allowed INTO v_allowed
  FROM public.evaluate_public_identity(v_raw_display_name, 'display_name')
  LIMIT 1;

  IF coalesce(v_allowed, false) THEN
    v_clean_display_name := public.identity_moderation_clean_display(v_raw_display_name);
  END IF;

  IF v_provider = 'email' THEN
    v_candidate := v_metadata_canonical;
    v_display_name := coalesce(v_clean_display_name, v_candidate);

    BEGIN
      INSERT INTO public.profiles (id, username, display_name)
      VALUES (NEW.id, v_candidate, v_display_name);
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'IDENTITY_USERNAME_UNAVAILABLE' USING ERRCODE = 'P0001';
    END;
  ELSE
    LOOP
      v_attempt := v_attempt + 1;
      IF v_attempt > 8 THEN
        RAISE EXCEPTION 'IDENTITY_USERNAME_UNAVAILABLE' USING ERRCODE = 'P0001';
      END IF;

      v_candidate := public.identity_moderation_next_username(v_candidate_base, NEW.id);
      v_display_name := coalesce(v_clean_display_name, v_candidate);

      BEGIN
        INSERT INTO public.profiles (id, username, display_name)
        VALUES (NEW.id, v_candidate, v_display_name);

        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
            EXIT;
          END IF;
      END;
    END LOOP;
  END IF;

  INSERT INTO public.user_wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

UPDATE public.identity_moderation_terms
SET active = false,
    updated_at = now()
WHERE kind = 'blocked'
  AND category = 'common_profanity'
  AND normalized_term IN ('idiot', 'stupid', 'trash');

UPDATE public.identity_moderation_terms
SET active = true,
    updated_at = now()
WHERE kind = 'blocked'
  AND category = 'common_profanity'
  AND normalized_term IN ('damn', 'hell', 'crap');

UPDATE public.identity_moderation_terms
SET category = 'severe_profanity',
    active = true,
    updated_at = now()
WHERE kind = 'blocked'
  AND category = 'sexual_profanity'
  AND normalized_term IN ('dick', 'cock', 'pussy');

UPDATE public.identity_moderation_terms
SET active = false,
    updated_at = now()
WHERE kind = 'blocked'
  AND category = 'sexual_profanity'
  AND normalized_term IN ('porn', 'xxx', 'sex');

UPDATE public.identity_moderation_terms
SET active = false,
    updated_at = now()
WHERE active
  AND kind IN ('blocked', 'reserved')
  AND (
    kind = 'reserved'
    OR category NOT IN (
      'common_profanity',
      'severe_profanity',
      'racial_ethnic_slur',
      'religious_slur',
      'nationality_slur',
      'sex_gender_slur',
      'sexual_orientation_slur',
      'disability_slur'
    )
  );

CREATE OR REPLACE FUNCTION public.restore_public_identity_remediation_incident()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_action public.identity_moderation_actions%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_username_candidates integer := 0;
  v_usernames_restored integer := 0;
  v_username_conflicts integer := 0;
  v_explicit_display_name_candidates integer := 0;
  v_explicit_display_names_restored integer := 0;
  v_derived_display_name_candidates integer := 0;
  v_derived_display_names_restored integer := 0;
  v_skipped_changed_later integer := 0;
  v_missing_profiles integer := 0;
  v_reason text := 'Restored identity changed by the July 19, 2026 automatic-remediation incident.';
  v_derived_reason text := 'Restored display identity changed as a side effect of the July 19, 2026 username-remediation incident.';
BEGIN
  PERFORM set_config('app.identity_moderation_username_override', 'restore_incident', true);

  FOR v_action IN
    SELECT DISTINCT ON (profile_id, field) *
    FROM public.identity_moderation_actions
    WHERE action_type = 'auto_remediate'
      AND field = 'username'
      AND reason = 'Existing username failed public identity policy during migration.'
      AND previous_value IS NOT NULL
      AND new_value IS NOT NULL
    ORDER BY profile_id, field, created_at ASC, id ASC
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.identity_moderation_actions existing
      WHERE existing.profile_id = v_action.profile_id
        AND existing.field = 'username'
        AND existing.action_type IN ('incident_restore', 'incident_restore_conflict')
        AND existing.previous_value = v_action.new_value
        AND existing.new_value = v_action.previous_value
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_action.profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_missing_profiles := v_missing_profiles + 1;
      CONTINUE;
    END IF;

    IF v_profile.username IS DISTINCT FROM v_action.new_value THEN
      v_skipped_changed_later := v_skipped_changed_later + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.identity_moderation_actions later_action
      WHERE later_action.profile_id = v_action.profile_id
        AND later_action.field = 'username'
        AND later_action.action_type IN ('admin_reset', 'incident_restore')
        AND (
          later_action.created_at > v_action.created_at
          OR (
            later_action.created_at = v_action.created_at
            AND later_action.id::text > v_action.id::text
          )
        )
    ) THEN
      v_skipped_changed_later := v_skipped_changed_later + 1;
      CONTINUE;
    END IF;

    v_username_candidates := v_username_candidates + 1;

    IF EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE username = v_action.previous_value
        AND id IS DISTINCT FROM v_action.profile_id
    ) THEN
      v_username_conflicts := v_username_conflicts + 1;

      INSERT INTO public.identity_moderation_actions
        (profile_id, action_type, field, previous_value, new_value, reason, term_id)
      SELECT
        v_action.profile_id,
        'incident_restore_conflict',
        'username',
        v_action.new_value,
        v_action.previous_value,
        'Could not automatically restore July 19, 2026 username; manual review required.',
        v_action.term_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.identity_moderation_actions existing
        WHERE existing.profile_id = v_action.profile_id
          AND existing.action_type = 'incident_restore_conflict'
          AND existing.field = 'username'
          AND existing.previous_value = v_action.new_value
          AND existing.new_value = v_action.previous_value
      );

      CONTINUE;
    END IF;

    UPDATE public.profiles
    SET username = v_action.previous_value
    WHERE id = v_action.profile_id
      AND username = v_action.new_value;

    IF FOUND THEN
      INSERT INTO public.identity_moderation_actions
        (profile_id, action_type, field, previous_value, new_value, reason, term_id)
      SELECT
        v_action.profile_id,
        'incident_restore',
        'username',
        v_action.new_value,
        v_action.previous_value,
        v_reason,
        v_action.term_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.identity_moderation_actions existing
        WHERE existing.profile_id = v_action.profile_id
          AND existing.action_type = 'incident_restore'
          AND existing.field = 'username'
          AND existing.previous_value = v_action.new_value
          AND existing.new_value = v_action.previous_value
      );

      v_usernames_restored := v_usernames_restored + 1;
    END IF;
  END LOOP;

  FOR v_action IN
    SELECT DISTINCT ON (profile_id, field) *
    FROM public.identity_moderation_actions
    WHERE action_type = 'auto_remediate'
      AND field = 'display_name'
      AND reason = 'Existing display name failed public identity policy during migration.'
      AND previous_value IS NOT NULL
      AND new_value IS NOT NULL
    ORDER BY profile_id, field, created_at ASC, id ASC
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.identity_moderation_actions existing
      WHERE existing.profile_id = v_action.profile_id
        AND existing.action_type = 'incident_restore'
        AND existing.field = 'display_name'
        AND existing.previous_value = v_action.new_value
        AND existing.new_value = v_action.previous_value
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_action.profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_missing_profiles := v_missing_profiles + 1;
      CONTINUE;
    END IF;

    IF v_profile.display_name IS DISTINCT FROM v_action.new_value THEN
      v_skipped_changed_later := v_skipped_changed_later + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.identity_moderation_actions later_action
      WHERE later_action.profile_id = v_action.profile_id
        AND later_action.field = 'display_name'
        AND later_action.action_type IN ('admin_reset', 'incident_restore')
        AND (
          later_action.created_at > v_action.created_at
          OR (
            later_action.created_at = v_action.created_at
            AND later_action.id::text > v_action.id::text
          )
        )
    ) THEN
      v_skipped_changed_later := v_skipped_changed_later + 1;
      CONTINUE;
    END IF;

    v_explicit_display_name_candidates := v_explicit_display_name_candidates + 1;

    UPDATE public.profiles
    SET display_name = v_action.previous_value
    WHERE id = v_action.profile_id
      AND display_name = v_action.new_value;

    IF FOUND THEN
      INSERT INTO public.identity_moderation_actions
        (profile_id, action_type, field, previous_value, new_value, reason, term_id)
      SELECT
        v_action.profile_id,
        'incident_restore',
        'display_name',
        v_action.new_value,
        v_action.previous_value,
        v_reason,
        v_action.term_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.identity_moderation_actions existing
        WHERE existing.profile_id = v_action.profile_id
          AND existing.action_type = 'incident_restore'
          AND existing.field = 'display_name'
          AND existing.previous_value = v_action.new_value
          AND existing.new_value = v_action.previous_value
      );

      v_explicit_display_names_restored := v_explicit_display_names_restored + 1;
    END IF;
  END LOOP;

  FOR v_action IN
    SELECT DISTINCT ON (profile_id, field) *
    FROM public.identity_moderation_actions
    WHERE action_type = 'auto_remediate'
      AND field = 'username'
      AND reason = 'Existing username failed public identity policy during migration.'
      AND previous_value IS NOT NULL
      AND new_value IS NOT NULL
    ORDER BY profile_id, field, created_at ASC, id ASC
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.identity_moderation_actions existing
      WHERE existing.profile_id = v_action.profile_id
        AND existing.action_type = 'incident_restore'
        AND existing.field = 'display_name'
        AND existing.previous_value = v_action.new_value
        AND existing.new_value = v_action.previous_value
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.identity_moderation_actions explicit_display_action
      WHERE explicit_display_action.profile_id = v_action.profile_id
        AND explicit_display_action.action_type = 'auto_remediate'
        AND explicit_display_action.field = 'display_name'
        AND explicit_display_action.reason = 'Existing display name failed public identity policy during migration.'
        AND explicit_display_action.previous_value IS NOT NULL
        AND explicit_display_action.new_value IS NOT NULL
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_action.profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_missing_profiles := v_missing_profiles + 1;
      CONTINUE;
    END IF;

    IF v_profile.display_name IS DISTINCT FROM v_action.new_value THEN
      v_skipped_changed_later := v_skipped_changed_later + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.identity_moderation_actions later_action
      WHERE later_action.profile_id = v_action.profile_id
        AND later_action.field = 'display_name'
        AND later_action.action_type IN ('admin_reset', 'incident_restore')
        AND (
          later_action.created_at > v_action.created_at
          OR (
            later_action.created_at = v_action.created_at
            AND later_action.id::text > v_action.id::text
          )
        )
    ) THEN
      v_skipped_changed_later := v_skipped_changed_later + 1;
      CONTINUE;
    END IF;

    v_derived_display_name_candidates := v_derived_display_name_candidates + 1;

    UPDATE public.profiles
    SET display_name = v_action.previous_value
    WHERE id = v_action.profile_id
      AND display_name = v_action.new_value;

    IF FOUND THEN
      INSERT INTO public.identity_moderation_actions
        (profile_id, action_type, field, previous_value, new_value, reason, term_id)
      SELECT
        v_action.profile_id,
        'incident_restore',
        'display_name',
        v_action.new_value,
        v_action.previous_value,
        v_derived_reason,
        v_action.term_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.identity_moderation_actions existing
        WHERE existing.profile_id = v_action.profile_id
          AND existing.action_type = 'incident_restore'
          AND existing.field = 'display_name'
          AND existing.previous_value = v_action.new_value
          AND existing.new_value = v_action.previous_value
      );

      v_derived_display_names_restored := v_derived_display_names_restored + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'usernameCandidates', v_username_candidates,
    'usernamesRestored', v_usernames_restored,
    'usernameConflicts', v_username_conflicts,
    'explicitDisplayNameCandidates', v_explicit_display_name_candidates,
    'explicitDisplayNamesRestored', v_explicit_display_names_restored,
    'derivedDisplayNameCandidates', v_derived_display_name_candidates,
    'derivedDisplayNamesRestored', v_derived_display_names_restored,
    'skippedBecauseChangedLater', v_skipped_changed_later,
    'missingProfiles', v_missing_profiles
  );
END;
$$;

SELECT public.restore_public_identity_remediation_incident();

DROP FUNCTION IF EXISTS public.remediate_existing_public_identities();

REVOKE EXECUTE ON FUNCTION public.evaluate_public_identity(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_username_canonical(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_username_legacy_format_valid(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_normalize(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_words(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_compact(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_reduce_repeats(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_clean_display(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_next_username(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_public_identity_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_public_identity_remediation_incident() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_profile_identity(uuid, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.evaluate_public_identity(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_username_canonical(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_username_legacy_format_valid(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_normalize(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_words(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_compact(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_reduce_repeats(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_clean_display(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_next_username(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_public_identity_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_public_identity_remediation_incident() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_profile_identity(uuid, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_profile_identity(uuid, boolean, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
