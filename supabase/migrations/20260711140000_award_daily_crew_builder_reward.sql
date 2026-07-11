BEGIN;

CREATE OR REPLACE FUNCTION public.award_daily_crew_builder_reward(
  _submission_id uuid,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_submission public.daily_crew_submissions%ROWTYPE;
  v_wallet_balance integer;
BEGIN
  SELECT *
    INTO v_submission
  FROM public.daily_crew_submissions
  WHERE id = _submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily Crew Builder payout submission not found';
  END IF;

  IF v_submission.user_id <> _user_id THEN
    RAISE EXCEPTION 'Daily Crew Builder payout submission ownership mismatch';
  END IF;

  IF v_submission.reward_paid THEN
    SELECT berries
      INTO v_wallet_balance
    FROM public.user_wallets
    WHERE user_id = _user_id;

    RETURN jsonb_build_object(
      'submissionId', v_submission.id,
      'rewardAmount', v_submission.reward_amount,
      'rewardPaid', true,
      'alreadyPaid', true,
      'walletBalance', v_wallet_balance
    );
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
    RAISE EXCEPTION 'Daily Crew Builder payout wallet row could not be prepared';
  END IF;

  IF v_submission.reward_amount > 0 THEN
    UPDATE public.user_wallets
    SET
      berries = berries + v_submission.reward_amount,
      updated_at = pg_catalog.now()
    WHERE user_id = _user_id
    RETURNING berries INTO v_wallet_balance;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Daily Crew Builder payout wallet update failed';
    END IF;
  END IF;

  UPDATE public.daily_crew_submissions
  SET
    reward_paid = true,
    updated_at = pg_catalog.now()
  WHERE id = v_submission.id
  RETURNING * INTO v_submission;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily Crew Builder payout state update failed';
  END IF;

  RETURN jsonb_build_object(
    'submissionId', v_submission.id,
    'rewardAmount', v_submission.reward_amount,
    'rewardPaid', true,
    'alreadyPaid', false,
    'walletBalance', v_wallet_balance
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.award_daily_crew_builder_reward(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_daily_crew_builder_reward(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
