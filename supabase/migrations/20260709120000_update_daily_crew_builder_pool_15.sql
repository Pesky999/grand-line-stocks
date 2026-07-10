BEGIN;

ALTER TABLE public.daily_crew_mission_pool
  DROP CONSTRAINT IF EXISTS daily_crew_mission_pool_display_order_check;

ALTER TABLE public.daily_crew_mission_pool
  ADD CONSTRAINT daily_crew_mission_pool_display_order_check
  CHECK (display_order BETWEEN 1 AND 15);

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

  SELECT count(*), count(DISTINCT role)
    INTO v_requirement_count, v_requirement_role_count
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
    v_pool_count = 15
    AND v_pool_straw_hats <= 5
    AND v_requirement_count = 5
    AND v_requirement_role_count = 5
    AND v_solution_count = 5
    AND v_solution_role_count = 5
    AND v_solution_straw_hats <= 3
    AND v_score_count = 75
    AND v_solution_score_total = 90;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_daily_crew_mission(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_daily_crew_mission(uuid) TO service_role;

COMMIT;
