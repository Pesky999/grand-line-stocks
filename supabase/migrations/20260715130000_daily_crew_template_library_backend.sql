BEGIN;

CREATE TABLE public.daily_crew_mission_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  brief text NOT NULL,
  mission_tags text[] NOT NULL DEFAULT '{}',
  reveal_policy public.daily_crew_reveal_policy NOT NULL DEFAULT 'next_day',
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_crew_mission_templates_slug_check
    CHECK (
      char_length(slug) <= 69
      AND slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'
    ),
  CONSTRAINT daily_crew_mission_templates_title_check
    CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT daily_crew_mission_templates_brief_check
    CHECK (brief = btrim(brief) AND char_length(brief) BETWEEN 1 AND 2000),
  CONSTRAINT daily_crew_mission_templates_revision_check
    CHECK (revision > 0)
);

CREATE TABLE public.daily_crew_mission_template_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.daily_crew_mission_templates(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE RESTRICT,
  display_order integer NOT NULL,
  is_straw_hat boolean NOT NULL DEFAULT false,
  visible_tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_crew_mission_template_pool_display_order_check
    CHECK (display_order BETWEEN 1 AND 15),
  UNIQUE (template_id, character_id),
  UNIQUE (template_id, display_order)
);

CREATE TABLE public.daily_crew_mission_template_role_requirements (
  template_id uuid NOT NULL REFERENCES public.daily_crew_mission_templates(id) ON DELETE CASCADE,
  role public.daily_crew_role NOT NULL,
  subtype_key text NOT NULL,
  subtype_label text,
  display_label text NOT NULL,
  display_order integer NOT NULL,
  max_points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, role),
  CONSTRAINT daily_crew_mission_template_role_requirements_subtype_key_check
    CHECK (subtype_key ~ '^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$'),
  CONSTRAINT daily_crew_mission_template_role_requirements_subtype_label_check
    CHECK (
      subtype_label IS NULL
      OR (subtype_label = btrim(subtype_label) AND char_length(subtype_label) BETWEEN 1 AND 120)
    ),
  CONSTRAINT daily_crew_mission_template_role_requirements_display_label_check
    CHECK (display_label = btrim(display_label) AND char_length(display_label) BETWEEN 1 AND 120),
  CONSTRAINT daily_crew_mission_template_role_requirements_display_order_check
    CHECK (display_order BETWEEN 1 AND 5),
  CONSTRAINT daily_crew_mission_template_role_requirements_max_points_check
    CHECK (max_points BETWEEN 1 AND 30),
  UNIQUE (template_id, display_order)
);

CREATE TABLE public.daily_crew_mission_template_character_role_scores (
  template_id uuid NOT NULL,
  character_id uuid NOT NULL,
  role public.daily_crew_role NOT NULL,
  score integer NOT NULL,
  explanation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, character_id, role),
  CONSTRAINT daily_crew_mission_template_character_role_scores_score_check
    CHECK (score BETWEEN 0 AND 30),
  CONSTRAINT daily_crew_mission_template_character_role_scores_explanation_check
    CHECK (explanation = btrim(explanation) AND char_length(explanation) BETWEEN 1 AND 500),
  FOREIGN KEY (template_id, character_id)
    REFERENCES public.daily_crew_mission_template_pool(template_id, character_id)
    ON DELETE CASCADE,
  FOREIGN KEY (template_id, role)
    REFERENCES public.daily_crew_mission_template_role_requirements(template_id, role)
    ON DELETE CASCADE
);

CREATE TABLE public.daily_crew_mission_template_perfect_solution (
  template_id uuid NOT NULL,
  role public.daily_crew_role NOT NULL,
  character_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, role),
  UNIQUE (template_id, character_id),
  FOREIGN KEY (template_id, role)
    REFERENCES public.daily_crew_mission_template_role_requirements(template_id, role)
    ON DELETE CASCADE,
  FOREIGN KEY (template_id, character_id)
    REFERENCES public.daily_crew_mission_template_pool(template_id, character_id)
    ON DELETE CASCADE
);

CREATE TRIGGER daily_crew_mission_templates_touch
  BEFORE UPDATE ON public.daily_crew_mission_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.daily_crew_missions
  ADD COLUMN source_template_id uuid,
  ADD COLUMN source_template_revision integer,
  ADD CONSTRAINT daily_crew_missions_source_template_fkey
    FOREIGN KEY (source_template_id)
    REFERENCES public.daily_crew_mission_templates(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT daily_crew_missions_source_template_pair_check
    CHECK (
      (source_template_id IS NULL AND source_template_revision IS NULL)
      OR (source_template_id IS NOT NULL AND source_template_revision IS NOT NULL)
    ),
  ADD CONSTRAINT daily_crew_missions_source_template_revision_check
    CHECK (source_template_revision IS NULL OR source_template_revision > 0);

CREATE INDEX idx_daily_crew_missions_source_template_date
  ON public.daily_crew_missions (source_template_id, mission_date DESC)
  WHERE source_template_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.clear_daily_crew_mission_template_source_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  UPDATE public.daily_crew_missions
  SET
    source_template_id = NULL,
    source_template_revision = NULL
  WHERE source_template_id = OLD.id;

  RETURN OLD;
END;
$function$;

CREATE TRIGGER daily_crew_template_source_delete
  BEFORE DELETE ON public.daily_crew_mission_templates
  FOR EACH ROW EXECUTE FUNCTION public.clear_daily_crew_mission_template_source_on_delete();

CREATE OR REPLACE FUNCTION public.validate_daily_crew_template(_template_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_pool_count integer;
  v_pool_straw_hats integer;
  v_pool_display_order_count integer;
  v_pool_min_display_order integer;
  v_pool_max_display_order integer;
  v_requirement_count integer;
  v_requirement_role_count integer;
  v_requirement_display_order_count integer;
  v_requirement_min_display_order integer;
  v_requirement_max_display_order integer;
  v_requirement_max_points_total integer;
  v_solution_count integer;
  v_solution_role_count integer;
  v_solution_character_count integer;
  v_solution_straw_hats integer;
  v_score_count integer;
  v_solution_score_total integer;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE is_straw_hat),
    count(DISTINCT display_order),
    min(display_order),
    max(display_order)
    INTO
      v_pool_count,
      v_pool_straw_hats,
      v_pool_display_order_count,
      v_pool_min_display_order,
      v_pool_max_display_order
  FROM public.daily_crew_mission_template_pool
  WHERE template_id = _template_id;

  SELECT
    count(*),
    count(DISTINCT role),
    count(DISTINCT display_order),
    min(display_order),
    max(display_order),
    COALESCE(sum(max_points), 0)
    INTO
      v_requirement_count,
      v_requirement_role_count,
      v_requirement_display_order_count,
      v_requirement_min_display_order,
      v_requirement_max_display_order,
      v_requirement_max_points_total
  FROM public.daily_crew_mission_template_role_requirements
  WHERE template_id = _template_id;

  SELECT
    count(*),
    count(DISTINCT s.role),
    count(DISTINCT s.character_id),
    count(*) FILTER (WHERE p.is_straw_hat)
    INTO
      v_solution_count,
      v_solution_role_count,
      v_solution_character_count,
      v_solution_straw_hats
  FROM public.daily_crew_mission_template_perfect_solution AS s
  JOIN public.daily_crew_mission_template_pool AS p
    ON p.template_id = s.template_id
   AND p.character_id = s.character_id
  WHERE s.template_id = _template_id;

  SELECT count(*)
    INTO v_score_count
  FROM public.daily_crew_mission_template_character_role_scores
  WHERE template_id = _template_id;

  SELECT COALESCE(sum(scores.score), 0)
    INTO v_solution_score_total
  FROM public.daily_crew_mission_template_perfect_solution AS s
  JOIN public.daily_crew_mission_template_character_role_scores AS scores
    ON scores.template_id = s.template_id
   AND scores.character_id = s.character_id
   AND scores.role = s.role
  WHERE s.template_id = _template_id;

  RETURN
    (
      (v_pool_count = 9 AND v_requirement_count = 3)
      OR (v_pool_count = 15 AND v_requirement_count = 5)
    )
    AND v_pool_straw_hats <= 5
    AND v_pool_display_order_count = v_pool_count
    AND v_pool_min_display_order = 1
    AND v_pool_max_display_order = v_pool_count
    AND v_requirement_role_count = v_requirement_count
    AND v_requirement_display_order_count = v_requirement_count
    AND v_requirement_min_display_order = 1
    AND v_requirement_max_display_order = v_requirement_count
    AND v_requirement_max_points_total = 90
    AND v_solution_count = v_requirement_count
    AND v_solution_role_count = v_requirement_count
    AND v_solution_character_count = v_requirement_count
    AND v_solution_straw_hats <= 3
    AND v_score_count = v_pool_count * v_requirement_count
    AND v_solution_score_total = 90;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_daily_crew_builder_template(
  _template_id uuid,
  _slug text,
  _title text,
  _brief text,
  _mission_tags text[],
  _reveal_policy public.daily_crew_reveal_policy,
  _is_active boolean,
  _pool jsonb,
  _jobs jsonb,
  _scores jsonb,
  _perfect_solution jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_template_id uuid;
  v_existing_template public.daily_crew_mission_templates%ROWTYPE;
  v_title text := btrim(COALESCE(_title, ''));
  v_brief text := btrim(COALESCE(_brief, ''));
  v_pool_count integer;
  v_job_count integer;
  v_score_count integer;
  v_solution_count integer;
  v_invalid_count integer;
  v_inserted_count integer;
  v_ready boolean;
  v_revision integer;
  v_instance_count integer;
BEGIN
  IF _slug IS NULL
     OR _slug <> btrim(_slug)
     OR char_length(_slug) > 69
     OR _slug !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Daily Crew Builder template slug is invalid';
  END IF;

  IF char_length(v_title) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Daily Crew Builder template title is required';
  END IF;

  IF char_length(v_brief) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Daily Crew Builder template brief is required';
  END IF;

  IF _mission_tags IS NULL THEN
    _mission_tags := ARRAY[]::text[];
  END IF;

  IF COALESCE(array_length(_mission_tags, 1), 0) > 8 THEN
    RAISE EXCEPTION 'Daily Crew Builder template tags are limited to 8 values';
  END IF;

  SELECT count(*)
    INTO v_invalid_count
  FROM unnest(_mission_tags) AS tag(value)
  WHERE value IS NULL
     OR btrim(value) = ''
     OR value <> btrim(value)
     OR char_length(value) > 40;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template tags must be trimmed non-empty values';
  END IF;

  IF _reveal_policy IS NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder template reveal policy is required';
  END IF;

  IF _is_active IS NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder template active state is required';
  END IF;

  IF _pool IS NULL OR jsonb_typeof(_pool) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder template pool must be a JSON array';
  END IF;

  IF _jobs IS NULL OR jsonb_typeof(_jobs) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder template jobs must be a JSON array';
  END IF;

  IF _scores IS NULL OR jsonb_typeof(_scores) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder template score matrix must be a JSON array';
  END IF;

  IF _perfect_solution IS NULL OR jsonb_typeof(_perfect_solution) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder template perfect solution must be a JSON array';
  END IF;

  v_pool_count := jsonb_array_length(_pool);
  v_job_count := jsonb_array_length(_jobs);
  v_score_count := jsonb_array_length(_scores);
  v_solution_count := jsonb_array_length(_perfect_solution);

  IF NOT (
    (v_pool_count = 9 AND v_job_count = 3)
    OR (v_pool_count = 15 AND v_job_count = 5)
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder templates must use either a 9-character/3-job or 15-character/5-job format';
  END IF;

  IF v_score_count <> v_pool_count * v_job_count THEN
    RAISE EXCEPTION 'Daily Crew Builder template score matrix must cover every pool character and job';
  END IF;

  IF v_solution_count <> v_job_count THEN
    RAISE EXCEPTION 'Daily Crew Builder template perfect solution must include one entry per job';
  END IF;

  WITH pool_input AS (
    SELECT
      parsed."characterId" AS character_id,
      parsed."displayOrder" AS display_order,
      COALESCE(parsed."isStrawHat", false) AS is_straw_hat,
      COALESCE(parsed."visibleTags", ARRAY[]::text[]) AS visible_tags
    FROM jsonb_to_recordset(_pool) AS parsed(
      "characterId" uuid,
      "displayOrder" integer,
      "isStrawHat" boolean,
      "visibleTags" text[]
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM pool_input
  WHERE character_id IS NULL
     OR display_order IS NULL
     OR display_order < 1
     OR display_order > v_pool_count
     OR COALESCE(array_length(visible_tags, 1), 0) > 5;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template pool entries are invalid';
  END IF;

  WITH pool_input AS (
    SELECT
      parsed."characterId" AS character_id,
      parsed."displayOrder" AS display_order,
      COALESCE(parsed."isStrawHat", false) AS is_straw_hat
    FROM jsonb_to_recordset(_pool) AS parsed(
      "characterId" uuid,
      "displayOrder" integer,
      "isStrawHat" boolean
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM (
    SELECT
      count(*) AS row_count,
      count(DISTINCT character_id) AS character_count,
      count(DISTINCT display_order) AS display_order_count,
      count(*) FILTER (WHERE is_straw_hat) AS straw_hat_count,
      min(display_order) AS min_display_order,
      max(display_order) AS max_display_order
    FROM pool_input
  ) AS pool_summary
  WHERE row_count <> v_pool_count
     OR character_count <> v_pool_count
     OR display_order_count <> v_pool_count
     OR straw_hat_count > 5
     OR min_display_order <> 1
     OR max_display_order <> v_pool_count;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template pool must have unique contiguous characters and display orders';
  END IF;

  WITH pool_input AS (
    SELECT COALESCE(parsed."visibleTags", ARRAY[]::text[]) AS visible_tags
    FROM jsonb_to_recordset(_pool) AS parsed("visibleTags" text[])
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM pool_input
  CROSS JOIN LATERAL unnest(visible_tags) AS tag(value)
  WHERE value IS NULL
     OR btrim(value) = ''
     OR value <> btrim(value)
     OR char_length(value) > 40;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template visible tags must be trimmed non-empty values';
  END IF;

  WITH pool_input AS (
    SELECT parsed."characterId" AS character_id
    FROM jsonb_to_recordset(_pool) AS parsed("characterId" uuid)
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM pool_input AS pool
  LEFT JOIN public.characters AS characters
    ON characters.id = pool.character_id
  WHERE characters.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template pool references an unknown character';
  END IF;

  WITH job_input AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."subtypeKey" AS subtype_key,
      parsed."subtypeLabel" AS subtype_label,
      parsed."displayLabel" AS display_label,
      parsed."displayOrder" AS display_order,
      parsed."maxPoints" AS max_points
    FROM jsonb_to_recordset(_jobs) AS parsed(
      role text,
      "subtypeKey" text,
      "subtypeLabel" text,
      "displayLabel" text,
      "displayOrder" integer,
      "maxPoints" integer
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM job_input
  WHERE role IS NULL
     OR subtype_key IS NULL
     OR subtype_key <> btrim(subtype_key)
     OR subtype_key !~ '^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$'
     OR display_label IS NULL
     OR display_label <> btrim(display_label)
     OR char_length(display_label) NOT BETWEEN 1 AND 120
     OR (
       subtype_label IS NOT NULL
       AND (
         subtype_label <> btrim(subtype_label)
         OR char_length(subtype_label) NOT BETWEEN 1 AND 120
       )
     )
     OR display_order IS NULL
     OR display_order < 1
     OR display_order > v_job_count
     OR max_points IS NULL
     OR max_points < 1
     OR max_points > 30;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template jobs are invalid';
  END IF;

  WITH job_input AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."displayOrder" AS display_order,
      parsed."maxPoints" AS max_points
    FROM jsonb_to_recordset(_jobs) AS parsed(
      role text,
      "displayOrder" integer,
      "maxPoints" integer
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM (
    SELECT
      count(*) AS row_count,
      count(DISTINCT role) AS role_count,
      count(DISTINCT display_order) AS display_order_count,
      min(display_order) AS min_display_order,
      max(display_order) AS max_display_order,
      COALESCE(sum(max_points), 0) AS max_points_total
    FROM job_input
  ) AS job_summary
  WHERE row_count <> v_job_count
     OR role_count <> v_job_count
     OR display_order_count <> v_job_count
     OR min_display_order <> 1
     OR max_display_order <> v_job_count
     OR max_points_total <> 90;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template jobs must be unique, contiguous, and total 90 points';
  END IF;

  WITH score_input AS (
    SELECT
      parsed."characterId" AS character_id,
      parsed.role::public.daily_crew_role AS role,
      parsed.score AS score,
      parsed.explanation AS explanation
    FROM jsonb_to_recordset(_scores) AS parsed(
      "characterId" uuid,
      role text,
      score integer,
      explanation text
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM score_input
  WHERE character_id IS NULL
     OR role IS NULL
     OR score IS NULL
     OR explanation IS NULL
     OR explanation <> btrim(explanation)
     OR char_length(explanation) NOT BETWEEN 1 AND 500;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template score matrix entries are invalid';
  END IF;

  WITH
  score_input AS (
    SELECT
      parsed."characterId" AS character_id,
      parsed.role::public.daily_crew_role AS role
    FROM jsonb_to_recordset(_scores) AS parsed(
      "characterId" uuid,
      role text
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM (
    SELECT
      count(*) AS row_count,
      count(DISTINCT (character_id, role)) AS pair_count
    FROM score_input
  ) AS score_summary
  WHERE row_count <> v_score_count
     OR pair_count <> v_score_count;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template score matrix cannot contain duplicate character-role pairs';
  END IF;

  WITH
  pool_input AS (
    SELECT parsed."characterId" AS character_id
    FROM jsonb_to_recordset(_pool) AS parsed("characterId" uuid)
  ),
  job_input AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."maxPoints" AS max_points
    FROM jsonb_to_recordset(_jobs) AS parsed(role text, "maxPoints" integer)
  ),
  score_input AS (
    SELECT
      parsed."characterId" AS character_id,
      parsed.role::public.daily_crew_role AS role,
      parsed.score AS score
    FROM jsonb_to_recordset(_scores) AS parsed(
      "characterId" uuid,
      role text,
      score integer
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM score_input AS scores
  LEFT JOIN pool_input AS pool
    ON pool.character_id = scores.character_id
  LEFT JOIN job_input AS jobs
    ON jobs.role = scores.role
  WHERE pool.character_id IS NULL
     OR jobs.role IS NULL
     OR scores.score < 0
     OR scores.score > jobs.max_points;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template scores must match the template pool and jobs';
  END IF;

  WITH solution_input AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId" AS character_id
    FROM jsonb_to_recordset(_perfect_solution) AS parsed(
      role text,
      "characterId" uuid
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM solution_input
  WHERE role IS NULL
     OR character_id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template perfect solution entries are invalid';
  END IF;

  WITH solution_input AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId" AS character_id
    FROM jsonb_to_recordset(_perfect_solution) AS parsed(
      role text,
      "characterId" uuid
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM (
    SELECT
      count(*) AS row_count,
      count(DISTINCT role) AS role_count,
      count(DISTINCT character_id) AS character_count
    FROM solution_input
  ) AS solution_summary
  WHERE row_count <> v_job_count
     OR role_count <> v_job_count
     OR character_count <> v_job_count;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template perfect solution must use unique roles and characters';
  END IF;

  WITH
  pool_input AS (
    SELECT
      parsed."characterId" AS character_id,
      COALESCE(parsed."isStrawHat", false) AS is_straw_hat
    FROM jsonb_to_recordset(_pool) AS parsed(
      "characterId" uuid,
      "isStrawHat" boolean
    )
  ),
  job_input AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."maxPoints" AS max_points
    FROM jsonb_to_recordset(_jobs) AS parsed(role text, "maxPoints" integer)
  ),
  score_input AS (
    SELECT
      parsed."characterId" AS character_id,
      parsed.role::public.daily_crew_role AS role,
      parsed.score AS score
    FROM jsonb_to_recordset(_scores) AS parsed(
      "characterId" uuid,
      role text,
      score integer
    )
  ),
  solution_input AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId" AS character_id
    FROM jsonb_to_recordset(_perfect_solution) AS parsed(
      role text,
      "characterId" uuid
    )
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM solution_input AS solution
  LEFT JOIN pool_input AS pool
    ON pool.character_id = solution.character_id
  LEFT JOIN job_input AS jobs
    ON jobs.role = solution.role
  LEFT JOIN score_input AS scores
    ON scores.character_id = solution.character_id
   AND scores.role = solution.role
  WHERE pool.character_id IS NULL
     OR jobs.role IS NULL
     OR scores.score IS NULL
     OR scores.score <> jobs.max_points;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder template perfect solution must use max-score pool characters';
  END IF;

  WITH
  pool_input AS (
    SELECT
      parsed."characterId" AS character_id,
      COALESCE(parsed."isStrawHat", false) AS is_straw_hat
    FROM jsonb_to_recordset(_pool) AS parsed(
      "characterId" uuid,
      "isStrawHat" boolean
    )
  ),
  solution_input AS (
    SELECT parsed."characterId" AS character_id
    FROM jsonb_to_recordset(_perfect_solution) AS parsed("characterId" uuid)
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM solution_input AS solution
  JOIN pool_input AS pool
    ON pool.character_id = solution.character_id
  WHERE pool.is_straw_hat;

  IF v_invalid_count > 3 THEN
    RAISE EXCEPTION 'Daily Crew Builder template perfect solution cannot include more than 3 Straw Hats';
  END IF;

  IF _template_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_mission_templates
      WHERE slug = _slug
    ) THEN
      RAISE EXCEPTION 'Daily Crew Builder template slug already exists'
        USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.daily_crew_mission_templates (
      slug,
      title,
      brief,
      mission_tags,
      reveal_policy,
      is_active,
      revision
    )
    VALUES (
      _slug,
      v_title,
      v_brief,
      _mission_tags,
      _reveal_policy,
      _is_active,
      1
    )
    RETURNING id, revision
    INTO v_template_id, v_revision;
  ELSE
    SELECT *
      INTO v_existing_template
    FROM public.daily_crew_mission_templates
    WHERE id = _template_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Daily Crew Builder template not found';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_mission_templates
      WHERE slug = _slug
        AND id <> _template_id
    ) THEN
      RAISE EXCEPTION 'Daily Crew Builder template slug already exists'
        USING ERRCODE = '23505';
    END IF;

    v_template_id := _template_id;

    DELETE FROM public.daily_crew_mission_template_perfect_solution
    WHERE template_id = v_template_id;

    DELETE FROM public.daily_crew_mission_template_character_role_scores
    WHERE template_id = v_template_id;

    DELETE FROM public.daily_crew_mission_template_role_requirements
    WHERE template_id = v_template_id;

    DELETE FROM public.daily_crew_mission_template_pool
    WHERE template_id = v_template_id;

    UPDATE public.daily_crew_mission_templates
    SET
      slug = _slug,
      title = v_title,
      brief = v_brief,
      mission_tags = _mission_tags,
      reveal_policy = _reveal_policy,
      is_active = _is_active,
      revision = revision + 1
    WHERE id = v_template_id
    RETURNING revision
    INTO v_revision;
  END IF;

  WITH inserted_pool AS (
    INSERT INTO public.daily_crew_mission_template_pool (
      template_id,
      character_id,
      display_order,
      is_straw_hat,
      visible_tags
    )
    SELECT
      v_template_id,
      parsed."characterId",
      parsed."displayOrder",
      COALESCE(parsed."isStrawHat", false),
      COALESCE(parsed."visibleTags", ARRAY[]::text[])
    FROM jsonb_to_recordset(_pool) AS parsed(
      "characterId" uuid,
      "displayOrder" integer,
      "isStrawHat" boolean,
      "visibleTags" text[]
    )
    RETURNING 1
  )
  SELECT count(*)
    INTO v_inserted_count
  FROM inserted_pool;

  IF v_inserted_count <> v_pool_count THEN
    RAISE EXCEPTION 'Daily Crew Builder template pool save failed';
  END IF;

  WITH inserted_jobs AS (
    INSERT INTO public.daily_crew_mission_template_role_requirements (
      template_id,
      role,
      subtype_key,
      subtype_label,
      display_label,
      display_order,
      max_points
    )
    SELECT
      v_template_id,
      parsed.role::public.daily_crew_role,
      btrim(parsed."subtypeKey"),
      NULLIF(btrim(COALESCE(parsed."subtypeLabel", '')), ''),
      btrim(parsed."displayLabel"),
      parsed."displayOrder",
      parsed."maxPoints"
    FROM jsonb_to_recordset(_jobs) AS parsed(
      role text,
      "subtypeKey" text,
      "subtypeLabel" text,
      "displayLabel" text,
      "displayOrder" integer,
      "maxPoints" integer
    )
    RETURNING 1
  )
  SELECT count(*)
    INTO v_inserted_count
  FROM inserted_jobs;

  IF v_inserted_count <> v_job_count THEN
    RAISE EXCEPTION 'Daily Crew Builder template jobs save failed';
  END IF;

  WITH inserted_scores AS (
    INSERT INTO public.daily_crew_mission_template_character_role_scores (
      template_id,
      character_id,
      role,
      score,
      explanation
    )
    SELECT
      v_template_id,
      parsed."characterId",
      parsed.role::public.daily_crew_role,
      parsed.score,
      btrim(parsed.explanation)
    FROM jsonb_to_recordset(_scores) AS parsed(
      "characterId" uuid,
      role text,
      score integer,
      explanation text
    )
    RETURNING 1
  )
  SELECT count(*)
    INTO v_inserted_count
  FROM inserted_scores;

  IF v_inserted_count <> v_score_count THEN
    RAISE EXCEPTION 'Daily Crew Builder template score matrix save failed';
  END IF;

  WITH inserted_solution AS (
    INSERT INTO public.daily_crew_mission_template_perfect_solution (
      template_id,
      role,
      character_id
    )
    SELECT
      v_template_id,
      parsed.role::public.daily_crew_role,
      parsed."characterId"
    FROM jsonb_to_recordset(_perfect_solution) AS parsed(
      role text,
      "characterId" uuid
    )
    RETURNING 1
  )
  SELECT count(*)
    INTO v_inserted_count
  FROM inserted_solution;

  IF v_inserted_count <> v_solution_count THEN
    RAISE EXCEPTION 'Daily Crew Builder template perfect solution save failed';
  END IF;

  v_ready := public.validate_daily_crew_template(v_template_id);

  IF NOT v_ready THEN
    RAISE EXCEPTION 'Daily Crew Builder template is not ready to save';
  END IF;

  SELECT count(*)
    INTO v_instance_count
  FROM public.daily_crew_missions
  WHERE source_template_id = v_template_id;

  RETURN jsonb_build_object(
    'templateId', v_template_id,
    'slug', _slug,
    'revision', v_revision,
    'isActive', _is_active,
    'poolCount', v_pool_count,
    'jobCount', v_job_count,
    'scoreCount', v_score_count,
    'instanceCount', v_instance_count,
    'ready', v_ready
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_daily_crew_builder_mission_from_template(
  _template_id uuid,
  _mission_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_today date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_template public.daily_crew_mission_templates%ROWTYPE;
  v_mission_id uuid;
  v_slug text;
  v_pool_count integer;
  v_job_count integer;
  v_score_count integer;
  v_ready boolean;
BEGIN
  IF _template_id IS NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder template is required';
  END IF;

  IF _mission_date IS NULL OR _mission_date < v_today THEN
    RAISE EXCEPTION 'Daily Crew Builder template mission date must be today or later';
  END IF;

  SELECT *
    INTO v_template
  FROM public.daily_crew_mission_templates
  WHERE id = _template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily Crew Builder template not found';
  END IF;

  IF NOT v_template.is_active THEN
    RAISE EXCEPTION 'Daily Crew Builder template is inactive';
  END IF;

  IF NOT public.validate_daily_crew_template(v_template.id) THEN
    RAISE EXCEPTION 'Daily Crew Builder template is not ready to instantiate';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.daily_crew_missions
    WHERE mission_date = _mission_date
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder mission date already exists'
      USING ERRCODE = '23505';
  END IF;

  v_slug := v_template.slug || '-' || _mission_date::text;

  IF char_length(v_slug) > 80 THEN
    RAISE EXCEPTION 'Daily Crew Builder template slug is too long for this mission date';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.daily_crew_missions
    WHERE slug = v_slug
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder mission slug already exists'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.daily_crew_missions (
    mission_date,
    slug,
    title,
    brief,
    mission_tags,
    status,
    reveal_policy,
    reveal_at,
    max_score,
    source_template_id,
    source_template_revision
  )
  VALUES (
    _mission_date,
    v_slug,
    v_template.title,
    v_template.brief,
    v_template.mission_tags,
    'draft'::public.daily_crew_mission_status,
    v_template.reveal_policy,
    NULL,
    100,
    v_template.id,
    v_template.revision
  )
  RETURNING id
  INTO v_mission_id;

  INSERT INTO public.daily_crew_mission_pool (
    mission_id,
    character_id,
    display_order,
    is_straw_hat,
    visible_tags
  )
  SELECT
    v_mission_id,
    character_id,
    display_order,
    is_straw_hat,
    visible_tags
  FROM public.daily_crew_mission_template_pool
  WHERE template_id = v_template.id;

  INSERT INTO public.daily_crew_role_requirements (
    mission_id,
    role,
    subtype_key,
    subtype_label,
    display_label,
    display_order,
    max_points
  )
  SELECT
    v_mission_id,
    role,
    subtype_key,
    subtype_label,
    display_label,
    display_order,
    max_points
  FROM public.daily_crew_mission_template_role_requirements
  WHERE template_id = v_template.id;

  INSERT INTO public.daily_crew_character_role_scores (
    mission_id,
    character_id,
    role,
    score,
    explanation
  )
  SELECT
    v_mission_id,
    character_id,
    role,
    score,
    explanation
  FROM public.daily_crew_mission_template_character_role_scores
  WHERE template_id = v_template.id;

  INSERT INTO public.daily_crew_perfect_solution (
    mission_id,
    role,
    character_id
  )
  SELECT
    v_mission_id,
    role,
    character_id
  FROM public.daily_crew_mission_template_perfect_solution
  WHERE template_id = v_template.id;

  v_ready := public.validate_daily_crew_mission(v_mission_id);

  IF NOT v_ready THEN
    RAISE EXCEPTION 'Daily Crew Builder mission from template is not ready';
  END IF;

  SELECT count(*)
    INTO v_pool_count
  FROM public.daily_crew_mission_pool
  WHERE mission_id = v_mission_id;

  SELECT count(*)
    INTO v_job_count
  FROM public.daily_crew_role_requirements
  WHERE mission_id = v_mission_id;

  SELECT count(*)
    INTO v_score_count
  FROM public.daily_crew_character_role_scores
  WHERE mission_id = v_mission_id;

  RETURN jsonb_build_object(
    'missionId', v_mission_id,
    'missionDate', _mission_date,
    'slug', v_slug,
    'status', 'draft',
    'sourceTemplateId', v_template.id,
    'sourceTemplateRevision', v_template.revision,
    'poolCount', v_pool_count,
    'jobCount', v_job_count,
    'scoreCount', v_score_count,
    'submissionCount', 0,
    'ready', v_ready
  );
END;
$function$;

REVOKE ALL ON TABLE public.daily_crew_mission_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_mission_template_pool FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_mission_template_role_requirements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_mission_template_character_role_scores FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_mission_template_perfect_solution FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.daily_crew_mission_templates TO service_role;
GRANT ALL ON TABLE public.daily_crew_mission_template_pool TO service_role;
GRANT ALL ON TABLE public.daily_crew_mission_template_role_requirements TO service_role;
GRANT ALL ON TABLE public.daily_crew_mission_template_character_role_scores TO service_role;
GRANT ALL ON TABLE public.daily_crew_mission_template_perfect_solution TO service_role;

ALTER TABLE public.daily_crew_mission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_mission_template_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_mission_template_role_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_mission_template_character_role_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_mission_template_perfect_solution ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.validate_daily_crew_template(uuid)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_save_daily_crew_builder_template(
  uuid,
  text,
  text,
  text,
  text[],
  public.daily_crew_reveal_policy,
  boolean,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_create_daily_crew_builder_mission_from_template(
  uuid,
  date
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.clear_daily_crew_mission_template_source_on_delete()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.validate_daily_crew_template(uuid)
TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_save_daily_crew_builder_template(
  uuid,
  text,
  text,
  text,
  text[],
  public.daily_crew_reveal_policy,
  boolean,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_create_daily_crew_builder_mission_from_template(
  uuid,
  date
) TO service_role;

GRANT EXECUTE ON FUNCTION public.clear_daily_crew_mission_template_source_on_delete()
TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
