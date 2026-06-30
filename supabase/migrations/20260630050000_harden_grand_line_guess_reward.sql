-- Harden Grand Line Guess reward payout.
-- This RPC is called only by the server-side service-role client; browser roles
-- must not be able to execute it directly.

CREATE OR REPLACE FUNCTION public.award_grand_line_guess_reward(
  _puzzle_id uuid,
  _user_id uuid,
  _attempt_number integer,
  _reward_amount integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_puzzle_user_id uuid;
  v_character_id uuid;
  v_puzzle_date date;
  v_status text;
  v_attempt_number integer;
  v_computed_reward integer;
  v_result_id uuid;
  v_reward_paid boolean;
  v_wallet_rows integer;
BEGIN
  SELECT p.user_id, p.character_id, p.puzzle_date, p.status
    INTO v_puzzle_user_id, v_character_id, v_puzzle_date, v_status
  FROM public.grand_line_guess_daily_puzzles AS p
  WHERE p.id = _puzzle_id
  FOR UPDATE;

  IF v_puzzle_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
  END IF;

  IF v_puzzle_user_id <> _user_id THEN
    RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
  END IF;

  IF v_status = 'expired' THEN
    RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
  END IF;

  SELECT a.attempt_number
    INTO v_attempt_number
  FROM public.grand_line_guess_attempts AS a
  WHERE a.puzzle_id = _puzzle_id
    AND a.user_id = _user_id
    AND a.guessed_character_id = v_character_id
    AND a.is_correct = true
  ORDER BY a.attempt_number ASC
  LIMIT 1
  FOR UPDATE;

  IF v_attempt_number IS NULL OR v_attempt_number < 1 THEN
    RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
  END IF;

  v_computed_reward := CASE
    WHEN v_attempt_number = 1 THEN 750
    WHEN v_attempt_number = 2 THEN 600
    WHEN v_attempt_number = 3 THEN 500
    WHEN v_attempt_number = 4 THEN 400
    WHEN v_attempt_number = 5 THEN 300
    WHEN v_attempt_number = 6 THEN 200
    ELSE 100
  END;

  IF _attempt_number IS DISTINCT FROM v_attempt_number THEN
    RAISE EXCEPTION 'Grand Line Guess reward validation failed';
  END IF;

  IF _reward_amount IS DISTINCT FROM v_computed_reward THEN
    RAISE EXCEPTION 'Grand Line Guess reward validation failed';
  END IF;

  INSERT INTO public.grand_line_guess_results (puzzle_id, user_id)
  VALUES (_puzzle_id, _user_id)
  ON CONFLICT (puzzle_id, user_id) DO NOTHING;

  SELECT r.id, r.reward_paid
    INTO v_result_id, v_reward_paid
  FROM public.grand_line_guess_results AS r
  WHERE r.puzzle_id = _puzzle_id
    AND r.user_id = _user_id
  FOR UPDATE;

  IF v_result_id IS NULL THEN
    RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
  END IF;

  IF v_reward_paid THEN
    RETURN true;
  END IF;

  UPDATE public.user_wallets
    SET berries = berries + v_computed_reward,
        updated_at = pg_catalog.now()
  WHERE user_id = _user_id;

  GET DIAGNOSTICS v_wallet_rows = ROW_COUNT;
  IF v_wallet_rows <> 1 THEN
    RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
  END IF;

  UPDATE public.grand_line_guess_results
    SET solved = true,
        attempts_used = v_attempt_number,
        reward_paid = true,
        reward_amount = v_computed_reward,
        solved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
  WHERE id = v_result_id;

  UPDATE public.grand_line_guess_daily_puzzles
    SET status = 'solved',
        updated_at = pg_catalog.now()
  WHERE id = _puzzle_id;

  INSERT INTO public.grand_line_guess_stats (
    user_id,
    games_played,
    games_won,
    current_streak,
    best_streak,
    average_attempts,
    one_shot_wins,
    total_rewards_earned,
    last_played_date,
    last_win_date,
    updated_at
  )
  VALUES (
    _user_id,
    1,
    1,
    1,
    1,
    v_attempt_number,
    CASE WHEN v_attempt_number = 1 THEN 1 ELSE 0 END,
    v_computed_reward,
    v_puzzle_date,
    v_puzzle_date,
    pg_catalog.now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    games_played = CASE
      WHEN public.grand_line_guess_stats.last_played_date = EXCLUDED.last_played_date
        THEN public.grand_line_guess_stats.games_played
      ELSE public.grand_line_guess_stats.games_played + 1
    END,
    games_won = public.grand_line_guess_stats.games_won + 1,
    current_streak = CASE
      WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date - 1
        THEN public.grand_line_guess_stats.current_streak + 1
      WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date
        THEN public.grand_line_guess_stats.current_streak
      ELSE 1
    END,
    best_streak = pg_catalog.GREATEST(public.grand_line_guess_stats.best_streak, CASE
      WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date - 1
        THEN public.grand_line_guess_stats.current_streak + 1
      WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date
        THEN public.grand_line_guess_stats.current_streak
      ELSE 1
    END),
    average_attempts = (
      (public.grand_line_guess_stats.average_attempts * public.grand_line_guess_stats.games_won)
      + EXCLUDED.average_attempts
    )::numeric / NULLIF(public.grand_line_guess_stats.games_won + 1, 0),
    one_shot_wins = public.grand_line_guess_stats.one_shot_wins + EXCLUDED.one_shot_wins,
    total_rewards_earned = public.grand_line_guess_stats.total_rewards_earned + EXCLUDED.total_rewards_earned,
    last_played_date = EXCLUDED.last_played_date,
    last_win_date = EXCLUDED.last_win_date,
    updated_at = pg_catalog.now();

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) TO service_role;
