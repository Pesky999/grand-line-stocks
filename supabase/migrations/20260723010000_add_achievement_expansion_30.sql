BEGIN;

INSERT INTO public.achievements (
  code,
  name,
  description,
  tier,
  category,
  icon,
  criteria,
  reputation_reward
) VALUES
  (
    'deckhand_dealer',
    'Deckhand Dealer',
    'Complete 10 trades.',
    'beginner'::public.achievement_tier,
    'Trading',
    '*',
    '{"unlock":"Complete 10 trades.","total_trades":10}'::jsonb,
    5
  ),
  (
    'balanced_ledger',
    'Balanced Ledger',
    'Complete 25 buys and 25 sells.',
    'intermediate'::public.achievement_tier,
    'Trading',
    '*',
    '{"unlock":"Complete 25 buys and 25 sells.","total_buys":25,"total_sells":25}'::jsonb,
    10
  ),
  (
    'million_berry_mover',
    'Million-Berry Mover',
    'Reach ฿1,000,000 in lifetime trade volume.',
    'advanced'::public.achievement_tier,
    'Trading',
    '*',
    '{"unlock":"Reach ฿1,000,000 in lifetime trade volume.","total_volume":1000000}'::jsonb,
    20
  ),
  (
    'big_score',
    'Big Score',
    'Earn at least ฿10,000 profit from one sell.',
    'intermediate'::public.achievement_tier,
    'Trading',
    '*',
    '{"unlock":"Earn at least ฿10,000 profit from one sell.","best_trade_pnl":10000}'::jsonb,
    10
  ),
  (
    'treasure_haul',
    'Treasure Haul',
    'Earn at least ฿50,000 profit from one sell.',
    'advanced'::public.achievement_tier,
    'Trading',
    '*',
    '{"unlock":"Earn at least ฿50,000 profit from one sell.","best_trade_pnl":50000}'::jsonb,
    20
  ),
  (
    'storm_trader',
    'Storm Trader',
    'Complete 500 trades.',
    'legendary'::public.achievement_tier,
    'Trading',
    '*',
    '{"unlock":"Complete 500 trades.","total_trades":500}'::jsonb,
    40
  ),
  (
    'first_crew',
    'First Crew',
    'Own shares in 3 characters simultaneously.',
    'beginner'::public.achievement_tier,
    'Portfolio',
    '*',
    '{"unlock":"Own shares in 3 characters simultaneously.","holding_character_count":3}'::jsonb,
    5
  ),
  (
    'crew_builder',
    'Crew Builder',
    'Own shares in 10 characters simultaneously.',
    'intermediate'::public.achievement_tier,
    'Portfolio',
    '*',
    '{"unlock":"Own shares in 10 characters simultaneously.","holding_character_count":10}'::jsonb,
    10
  ),
  (
    'grand_fleet',
    'Grand Fleet',
    'Own shares in 25 characters simultaneously.',
    'advanced'::public.achievement_tier,
    'Portfolio',
    '*',
    '{"unlock":"Own shares in 25 characters simultaneously.","holding_character_count":25}'::jsonb,
    20
  ),
  (
    'four_seas_investor',
    'Four Seas Investor',
    'Own a Blue Chip, Growth, Speculative, and Meme stock simultaneously.',
    'intermediate'::public.achievement_tier,
    'Portfolio',
    '*',
    '{"unlock":"Own a Blue Chip, Growth, Speculative, and Meme stock simultaneously.","stock_categories":4}'::jsonb,
    10
  ),
  (
    'rising_bounty',
    'Rising Bounty',
    'Reach ฿50,000 net worth.',
    'beginner'::public.achievement_tier,
    'Wealth',
    '*',
    '{"unlock":"Reach ฿50,000 net worth.","net_worth":50000}'::jsonb,
    5
  ),
  (
    'supernova_fortune',
    'Supernova Fortune',
    'Reach ฿250,000 net worth.',
    'intermediate'::public.achievement_tier,
    'Wealth',
    '*',
    '{"unlock":"Reach ฿250,000 net worth.","net_worth":250000}'::jsonb,
    10
  ),
  (
    'emperors_treasury',
    'Emperor''s Treasury',
    'Reach ฿5,000,000 net worth.',
    'legendary'::public.achievement_tier,
    'Wealth',
    '*',
    '{"unlock":"Reach ฿5,000,000 net worth.","net_worth":5000000}'::jsonb,
    40
  ),
  (
    'whale_position',
    'Whale Position',
    'Hold one position worth at least ฿250,000.',
    'advanced'::public.achievement_tier,
    'Portfolio',
    '*',
    '{"unlock":"Hold one position worth at least ฿250,000.","largest_position_value":250000}'::jsonb,
    20
  ),
  (
    'seven_day_sail',
    'Seven-Day Sail',
    'Maintain a 7-day login streak.',
    'beginner'::public.achievement_tier,
    'Activity',
    '*',
    '{"unlock":"Maintain a 7-day login streak.","login_streak":7}'::jsonb,
    5
  ),
  (
    'seasoned_sailor',
    'Seasoned Sailor',
    'Be active on 100 distinct days.',
    'advanced'::public.achievement_tier,
    'Activity',
    '*',
    '{"unlock":"Be active on 100 distinct days.","days_active":100}'::jsonb,
    20
  ),
  (
    'unbroken_voyage',
    'Unbroken Voyage',
    'Maintain a 100-day login streak.',
    'legendary'::public.achievement_tier,
    'Activity',
    '*',
    '{"unlock":"Maintain a 100-day login streak.","login_streak":100}'::jsonb,
    40
  ),
  (
    'king_of_exchange',
    'King of the Exchange',
    'Reach rank #1 on the all-time net-worth leaderboard.',
    'legendary'::public.achievement_tier,
    'Leaderboard',
    '*',
    '{"unlock":"Reach rank #1 on the all-time net-worth leaderboard.","rank":1}'::jsonb,
    40
  ),
  (
    'first_sight',
    'First Sight',
    'Solve your first daily puzzle.',
    'beginner'::public.achievement_tier,
    'Grand Line Guess',
    '*',
    '{"unlock":"Solve your first daily puzzle.","grand_line_guess_wins":1}'::jsonb,
    5
  ),
  (
    'observation_haki',
    'Observation Haki',
    'Solve a puzzle on the first guess.',
    'intermediate'::public.achievement_tier,
    'Grand Line Guess',
    '*',
    '{"unlock":"Solve a puzzle on the first guess.","one_shot_wins":1}'::jsonb,
    10
  ),
  (
    'clue_free_navigator',
    'Clue-Free Navigator',
    'Solve a puzzle without using a hint.',
    'intermediate'::public.achievement_tier,
    'Grand Line Guess',
    '*',
    '{"unlock":"Solve a puzzle without using a hint.","hints_used":0}'::jsonb,
    10
  ),
  (
    'winning_route',
    'Winning Route',
    'Win 10 daily puzzles consecutively.',
    'advanced'::public.achievement_tier,
    'Grand Line Guess',
    '*',
    '{"unlock":"Win 10 daily puzzles consecutively.","grand_line_guess_best_streak":10}'::jsonb,
    20
  ),
  (
    'grand_line_oracle',
    'Grand Line Oracle',
    'Win 50 daily puzzles.',
    'legendary'::public.achievement_tier,
    'Grand Line Guess',
    '*',
    '{"unlock":"Win 50 daily puzzles.","grand_line_guess_wins":50}'::jsonb,
    40
  ),
  (
    'first_command',
    'First Command',
    'Submit your first Daily Crew mission.',
    'beginner'::public.achievement_tier,
    'Daily Crew',
    '*',
    '{"unlock":"Submit your first Daily Crew mission.","daily_crew_submissions":1}'::jsonb,
    5
  ),
  (
    'a_rank_captain',
    'A-Rank Captain',
    'Earn an A or S rank.',
    'intermediate'::public.achievement_tier,
    'Daily Crew',
    '*',
    '{"unlock":"Earn an A or S rank.","daily_crew_rank":["a","s"]}'::jsonb,
    10
  ),
  (
    's_rank_commander',
    'S-Rank Commander',
    'Earn an S rank.',
    'advanced'::public.achievement_tier,
    'Daily Crew',
    '*',
    '{"unlock":"Earn an S rank.","daily_crew_rank":"s"}'::jsonb,
    20
  ),
  (
    'perfect_crew',
    'Perfect Crew',
    'Achieve the maximum possible mission score.',
    'advanced'::public.achievement_tier,
    'Daily Crew',
    '*',
    '{"unlock":"Achieve the maximum possible mission score.","daily_crew_perfect_score":true}'::jsonb,
    20
  ),
  (
    'mission_log',
    'Mission Log',
    'Submit 5 Daily Crew missions.',
    'beginner'::public.achievement_tier,
    'Daily Crew',
    '*',
    '{"unlock":"Submit 5 Daily Crew missions.","daily_crew_submissions":5}'::jsonb,
    5
  ),
  (
    'crew_scholar',
    'Crew Scholar',
    'Earn an A or S rank on 10 Daily Crew missions.',
    'intermediate'::public.achievement_tier,
    'Daily Crew',
    '*',
    '{"unlock":"Earn an A or S rank on 10 Daily Crew missions.","daily_crew_high_rank_count":10}'::jsonb,
    10
  ),
  (
    'grand_fleet_archivist',
    'Grand Fleet Archivist',
    'Achieve a perfect score on 5 Daily Crew missions.',
    'advanced'::public.achievement_tier,
    'Daily Crew',
    '*',
    '{"unlock":"Achieve a perfect score on 5 Daily Crew missions.","daily_crew_perfect_count":5}'::jsonb,
    20
  )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    icon = EXCLUDED.icon,
    criteria = EXCLUDED.criteria,
    reputation_reward = EXCLUDED.reputation_reward;

CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  s public.user_stats;
  v_count integer := 0;
  v_profile_created_at timestamptz;
  v_is_largest boolean := false;
  v_rank integer;
  v_win_rate numeric := 0;
  v_closed integer := 0;
  v_holding_count integer := 0;
  v_holding_category_count integer := 0;
  v_glg_games_won integer := 0;
  v_glg_one_shot_wins integer := 0;
  v_glg_best_streak integer := 0;
  v_glg_hints_free boolean := false;
  v_daily_crew_submission_count integer := 0;
  v_daily_crew_best_score integer := 0;
  v_daily_crew_a_or_s boolean := false;
  v_daily_crew_s boolean := false;
  v_daily_crew_perfect boolean := false;
  v_daily_crew_a_or_s_count integer := 0;
  v_daily_crew_perfect_count integer := 0;
BEGIN
  SELECT *
    INTO s
  FROM public.user_stats
  WHERE user_id = _user_id;

  IF s IS NULL THEN
    RETURN 0;
  END IF;

  SELECT created_at
    INTO v_profile_created_at
  FROM public.profiles
  WHERE id = _user_id;

  SELECT rank
    INTO v_rank
  FROM public.leaderboard_cache
  WHERE board_key = 'net_worth_all_time'
    AND user_id = _user_id;

  SELECT COUNT(DISTINCT h.character_id), COUNT(DISTINCT c.category)
    INTO v_holding_count, v_holding_category_count
  FROM public.user_holdings AS h
  JOIN public.characters AS c
    ON c.id = h.character_id
  WHERE h.user_id = _user_id
    AND h.shares > 0;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_holdings AS h1
    WHERE h1.user_id = _user_id
      AND h1.shares > 0
      AND h1.shares = (
        SELECT MAX(h2.shares)
        FROM public.user_holdings AS h2
        WHERE h2.character_id = h1.character_id
          AND h2.shares > 0
      )
  )
  INTO v_is_largest;

  SELECT COALESCE(stats.games_won, 0),
         COALESCE(stats.one_shot_wins, 0),
         COALESCE(stats.best_streak, 0)
    INTO v_glg_games_won, v_glg_one_shot_wins, v_glg_best_streak
  FROM public.grand_line_guess_stats AS stats
  WHERE stats.user_id = _user_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.grand_line_guess_results AS results
    WHERE results.user_id = _user_id
      AND results.solved = true
      AND results.hints_used = 0
  )
  INTO v_glg_hints_free;

  SELECT COUNT(*),
         COALESCE(MAX(submissions.score), 0),
         COALESCE(BOOL_OR(submissions.rank IN ('a'::public.daily_crew_rank, 's'::public.daily_crew_rank)), false),
         COALESCE(BOOL_OR(submissions.rank = 's'::public.daily_crew_rank), false),
         COALESCE(BOOL_OR(submissions.score >= missions.max_score), false),
         COUNT(*) FILTER (WHERE submissions.rank IN ('a'::public.daily_crew_rank, 's'::public.daily_crew_rank)),
         COUNT(*) FILTER (WHERE submissions.score = missions.max_score)
    INTO v_daily_crew_submission_count,
         v_daily_crew_best_score,
         v_daily_crew_a_or_s,
         v_daily_crew_s,
         v_daily_crew_perfect,
         v_daily_crew_a_or_s_count,
         v_daily_crew_perfect_count
  FROM public.daily_crew_submissions AS submissions
  JOIN public.daily_crew_missions AS missions
    ON missions.id = submissions.mission_id
  WHERE submissions.user_id = _user_id;

  IF s.total_trades >= 1 AND public.grant_achievement(_user_id, 'first_trade') THEN
    v_count := v_count + 1;
  END IF;

  IF s.realized_pnl > 0 AND public.grant_achievement(_user_id, 'first_profit') THEN
    v_count := v_count + 1;
  END IF;

  IF v_profile_created_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.market_events AS event
      WHERE event.status = 'published'::public.event_status
        AND event.published_at IS NOT NULL
        AND event.published_at >= v_profile_created_at
        AND event.published_at <= pg_catalog.now()
    )
    AND public.grant_achievement(_user_id, 'first_event')
  THEN
    v_count := v_count + 1;
  END IF;

  IF s.total_trades >= 100 AND public.grant_achievement(_user_id, 'hundred_trades') THEN
    v_count := v_count + 1;
  END IF;

  IF s.realized_pnl >= 100000 AND public.grant_achievement(_user_id, 'hundred_k_profit') THEN
    v_count := v_count + 1;
  END IF;

  IF s.login_streak >= 30 AND public.grant_achievement(_user_id, 'streak_30') THEN
    v_count := v_count + 1;
  END IF;

  IF s.current_net_worth >= 1000000 AND public.grant_achievement(_user_id, 'millionaire') THEN
    v_count := v_count + 1;
  END IF;

  IF v_rank IS NOT NULL
    AND v_rank <= 100
    AND public.grant_achievement(_user_id, 'top_100')
  THEN
    v_count := v_count + 1;
  END IF;

  IF v_rank IS NOT NULL
    AND v_rank <= 10
    AND public.grant_achievement(_user_id, 'top_10')
  THEN
    v_count := v_count + 1;
  END IF;

  IF v_is_largest AND public.grant_achievement(_user_id, 'largest_holder') THEN
    v_count := v_count + 1;
  END IF;

  IF s.reputation_score >= 850 AND public.grant_achievement(_user_id, 'yonko_investor') THEN
    v_count := v_count + 1;
  END IF;

  IF s.reputation_score >= 950 AND public.grant_achievement(_user_id, 'pirate_king') THEN
    v_count := v_count + 1;
  END IF;

  v_closed := s.wins + s.losses;
  IF v_closed >= 50 THEN
    v_win_rate := s.wins::numeric * 100 / v_closed;
    IF v_win_rate >= 70 AND public.grant_achievement(_user_id, 'market_prophet') THEN
      v_count := v_count + 1;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_holdings AS h
    WHERE h.user_id = _user_id
      AND h.shares > 0
      AND h.created_at <= pg_catalog.now() - interval '60 days'
  )
    AND public.grant_achievement(_user_id, 'diamond_hands')
  THEN
    v_count := v_count + 1;
  END IF;

  IF s.total_trades >= 10 AND public.grant_achievement(_user_id, 'deckhand_dealer') THEN
    v_count := v_count + 1;
  END IF;

  IF s.total_buys >= 25
    AND s.total_sells >= 25
    AND public.grant_achievement(_user_id, 'balanced_ledger')
  THEN
    v_count := v_count + 1;
  END IF;

  IF s.total_volume >= 1000000
    AND public.grant_achievement(_user_id, 'million_berry_mover')
  THEN
    v_count := v_count + 1;
  END IF;

  IF s.best_trade_pnl >= 10000 AND public.grant_achievement(_user_id, 'big_score') THEN
    v_count := v_count + 1;
  END IF;

  IF s.best_trade_pnl >= 50000 AND public.grant_achievement(_user_id, 'treasure_haul') THEN
    v_count := v_count + 1;
  END IF;

  IF s.total_trades >= 500 AND public.grant_achievement(_user_id, 'storm_trader') THEN
    v_count := v_count + 1;
  END IF;

  IF v_holding_count >= 3 AND public.grant_achievement(_user_id, 'first_crew') THEN
    v_count := v_count + 1;
  END IF;

  IF v_holding_count >= 10 AND public.grant_achievement(_user_id, 'crew_builder') THEN
    v_count := v_count + 1;
  END IF;

  IF v_holding_count >= 25 AND public.grant_achievement(_user_id, 'grand_fleet') THEN
    v_count := v_count + 1;
  END IF;

  IF v_holding_category_count = 4 AND public.grant_achievement(_user_id, 'four_seas_investor') THEN
    v_count := v_count + 1;
  END IF;

  IF s.current_net_worth >= 50000 AND public.grant_achievement(_user_id, 'rising_bounty') THEN
    v_count := v_count + 1;
  END IF;

  IF s.current_net_worth >= 250000
    AND public.grant_achievement(_user_id, 'supernova_fortune')
  THEN
    v_count := v_count + 1;
  END IF;

  IF s.current_net_worth >= 5000000
    AND public.grant_achievement(_user_id, 'emperors_treasury')
  THEN
    v_count := v_count + 1;
  END IF;

  IF s.largest_position_value >= 250000
    AND public.grant_achievement(_user_id, 'whale_position')
  THEN
    v_count := v_count + 1;
  END IF;

  IF s.login_streak >= 7 AND public.grant_achievement(_user_id, 'seven_day_sail') THEN
    v_count := v_count + 1;
  END IF;

  IF s.days_active >= 100 AND public.grant_achievement(_user_id, 'seasoned_sailor') THEN
    v_count := v_count + 1;
  END IF;

  IF s.login_streak >= 100 AND public.grant_achievement(_user_id, 'unbroken_voyage') THEN
    v_count := v_count + 1;
  END IF;

  IF v_rank IS NOT NULL
    AND v_rank = 1
    AND public.grant_achievement(_user_id, 'king_of_exchange')
  THEN
    v_count := v_count + 1;
  END IF;

  IF v_glg_games_won >= 1 AND public.grant_achievement(_user_id, 'first_sight') THEN
    v_count := v_count + 1;
  END IF;

  IF v_glg_one_shot_wins >= 1 AND public.grant_achievement(_user_id, 'observation_haki') THEN
    v_count := v_count + 1;
  END IF;

  IF v_glg_hints_free AND public.grant_achievement(_user_id, 'clue_free_navigator') THEN
    v_count := v_count + 1;
  END IF;

  IF v_glg_best_streak >= 10 AND public.grant_achievement(_user_id, 'winning_route') THEN
    v_count := v_count + 1;
  END IF;

  IF v_glg_games_won >= 50 AND public.grant_achievement(_user_id, 'grand_line_oracle') THEN
    v_count := v_count + 1;
  END IF;

  IF v_daily_crew_submission_count >= 1
    AND public.grant_achievement(_user_id, 'first_command')
  THEN
    v_count := v_count + 1;
  END IF;

  IF v_daily_crew_a_or_s AND public.grant_achievement(_user_id, 'a_rank_captain') THEN
    v_count := v_count + 1;
  END IF;

  IF v_daily_crew_s AND public.grant_achievement(_user_id, 's_rank_commander') THEN
    v_count := v_count + 1;
  END IF;

  IF v_daily_crew_perfect AND public.grant_achievement(_user_id, 'perfect_crew') THEN
    v_count := v_count + 1;
  END IF;

  IF v_daily_crew_submission_count >= 5 AND public.grant_achievement(_user_id, 'mission_log') THEN
    v_count := v_count + 1;
  END IF;

  IF v_daily_crew_a_or_s_count >= 10 AND public.grant_achievement(_user_id, 'crew_scholar') THEN
    v_count := v_count + 1;
  END IF;

  IF v_daily_crew_perfect_count >= 5 AND public.grant_achievement(_user_id, 'grand_fleet_archivist') THEN
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_achievements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_achievements(uuid) TO service_role;

SELECT public.refresh_all_user_progression() AS achievement_expansion_30_backfill;

COMMIT;

NOTIFY pgrst, 'reload schema';
