BEGIN;

ALTER TABLE public.daily_crew_role_requirements
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS display_order integer;

UPDATE public.daily_crew_role_requirements
SET
  display_label = COALESCE(
    display_label,
    CASE role
      WHEN 'captain'::public.daily_crew_role THEN 'Captain'
      WHEN 'fighter'::public.daily_crew_role THEN 'Fighter'
      WHEN 'navigator'::public.daily_crew_role THEN 'Navigator'
      WHEN 'strategist'::public.daily_crew_role THEN 'Strategist'
      WHEN 'support'::public.daily_crew_role THEN 'Support'
    END
  ),
  display_order = COALESCE(
    display_order,
    CASE role
      WHEN 'captain'::public.daily_crew_role THEN 1
      WHEN 'fighter'::public.daily_crew_role THEN 2
      WHEN 'navigator'::public.daily_crew_role THEN 3
      WHEN 'strategist'::public.daily_crew_role THEN 4
      WHEN 'support'::public.daily_crew_role THEN 5
    END
  );

ALTER TABLE public.daily_crew_role_requirements
  ALTER COLUMN display_label SET NOT NULL,
  ALTER COLUMN display_order SET NOT NULL;

ALTER TABLE public.daily_crew_role_requirements
  DROP CONSTRAINT IF EXISTS daily_crew_role_requirements_display_label_check,
  DROP CONSTRAINT IF EXISTS daily_crew_role_requirements_display_order_check,
  DROP CONSTRAINT IF EXISTS daily_crew_role_requirements_mission_id_display_order_key,
  DROP CONSTRAINT IF EXISTS daily_crew_role_requirements_max_points_check;

ALTER TABLE public.daily_crew_role_requirements
  ADD CONSTRAINT daily_crew_role_requirements_display_label_check
  CHECK (btrim(display_label) <> ''),
  ADD CONSTRAINT daily_crew_role_requirements_display_order_check
  CHECK (display_order BETWEEN 1 AND 5),
  ADD CONSTRAINT daily_crew_role_requirements_mission_id_display_order_key
  UNIQUE (mission_id, display_order),
  ADD CONSTRAINT daily_crew_role_requirements_max_points_check
  CHECK (max_points BETWEEN 1 AND 30);

ALTER TABLE public.daily_crew_character_role_scores
  DROP CONSTRAINT IF EXISTS daily_crew_character_role_scores_score_check;

ALTER TABLE public.daily_crew_character_role_scores
  ADD CONSTRAINT daily_crew_character_role_scores_score_check
  CHECK (score BETWEEN 0 AND 30);

ALTER TABLE public.daily_crew_submission_roles
  DROP CONSTRAINT IF EXISTS daily_crew_submission_roles_role_score_check;

ALTER TABLE public.daily_crew_submission_roles
  ADD CONSTRAINT daily_crew_submission_roles_role_score_check
  CHECK (role_score BETWEEN 0 AND 30);

CREATE OR REPLACE FUNCTION public.validate_daily_crew_mission(_mission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_pool_count integer;
  v_pool_straw_hats integer;
  v_requirement_count integer;
  v_requirement_role_count integer;
  v_requirement_display_order_count integer;
  v_requirement_max_points_total integer;
  v_solution_count integer;
  v_solution_role_count integer;
  v_solution_straw_hats integer;
  v_score_count integer;
  v_solution_score_total integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_straw_hat)
    INTO v_pool_count, v_pool_straw_hats
  FROM public.daily_crew_mission_pool
  WHERE mission_id = _mission_id;

  SELECT
    count(*),
    count(DISTINCT role),
    count(DISTINCT display_order),
    COALESCE(sum(max_points), 0)
    INTO
      v_requirement_count,
      v_requirement_role_count,
      v_requirement_display_order_count,
      v_requirement_max_points_total
  FROM public.daily_crew_role_requirements
  WHERE mission_id = _mission_id;

  SELECT count(*), count(DISTINCT s.role), count(*) FILTER (WHERE p.is_straw_hat)
    INTO v_solution_count, v_solution_role_count, v_solution_straw_hats
  FROM public.daily_crew_perfect_solution AS s
  JOIN public.daily_crew_mission_pool AS p
    ON p.mission_id = s.mission_id
   AND p.character_id = s.character_id
  WHERE s.mission_id = _mission_id;

  SELECT count(*)
    INTO v_score_count
  FROM public.daily_crew_character_role_scores
  WHERE mission_id = _mission_id;

  SELECT COALESCE(sum(scores.score), 0)
    INTO v_solution_score_total
  FROM public.daily_crew_perfect_solution AS s
  JOIN public.daily_crew_character_role_scores AS scores
    ON scores.mission_id = s.mission_id
   AND scores.character_id = s.character_id
   AND scores.role = s.role
  WHERE s.mission_id = _mission_id;

  RETURN
    v_pool_count IN (9, 15)
    AND v_pool_straw_hats <= CASE WHEN v_pool_count = 9 THEN 6 ELSE 5 END
    AND v_requirement_count IN (3, 5)
    AND v_requirement_role_count = v_requirement_count
    AND v_requirement_display_order_count = v_requirement_count
    AND v_requirement_max_points_total = 90
    AND v_solution_count = v_requirement_count
    AND v_solution_role_count = v_requirement_count
    AND v_solution_straw_hats <= 3
    AND v_score_count = v_pool_count * v_requirement_count
    AND v_solution_score_total = 90;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_daily_crew_mission(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_daily_crew_mission(uuid) TO service_role;

CREATE TEMP TABLE daily_crew_simplified_seed_characters (
  fixture_id text PRIMARY KEY,
  market_slug text NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO daily_crew_simplified_seed_characters (fixture_id, market_slug) VALUES
  ('char-shanks', 'shanks'),
  ('char-dragon', 'monkey-d-dragon'),
  ('char-jinbe', 'jinbe'),
  ('char-usopp', 'usopp'),
  ('char-franky', 'franky'),
  ('char-koby', 'coby'),
  ('char-robin', 'robin'),
  ('char-brook', 'brook'),
  ('char-chopper', 'chopper');

DO $$
DECLARE
  v_missing_slugs text;
BEGIN
  SELECT string_agg(seed.market_slug, ', ' ORDER BY seed.market_slug)
    INTO v_missing_slugs
  FROM daily_crew_simplified_seed_characters AS seed
  LEFT JOIN public.characters AS characters
    ON characters.slug = seed.market_slug
  WHERE characters.id IS NULL;

  IF v_missing_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder simplified seed missing public.characters slugs: %', v_missing_slugs;
  END IF;
END;
$$;

CREATE TEMP TABLE daily_crew_simplified_seed_pool (
  fixture_id text PRIMARY KEY,
  display_order integer NOT NULL,
  is_straw_hat boolean NOT NULL,
  visible_tags text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO daily_crew_simplified_seed_pool (fixture_id, display_order, is_straw_hat, visible_tags) VALUES
  ('char-shanks', 1, false, ARRAY['emperor', 'leader']),
  ('char-dragon', 2, false, ARRAY['revolutionary', 'leader']),
  ('char-jinbe', 3, true, ARRAY['Straw Hat', 'steady hand']),
  ('char-usopp', 4, true, ARRAY['Straw Hat', 'scout', 'lookout']),
  ('char-franky', 5, true, ARRAY['Straw Hat', 'shipwright', 'backup lookout']),
  ('char-koby', 6, false, ARRAY['marine', 'scout']),
  ('char-robin', 7, true, ARRAY['Straw Hat', 'intel']),
  ('char-brook', 8, true, ARRAY['Straw Hat', 'morale']),
  ('char-chopper', 9, true, ARRAY['Straw Hat', 'medic']);

CREATE TEMP TABLE daily_crew_simplified_seed_requirements (
  role public.daily_crew_role PRIMARY KEY,
  subtype_key text NOT NULL,
  subtype_label text NOT NULL,
  display_label text NOT NULL,
  display_order integer NOT NULL,
  max_points integer NOT NULL
) ON COMMIT DROP;

INSERT INTO daily_crew_simplified_seed_requirements (
  role,
  subtype_key,
  subtype_label,
  display_label,
  display_order,
  max_points
) VALUES
  (
    'captain',
    'covert_extraction_lead',
    'Hidden operation lead profile',
    'Operation Lead',
    1,
    30
  ),
  (
    'navigator',
    'covert_extraction_scout',
    'Hidden scout profile',
    'Scout / Lookout',
    2,
    30
  ),
  (
    'support',
    'covert_extraction_support',
    'Hidden emergency support profile',
    'Emergency Support',
    3,
    30
  );

CREATE TEMP TABLE daily_crew_simplified_seed_scores (
  fixture_id text NOT NULL,
  role public.daily_crew_role NOT NULL,
  score integer NOT NULL,
  explanation text NOT NULL,
  PRIMARY KEY (fixture_id, role)
) ON COMMIT DROP;

INSERT INTO daily_crew_simplified_seed_scores (fixture_id, role, score, explanation) VALUES
  ('char-shanks', 'captain', 30, 'Shanks can command the extraction without drawing unnecessary heat.'),
  ('char-shanks', 'navigator', 11, 'Shanks can read a battlefield, but he is not the sharpest harbor lookout.'),
  ('char-shanks', 'support', 10, 'Shanks can stabilize morale, though medical support is not his lane.'),
  ('char-dragon', 'captain', 25, 'Dragon can lead a covert exit with patience and political cover.'),
  ('char-dragon', 'navigator', 14, 'Dragon can mask movement patterns, but scouting is not his best fit.'),
  ('char-dragon', 'support', 12, 'Dragon helps the escape plan hold together from a distance.'),
  ('char-jinbe', 'captain', 22, 'Jinbe keeps the crew calm and decisive under pressure.'),
  ('char-jinbe', 'navigator', 12, 'Jinbe can read sea conditions, but this mission needs a sharper lookout.'),
  ('char-jinbe', 'support', 18, 'Jinbe is steady emergency support when the harbor turns hostile.'),
  ('char-usopp', 'captain', 10, 'Usopp can improvise, but this mission needs a firmer operation lead.'),
  ('char-usopp', 'navigator', 30, 'Usopp is the best lookout for spotting patrol shifts before they close in.'),
  ('char-usopp', 'support', 14, 'Usopp can cover the escape, but he is not the strongest emergency support.'),
  ('char-franky', 'captain', 12, 'Franky can rally the team, but subtle leadership is not his strongest fit.'),
  ('char-franky', 'navigator', 24, 'Franky can read exits, machines, and harbor infrastructure quickly.'),
  ('char-franky', 'support', 17, 'Franky brings strong backup if the extraction needs repairs or cover.'),
  ('char-koby', 'captain', 14, 'Koby has discipline and courage, though he is still growing as a lead.'),
  ('char-koby', 'navigator', 22, 'Koby is a strong scout, just behind the best lookout for this harbor.'),
  ('char-koby', 'support', 15, 'Koby can protect civilians and stabilize a messy escape.'),
  ('char-robin', 'captain', 18, 'Robin can coordinate quietly, though she is better as an intelligence anchor.'),
  ('char-robin', 'navigator', 18, 'Robin can read patterns and clues, but the harbor needs a specialist lookout.'),
  ('char-robin', 'support', 24, 'Robin is excellent emergency support for misdirection and extraction control.'),
  ('char-brook', 'captain', 9, 'Brook keeps spirits up, but command is not his best role here.'),
  ('char-brook', 'navigator', 16, 'Brook can move quietly and scout close quarters in a pinch.'),
  ('char-brook', 'support', 22, 'Brook brings morale and disruption support when the route collapses.'),
  ('char-chopper', 'captain', 8, 'Chopper is brave, but he should not lead this covert extraction.'),
  ('char-chopper', 'navigator', 10, 'Chopper can help track movement, but he is not the best lookout.'),
  ('char-chopper', 'support', 30, 'Chopper is the best emergency support when the escape turns dangerous.');

CREATE TEMP TABLE daily_crew_simplified_seed_solution (
  role public.daily_crew_role PRIMARY KEY,
  fixture_id text NOT NULL
) ON COMMIT DROP;

INSERT INTO daily_crew_simplified_seed_solution (role, fixture_id) VALUES
  ('captain', 'char-shanks'),
  ('navigator', 'char-usopp'),
  ('support', 'char-chopper');

DO $$
DECLARE
  v_mission_id uuid;
BEGIN
  INSERT INTO public.daily_crew_missions (
    mission_date,
    slug,
    title,
    brief,
    mission_tags,
    status,
    reveal_policy
  )
  VALUES (
    DATE '2026-07-12',
    'covert-harbor-extraction',
    'Covert Harbor Extraction',
    'Pick three specialists who can lead the exit, watch the harbor lanes, and keep the crew standing when the escape turns loud.',
    ARRAY['stealth', 'extraction', 'support'],
    'draft'::public.daily_crew_mission_status,
    'next_day'::public.daily_crew_reveal_policy
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    mission_date = EXCLUDED.mission_date,
    title = EXCLUDED.title,
    brief = EXCLUDED.brief,
    mission_tags = EXCLUDED.mission_tags,
    status = 'draft'::public.daily_crew_mission_status,
    reveal_policy = EXCLUDED.reveal_policy,
    updated_at = now()
  RETURNING id INTO v_mission_id;

  INSERT INTO public.daily_crew_mission_pool (
    mission_id,
    character_id,
    display_order,
    is_straw_hat,
    visible_tags
  )
  SELECT
    v_mission_id,
    characters.id,
    pool.display_order,
    pool.is_straw_hat,
    pool.visible_tags
  FROM daily_crew_simplified_seed_pool AS pool
  JOIN daily_crew_simplified_seed_characters AS seed_characters
    ON seed_characters.fixture_id = pool.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  ON CONFLICT (mission_id, character_id) DO UPDATE
  SET
    display_order = EXCLUDED.display_order,
    is_straw_hat = EXCLUDED.is_straw_hat,
    visible_tags = EXCLUDED.visible_tags;

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
  FROM daily_crew_simplified_seed_requirements
  ON CONFLICT (mission_id, role) DO UPDATE
  SET
    subtype_key = EXCLUDED.subtype_key,
    subtype_label = EXCLUDED.subtype_label,
    display_label = EXCLUDED.display_label,
    display_order = EXCLUDED.display_order,
    max_points = EXCLUDED.max_points;

  INSERT INTO public.daily_crew_character_role_scores (
    mission_id,
    character_id,
    role,
    score,
    explanation
  )
  SELECT
    v_mission_id,
    characters.id,
    scores.role,
    scores.score,
    scores.explanation
  FROM daily_crew_simplified_seed_scores AS scores
  JOIN daily_crew_simplified_seed_characters AS seed_characters
    ON seed_characters.fixture_id = scores.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  ON CONFLICT (mission_id, character_id, role) DO UPDATE
  SET
    score = EXCLUDED.score,
    explanation = EXCLUDED.explanation;

  INSERT INTO public.daily_crew_perfect_solution (
    mission_id,
    role,
    character_id
  )
  SELECT
    v_mission_id,
    solution.role,
    characters.id
  FROM daily_crew_simplified_seed_solution AS solution
  JOIN daily_crew_simplified_seed_characters AS seed_characters
    ON seed_characters.fixture_id = solution.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  ON CONFLICT (mission_id, role) DO UPDATE
  SET character_id = EXCLUDED.character_id;

  IF NOT public.validate_daily_crew_mission(v_mission_id) THEN
    RAISE EXCEPTION 'Daily Crew Builder simplified mission is not ready to publish';
  END IF;

  UPDATE public.daily_crew_missions
  SET
    status = 'published'::public.daily_crew_mission_status,
    updated_at = now()
  WHERE id = v_mission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_daily_crew_builder_submission(
  _mission_id uuid,
  _user_id uuid,
  _score integer,
  _rank public.daily_crew_rank,
  _reward_amount integer,
  _score_breakdown jsonb,
  _assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_expected_rank public.daily_crew_rank;
  v_expected_reward integer;
  v_existing_submission public.daily_crew_submissions%ROWTYPE;
  v_submission public.daily_crew_submissions%ROWTYPE;
  v_required_role_count integer;
  v_assignment_count integer;
  v_distinct_role_count integer;
  v_distinct_character_count integer;
  v_null_character_count integer;
  v_valid_assignment_count integer;
  v_inserted_role_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_crew_missions AS missions
    WHERE missions.id = _mission_id
      AND missions.status = 'published'::public.daily_crew_mission_status
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder mission is not published';
  END IF;

  SELECT count(*)
    INTO v_required_role_count
  FROM public.daily_crew_role_requirements
  WHERE mission_id = _mission_id;

  IF v_required_role_count NOT IN (3, 5) THEN
    RAISE EXCEPTION 'Daily Crew Builder mission has unsupported assignment count';
  END IF;

  IF _score < 0 OR _score > 100 THEN
    RAISE EXCEPTION 'Daily Crew Builder score must be from 0 through 100';
  END IF;

  v_expected_rank := CASE
    WHEN _score >= 90 THEN 's'::public.daily_crew_rank
    WHEN _score >= 80 THEN 'a'::public.daily_crew_rank
    WHEN _score >= 70 THEN 'b'::public.daily_crew_rank
    WHEN _score >= 60 THEN 'c'::public.daily_crew_rank
    ELSE 'fail'::public.daily_crew_rank
  END;

  IF _rank <> v_expected_rank THEN
    RAISE EXCEPTION 'Daily Crew Builder rank does not match score';
  END IF;

  v_expected_reward := CASE _rank
    WHEN 's'::public.daily_crew_rank THEN 1000
    WHEN 'a'::public.daily_crew_rank THEN 700
    WHEN 'b'::public.daily_crew_rank THEN 400
    WHEN 'c'::public.daily_crew_rank THEN 200
    ELSE 0
  END;

  IF _reward_amount <> v_expected_reward OR _reward_amount < 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder reward amount does not match rank';
  END IF;

  IF _score_breakdown IS NULL OR jsonb_typeof(_score_breakdown) <> 'object' THEN
    RAISE EXCEPTION 'Daily Crew Builder score breakdown must be a JSON object';
  END IF;

  SELECT *
    INTO v_existing_submission
  FROM public.daily_crew_submissions
  WHERE mission_id = _mission_id
    AND user_id = _user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadySubmitted', true,
      'submissionId', v_existing_submission.id,
      'submittedAt', v_existing_submission.submitted_at,
      'score', v_existing_submission.score,
      'rank', v_existing_submission.rank,
      'rewardAmount', v_existing_submission.reward_amount,
      'rewardPaid', v_existing_submission.reward_paid,
      'scoreBreakdown', v_existing_submission.score_breakdown
    );
  END IF;

  IF _assignments IS NULL OR jsonb_typeof(_assignments) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder assignments must be a JSON array';
  END IF;

  WITH assignments AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId"::uuid AS character_id
    FROM jsonb_to_recordset(_assignments) AS parsed(role text, "characterId" uuid)
  )
  SELECT
    count(*),
    count(DISTINCT role),
    count(DISTINCT character_id),
    count(*) FILTER (WHERE character_id IS NULL)
    INTO
      v_assignment_count,
      v_distinct_role_count,
      v_distinct_character_count,
      v_null_character_count
  FROM assignments;

  IF v_assignment_count <> v_required_role_count
     OR v_distinct_role_count <> v_required_role_count
     OR v_distinct_character_count <> v_required_role_count
     OR v_null_character_count <> 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder assignments must include one unique character for every mission job';
  END IF;

  WITH assignments AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId"::uuid AS character_id
    FROM jsonb_to_recordset(_assignments) AS parsed(role text, "characterId" uuid)
  )
  SELECT count(*)
    INTO v_valid_assignment_count
  FROM assignments AS a
  JOIN public.daily_crew_mission_pool AS pool
    ON pool.mission_id = _mission_id
   AND pool.character_id = a.character_id
  JOIN public.daily_crew_role_requirements AS requirements
    ON requirements.mission_id = _mission_id
   AND requirements.role = a.role
  JOIN public.daily_crew_character_role_scores AS scores
    ON scores.mission_id = _mission_id
   AND scores.character_id = a.character_id
   AND scores.role = a.role;

  IF v_valid_assignment_count <> v_required_role_count THEN
    RAISE EXCEPTION 'Daily Crew Builder assignments must match the mission pool and jobs';
  END IF;

  INSERT INTO public.daily_crew_submissions (
    mission_id,
    user_id,
    score,
    rank,
    reward_amount,
    reward_paid,
    score_breakdown
  )
  VALUES (
    _mission_id,
    _user_id,
    _score,
    _rank,
    _reward_amount,
    false,
    _score_breakdown
  )
  RETURNING *
  INTO v_submission;

  WITH assignments AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId"::uuid AS character_id
    FROM jsonb_to_recordset(_assignments) AS parsed(role text, "characterId" uuid)
  ),
  inserted_roles AS (
    INSERT INTO public.daily_crew_submission_roles (
      submission_id,
      mission_id,
      role,
      character_id,
      role_score,
      explanation
    )
    SELECT
      v_submission.id,
      _mission_id,
      a.role,
      a.character_id,
      scores.score,
      scores.explanation
    FROM assignments AS a
    JOIN public.daily_crew_character_role_scores AS scores
      ON scores.mission_id = _mission_id
     AND scores.character_id = a.character_id
     AND scores.role = a.role
    RETURNING 1
  )
  SELECT count(*)
    INTO v_inserted_role_count
  FROM inserted_roles;

  IF v_inserted_role_count <> v_required_role_count THEN
    RAISE EXCEPTION 'Daily Crew Builder submission role persistence failed';
  END IF;

  RETURN jsonb_build_object(
    'alreadySubmitted', false,
    'submissionId', v_submission.id,
    'submittedAt', v_submission.submitted_at,
    'score', v_submission.score,
    'rank', v_submission.rank,
    'rewardAmount', v_submission.reward_amount,
    'rewardPaid', v_submission.reward_paid,
    'scoreBreakdown', v_submission.score_breakdown
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
      INTO v_existing_submission
    FROM public.daily_crew_submissions
    WHERE mission_id = _mission_id
      AND user_id = _user_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'alreadySubmitted', true,
        'submissionId', v_existing_submission.id,
        'submittedAt', v_existing_submission.submitted_at,
        'score', v_existing_submission.score,
        'rank', v_existing_submission.rank,
        'rewardAmount', v_existing_submission.reward_amount,
        'rewardPaid', v_existing_submission.reward_paid,
        'scoreBreakdown', v_existing_submission.score_breakdown
      );
    END IF;

    RAISE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_daily_crew_builder_submission(
  uuid,
  uuid,
  integer,
  public.daily_crew_rank,
  integer,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_daily_crew_builder_submission(
  uuid,
  uuid,
  integer,
  public.daily_crew_rank,
  integer,
  jsonb,
  jsonb
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
