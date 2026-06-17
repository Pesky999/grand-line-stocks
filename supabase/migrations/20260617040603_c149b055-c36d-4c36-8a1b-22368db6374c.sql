
-- 1) trivia_questions: hide answer_index from public reads
DROP POLICY IF EXISTS "trivia_public_read" ON public.trivia_questions;
DROP POLICY IF EXISTS "Trivia readable by all" ON public.trivia_questions;
DROP POLICY IF EXISTS "trivia_questions_public_read" ON public.trivia_questions;
REVOKE SELECT ON public.trivia_questions FROM anon, authenticated;
GRANT SELECT (id, question, choices, reward, difficulty, created_at) ON public.trivia_questions TO anon, authenticated;
-- still need a row-level read policy so column grants apply
CREATE POLICY "Trivia safe columns readable" ON public.trivia_questions FOR SELECT TO anon, authenticated USING (true);

-- 2) net_worth_snapshots: own rows only
DROP POLICY IF EXISTS "snapshots_public_read" ON public.net_worth_snapshots;
DROP POLICY IF EXISTS "snapshots_read" ON public.net_worth_snapshots;
CREATE POLICY "Snapshots: owner can read" ON public.net_worth_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3) user_stats: own row only via direct API; server functions use service role
DROP POLICY IF EXISTS "user_stats_public_read" ON public.user_stats;
DROP POLICY IF EXISTS "stats_public_read" ON public.user_stats;
CREATE POLICY "User stats: owner can read" ON public.user_stats
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4) leaderboard_cache: no direct API access (server functions use service role)
DROP POLICY IF EXISTS "leaderboard_public_read" ON public.leaderboard_cache;
DROP POLICY IF EXISTS "lb_public_read" ON public.leaderboard_cache;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.leaderboard_cache FROM anon, authenticated;

-- 5) legacy_records: no direct API access; surfaced through server functions only
DROP POLICY IF EXISTS "legacy_public_read" ON public.legacy_records;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.legacy_records FROM anon, authenticated;

-- 6) user_roles: hard restrictive guard against self-granting roles
DROP POLICY IF EXISTS "Block non-admin role writes" ON public.user_roles;
CREATE POLICY "Block non-admin role writes" ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 7) Revoke EXECUTE on internal SECURITY DEFINER functions from anon/authenticated
--    (they remain callable by service_role used in server functions)
REVOKE EXECUTE ON FUNCTION
  public.apply_market_event(uuid),
  public.publish_due_events(),
  public.generate_market_rumor(),
  public.run_daily_market_cycle(),
  public.refresh_leaderboards(),
  public.expire_old_rumors(),
  public.generate_movement_explanation(uuid, numeric, text, uuid, uuid, numeric),
  public.grant_achievement(uuid, text),
  public.record_legacy_if_first(text, text, text, uuid, uuid, numeric),
  public.check_legacy_for_user(uuid),
  public.check_achievements(uuid),
  public.recalc_user_stats(uuid),
  public.preview_market_event(uuid),
  public.execute_trade(uuid, text, text, numeric),
  public.after_transaction()
FROM anon, authenticated, PUBLIC;
