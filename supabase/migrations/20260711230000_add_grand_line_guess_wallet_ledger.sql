BEGIN;

DROP FUNCTION IF EXISTS public.award_grand_line_guess_reward(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.award_grand_line_guess_reward(
  _puzzle_id uuid,
  _user_id uuid,
  _attempt_number integer,
  _reward_amount integer
)
RETURNS void
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
  v_wrong_guesses integer;
  v_computed_reward integer;
  v_result_id uuid;
  v_reward_paid boolean;
  v_wallet_balance public.user_wallets.berries%TYPE;
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

  IF _attempt_number IS DISTINCT FROM v_attempt_number THEN
    RAISE EXCEPTION 'Grand Line Guess reward validation failed';
  END IF;

  v_wrong_guesses := CASE
    WHEN v_attempt_number > 1 THEN v_attempt_number - 1
    ELSE 0
  END;
  v_computed_reward := CASE
    WHEN 1000 - (100 * v_wrong_guesses) > 0 THEN 1000 - (100 * v_wrong_guesses)
    ELSE 0
  END;

  -- _reward_amount remains in the signature for deployed-client compatibility.
  -- The payout amount is authorized from database state above.

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
    RETURN;
  END IF;

  INSERT INTO public.user_wallets (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT berries
    INTO v_wallet_balance
  FROM public.user_wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
  END IF;

  IF v_computed_reward > 0 THEN
    UPDATE public.user_wallets
      SET berries = berries + v_computed_reward,
          updated_at = pg_catalog.now()
    WHERE user_id = _user_id
    RETURNING berries INTO v_wallet_balance;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
    END IF;

    INSERT INTO public.wallet_ledger_entries (
      user_id,
      entry_type,
      amount,
      balance_after,
      source_type,
      source_id,
      idempotency_key,
      description,
      metadata
    )
    VALUES (
      _user_id,
      'reward',
      v_computed_reward,
      v_wallet_balance,
      'grand_line_guess',
      v_result_id,
      'grand_line_guess:' || v_result_id::text,
      'Grand Line Guess reward',
      jsonb_build_object(
        'puzzleId', _puzzle_id,
        'resultId', v_result_id,
        'attemptNumber', v_attempt_number,
        'rewardAmount', v_computed_reward
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  UPDATE public.grand_line_guess_results
    SET solved = true,
        attempts_used = v_attempt_number,
        reward_paid = true,
        reward_amount = v_computed_reward,
        solved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
  WHERE id = v_result_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to award Grand Line Guess reward';
  END IF;

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
    best_streak = CASE
      WHEN public.grand_line_guess_stats.best_streak > CASE
        WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date - 1
          THEN public.grand_line_guess_stats.current_streak + 1
        WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date
          THEN public.grand_line_guess_stats.current_streak
        ELSE 1
      END THEN public.grand_line_guess_stats.best_streak
      ELSE CASE
        WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date - 1
          THEN public.grand_line_guess_stats.current_streak + 1
        WHEN public.grand_line_guess_stats.last_win_date = EXCLUDED.last_win_date
          THEN public.grand_line_guess_stats.current_streak
        ELSE 1
      END
    END,
    average_attempts = (
      (public.grand_line_guess_stats.average_attempts * public.grand_line_guess_stats.games_won)
      + EXCLUDED.average_attempts
    )::numeric / NULLIF(public.grand_line_guess_stats.games_won + 1, 0),
    one_shot_wins = public.grand_line_guess_stats.one_shot_wins + EXCLUDED.one_shot_wins,
    total_rewards_earned = public.grand_line_guess_stats.total_rewards_earned + EXCLUDED.total_rewards_earned,
    last_played_date = EXCLUDED.last_played_date,
    last_win_date = EXCLUDED.last_win_date,
    updated_at = pg_catalog.now();

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.award_grand_line_guess_reward(uuid, uuid, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
