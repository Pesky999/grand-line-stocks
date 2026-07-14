BEGIN;

CREATE OR REPLACE FUNCTION public.admin_save_daily_crew_builder_mission(
  _mission_id uuid,
  _mission_date date,
  _slug text,
  _title text,
  _brief text,
  _mission_tags text[],
  _reveal_policy public.daily_crew_reveal_policy,
  _reveal_at timestamptz,
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
  v_today date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_mission_id uuid;
  v_existing_mission public.daily_crew_missions%ROWTYPE;
  v_title text := btrim(COALESCE(_title, ''));
  v_brief text := btrim(COALESCE(_brief, ''));
  v_pool_count integer;
  v_job_count integer;
  v_score_count integer;
  v_solution_count integer;
  v_invalid_count integer;
  v_inserted_count integer;
  v_ready boolean;
  v_submission_count integer;
BEGIN
  IF _mission_date IS NULL OR _mission_date < v_today THEN
    RAISE EXCEPTION 'Daily Crew Builder mission date must be today or later';
  END IF;

  IF _slug IS NULL
     OR _slug <> btrim(_slug)
     OR _slug !~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Daily Crew Builder mission slug is invalid';
  END IF;

  IF char_length(v_title) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Daily Crew Builder mission title is required';
  END IF;

  IF char_length(v_brief) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Daily Crew Builder mission brief is required';
  END IF;

  IF _mission_tags IS NULL THEN
    _mission_tags := ARRAY[]::text[];
  END IF;

  IF COALESCE(array_length(_mission_tags, 1), 0) > 8 THEN
    RAISE EXCEPTION 'Daily Crew Builder mission tags are limited to 8 values';
  END IF;

  SELECT count(*)
    INTO v_invalid_count
  FROM unnest(_mission_tags) AS tag(value)
  WHERE value IS NULL
     OR btrim(value) = ''
     OR value <> btrim(value)
     OR char_length(value) > 40;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder mission tags must be trimmed non-empty values';
  END IF;

  IF _reveal_policy IS NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder reveal policy is required';
  END IF;

  IF _pool IS NULL OR jsonb_typeof(_pool) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder mission pool must be a JSON array';
  END IF;

  IF _jobs IS NULL OR jsonb_typeof(_jobs) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder mission jobs must be a JSON array';
  END IF;

  IF _scores IS NULL OR jsonb_typeof(_scores) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder score matrix must be a JSON array';
  END IF;

  IF _perfect_solution IS NULL OR jsonb_typeof(_perfect_solution) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder perfect solution must be a JSON array';
  END IF;

  v_pool_count := jsonb_array_length(_pool);
  v_job_count := jsonb_array_length(_jobs);
  v_score_count := jsonb_array_length(_scores);
  v_solution_count := jsonb_array_length(_perfect_solution);

  IF NOT (
    (v_pool_count = 9 AND v_job_count = 3)
    OR (v_pool_count = 15 AND v_job_count = 5)
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder missions must use either a 9-character/3-job or 15-character/5-job format';
  END IF;

  IF v_score_count <> v_pool_count * v_job_count THEN
    RAISE EXCEPTION 'Daily Crew Builder score matrix must cover every pool character and job';
  END IF;

  IF v_solution_count <> v_job_count THEN
    RAISE EXCEPTION 'Daily Crew Builder perfect solution must include one entry per job';
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
    RAISE EXCEPTION 'Daily Crew Builder mission pool entries are invalid';
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
    RAISE EXCEPTION 'Daily Crew Builder mission pool must have unique contiguous characters and display orders';
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
    RAISE EXCEPTION 'Daily Crew Builder visible tags must be trimmed non-empty values';
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
    RAISE EXCEPTION 'Daily Crew Builder mission pool references an unknown character';
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
    RAISE EXCEPTION 'Daily Crew Builder mission jobs are invalid';
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
    RAISE EXCEPTION 'Daily Crew Builder jobs must be unique, contiguous, and total 90 points';
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
    RAISE EXCEPTION 'Daily Crew Builder score matrix entries are invalid';
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
  FROM (
    SELECT
      count(*) AS row_count,
      count(DISTINCT (character_id, role)) AS pair_count
    FROM score_input
  ) AS score_summary
  WHERE row_count <> v_score_count
     OR pair_count <> v_score_count;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder score matrix cannot contain duplicate character-role pairs';
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
    RAISE EXCEPTION 'Daily Crew Builder scores must match the mission pool and jobs';
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
    RAISE EXCEPTION 'Daily Crew Builder perfect solution entries are invalid';
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
    RAISE EXCEPTION 'Daily Crew Builder perfect solution must use unique roles and characters';
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
    RAISE EXCEPTION 'Daily Crew Builder perfect solution must use max-score pool characters';
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
    RAISE EXCEPTION 'Daily Crew Builder perfect solution cannot include more than 3 Straw Hats';
  END IF;

  IF _mission_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_missions
      WHERE mission_date = _mission_date
    ) THEN
      RAISE EXCEPTION 'Daily Crew Builder mission date already exists'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_missions
      WHERE slug = _slug
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
      max_score
    )
    VALUES (
      _mission_date,
      _slug,
      v_title,
      v_brief,
      _mission_tags,
      'draft'::public.daily_crew_mission_status,
      _reveal_policy,
      _reveal_at,
      100
    )
    RETURNING id
    INTO v_mission_id;
  ELSE
    SELECT *
      INTO v_existing_mission
    FROM public.daily_crew_missions
    WHERE id = _mission_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Daily Crew Builder mission not found';
    END IF;

    IF v_existing_mission.status <> 'draft'::public.daily_crew_mission_status THEN
      RAISE EXCEPTION 'Only draft Daily Crew Builder missions can be edited';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_submissions
      WHERE mission_id = _mission_id
    ) THEN
      RAISE EXCEPTION 'Daily Crew Builder missions with submissions cannot be edited';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_missions
      WHERE mission_date = _mission_date
        AND id <> _mission_id
    ) THEN
      RAISE EXCEPTION 'Daily Crew Builder mission date already exists'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_missions
      WHERE slug = _slug
        AND id <> _mission_id
    ) THEN
      RAISE EXCEPTION 'Daily Crew Builder mission slug already exists'
        USING ERRCODE = '23505';
    END IF;

    v_mission_id := _mission_id;

    DELETE FROM public.daily_crew_perfect_solution
    WHERE mission_id = v_mission_id;

    DELETE FROM public.daily_crew_character_role_scores
    WHERE mission_id = v_mission_id;

    DELETE FROM public.daily_crew_role_requirements
    WHERE mission_id = v_mission_id;

    DELETE FROM public.daily_crew_mission_pool
    WHERE mission_id = v_mission_id;

    UPDATE public.daily_crew_missions
    SET
      mission_date = _mission_date,
      slug = _slug,
      title = v_title,
      brief = v_brief,
      mission_tags = _mission_tags,
      reveal_policy = _reveal_policy,
      reveal_at = _reveal_at,
      max_score = 100
    WHERE id = v_mission_id
    RETURNING id
    INTO v_mission_id;
  END IF;

  WITH inserted_pool AS (
    INSERT INTO public.daily_crew_mission_pool (
      mission_id,
      character_id,
      display_order,
      is_straw_hat,
      visible_tags
    )
    SELECT
      v_mission_id,
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
    RAISE EXCEPTION 'Daily Crew Builder mission pool save failed';
  END IF;

  WITH inserted_jobs AS (
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
    RAISE EXCEPTION 'Daily Crew Builder mission jobs save failed';
  END IF;

  WITH inserted_scores AS (
    INSERT INTO public.daily_crew_character_role_scores (
      mission_id,
      character_id,
      role,
      score,
      explanation
    )
    SELECT
      v_mission_id,
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
    RAISE EXCEPTION 'Daily Crew Builder score matrix save failed';
  END IF;

  WITH inserted_solution AS (
    INSERT INTO public.daily_crew_perfect_solution (
      mission_id,
      role,
      character_id
    )
    SELECT
      v_mission_id,
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
    RAISE EXCEPTION 'Daily Crew Builder perfect solution save failed';
  END IF;

  v_ready := public.validate_daily_crew_mission(v_mission_id);

  IF NOT v_ready THEN
    RAISE EXCEPTION 'Daily Crew Builder mission is not ready to save';
  END IF;

  SELECT count(*)
    INTO v_submission_count
  FROM public.daily_crew_submissions
  WHERE mission_id = v_mission_id;

  RETURN jsonb_build_object(
    'missionId', v_mission_id,
    'missionDate', _mission_date,
    'slug', _slug,
    'status', 'draft',
    'poolCount', v_pool_count,
    'jobCount', v_job_count,
    'scoreCount', v_score_count,
    'submissionCount', v_submission_count,
    'ready', v_ready
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_daily_crew_builder_mission_status(
  _mission_id uuid,
  _target_status public.daily_crew_mission_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_today date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_mission public.daily_crew_missions%ROWTYPE;
  v_submission_count integer;
  v_pool_count integer;
  v_job_count integer;
  v_score_count integer;
  v_ready boolean;
BEGIN
  IF _mission_id IS NULL OR _target_status IS NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder mission and target status are required';
  END IF;

  IF _target_status = 'published'::public.daily_crew_mission_status THEN
    RAISE EXCEPTION 'Daily Crew Builder missions cannot be manually published';
  END IF;

  SELECT *
    INTO v_mission
  FROM public.daily_crew_missions
  WHERE id = _mission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily Crew Builder mission not found';
  END IF;

  SELECT count(*)
    INTO v_submission_count
  FROM public.daily_crew_submissions
  WHERE mission_id = _mission_id;

  SELECT count(*)
    INTO v_pool_count
  FROM public.daily_crew_mission_pool
  WHERE mission_id = _mission_id;

  SELECT count(*)
    INTO v_job_count
  FROM public.daily_crew_role_requirements
  WHERE mission_id = _mission_id;

  SELECT count(*)
    INTO v_score_count
  FROM public.daily_crew_character_role_scores
  WHERE mission_id = _mission_id;

  v_ready := public.validate_daily_crew_mission(_mission_id);

  IF v_mission.status = 'draft'::public.daily_crew_mission_status
     AND _target_status = 'scheduled'::public.daily_crew_mission_status THEN
    IF v_mission.mission_date < v_today THEN
      RAISE EXCEPTION 'Daily Crew Builder past missions cannot be scheduled';
    END IF;

    IF NOT v_ready THEN
      RAISE EXCEPTION 'Daily Crew Builder mission is not ready to schedule';
    END IF;
  ELSIF v_mission.status = 'scheduled'::public.daily_crew_mission_status
        AND _target_status = 'draft'::public.daily_crew_mission_status THEN
    IF v_mission.mission_date <= v_today OR v_submission_count > 0 THEN
      RAISE EXCEPTION 'Only future scheduled Daily Crew Builder missions without submissions can return to draft';
    END IF;
  ELSIF v_mission.status = 'draft'::public.daily_crew_mission_status
        AND _target_status = 'archived'::public.daily_crew_mission_status THEN
    NULL;
  ELSIF v_mission.status = 'scheduled'::public.daily_crew_mission_status
        AND _target_status = 'archived'::public.daily_crew_mission_status THEN
    IF v_mission.mission_date = v_today THEN
      RAISE EXCEPTION 'The active Daily Crew Builder mission cannot be archived while scheduled';
    END IF;
  ELSIF v_mission.status = 'archived'::public.daily_crew_mission_status
        AND _target_status = 'draft'::public.daily_crew_mission_status THEN
    IF v_mission.mission_date < v_today OR v_submission_count > 0 THEN
      RAISE EXCEPTION 'Only current or future archived Daily Crew Builder missions without submissions can return to draft';
    END IF;
  ELSIF v_mission.status = 'published'::public.daily_crew_mission_status
        AND _target_status = 'archived'::public.daily_crew_mission_status THEN
    IF v_mission.mission_date >= v_today THEN
      RAISE EXCEPTION 'Only past published Daily Crew Builder missions can be archived';
    END IF;
  ELSE
    RAISE EXCEPTION 'Daily Crew Builder mission status transition is not allowed';
  END IF;

  UPDATE public.daily_crew_missions
  SET status = _target_status
  WHERE id = _mission_id
  RETURNING *
  INTO v_mission;

  RETURN jsonb_build_object(
    'missionId', v_mission.id,
    'missionDate', v_mission.mission_date,
    'slug', v_mission.slug,
    'status', v_mission.status,
    'poolCount', v_pool_count,
    'jobCount', v_job_count,
    'scoreCount', v_score_count,
    'ready', public.validate_daily_crew_mission(v_mission.id),
    'submissionCount', v_submission_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_daily_crew_publish_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.status IN (
       'scheduled'::public.daily_crew_mission_status,
       'published'::public.daily_crew_mission_status
     )
     AND NOT public.validate_daily_crew_mission(NEW.id) THEN
    RAISE EXCEPTION 'Daily Crew Builder mission is not ready to schedule or publish';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_save_daily_crew_builder_mission(
  uuid,
  date,
  text,
  text,
  text,
  text[],
  public.daily_crew_reveal_policy,
  timestamptz,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_daily_crew_builder_mission_status(
  uuid,
  public.daily_crew_mission_status
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_daily_crew_publish_ready()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_save_daily_crew_builder_mission(
  uuid,
  date,
  text,
  text,
  text,
  text[],
  public.daily_crew_reveal_policy,
  timestamptz,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_set_daily_crew_builder_mission_status(
  uuid,
  public.daily_crew_mission_status
) TO service_role;

GRANT EXECUTE ON FUNCTION public.enforce_daily_crew_publish_ready()
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
