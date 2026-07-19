BEGIN;

CREATE TABLE IF NOT EXISTS public.identity_moderation_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  normalized_term text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('blocked', 'reserved', 'allow')),
  category text NOT NULL,
  match_mode text NOT NULL CHECK (match_mode IN ('exact', 'word', 'substring', 'compact_substring')),
  severity integer NOT NULL CHECK (severity BETWEEN 1 AND 4),
  notes text,
  is_core boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_term, kind, match_mode, category)
);

CREATE TABLE IF NOT EXISTS public.identity_moderation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  field text NOT NULL CHECK (field IN ('username', 'display_name')),
  observed_value text,
  normalized_value text NOT NULL,
  term_id uuid REFERENCES public.identity_moderation_terms(id) ON DELETE SET NULL,
  violation_code text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved', 'dismissed')),
  resolution_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.identity_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (
    action_type IN (
      'auto_flag',
      'auto_remediate',
      'admin_reset',
      'rule_create',
      'rule_update',
      'flag_review'
    )
  ),
  field text CHECK (field IN ('username', 'display_name')),
  previous_value text,
  new_value text,
  reason text,
  term_id uuid REFERENCES public.identity_moderation_terms(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_moderation_terms_active
  ON public.identity_moderation_terms (active, kind, match_mode, category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_moderation_terms_active_unique
  ON public.identity_moderation_terms (normalized_term, kind, match_mode)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_identity_moderation_flags_status
  ON public.identity_moderation_flags (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_moderation_flags_profile
  ON public.identity_moderation_flags (profile_id, status);

CREATE INDEX IF NOT EXISTS idx_identity_moderation_actions_profile
  ON public.identity_moderation_actions (profile_id, created_at DESC);

ALTER TABLE public.identity_moderation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_moderation_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_moderation_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.identity_moderation_terms FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.identity_moderation_flags FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.identity_moderation_actions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.identity_moderation_terms TO service_role;
GRANT ALL ON public.identity_moderation_flags TO service_role;
GRANT ALL ON public.identity_moderation_actions TO service_role;

CREATE OR REPLACE FUNCTION public.identity_moderation_normalize(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT btrim(
    regexp_replace(
      translate(
        translate(
          translate(
            lower(normalize(coalesce(_value, ''), NFKC)),
            U&'\03B1\0430\03BF\043E\0441\0440\0435\0445\0443\0456',
            'aaoocpexyi'
          ),
          U&'\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\FEFF',
          ''
        ),
        '0134578@$!',
        'oieastbasi'
      ),
      '[[:cntrl:]]+',
      '',
      'g'
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

CREATE OR REPLACE FUNCTION public.identity_moderation_reduce_repeats(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT regexp_replace(_value, '(.)\1{2,}', '\1\1', 'g');
$$;

CREATE OR REPLACE FUNCTION public.identity_moderation_clean_display(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT btrim(
    regexp_replace(
      translate(
        normalize(coalesce(_value, ''), NFKC),
        U&'\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\FEFF',
        ''
      ),
      '[[:cntrl:]]+',
      '',
      'g'
    )
  );
$$;

INSERT INTO public.identity_moderation_terms
  (term, normalized_term, kind, category, match_mode, severity, is_core)
VALUES
  ('admin', 'admin', 'reserved', 'reserved', 'exact', 3, true),
  ('administrator', 'administrator', 'reserved', 'reserved', 'exact', 3, true),
  ('moderator', 'moderator', 'reserved', 'reserved', 'exact', 3, true),
  ('staff', 'staff', 'reserved', 'reserved', 'exact', 3, true),
  ('support', 'support', 'reserved', 'reserved', 'exact', 2, true),
  ('official', 'official', 'reserved', 'reserved', 'exact', 2, true),
  ('system', 'system', 'reserved', 'reserved', 'exact', 2, true),
  ('mod', 'mod', 'reserved', 'reserved', 'exact', 3, true),
  ('developer', 'developer', 'reserved', 'reserved', 'exact', 3, true),
  ('dev', 'dev', 'reserved', 'reserved', 'exact', 3, true),
  ('owner', 'owner', 'reserved', 'reserved', 'exact', 3, true),
  ('site staff', 'site staff', 'reserved', 'reserved', 'exact', 3, true),
  ('customer support', 'customer support', 'reserved', 'reserved', 'exact', 3, true),
  ('one piece staff', 'one piece staff', 'reserved', 'reserved', 'exact', 3, true),
  ('toeianimation', 'toeianimation', 'reserved', 'reserved', 'compact_substring', 3, true),
  ('shueisha', 'shueisha', 'reserved', 'reserved', 'exact', 3, true),
  ('oda', 'oda', 'reserved', 'reserved', 'exact', 2, true),
  ('berrystreet', 'berrystreet', 'reserved', 'reserved', 'compact_substring', 3, true),
  ('grandlinestocks', 'grandlinestocks', 'reserved', 'reserved', 'compact_substring', 3, true),
  ('bit.ly', 'bitly', 'blocked', 'contact_info', 'compact_substring', 2, true),
  ('discord.gg', 'discordgg', 'blocked', 'contact_info', 'compact_substring', 2, true),
  ('kill', 'kill', 'blocked', 'threat', 'word', 4, true),
  ('die', 'die', 'blocked', 'threat', 'word', 4, true),
  ('kill yourself', 'kill yourself', 'blocked', 'threat', 'word', 4, true),
  ('terror', 'terror', 'blocked', 'threat', 'substring', 4, true),
  ('nazi', 'nazi', 'blocked', 'hate_group', 'compact_substring', 4, true),
  ('kkk', 'kkk', 'blocked', 'hate_group', 'compact_substring', 4, true),
  ('hitler', 'hitler', 'blocked', 'hate_group', 'compact_substring', 4, true),
  ('whitepower', 'whitepower', 'blocked', 'hate_group', 'compact_substring', 4, true),
  ('damn', 'damn', 'blocked', 'common_profanity', 'word', 1, true),
  ('hell', 'hell', 'blocked', 'common_profanity', 'word', 1, true),
  ('crap', 'crap', 'blocked', 'common_profanity', 'word', 1, true),
  ('idiot', 'idiot', 'blocked', 'common_profanity', 'word', 1, true),
  ('stupid', 'stupid', 'blocked', 'common_profanity', 'word', 1, true),
  ('trash', 'trash', 'blocked', 'common_profanity', 'word', 1, true),
  ('asshole', 'asshole', 'blocked', 'severe_profanity', 'compact_substring', 3, true),
  ('bastard', 'bastard', 'blocked', 'severe_profanity', 'word', 3, true),
  ('fuck', 'fuck', 'blocked', 'severe_profanity', 'compact_substring', 3, true),
  ('shit', 'shit', 'blocked', 'severe_profanity', 'compact_substring', 3, true),
  ('cunt', 'cunt', 'blocked', 'severe_profanity', 'compact_substring', 4, true),
  ('hate', 'hate', 'blocked', 'harassment', 'word', 2, true),
  ('loser', 'loser', 'blocked', 'harassment', 'word', 2, true),
  ('dox', 'dox', 'blocked', 'privacy_abuse', 'word', 3, true),
  ('doxx', 'doxx', 'blocked', 'privacy_abuse', 'substring', 3, true),
  ('nigger', 'nigger', 'blocked', 'racial_ethnic_slur', 'compact_substring', 4, true),
  ('nigga', 'nigga', 'blocked', 'racial_ethnic_slur', 'compact_substring', 4, true),
  ('chink', 'chink', 'blocked', 'racial_ethnic_slur', 'compact_substring', 4, true),
  ('gook', 'gook', 'blocked', 'racial_ethnic_slur', 'compact_substring', 4, true),
  ('spic', 'spic', 'blocked', 'racial_ethnic_slur', 'compact_substring', 4, true),
  ('wetback', 'wetback', 'blocked', 'racial_ethnic_slur', 'compact_substring', 4, true),
  ('kike', 'kike', 'blocked', 'religious_slur', 'compact_substring', 4, true),
  ('heeb', 'heeb', 'blocked', 'religious_slur', 'compact_substring', 4, true),
  ('raghead', 'raghead', 'blocked', 'religious_slur', 'compact_substring', 4, true),
  ('paki', 'paki', 'blocked', 'nationality_slur', 'compact_substring', 4, true),
  ('gypsy', 'gypsy', 'blocked', 'nationality_slur', 'word', 3, true),
  ('bitch', 'bitch', 'blocked', 'sex_gender_slur', 'word', 3, true),
  ('slut', 'slut', 'blocked', 'sex_gender_slur', 'word', 3, true),
  ('tranny', 'tranny', 'blocked', 'sex_gender_slur', 'compact_substring', 4, true),
  ('fag', 'fag', 'blocked', 'sexual_orientation_slur', 'word', 4, true),
  ('faggot', 'faggot', 'blocked', 'sexual_orientation_slur', 'compact_substring', 4, true),
  ('dyke', 'dyke', 'blocked', 'sexual_orientation_slur', 'word', 4, true),
  ('retard', 'retard', 'blocked', 'disability_slur', 'compact_substring', 4, true),
  ('spaz', 'spaz', 'blocked', 'disability_slur', 'word', 3, true),
  ('porn', 'porn', 'blocked', 'sexual_profanity', 'compact_substring', 3, true),
  ('xxx', 'xxx', 'blocked', 'sexual_profanity', 'compact_substring', 3, true),
  ('sex', 'sex', 'blocked', 'sexual_profanity', 'word', 3, true),
  ('dick', 'dick', 'blocked', 'sexual_profanity', 'word', 3, true),
  ('cock', 'cock', 'blocked', 'sexual_profanity', 'word', 3, true),
  ('pussy', 'pussy', 'blocked', 'sexual_profanity', 'word', 3, true),
  ('classic', 'classic', 'allow', 'allow', 'exact', 1, true)
ON CONFLICT (normalized_term, kind, match_mode, category)
DO UPDATE SET
  term = EXCLUDED.term,
  severity = EXCLUDED.severity,
  is_core = EXCLUDED.is_core,
  active = EXCLUDED.active,
  updated_at = now();

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
  v_normalized text := public.identity_moderation_normalize(v_value);
  v_words text := public.identity_moderation_words(v_value);
  v_compact text := public.identity_moderation_compact(v_value);
  v_reduced text := public.identity_moderation_reduce_repeats(v_words);
  v_reduced_compact text := regexp_replace(public.identity_moderation_reduce_repeats(v_compact), '[^[:alnum:]]+', '', 'g');
  v_contact_value text := normalize(v_value, NFKC);
  v_display_value text := public.identity_moderation_clean_display(v_value);
  v_rule public.identity_moderation_terms%ROWTYPE;
BEGIN
  IF _field NOT IN ('username', 'display_name') THEN
    RETURN QUERY SELECT false, 'invalid_format'::text, 'format'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_contact_value ~* '(^|[^[:alnum:]_])(https?://|www\.)'
     OR v_contact_value ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
     OR v_contact_value ~ '(\+?[0-9][[:space:]().-]*){7,}' THEN
    RETURN QUERY SELECT false, 'contact_info'::text, 'contact_info'::text, NULL::uuid;
    RETURN;
  END IF;

  IF _field = 'username' THEN
    IF v_normalized = '' THEN
      RETURN QUERY SELECT false, 'empty'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF char_length(v_normalized) < 3 THEN
      RETURN QUERY SELECT false, 'too_short'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF char_length(v_normalized) > 20 THEN
      RETURN QUERY SELECT false, 'too_long'::text, 'format'::text, NULL::uuid;
      RETURN;
    END IF;

    IF v_normalized <> btrim(v_value)
       OR v_normalized !~ '^[a-z0-9]([a-z0-9_]{1,18}[a-z0-9])$'
       OR v_normalized LIKE '%__%'
       OR v_normalized ~ '(.)\1{9,}' THEN
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
    AND kind IN ('blocked', 'reserved')
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
      CASE WHEN v_rule.kind = 'reserved' THEN 'reserved' ELSE 'blocked' END,
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
  v_base text := regexp_replace(public.identity_moderation_normalize(_base), '[^a-z0-9_]+', '', 'g');
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
  IF TG_OP = 'UPDATE'
     AND NEW.username IS DISTINCT FROM OLD.username
     AND NOT (
       v_override = 'migration_remediate'
       OR (
         v_override = 'admin_reset'
         AND auth.uid() IS NOT NULL
         AND public.has_role(auth.uid(), 'admin'::public.app_role)
       )
     ) THEN
    RAISE EXCEPTION 'IDENTITY_USERNAME_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT allowed, violation_code, category
  INTO v_allowed, v_code, v_category
  FROM public.evaluate_public_identity(NEW.username, 'username')
  LIMIT 1;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'IDENTITY_USERNAME_REJECTED' USING ERRCODE = 'P0001', DETAIL = v_code, HINT = v_category;
  END IF;

  IF NEW.display_name IS NOT NULL THEN
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

CREATE OR REPLACE FUNCTION public.remediate_existing_public_identities()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_allowed boolean;
  v_code text;
  v_category text;
  v_term_id uuid;
  v_new_username text;
  v_new_display_name text;
  v_changed_count integer := 0;
  v_flag_count integer := 0;
BEGIN
  PERFORM set_config('app.identity_moderation_username_override', 'migration_remediate', true);

  FOR v_profile IN SELECT * FROM public.profiles ORDER BY created_at ASC LOOP
    SELECT allowed, violation_code, category, term_id
    INTO v_allowed, v_code, v_category, v_term_id
    FROM public.evaluate_public_identity(v_profile.username, 'username')
    LIMIT 1;

    IF NOT v_allowed THEN
      v_new_username := public.identity_moderation_next_username('pirate_' || left(replace(v_profile.id::text, '-', ''), 8), v_profile.id);

      INSERT INTO public.identity_moderation_flags
        (profile_id, field, observed_value, normalized_value, term_id, violation_code, category, status, reviewed_at)
      VALUES
        (v_profile.id, 'username', v_profile.username, public.identity_moderation_compact(v_profile.username), v_term_id, v_code, v_category, 'resolved', now());

      INSERT INTO public.identity_moderation_actions
        (profile_id, action_type, field, previous_value, new_value, reason, term_id)
      VALUES
        (v_profile.id, 'auto_remediate', 'username', v_profile.username, v_new_username, 'Existing username failed public identity policy during migration.', v_term_id);

      UPDATE public.profiles
      SET username = v_new_username,
          display_name = CASE
            WHEN display_name IS NULL OR display_name = v_profile.username THEN v_new_username
            ELSE display_name
          END
      WHERE id = v_profile.id;

      v_changed_count := v_changed_count + 1;
      v_flag_count := v_flag_count + 1;
    END IF;

    IF v_profile.display_name IS NOT NULL THEN
      SELECT allowed, violation_code, category, term_id
      INTO v_allowed, v_code, v_category, v_term_id
      FROM public.evaluate_public_identity(v_profile.display_name, 'display_name')
      LIMIT 1;

      IF NOT v_allowed THEN
        SELECT username INTO v_new_display_name
        FROM public.profiles
        WHERE id = v_profile.id;

        INSERT INTO public.identity_moderation_flags
          (profile_id, field, observed_value, normalized_value, term_id, violation_code, category, status, reviewed_at)
        VALUES
          (v_profile.id, 'display_name', v_profile.display_name, public.identity_moderation_compact(v_profile.display_name), v_term_id, v_code, v_category, 'resolved', now());

        INSERT INTO public.identity_moderation_actions
          (profile_id, action_type, field, previous_value, new_value, reason, term_id)
        VALUES
          (v_profile.id, 'auto_remediate', 'display_name', v_profile.display_name, v_new_display_name, 'Existing display name failed public identity policy during migration.', v_term_id);

        UPDATE public.profiles
        SET display_name = v_new_display_name
        WHERE id = v_profile.id;

        v_changed_count := v_changed_count + 1;
        v_flag_count := v_flag_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('changedCount', v_changed_count, 'flagCount', v_flag_count);
END;
$$;

SELECT public.remediate_existing_public_identities();

DROP TRIGGER IF EXISTS enforce_public_identity_profile_trigger ON public.profiles;
CREATE TRIGGER enforce_public_identity_profile_trigger
BEFORE INSERT OR UPDATE OF username, display_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_public_identity_profile();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_provider text;
  v_metadata_username text;
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
      WHERE username = v_metadata_username
        AND id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'IDENTITY_USERNAME_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    v_candidate_base := v_metadata_username;
  ELSIF v_metadata_username IS NOT NULL THEN
    v_raw_username := v_metadata_username;
  ELSE
    v_raw_username := regexp_replace(public.identity_moderation_normalize(v_email_prefix), '[^a-z0-9]+', '_', 'g');
    v_raw_username := regexp_replace(v_raw_username, '_+', '_', 'g');
    v_raw_username := regexp_replace(v_raw_username, '^_+|_+$', '', 'g');
  END IF;

  IF v_provider <> 'email' THEN
    SELECT allowed INTO v_allowed
    FROM public.evaluate_public_identity(v_raw_username, 'username')
    LIMIT 1;

    IF coalesce(v_allowed, false) THEN
      v_candidate_base := v_raw_username;
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

  INSERT INTO public.user_wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_profile_identity(
  _target_profile_id uuid,
  _reset_username boolean DEFAULT true,
  _reset_display_name boolean DEFAULT true,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_new_username text;
  v_new_display_name text;
  v_old_username text;
  v_old_display_name text;
  v_username_changed boolean;
  v_display_name_changed boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT coalesce(_reset_username, false) AND NOT coalesce(_reset_display_name, false) THEN
    RAISE EXCEPTION 'IDENTITY_RESET_SCOPE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = _target_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_old_username := v_profile.username;
  v_old_display_name := v_profile.display_name;
  v_new_username := v_profile.username;
  v_new_display_name := v_profile.display_name;

  IF _reset_username THEN
    v_new_username := public.identity_moderation_next_username('pirate_' || left(replace(_target_profile_id::text, '-', ''), 8), _target_profile_id);
  END IF;

  IF _reset_display_name THEN
    v_new_display_name := v_new_username;
  END IF;

  v_username_changed := coalesce(_reset_username, false) AND v_new_username IS DISTINCT FROM v_old_username;
  v_display_name_changed := coalesce(_reset_display_name, false) AND v_new_display_name IS DISTINCT FROM v_old_display_name;

  IF NOT v_username_changed AND NOT v_display_name_changed THEN
    RAISE EXCEPTION 'IDENTITY_RESET_NO_CHANGE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.identity_moderation_username_override', 'admin_reset', true);

  UPDATE public.profiles
  SET username = v_new_username,
      display_name = v_new_display_name
  WHERE id = _target_profile_id;

  UPDATE public.identity_moderation_flags
  SET status = 'resolved',
      reviewed_by = v_actor,
      reviewed_at = now(),
      updated_at = now()
  WHERE profile_id = _target_profile_id
    AND status = 'open';

  IF v_username_changed THEN
    INSERT INTO public.identity_moderation_actions
      (profile_id, actor_user_id, action_type, field, previous_value, new_value, reason)
    VALUES
      (_target_profile_id, v_actor, 'admin_reset', 'username', v_old_username, v_new_username, coalesce(_reason, 'Admin reset public identity.'));
  END IF;

  IF v_display_name_changed THEN
    INSERT INTO public.identity_moderation_actions
      (profile_id, actor_user_id, action_type, field, previous_value, new_value, reason)
    VALUES
      (_target_profile_id, v_actor, 'admin_reset', 'display_name', v_old_display_name, v_new_display_name, coalesce(_reason, 'Admin reset public identity.'));
  END IF;

  RETURN jsonb_build_object(
    'profileId', _target_profile_id,
    'username', v_new_username,
    'displayName', v_new_display_name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_public_identity(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_normalize(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_words(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_compact(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_reduce_repeats(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_clean_display(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_moderation_next_username(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_public_identity_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remediate_existing_public_identities() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_profile_identity(uuid, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.evaluate_public_identity(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_normalize(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_words(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_compact(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_reduce_repeats(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_clean_display(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_moderation_next_username(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_public_identity_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.remediate_existing_public_identities() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_profile_identity(uuid, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_profile_identity(uuid, boolean, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
