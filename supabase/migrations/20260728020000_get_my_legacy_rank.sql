BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_legacy_rank()
RETURNS TABLE (
  rank integer,
  prev_rank integer,
  value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    leaderboard.rank,
    leaderboard.prev_rank,
    leaderboard.value
  FROM public.leaderboard_cache AS leaderboard
  WHERE leaderboard.user_id = auth.uid()
    AND leaderboard.board_key = 'net_worth_all_time'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_legacy_rank() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_legacy_rank() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_legacy_rank() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
