BEGIN;

CREATE TABLE IF NOT EXISTS public.wallet_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ledger_entries_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT wallet_ledger_entries_entry_type_check CHECK (
    entry_type IN ('reward', 'bonus', 'grant', 'adjustment')
  ),
  CONSTRAINT wallet_ledger_entries_source_type_check CHECK (
    source_type IN (
      'daily_crew_builder',
      'grand_line_guess',
      'trivia',
      'admin_bonus',
      'launch_grant',
      'reset_grant'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entries_user_created
  ON public.wallet_ledger_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entries_source
  ON public.wallet_ledger_entries (source_type, source_id)
  WHERE source_id IS NOT NULL;

ALTER TABLE public.wallet_ledger_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wallet_ledger_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.wallet_ledger_entries TO authenticated;
GRANT ALL ON TABLE public.wallet_ledger_entries TO service_role;

DROP POLICY IF EXISTS "Users read own wallet ledger entries" ON public.wallet_ledger_entries;
CREATE POLICY "Users read own wallet ledger entries"
  ON public.wallet_ledger_entries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

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
  v_wallet_balance public.user_wallets.berries%TYPE;
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
      v_submission.reward_amount,
      v_wallet_balance,
      'daily_crew_builder',
      v_submission.id,
      'daily_crew_builder:' || v_submission.id::text,
      'Daily Crew Builder reward',
      jsonb_build_object(
        'submissionId', v_submission.id,
        'score', v_submission.score,
        'rank', v_submission.rank,
        'rewardAmount', v_submission.reward_amount
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
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
