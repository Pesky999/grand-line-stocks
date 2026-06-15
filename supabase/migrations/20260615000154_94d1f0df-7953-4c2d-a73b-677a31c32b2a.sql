
-- Enums
CREATE TYPE public.stock_category AS ENUM ('blue_chip','growth','speculative','meme');
CREATE TYPE public.market_sentiment AS ENUM ('extremely_bearish','bearish','neutral','bullish','extremely_bullish');
CREATE TYPE public.rumor_status AS ENUM ('active','expired');
CREATE TYPE public.hype_modifier_type AS ENUM ('movie_announcement','anime_announcement','trailer_release','game_release','merchandise','live_action','other');

-- Characters: public-visible market metadata
ALTER TABLE public.characters
  ADD COLUMN category public.stock_category NOT NULL DEFAULT 'growth',
  ADD COLUMN momentum numeric NOT NULL DEFAULT 0;

-- Price history: traceability
ALTER TABLE public.price_history
  ADD COLUMN source text,
  ADD COLUMN source_rumor_id uuid;

-- Hidden character attributes (admin/backend only)
CREATE TABLE public.character_attributes (
  character_id uuid PRIMARY KEY REFERENCES public.characters(id) ON DELETE CASCADE,
  narrative_potential int NOT NULL DEFAULT 50 CHECK (narrative_potential BETWEEN 0 AND 100),
  hype_rating int NOT NULL DEFAULT 50 CHECK (hype_rating BETWEEN 0 AND 100),
  investor_confidence int NOT NULL DEFAULT 50 CHECK (investor_confidence BETWEEN 0 AND 100),
  volatility_rating int NOT NULL DEFAULT 50 CHECK (volatility_rating BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_attributes TO authenticated;
GRANT ALL ON public.character_attributes TO service_role;
ALTER TABLE public.character_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read character_attributes" ON public.character_attributes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write character_attributes" ON public.character_attributes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Daily market reports
CREATE TABLE public.daily_market_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  sentiment public.market_sentiment NOT NULL,
  avg_change_pct numeric NOT NULL DEFAULT 0,
  biggest_gainer_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  biggest_gainer_pct numeric,
  biggest_loser_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  biggest_loser_pct numeric,
  trending_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  most_discussed_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  headline text NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_market_reports TO anon, authenticated;
GRANT ALL ON public.daily_market_reports TO service_role;
ALTER TABLE public.daily_market_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads daily_market_reports" ON public.daily_market_reports FOR SELECT USING (true);

-- Market rumors
CREATE TABLE public.market_rumors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  status public.rumor_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
GRANT SELECT ON public.market_rumors TO anon, authenticated;
GRANT ALL ON public.market_rumors TO service_role;
ALTER TABLE public.market_rumors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads market_rumors" ON public.market_rumors FOR SELECT USING (true);

CREATE TABLE public.market_rumor_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rumor_id uuid NOT NULL REFERENCES public.market_rumors(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  pct_change numeric NOT NULL,
  price_before numeric,
  price_after numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_rumor_impacts TO anon, authenticated;
GRANT ALL ON public.market_rumor_impacts TO service_role;
ALTER TABLE public.market_rumor_impacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads market_rumor_impacts" ON public.market_rumor_impacts FOR SELECT USING (true);

-- Future hype modifiers (scaffold)
CREATE TABLE public.hype_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_type public.hype_modifier_type NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  multiplier numeric NOT NULL DEFAULT 1.0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hype_modifiers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hype_modifiers TO authenticated;
GRANT ALL ON public.hype_modifiers TO service_role;
ALTER TABLE public.hype_modifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads hype_modifiers" ON public.hype_modifiers FOR SELECT USING (true);
CREATE POLICY "Admins manage hype_modifiers" ON public.hype_modifiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.hype_modifier_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_id uuid NOT NULL REFERENCES public.hype_modifiers(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  UNIQUE(modifier_id, character_id)
);
GRANT SELECT ON public.hype_modifier_targets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hype_modifier_targets TO authenticated;
GRANT ALL ON public.hype_modifier_targets TO service_role;
ALTER TABLE public.hype_modifier_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads hype_modifier_targets" ON public.hype_modifier_targets FOR SELECT USING (true);
CREATE POLICY "Admins manage hype_modifier_targets" ON public.hype_modifier_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed character attributes for every existing character
INSERT INTO public.character_attributes (character_id)
SELECT id FROM public.characters
ON CONFLICT (character_id) DO NOTHING;

-- Seed categories by bounty heuristic
UPDATE public.characters SET category = 'blue_chip'
  WHERE bounty >= 1000000000;
UPDATE public.characters SET category = 'growth'
  WHERE bounty >= 100000000 AND bounty < 1000000000;
UPDATE public.characters SET category = 'speculative'
  WHERE bounty < 100000000 AND bounty > 0;
UPDATE public.characters SET category = 'meme'
  WHERE bounty = 0 OR bounty IS NULL;

-- ============= Functions =============

-- Generate one rumor and apply its small price move
CREATE OR REPLACE FUNCTION public.generate_market_rumor()
RETURNS public.market_rumors
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_titles text[] := ARRAY[
    'Bounty revision leaked',
    'Awakening rumored',
    'Crew alliance whispered',
    'Return theory gains traction',
    'Forum hype surges',
    'Insider sighting reported',
    'Cover story speculation',
    'Shanks-tier rumor surfaces'
  ];
  v_descs text[] := ARRAY[
    'Unverified source claims a Marine memo hints at a major bounty revision',
    'Theorists across the New World forums suggest a Devil Fruit awakening is imminent',
    'Speculation grows about an unannounced crew alliance',
    'Multiple posters are convinced a former player is about to return',
    'Social chatter spikes after a viral fan theory',
    'A blurry leak panel is making the rounds',
    'A recent cover story is being read as foreshadowing',
    'Speculation reaches Yonko-tier levels'
  ];
  v_idx int;
  v_char RECORD;
  v_rumor public.market_rumors;
  v_pct numeric;
  v_new numeric;
BEGIN
  v_idx := 1 + floor(random() * array_length(v_titles, 1))::int;

  -- Pick character weighted by hype + category volatility
  SELECT c.id, c.name, c.slug, c.current_price, c.momentum
  INTO v_char
  FROM public.characters c
  LEFT JOIN public.character_attributes a ON a.character_id = c.id
  ORDER BY random() * (COALESCE(a.hype_rating, 50) + 10) *
    CASE c.category WHEN 'meme' THEN 2.5 WHEN 'speculative' THEN 1.8 WHEN 'growth' THEN 1.2 ELSE 1 END DESC
  LIMIT 1;

  IF v_char.id IS NULL THEN RAISE EXCEPTION 'No characters available'; END IF;

  -- Bias slightly positive (rumors are usually hype): range ~ -3% to +5%
  v_pct := ROUND(((random() * 8) - 3)::numeric, 2);
  v_new := GREATEST(ROUND(v_char.current_price * (1 + v_pct/100.0), 2), 0.01);

  INSERT INTO public.market_rumors (title, description, expires_at)
  VALUES (v_titles[v_idx] || ' — ' || v_char.name,
          v_descs[v_idx] || ' involving ' || v_char.name || '.',
          now() + interval '24 hours')
  RETURNING * INTO v_rumor;

  INSERT INTO public.market_rumor_impacts (rumor_id, character_id, pct_change, price_before, price_after)
  VALUES (v_rumor.id, v_char.id, v_pct, v_char.current_price, v_new);

  UPDATE public.characters
    SET previous_price = current_price,
        current_price = v_new,
        momentum = LEAST(GREATEST(momentum + v_pct/200.0, -5), 5),
        updated_at = now()
    WHERE id = v_char.id;

  INSERT INTO public.price_history (character_id, price, note, pct_change, source, source_rumor_id)
  VALUES (v_char.id, v_new, 'Rumor: ' || v_rumor.title, v_pct, 'rumor', v_rumor.id);

  RETURN v_rumor;
END;
$$;

-- Expire old rumors
CREATE OR REPLACE FUNCTION public.expire_old_rumors()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.market_rumors SET status = 'expired'
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Daily market cycle: drift every stock, generate report. Idempotent per day.
CREATE OR REPLACE FUNCTION public.run_daily_market_cycle()
RETURNS public.daily_market_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_existing public.daily_market_reports;
  v_char RECORD;
  v_vol numeric;
  v_drift numeric;
  v_change_pct numeric;
  v_new_price numeric;
  v_sum numeric := 0;
  v_count int := 0;
  v_avg numeric;
  v_sentiment public.market_sentiment;
  v_gainer RECORD;
  v_loser RECORD;
  v_trending uuid;
  v_most_disc uuid;
  v_report public.daily_market_reports;
  v_headline text;
  v_summary text;
BEGIN
  SELECT * INTO v_existing FROM public.daily_market_reports WHERE report_date = v_today;
  IF v_existing.id IS NOT NULL THEN RETURN v_existing; END IF;

  FOR v_char IN
    SELECT c.id, c.name, c.current_price, c.category, c.momentum,
           COALESCE(a.narrative_potential, 50) AS narrative_potential,
           COALESCE(a.hype_rating, 50) AS hype_rating,
           COALESCE(a.investor_confidence, 50) AS investor_confidence,
           COALESCE(a.volatility_rating, 50) AS volatility_rating
    FROM public.characters c
    LEFT JOIN public.character_attributes a ON a.character_id = c.id
    FOR UPDATE OF c
  LOOP
    v_vol := CASE v_char.category
      WHEN 'blue_chip' THEN 0.8
      WHEN 'growth' THEN 1.8
      WHEN 'speculative' THEN 3.5
      WHEN 'meme' THEN 6.0
    END;
    v_vol := v_vol * (0.5 + v_char.volatility_rating / 100.0);

    v_drift := ((v_char.investor_confidence - 50) / 100.0) * 0.6
             + ((v_char.hype_rating - 50) / 100.0) * 0.4
             + v_char.momentum * 0.3;

    v_change_pct := ROUND((v_drift + (random() - 0.5) * 2 * v_vol)::numeric, 2);
    v_new_price := GREATEST(ROUND(v_char.current_price * (1 + v_change_pct/100.0), 2), 0.01);

    UPDATE public.characters
      SET previous_price = current_price,
          current_price = v_new_price,
          momentum = GREATEST(LEAST(momentum * 0.85 + v_change_pct/100.0, 5), -5),
          updated_at = now()
      WHERE id = v_char.id;

    INSERT INTO public.price_history (character_id, price, note, pct_change, source)
    VALUES (v_char.id, v_new_price, 'Daily drift', v_change_pct, 'daily_drift');

    v_sum := v_sum + v_change_pct;
    v_count := v_count + 1;
  END LOOP;

  v_avg := CASE WHEN v_count > 0 THEN v_sum / v_count ELSE 0 END;
  v_sentiment := CASE
    WHEN v_avg > 3 THEN 'extremely_bullish'::public.market_sentiment
    WHEN v_avg > 1 THEN 'bullish'::public.market_sentiment
    WHEN v_avg < -3 THEN 'extremely_bearish'::public.market_sentiment
    WHEN v_avg < -1 THEN 'bearish'::public.market_sentiment
    ELSE 'neutral'::public.market_sentiment
  END;

  SELECT c.id, c.name,
         (c.current_price - c.previous_price)/NULLIF(c.previous_price,0)*100 AS pct
    INTO v_gainer
    FROM public.characters c
    ORDER BY (c.current_price - c.previous_price)/NULLIF(c.previous_price,0) DESC NULLS LAST
    LIMIT 1;

  SELECT c.id, c.name,
         (c.current_price - c.previous_price)/NULLIF(c.previous_price,0)*100 AS pct
    INTO v_loser
    FROM public.characters c
    ORDER BY (c.current_price - c.previous_price)/NULLIF(c.previous_price,0) ASC NULLS LAST
    LIMIT 1;

  SELECT id INTO v_trending FROM public.characters ORDER BY momentum DESC NULLS LAST LIMIT 1;

  SELECT character_id INTO v_most_disc
  FROM public.transactions
  WHERE created_at > now() - interval '24 hours'
  GROUP BY character_id
  ORDER BY count(*) DESC
  LIMIT 1;
  IF v_most_disc IS NULL THEN v_most_disc := v_trending; END IF;

  v_headline := format('Market %s — %s leads, %s lags',
    CASE v_sentiment
      WHEN 'extremely_bullish' THEN 'rips higher'
      WHEN 'bullish' THEN 'climbs'
      WHEN 'extremely_bearish' THEN 'crashes'
      WHEN 'bearish' THEN 'slips'
      ELSE 'trades flat'
    END,
    COALESCE(v_gainer.name,'—'), COALESCE(v_loser.name,'—'));

  v_summary := format('Average move %s%s%%. %s sentiment across %s symbols.',
    CASE WHEN v_avg >= 0 THEN '+' ELSE '' END,
    ROUND(v_avg, 2),
    replace(initcap(v_sentiment::text), '_', ' '),
    v_count);

  INSERT INTO public.daily_market_reports
    (report_date, sentiment, avg_change_pct,
     biggest_gainer_id, biggest_gainer_pct,
     biggest_loser_id, biggest_loser_pct,
     trending_id, most_discussed_id, headline, summary)
  VALUES
    (v_today, v_sentiment, v_avg,
     v_gainer.id, v_gainer.pct,
     v_loser.id, v_loser.pct,
     v_trending, v_most_disc, v_headline, v_summary)
  RETURNING * INTO v_report;

  PERFORM public.expire_old_rumors();

  RETURN v_report;
END;
$$;
