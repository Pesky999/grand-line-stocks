BEGIN;

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
      AND missions.mission_date = (pg_catalog.now() AT TIME ZONE 'UTC')::date
      AND missions.status IN (
        'published'::public.daily_crew_mission_status,
        'scheduled'::public.daily_crew_mission_status
      )
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
