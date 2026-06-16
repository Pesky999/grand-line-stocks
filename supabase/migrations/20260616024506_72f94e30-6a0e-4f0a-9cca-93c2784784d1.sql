
-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.investor_title AS ENUM (
    'rookie_pirate','east_blue_trader','grand_line_investor',
    'warlord_investor','yonko_investor','pirate_king_investor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.investor_specialization AS ENUM (
    'generalist','value_investor','growth_investor','speculator',
    'meme_investor','event_trader','whale'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.achievement_tier AS ENUM ('beginner','intermediate','advanced','legendary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.net_worth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  cash numeric NOT NULL DEFAULT 0,
  equity numeric NOT NULL DEFAULT 0,
  net_worth numeric NOT NULL DEFAULT 0,
  return_pct numeric NOT NULL DEFAULT 0,
  rank_overall int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);
GRANT SELECT ON public.net_worth_snapshots TO anon, authenticated;
GRANT ALL ON public.net_worth_snapshots TO service_role;
ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots_public_read" ON public.net_worth_snapshots FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS net_worth_snapshots_user_date_idx
  ON public.net_worth_snapshots (user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS net_worth_snapshots_date_idx
  ON public.net_worth_snapshots (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_trades int NOT NULL DEFAULT 0,
  total_buys int NOT NULL DEFAULT 0,
  total_sells int NOT NULL DEFAULT 0,
  total_volume numeric NOT NULL DEFAULT 0,
  realized_pnl numeric NOT NULL DEFAULT 0,
  wins int NOT NULL DEFAULT 0,
  losses int NOT NULL DEFAULT 0,
  best_trade_pnl numeric NOT NULL DEFAULT 0,
  best_trade_slug text,
  worst_trade_pnl numeric NOT NULL DEFAULT 0,
  worst_trade_slug text,
  largest_position_value numeric NOT NULL DEFAULT 0,
  largest_position_slug text,
  avg_holding_days numeric NOT NULL DEFAULT 0,
  current_net_worth numeric NOT NULL DEFAULT 0,
  highest_net_worth numeric NOT NULL DEFAULT 0,
  highest_rank int,
  current_rank int,
  rank_overall_prev int,
  days_active int NOT NULL DEFAULT 1,
  login_streak int NOT NULL DEFAULT 1,
  last_active_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  reputation_score int NOT NULL DEFAULT 0,
  title public.investor_title NOT NULL DEFAULT 'rookie_pirate',
  specialization public.investor_specialization NOT NULL DEFAULT 'generalist',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_stats TO anon, authenticated;
GRANT ALL ON public.user_stats TO service_role;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_stats_public_read" ON public.user_stats FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.leaderboard_cache (
  id bigserial PRIMARY KEY,
  board_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank int NOT NULL,
  prev_rank int,
  value numeric NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_key, user_id)
);
GRANT SELECT ON public.leaderboard_cache TO anon, authenticated;
GRANT ALL ON public.leaderboard_cache TO service_role;
ALTER TABLE public.leaderboard_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaderboard_public_read" ON public.leaderboard_cache FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS leaderboard_cache_board_rank_idx
  ON public.leaderboard_cache (board_key, rank);

CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  tier public.achievement_tier NOT NULL,
  category text NOT NULL DEFAULT 'general',
  icon text NOT NULL DEFAULT '★',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  reputation_reward int NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievements TO anon, authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements_public_read" ON public.achievements FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
GRANT SELECT ON public.user_achievements TO anon, authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_achievements_public_read" ON public.user_achievements FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON public.user_achievements (user_id);

CREATE TABLE IF NOT EXISTS public.legacy_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  value numeric,
  achieved_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.legacy_records TO anon, authenticated;
GRANT ALL ON public.legacy_records TO service_role;
ALTER TABLE public.legacy_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legacy_public_read" ON public.legacy_records FOR SELECT USING (true);

-- ============================================================
-- SEED ACHIEVEMENT CATALOG
-- ============================================================
INSERT INTO public.achievements (code, name, description, tier, category, icon, criteria, reputation_reward) VALUES
  ('first_trade','First Trade','Execute your first trade.','beginner','trading','▲','{"total_trades":1}',10),
  ('first_profit','First Profit','Realize your first profitable sale.','beginner','trading','✚','{"realized_pnl":0.01}',15),
  ('first_event','First Market Event','Live through your first published market event.','beginner','market','◈','{"event_seen":1}',10),
  ('hundred_trades','100 Trades','Execute 100 trades.','intermediate','trading','100','{"total_trades":100}',40),
  ('hundred_k_profit','100,000 Berries Earned','Realize ฿100,000 in profit.','intermediate','wealth','฿','{"realized_pnl":100000}',60),
  ('streak_30','30-Day Login Streak','Trade or visit on 30 consecutive days.','intermediate','engagement','◷','{"login_streak":30}',50),
  ('millionaire','Millionaire Pirate','Reach ฿1,000,000 net worth.','advanced','wealth','✦','{"net_worth":1000000}',100),
  ('top_100','Top 100 Investor','Reach the top 100 on the all-time leaderboard.','advanced','rank','#','{"rank":100}',120),
  ('top_10','Top 10 Investor','Reach the top 10 on the all-time leaderboard.','advanced','rank','#','{"rank":10}',180),
  ('largest_holder','Largest Holder','Become the #1 holder of any character.','advanced','dominance','♛','{"largest_holder":1}',150),
  ('yonko_investor','Yonko Investor','Earn the Yonko Investor title.','legendary','prestige','☠','{"reputation":850}',250),
  ('pirate_king','Pirate King Investor','Earn the Pirate King Investor title.','legendary','prestige','♚','{"reputation":950}',500),
  ('market_prophet','Market Prophet','Achieve a 70%+ win rate with at least 50 closed trades.','legendary','skill','◎','{"win_rate":70,"closed_trades":50}',300),
  ('diamond_hands','Diamond Hands','Hold any position for 60+ days.','legendary','patience','◆','{"hold_days":60}',200)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- HELPER: get current portfolio value
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_equity(_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(h.shares * c.current_price), 0)
  FROM public.user_holdings h
  JOIN public.characters c ON c.id = h.character_id
  WHERE h.user_id = _user_id;
$$;

-- ============================================================
-- RECALC USER STATS (called after every trade + daily)
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_user_stats(_user_id uuid)
RETURNS public.user_stats LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cash numeric;
  v_equity numeric;
  v_net numeric;
  v_total int;
  v_buys int;
  v_sells int;
  v_vol numeric;
  v_wins int;
  v_losses int;
  v_best numeric := 0;
  v_best_slug text;
  v_worst numeric := 0;
  v_worst_slug text;
  v_largest_val numeric := 0;
  v_largest_slug text;
  v_avg_hold numeric := 0;
  v_realized numeric := 0;
  v_spec public.investor_specialization := 'generalist';
  v_meme_pct numeric;
  v_blue_pct numeric;
  v_growth_pct numeric;
  v_spec_pct numeric;
  v_pos_count int;
  v_avg_pos numeric;
  v_event_trades int;
  v_total_buy_vol numeric;
  v_rep int;
  v_title public.investor_title := 'rookie_pirate';
  v_account_age_days int;
  v_row public.user_stats;
BEGIN
  -- cash
  SELECT COALESCE(berries,0) INTO v_cash FROM public.user_wallets WHERE user_id = _user_id;
  IF v_cash IS NULL THEN v_cash := 0; END IF;
  v_equity := public.user_equity(_user_id);
  v_net := v_cash + v_equity;

  -- trade counts
  SELECT COUNT(*), COUNT(*) FILTER (WHERE side='buy'), COUNT(*) FILTER (WHERE side='sell'),
         COALESCE(SUM(total),0)
    INTO v_total, v_buys, v_sells, v_vol
    FROM public.transactions WHERE user_id = _user_id;

  -- realized pnl per sell vs running avg (approx via stored balance_after deltas)
  -- Approximation: for each sell, pnl = (price - avg_cost_at_time)*shares. Use heuristic by comparing to last buy avg.
  WITH sells AS (
    SELECT t.id, t.character_id, t.shares, t.price, t.created_at,
      (SELECT AVG(b.price) FROM public.transactions b
        WHERE b.user_id = t.user_id AND b.character_id = t.character_id
          AND b.side='buy' AND b.created_at < t.created_at) AS avg_buy,
      (SELECT c.slug FROM public.characters c WHERE c.id = t.character_id) AS slug
    FROM public.transactions t WHERE t.user_id = _user_id AND t.side='sell'
  ), pnl AS (
    SELECT slug, (price - COALESCE(avg_buy, price)) * shares AS p FROM sells
  )
  SELECT COALESCE(SUM(p),0),
         COUNT(*) FILTER (WHERE p > 0),
         COUNT(*) FILTER (WHERE p < 0)
    INTO v_realized, v_wins, v_losses FROM pnl;

  SELECT p, slug INTO v_best, v_best_slug FROM (
    WITH sells AS (
      SELECT t.character_id, t.shares, t.price,
        (SELECT AVG(b.price) FROM public.transactions b WHERE b.user_id=t.user_id AND b.character_id=t.character_id AND b.side='buy' AND b.created_at < t.created_at) AS avg_buy,
        (SELECT c.slug FROM public.characters c WHERE c.id=t.character_id) AS slug
      FROM public.transactions t WHERE t.user_id=_user_id AND t.side='sell'
    ) SELECT slug, (price - COALESCE(avg_buy,price))*shares AS p FROM sells ORDER BY p DESC NULLS LAST LIMIT 1
  ) x;

  SELECT p, slug INTO v_worst, v_worst_slug FROM (
    WITH sells AS (
      SELECT t.character_id, t.shares, t.price,
        (SELECT AVG(b.price) FROM public.transactions b WHERE b.user_id=t.user_id AND b.character_id=t.character_id AND b.side='buy' AND b.created_at < t.created_at) AS avg_buy,
        (SELECT c.slug FROM public.characters c WHERE c.id=t.character_id) AS slug
      FROM public.transactions t WHERE t.user_id=_user_id AND t.side='sell'
    ) SELECT slug, (price - COALESCE(avg_buy,price))*shares AS p FROM sells ORDER BY p ASC NULLS LAST LIMIT 1
  ) x;

  -- largest current position
  SELECT (h.shares*c.current_price), c.slug INTO v_largest_val, v_largest_slug
  FROM public.user_holdings h JOIN public.characters c ON c.id = h.character_id
  WHERE h.user_id = _user_id ORDER BY h.shares*c.current_price DESC LIMIT 1;
  v_largest_val := COALESCE(v_largest_val, 0);

  -- avg holding days for sells
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (s.created_at - b_first.created_at))/86400.0),0)
    INTO v_avg_hold
  FROM public.transactions s
  LEFT JOIN LATERAL (
    SELECT MIN(created_at) AS created_at FROM public.transactions b
    WHERE b.user_id=s.user_id AND b.character_id=s.character_id AND b.side='buy' AND b.created_at<s.created_at
  ) b_first ON true
  WHERE s.user_id=_user_id AND s.side='sell';

  -- specialization
  SELECT
    COALESCE(SUM(CASE WHEN c.category='meme' THEN t.total END),0),
    COALESCE(SUM(CASE WHEN c.category='blue_chip' THEN t.total END),0),
    COALESCE(SUM(CASE WHEN c.category='growth' THEN t.total END),0),
    COALESCE(SUM(CASE WHEN c.category='speculative' THEN t.total END),0),
    COALESCE(SUM(t.total),0)
  INTO v_meme_pct, v_blue_pct, v_growth_pct, v_spec_pct, v_total_buy_vol
  FROM public.transactions t JOIN public.characters c ON c.id=t.character_id
  WHERE t.user_id=_user_id AND t.side='buy';

  SELECT COUNT(*), COALESCE(AVG(h.shares*c.current_price),0)
    INTO v_pos_count, v_avg_pos
  FROM public.user_holdings h JOIN public.characters c ON c.id=h.character_id
  WHERE h.user_id=_user_id;

  -- event trader: trades within 2h of an event publication
  SELECT COUNT(*) INTO v_event_trades
  FROM public.transactions t
  WHERE t.user_id=_user_id
    AND EXISTS (
      SELECT 1 FROM public.market_events e
      WHERE e.published_at IS NOT NULL
        AND t.created_at BETWEEN e.published_at AND e.published_at + interval '2 hours'
    );

  IF v_total_buy_vol > 0 THEN
    IF v_meme_pct / v_total_buy_vol > 0.4 THEN v_spec := 'meme_investor';
    ELSIF v_spec_pct / v_total_buy_vol > 0.5 THEN v_spec := 'speculator';
    ELSIF v_blue_pct / v_total_buy_vol > 0.5 THEN v_spec := 'value_investor';
    ELSIF v_growth_pct / v_total_buy_vol > 0.5 THEN v_spec := 'growth_investor';
    END IF;
  END IF;
  IF v_total >= 10 AND v_event_trades::numeric / GREATEST(v_total,1) > 0.3 THEN
    v_spec := 'event_trader';
  END IF;
  IF v_avg_pos > 250000 OR v_net > 5000000 THEN v_spec := 'whale'; END IF;

  -- account age (days)
  SELECT GREATEST(1, (now()::date - p.created_at::date))::int INTO v_account_age_days
  FROM public.profiles p WHERE p.id=_user_id;
  IF v_account_age_days IS NULL THEN v_account_age_days := 1; END IF;

  -- reputation score (0-1000)
  v_rep := LEAST(1000, GREATEST(0,
      LEAST(300, (v_net / 10000)::int)                  -- up to 300 from wealth (3M = 300)
    + LEAST(200, (v_realized / 5000)::int)              -- up to 200 from realized gains (1M = 200)
    + LEAST(150, v_total * 2)                           -- up to 150 from activity (75 trades)
    + LEAST(100, v_account_age_days)                    -- up to 100 from longevity
    + LEAST(150, CASE WHEN (v_wins+v_losses) >= 10
        THEN (v_wins * 150 / GREATEST(v_wins+v_losses,1))
        ELSE 0 END)                                     -- up to 150 from win rate
    + LEAST(100, COALESCE((SELECT SUM(a.reputation_reward) FROM public.user_achievements ua JOIN public.achievements a ON a.id=ua.achievement_id WHERE ua.user_id=_user_id),0)/3)
  ));

  v_title := CASE
    WHEN v_rep >= 950 THEN 'pirate_king_investor'
    WHEN v_rep >= 850 THEN 'yonko_investor'
    WHEN v_rep >= 600 THEN 'warlord_investor'
    WHEN v_rep >= 300 THEN 'grand_line_investor'
    WHEN v_rep >= 100 THEN 'east_blue_trader'
    ELSE 'rookie_pirate'
  END::public.investor_title;

  INSERT INTO public.user_stats (
    user_id, total_trades, total_buys, total_sells, total_volume,
    realized_pnl, wins, losses, best_trade_pnl, best_trade_slug,
    worst_trade_pnl, worst_trade_slug, largest_position_value, largest_position_slug,
    avg_holding_days, current_net_worth, highest_net_worth, days_active,
    reputation_score, title, specialization, updated_at
  ) VALUES (
    _user_id, v_total, v_buys, v_sells, v_vol,
    v_realized, v_wins, v_losses, COALESCE(v_best,0), v_best_slug,
    COALESCE(v_worst,0), v_worst_slug, v_largest_val, v_largest_slug,
    v_avg_hold, v_net, v_net, v_account_age_days,
    v_rep, v_title, v_spec, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_trades = EXCLUDED.total_trades,
    total_buys = EXCLUDED.total_buys,
    total_sells = EXCLUDED.total_sells,
    total_volume = EXCLUDED.total_volume,
    realized_pnl = EXCLUDED.realized_pnl,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    best_trade_pnl = EXCLUDED.best_trade_pnl,
    best_trade_slug = EXCLUDED.best_trade_slug,
    worst_trade_pnl = EXCLUDED.worst_trade_pnl,
    worst_trade_slug = EXCLUDED.worst_trade_slug,
    largest_position_value = EXCLUDED.largest_position_value,
    largest_position_slug = EXCLUDED.largest_position_slug,
    avg_holding_days = EXCLUDED.avg_holding_days,
    current_net_worth = EXCLUDED.current_net_worth,
    highest_net_worth = GREATEST(public.user_stats.highest_net_worth, EXCLUDED.current_net_worth),
    days_active = EXCLUDED.days_active,
    reputation_score = EXCLUDED.reputation_score,
    title = EXCLUDED.title,
    specialization = EXCLUDED.specialization,
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- ============================================================
-- ACHIEVEMENT CHECK
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.user_stats;
  v_count int := 0;
  v_max_hold_days numeric;
  v_is_largest boolean;
  v_rank int;
  v_win_rate numeric;
  v_closed int;
BEGIN
  SELECT * INTO s FROM public.user_stats WHERE user_id=_user_id;
  IF s IS NULL THEN RETURN 0; END IF;

  PERFORM grant_achievement(_user_id, 'first_trade') WHERE s.total_trades >= 1;
  PERFORM grant_achievement(_user_id, 'first_profit') WHERE s.realized_pnl > 0;
  PERFORM grant_achievement(_user_id, 'hundred_trades') WHERE s.total_trades >= 100;
  PERFORM grant_achievement(_user_id, 'hundred_k_profit') WHERE s.realized_pnl >= 100000;
  PERFORM grant_achievement(_user_id, 'streak_30') WHERE s.login_streak >= 30;
  PERFORM grant_achievement(_user_id, 'millionaire') WHERE s.current_net_worth >= 1000000;
  PERFORM grant_achievement(_user_id, 'yonko_investor') WHERE s.reputation_score >= 850;
  PERFORM grant_achievement(_user_id, 'pirate_king') WHERE s.reputation_score >= 950;

  -- top 100 / top 10 based on cached leaderboard
  SELECT rank INTO v_rank FROM public.leaderboard_cache
    WHERE board_key='net_worth_all_time' AND user_id=_user_id;
  IF v_rank IS NOT NULL AND v_rank <= 100 THEN PERFORM grant_achievement(_user_id,'top_100'); END IF;
  IF v_rank IS NOT NULL AND v_rank <= 10 THEN PERFORM grant_achievement(_user_id,'top_10'); END IF;

  -- largest holder of any character
  SELECT EXISTS (
    SELECT 1 FROM public.user_holdings h1
    WHERE h1.user_id=_user_id AND h1.shares = (
      SELECT MAX(h2.shares) FROM public.user_holdings h2 WHERE h2.character_id=h1.character_id
    ) AND h1.shares > 0
  ) INTO v_is_largest;
  IF v_is_largest THEN PERFORM grant_achievement(_user_id,'largest_holder'); END IF;

  -- diamond hands: any holding 60+ days since first buy
  SELECT EXTRACT(EPOCH FROM (now() - MIN(t.created_at)))/86400.0 INTO v_max_hold_days
  FROM public.user_holdings h
  JOIN public.transactions t ON t.user_id=h.user_id AND t.character_id=h.character_id AND t.side='buy'
  WHERE h.user_id=_user_id AND h.shares>0;
  IF COALESCE(v_max_hold_days,0) >= 60 THEN PERFORM grant_achievement(_user_id,'diamond_hands'); END IF;

  -- market prophet
  v_closed := s.wins + s.losses;
  IF v_closed >= 50 THEN
    v_win_rate := s.wins::numeric * 100 / v_closed;
    IF v_win_rate >= 70 THEN PERFORM grant_achievement(_user_id,'market_prophet'); END IF;
  END IF;

  -- first event
  IF EXISTS (SELECT 1 FROM public.market_events WHERE status='published'
             AND published_at <= (SELECT created_at FROM public.profiles WHERE id=_user_id) + interval '90 days') THEN
    PERFORM grant_achievement(_user_id,'first_event');
  END IF;

  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.grant_achievement(_user_id uuid, _code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_inserted boolean := false;
BEGIN
  SELECT id INTO v_id FROM public.achievements WHERE code=_code;
  IF v_id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (_user_id, v_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$;

-- ============================================================
-- LEGACY RECORDS (first-to claims)
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_legacy_if_first(_code text, _title text, _description text,
  _user_id uuid, _character_id uuid, _value numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.legacy_records (code, title, description, user_id, character_id, value)
  VALUES (_code, _title, _description, _user_id, _character_id, _value)
  ON CONFLICT (code) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.check_legacy_for_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.user_stats;
  v_username text;
  h RECORD;
BEGIN
  SELECT * INTO s FROM public.user_stats WHERE user_id=_user_id;
  IF s IS NULL THEN RETURN; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id=_user_id;

  IF s.current_net_worth >= 1000000 THEN
    PERFORM record_legacy_if_first('first_millionaire',
      'First Millionaire Pirate',
      'First investor to ever cross ฿1,000,000 net worth: @' || v_username,
      _user_id, NULL, s.current_net_worth);
  END IF;

  -- per-character millionaire (position value)
  FOR h IN
    SELECT h.character_id, c.slug, c.name, (h.shares*c.current_price) AS pv
    FROM public.user_holdings h JOIN public.characters c ON c.id=h.character_id
    WHERE h.user_id=_user_id AND h.shares*c.current_price >= 1000000
  LOOP
    PERFORM record_legacy_if_first('first_' || h.slug || '_millionaire',
      'First ' || h.name || ' Millionaire',
      'First investor to hold ฿1M+ of ' || h.name || ': @' || v_username,
      _user_id, h.character_id, h.pv);
  END LOOP;
END $$;

-- ============================================================
-- DAILY SNAPSHOT + LEADERBOARD REFRESH
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_leaderboards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- Snapshot every user (with a wallet) once per day
  INSERT INTO public.net_worth_snapshots (user_id, snapshot_date, cash, equity, net_worth, return_pct)
  SELECT w.user_id, v_today,
         w.berries,
         public.user_equity(w.user_id),
         w.berries + public.user_equity(w.user_id),
         CASE WHEN 10000 > 0
           THEN ((w.berries + public.user_equity(w.user_id)) - 10000) * 100.0 / 10000
           ELSE 0 END
  FROM public.user_wallets w
  ON CONFLICT (user_id, snapshot_date) DO UPDATE
    SET cash = EXCLUDED.cash,
        equity = EXCLUDED.equity,
        net_worth = EXCLUDED.net_worth,
        return_pct = EXCLUDED.return_pct;

  -- Ensure user_stats rows exist for everyone, refreshed daily
  PERFORM public.recalc_user_stats(w.user_id) FROM public.user_wallets w;

  -- ===== Move current_rank -> rank_overall_prev BEFORE recomputing =====
  UPDATE public.user_stats SET rank_overall_prev = current_rank;

  -- Move previous rank cache entries
  UPDATE public.leaderboard_cache lc SET prev_rank = rank;

  -- ===== Board: net_worth_all_time =====
  DELETE FROM public.leaderboard_cache WHERE board_key='net_worth_all_time';
  INSERT INTO public.leaderboard_cache (board_key, user_id, rank, value, meta)
  SELECT 'net_worth_all_time', s.user_id,
         ROW_NUMBER() OVER (ORDER BY s.current_net_worth DESC) AS rnk,
         s.current_net_worth,
         jsonb_build_object('cash', (SELECT berries FROM public.user_wallets WHERE user_id=s.user_id),
                            'equity', public.user_equity(s.user_id))
  FROM public.user_stats s;

  -- update user_stats current_rank + highest_rank
  UPDATE public.user_stats us
  SET current_rank = lc.rank,
      highest_rank = LEAST(COALESCE(us.highest_rank, lc.rank), lc.rank)
  FROM public.leaderboard_cache lc
  WHERE lc.board_key='net_worth_all_time' AND lc.user_id=us.user_id;

  -- ===== Board: net_worth_monthly (30-day return) =====
  DELETE FROM public.leaderboard_cache WHERE board_key='return_30d';
  INSERT INTO public.leaderboard_cache (board_key, user_id, rank, value, meta)
  SELECT 'return_30d', cur.user_id,
         ROW_NUMBER() OVER (ORDER BY ((cur.net_worth - prev.net_worth)/NULLIF(prev.net_worth,0)*100) DESC NULLS LAST),
         ((cur.net_worth - prev.net_worth)/NULLIF(prev.net_worth,0)*100),
         jsonb_build_object('current', cur.net_worth, 'prior', prev.net_worth)
  FROM public.net_worth_snapshots cur
  JOIN LATERAL (
    SELECT net_worth FROM public.net_worth_snapshots
    WHERE user_id=cur.user_id AND snapshot_date <= v_today - 30 ORDER BY snapshot_date DESC LIMIT 1
  ) prev ON true
  WHERE cur.snapshot_date = v_today;

  -- ===== Board: return_7d =====
  DELETE FROM public.leaderboard_cache WHERE board_key='return_7d';
  INSERT INTO public.leaderboard_cache (board_key, user_id, rank, value, meta)
  SELECT 'return_7d', cur.user_id,
         ROW_NUMBER() OVER (ORDER BY ((cur.net_worth - prev.net_worth)/NULLIF(prev.net_worth,0)*100) DESC NULLS LAST),
         ((cur.net_worth - prev.net_worth)/NULLIF(prev.net_worth,0)*100),
         '{}'::jsonb
  FROM public.net_worth_snapshots cur
  JOIN LATERAL (
    SELECT net_worth FROM public.net_worth_snapshots
    WHERE user_id=cur.user_id AND snapshot_date <= v_today - 7 ORDER BY snapshot_date DESC LIMIT 1
  ) prev ON true
  WHERE cur.snapshot_date = v_today;

  -- ===== Board: return_all_time =====
  DELETE FROM public.leaderboard_cache WHERE board_key='return_all_time';
  INSERT INTO public.leaderboard_cache (board_key, user_id, rank, value, meta)
  SELECT 'return_all_time', s.user_id,
         ROW_NUMBER() OVER (ORDER BY ((s.current_net_worth - 10000)*100.0/10000) DESC),
         ((s.current_net_worth - 10000)*100.0/10000), '{}'::jsonb
  FROM public.user_stats s;

  -- ===== Board: most_active (total_trades) =====
  DELETE FROM public.leaderboard_cache WHERE board_key='most_active';
  INSERT INTO public.leaderboard_cache (board_key, user_id, rank, value, meta)
  SELECT 'most_active', s.user_id, ROW_NUMBER() OVER (ORDER BY s.total_trades DESC), s.total_trades, '{}'::jsonb
  FROM public.user_stats s WHERE s.total_trades > 0;

  -- ===== Board: most_profitable (realized_pnl) =====
  DELETE FROM public.leaderboard_cache WHERE board_key='most_profitable';
  INSERT INTO public.leaderboard_cache (board_key, user_id, rank, value, meta)
  SELECT 'most_profitable', s.user_id, ROW_NUMBER() OVER (ORDER BY s.realized_pnl DESC), s.realized_pnl, '{}'::jsonb
  FROM public.user_stats s WHERE s.realized_pnl > 0;

  -- ===== Board: most_accurate (win rate, min 10 closed trades) =====
  DELETE FROM public.leaderboard_cache WHERE board_key='most_accurate';
  INSERT INTO public.leaderboard_cache (board_key, user_id, rank, value, meta)
  SELECT 'most_accurate', s.user_id,
    ROW_NUMBER() OVER (ORDER BY (s.wins::numeric*100/NULLIF(s.wins+s.losses,0)) DESC NULLS LAST),
    ROUND(s.wins::numeric*100/NULLIF(s.wins+s.losses,0),2),
    jsonb_build_object('wins',s.wins,'losses',s.losses)
  FROM public.user_stats s WHERE (s.wins + s.losses) >= 10;

  -- ===== Per-character largest holder boards =====
  DELETE FROM public.leaderboard_cache WHERE board_key LIKE 'holder_%';
  INSERT INTO public.leaderboard_cache (board_key, user_id, rank, value, meta)
  SELECT 'holder_' || c.slug, h.user_id,
         ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY h.shares DESC),
         h.shares,
         jsonb_build_object('value', h.shares*c.current_price, 'character_name', c.name, 'character_slug', c.slug)
  FROM public.user_holdings h JOIN public.characters c ON c.id=h.character_id
  WHERE h.shares > 0;

  -- Check legacy for top earners (cheap pass)
  PERFORM public.check_legacy_for_user(s.user_id)
    FROM public.user_stats s
    WHERE s.current_net_worth >= 1000000;
END $$;

-- ============================================================
-- TRIGGER on transactions: recalc stats, achievements, legacy
-- ============================================================
CREATE OR REPLACE FUNCTION public.after_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalc_user_stats(NEW.user_id);
  PERFORM public.check_achievements(NEW.user_id);
  PERFORM public.check_legacy_for_user(NEW.user_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS after_transaction_trg ON public.transactions;
CREATE TRIGGER after_transaction_trg
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.after_transaction();

-- Backfill stats for any existing users
DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT user_id FROM public.user_wallets LOOP
    PERFORM public.recalc_user_stats(u.user_id);
    PERFORM public.check_achievements(u.user_id);
  END LOOP;
  PERFORM public.refresh_leaderboards();
END $$;

-- ============================================================
-- CRON: daily refresh
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('legendary-investor-daily-refresh');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'legendary-investor-daily-refresh',
  '15 0 * * *',
  $$ SELECT public.refresh_leaderboards(); $$
);
