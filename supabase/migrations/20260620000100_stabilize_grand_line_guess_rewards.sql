-- Grand Line Guess: atomic one-time reward payout.

CREATE OR REPLACE FUNCTION public.award_grand_line_guess_reward(
  _puzzle_id uuid,
  _user_id uuid,
  _attempt_number integer,
  _reward_amount integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.grand_line_guess_results;
  v_stats public.grand_line_guess_stats;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_next_streak integer;
BEGIN
  IF _attempt_number <= 0 THEN
    RAISE EXCEPTION 'Attempt number must be positive';
  END IF;

  IF _reward_amount < 0 THEN
    RAISE EXCEPTION 'Reward amount cannot be negative';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.grand_line_guess_daily_puzzles
    WHERE id = _puzzle_id
      AND user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Grand Line Guess puzzle not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.grand_line_guess_attempts
    WHERE puzzle_id = _puzzle_id
      AND user_id = _user_id
      AND attempt_number = _attempt_number
      AND is_correct = true
  ) THEN
    RAISE EXCEPTION 'Correct Grand Line Guess attempt not found';
  END IF;

  INSERT INTO public.grand_line_guess_results (puzzle_id, user_id)
  VALUES (_puzzle_id, _user_id)
  ON CONFLICT (puzzle_id, user_id) DO NOTHING;

  SELECT *
  INTO v_result
  FROM public.grand_line_guess_results
  WHERE puzzle_id = _puzzle_id
    AND user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grand Line Guess result row missing';
  END IF;

  IF v_result.reward_paid THEN
    RETURN false;
  END IF;

  UPDATE public.user_wallets
  SET berries = berries + _reward_amount,
      updated_at = now()
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  UPDATE public.grand_line_guess_results
  SET solved = true,
      attempts_used = _attempt_number,
      reward_paid = true,
      reward_amount = _reward_amount,
      solved_at = COALESCE(solved_at, now()),
      updated_at = now()
  WHERE id = v_result.id;

  UPDATE public.grand_line_guess_daily_puzzles
  SET status = 'solved',
      updated_at = now()
  WHERE id = _puzzle_id
    AND user_id = _user_id;

  SELECT *
  INTO v_stats
  FROM public.grand_line_guess_stats
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
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
      _attempt_number,
      CASE WHEN _attempt_number = 1 THEN 1 ELSE 0 END,
      _reward_amount,
      v_today,
      v_today,
      now()
    );
  ELSE
    v_next_streak := CASE
      WHEN v_stats.last_win_date IS NOT NULL
        AND v_today - v_stats.last_win_date <= 1
      THEN v_stats.current_streak + 1
      ELSE 1
    END;

    UPDATE public.grand_line_guess_stats
    SET games_played = games_played + CASE WHEN last_played_date = v_today THEN 0 ELSE 1 END,
        games_won = games_won + 1,
        current_streak = v_next_streak,
        best_streak = GREATEST(best_streak, v_next_streak),
        average_attempts = ((average_attempts * games_won) + _attempt_number) / (games_won + 1),
        one_shot_wins = one_shot_wins + CASE WHEN _attempt_number = 1 THEN 1 ELSE 0 END,
        total_rewards_earned = total_rewards_earned + _reward_amount,
        last_played_date = v_today,
        last_win_date = v_today,
        updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer)
  TO service_role;
