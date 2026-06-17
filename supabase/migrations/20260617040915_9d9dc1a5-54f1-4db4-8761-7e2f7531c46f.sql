
-- =====================================================
-- 1) Idempotent re-assert: after_transaction trigger
-- =====================================================
DROP TRIGGER IF EXISTS after_transaction_trg ON public.transactions;
CREATE TRIGGER after_transaction_trg
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.after_transaction();

-- =====================================================
-- 2) Atomic trivia answer RPC
--    - Locks question row, inserts attempt with ON CONFLICT DO NOTHING
--    - Credits wallet only when the insert actually happened AND answer is correct
--    - Wallet update uses a relative increment (no read-modify-write race)
-- =====================================================
CREATE OR REPLACE FUNCTION public.submit_trivia_answer(
  _question_id uuid,
  _choice_index int
)
RETURNS TABLE (correct boolean, reward numeric, already_answered boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_answer_index int;
  v_reward numeric;
  v_correct boolean;
  v_payout numeric := 0;
  v_inserted_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Snapshot question (FOR SHARE prevents concurrent admin delete mid-call)
  SELECT q.answer_index, q.reward
    INTO v_answer_index, v_reward
  FROM public.trivia_questions q
  WHERE q.id = _question_id
  FOR SHARE;

  IF v_answer_index IS NULL THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  v_correct := (_choice_index = v_answer_index);
  v_payout := CASE WHEN v_correct THEN v_reward ELSE 0 END;

  -- Atomic dedupe: unique(user_id, question_id) guarantees one row per attempt
  INSERT INTO public.trivia_attempts (user_id, question_id, correct, reward)
  VALUES (v_user, _question_id, v_correct, v_payout)
  ON CONFLICT (user_id, question_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    -- Already answered — no payout, ever
    RETURN QUERY SELECT v_correct, 0::numeric, true;
    RETURN;
  END IF;

  -- Credit wallet atomically (no read-modify-write)
  IF v_payout > 0 THEN
    UPDATE public.user_wallets
      SET berries = berries + v_payout,
          updated_at = now()
      WHERE user_id = v_user;
  END IF;

  RETURN QUERY SELECT v_correct, v_payout, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_trivia_answer(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_trivia_answer(uuid, int) TO authenticated;

-- =====================================================
-- 3) Schedule publish_due_events (pure-SQL cron, no pg_net needed)
--    - publish_due_events() already only acts on status='scheduled' AND scheduled_for<=now()
--    - apply_market_event() flips status to 'published' inside the same transaction,
--      preventing duplicates even if the cron tick overlaps.
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- idempotent: drop prior schedule if any
    PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'publish-due-market-events';
    PERFORM cron.schedule(
      'publish-due-market-events',
      '* * * * *',
      $cron$ SELECT public.publish_due_events(); $cron$
    );
  END IF;
END $$;
