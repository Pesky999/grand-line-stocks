BEGIN;

-- Reconcile the live account lifecycle repairs into migration history. This
-- migration is intentionally forward-only: it replaces definitions and
-- constraints, backfills only missing onboarding rows, and leaves unrelated
-- product data untouched.

CREATE OR REPLACE FUNCTION public.identity_username_legacy_format_valid(_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.identity_username_canonical(_value) = btrim(coalesce(_value, ''))
    AND char_length(public.identity_username_canonical(_value)) BETWEEN 3 AND 20
    AND public.identity_username_canonical(_value) ~ '^[a-z0-9]([a-z0-9_]{1,18}[a-z0-9])$'
    AND strpos(public.identity_username_canonical(_value), '__') = 0
    AND public.identity_username_canonical(_value) !~ '(.)\1{9,}';
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
       OR strpos(v_canonical, '__') > 0
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

  SELECT terms.*
  INTO v_rule
  FROM public.identity_moderation_terms AS terms
  WHERE terms.active
    AND terms.kind = 'allow'
    AND (
      terms.normalized_term = v_normalized
      OR terms.normalized_term = v_words
      OR terms.normalized_term = v_compact
    )
  ORDER BY terms.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, NULL::text, NULL::text, v_rule.id;
    RETURN;
  END IF;

  SELECT terms.*
  INTO v_rule
  FROM public.identity_moderation_terms AS terms
  WHERE terms.active
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
      (terms.match_mode = 'exact' AND terms.normalized_term IN (v_normalized, v_words, v_compact))
      OR (terms.match_mode = 'word' AND terms.normalized_term = ANY (regexp_split_to_array(v_words, '[[:space:]]+')))
      OR (terms.match_mode = 'substring' AND (v_normalized LIKE '%' || terms.normalized_term || '%' OR v_words LIKE '%' || terms.normalized_term || '%' OR v_reduced LIKE '%' || terms.normalized_term || '%'))
      OR (terms.match_mode = 'compact_substring' AND (v_compact LIKE '%' || terms.normalized_term || '%' OR v_reduced_compact LIKE '%' || terms.normalized_term || '%'))
    )
  ORDER BY terms.severity DESC, terms.created_at ASC
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

REVOKE EXECUTE ON FUNCTION public.identity_username_legacy_format_valid(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_public_identity(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_username_legacy_format_valid(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_public_identity(text, text) TO service_role;

UPDATE public.identity_moderation_terms AS terms
SET category = 'severe_profanity',
    active = true,
    updated_at = now()
WHERE terms.kind = 'blocked'
  AND terms.category = 'common_profanity'
  AND terms.normalized_term IN ('damn', 'hell', 'crap');

UPDATE public.identity_moderation_terms AS terms
SET active = false,
    updated_at = now()
WHERE terms.active
  AND (
    terms.kind = 'reserved'
    OR (
      terms.kind = 'blocked'
      AND terms.category NOT IN (
        'severe_profanity',
        'racial_ethnic_slur',
        'religious_slur',
        'nationality_slur',
        'sex_gender_slur',
        'sexual_orientation_slur',
        'disability_slur'
      )
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.identity_moderation_flags AS flags
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles AS profiles WHERE profiles.id = flags.profile_id
    )
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile identity_moderation_flags.profile_id: orphan profile references exist';
  END IF;
END $$;

ALTER TABLE public.identity_moderation_flags
  DROP CONSTRAINT IF EXISTS identity_moderation_flags_profile_id_fkey;

ALTER TABLE public.identity_moderation_flags
  ADD CONSTRAINT identity_moderation_flags_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT identity_moderation_flags_profile_id_fkey
  ON public.identity_moderation_flags
  IS 'Profile-specific moderation flags are removed with the deleted profile.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.identity_moderation_actions AS actions
    WHERE actions.profile_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles AS profiles WHERE profiles.id = actions.profile_id
      )
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile identity_moderation_actions.profile_id: orphan profile references exist';
  END IF;
END $$;

ALTER TABLE public.identity_moderation_actions
  DROP CONSTRAINT IF EXISTS identity_moderation_actions_profile_id_fkey;

ALTER TABLE public.identity_moderation_actions
  ADD CONSTRAINT identity_moderation_actions_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT identity_moderation_actions_profile_id_fkey
  ON public.identity_moderation_actions
  IS 'Moderation actions about a deleted profile are removed with that profile.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.character_pricing_ratings AS ratings
    WHERE ratings.created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users AS au WHERE au.id = ratings.created_by
      )
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile character_pricing_ratings.created_by: orphan user references exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.character_pricing_ratings AS ratings
    WHERE ratings.updated_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users AS au WHERE au.id = ratings.updated_by
      )
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile character_pricing_ratings.updated_by: orphan user references exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.character_pricing_ratings AS ratings
    WHERE ratings.approved_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users AS au WHERE au.id = ratings.approved_by
      )
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile character_pricing_ratings.approved_by: orphan user references exist';
  END IF;
END $$;

ALTER TABLE public.character_pricing_ratings
  DROP CONSTRAINT IF EXISTS character_pricing_ratings_created_by_fkey;

ALTER TABLE public.character_pricing_ratings
  ADD CONSTRAINT character_pricing_ratings_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.character_pricing_ratings
  DROP CONSTRAINT IF EXISTS character_pricing_ratings_updated_by_fkey;

ALTER TABLE public.character_pricing_ratings
  ADD CONSTRAINT character_pricing_ratings_updated_by_fkey
  FOREIGN KEY (updated_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.character_pricing_ratings
  DROP CONSTRAINT IF EXISTS character_pricing_ratings_approved_by_fkey;

ALTER TABLE public.character_pricing_ratings
  ADD CONSTRAINT character_pricing_ratings_approved_by_fkey
  FOREIGN KEY (approved_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.character_pricing_ratings
  DROP CONSTRAINT IF EXISTS character_pricing_ratings_approval_metadata_check;

ALTER TABLE public.character_pricing_ratings
  ADD CONSTRAINT character_pricing_ratings_approval_metadata_check CHECK (
    (
      ratings_status = 'draft'
      AND approved_at IS NULL
      AND approved_by IS NULL
    )
    OR
    (
      ratings_status = 'approved'
      AND approved_at IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT character_pricing_ratings_created_by_fkey
  ON public.character_pricing_ratings
  IS 'Shared pricing drafts remain while deleted author references are anonymized.';

COMMENT ON CONSTRAINT character_pricing_ratings_updated_by_fkey
  ON public.character_pricing_ratings
  IS 'Shared pricing records remain while deleted editor references are anonymized.';

COMMENT ON CONSTRAINT character_pricing_ratings_approved_by_fkey
  ON public.character_pricing_ratings
  IS 'Shared approved pricing records remain while deleted approver references are anonymized.';

COMMENT ON CONSTRAINT character_pricing_ratings_approval_metadata_check
  ON public.character_pricing_ratings
  IS 'Approved pricing requires an approval timestamp; the approver reference may be null after account deletion anonymizes audit actors.';

CREATE OR REPLACE FUNCTION public.create_onboarding_progress_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_onboarding_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_onboarding_progress_for_profile()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_onboarding_progress_for_profile()
  TO service_role;

DROP TRIGGER IF EXISTS create_onboarding_progress_for_profile_trigger ON public.profiles;
CREATE TRIGGER create_onboarding_progress_for_profile_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_onboarding_progress_for_profile();

DO $$
DECLARE
  v_traded_count integer := 0;
  v_no_trade_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT
      profiles.id AS user_id,
      EXISTS (
        SELECT 1
        FROM public.transactions AS transactions
        WHERE transactions.user_id = profiles.id
      ) AS has_traded
    FROM public.profiles AS profiles
    LEFT JOIN public.user_onboarding_progress AS existing
      ON existing.user_id = profiles.id
    WHERE existing.user_id IS NULL
  ),
  inserted AS (
    INSERT INTO public.user_onboarding_progress (
      user_id,
      stock_tutorial_offer,
      page_tips_disabled
    )
    SELECT
      candidates.user_id,
      CASE WHEN candidates.has_traded THEN 'none' ELSE 'soft' END,
      candidates.has_traded
    FROM candidates
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id, stock_tutorial_offer
  )
  SELECT
    count(*) FILTER (WHERE inserted.stock_tutorial_offer = 'none'),
    count(*) FILTER (WHERE inserted.stock_tutorial_offer = 'soft'),
    count(*)
  INTO v_traded_count, v_no_trade_count, v_inserted_count
  FROM inserted;

  RAISE NOTICE
    'Account lifecycle onboarding reconciliation: traded=%, no_trade=%, total_inserted=%',
    v_traded_count,
    v_no_trade_count,
    v_inserted_count;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
