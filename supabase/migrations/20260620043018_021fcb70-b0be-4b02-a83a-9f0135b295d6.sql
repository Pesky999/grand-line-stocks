-- Tighten grants on the reward function
REVOKE ALL ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) TO service_role;