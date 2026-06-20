-- Grand Line Guess: stabilize reward system
-- Adds the missing award_grand_line_guess_reward RPC and fixes race conditions.

-- ============================================================
-- 1) Ensure results table has everything needed for atomic reward logic
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_glg_results_lookup
  ON public.grand_line_guess_results (puzzle_id, user_id, reward_paid);

-- ============================================================
-- 2) Atomic reward + stats function
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_grand_line_guess_reward(
  _puzzle_id uuid,
  _user_id uuid,
  _attempt_number integer,
  _reward_amount integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result_id uuid;
  v_already_paid boolean;
  v_puzzle_date date;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- Lock the result row ( SERIALIZABLE-like guard against double-reward )
  SELECT id, reward_paid, p.puzzle_date
    INTO v_result_id, v_already_paid, v_puzzle_date
  FROM public.grand_line_guess_results r
  JOIN public.grand_line_guess_daily_puzzles p ON p.id = r.puzzle_id
  WHERE r.puzzle_id = _puzzle_id
    AND r.user_id = _user_id
  FOR UPDATE;

  IF v_result_id IS NULL THEN
    RAISE EXCEPTION 'Result row not found for puzzle % user %', _puzzle_id, _user_id;
  END IF;

  -- Idempotency: if reward already paid, silently return true
  IF v_already_paid THEN
    RETURN true;
  END IF;

  -- Credit wallet atomically
  UPDATE public.user_wallets
    SET berries = berries + _reward_amount,
        updated_at = now()
  WHERE user_id = _user_id;

  -- Mark puzzle & result as solved + reward paid
  UPDATE public.grand_line_guess_results
    SET solved = true,
        attempts_used = _attempt_number,
        reward_paid = true,
        reward_amount = _reward_amount,
        solved_at = now(),
        updated_at = now()
  WHERE id = v_result_id;

  UPDATE public.grand_line_guess_daily_puzzles
    SET status = 'solved',
        updated_at = now()
  WHERE id = _puzzle_id;

  -- Update stats atomically
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
  SELECT
    _user_id,
    1,
    1,
    CASE
      WHEN s.last_win_date = v_puzzle_date - 1 THEN COALESCE(s.current_streak, 0) + 1
      WHEN s.last_win_date = v_puzzle_date     THEN COALESCE(s.current_streak, 0)
      ELSE 1
    END,
    1,
    _attempt_number,
    CASE WHEN _attempt_number = 1 THEN 1 ELSE 0 END,
    _reward_amount,
    v_puzzle_date,
    v_puzzle_date,
    now()
  FROM (SELECT 1) dummy
  LEFT JOIN public.grand_line_guess_stats s ON s.user_id = _user_id
  ON CONFLICT (user_id) DO UPDATE SET
    games_played = public.grand_line_guess_stats.games_played + 1,
    games_won = public.grand_line_guess_stats.games_won + 1,
    current_streak = CASE
      WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date - 1
        THEN public.grand_line_guess_stats.current_streak + 1
      WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date
        THEN public.grand_line_guess_stats.current_streak
      ELSE 1
    END,
    best_streak = GREATEST(public.grand_line_guess_stats.best_streak, CASE
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
    updated_at = now();

  RETURN true;
END;
$function$;

-- Grant execute on the new function
GRANT EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) TO service_role;
