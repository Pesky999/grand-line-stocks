BEGIN;

ALTER TABLE public.user_wallets
  ALTER COLUMN berries SET DEFAULT 25000;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  suffix INT := 0;
BEGIN
  base := COALESCE(
    NULLIF(regexp_replace(LOWER(COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))), '[^a-z0-9_]', '', 'g'), ''),
    'pirate'
  );
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    suffix := suffix + 1;
    candidate := base || suffix::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, candidate, COALESCE(NEW.raw_user_meta_data->>'display_name', candidate));
  INSERT INTO public.user_wallets (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_leaderboards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_starting_balance numeric := 25000;
BEGIN
  -- Snapshot every user (with a wallet) once per day
  INSERT INTO public.net_worth_snapshots (user_id, snapshot_date, cash, equity, net_worth, return_pct)
  SELECT w.user_id, v_today,
         w.berries,
         public.user_equity(w.user_id),
         w.berries + public.user_equity(w.user_id),
         CASE WHEN v_starting_balance > 0
           THEN ((w.berries + public.user_equity(w.user_id)) - v_starting_balance) * 100.0 / v_starting_balance
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
         ROW_NUMBER() OVER (ORDER BY ((s.current_net_worth - v_starting_balance)*100.0/v_starting_balance) DESC),
         ((s.current_net_worth - v_starting_balance)*100.0/v_starting_balance), '{}'::jsonb
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

COMMIT;
