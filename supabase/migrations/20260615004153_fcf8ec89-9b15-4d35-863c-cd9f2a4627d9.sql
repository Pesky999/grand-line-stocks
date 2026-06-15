
-- ===== Enum =====
DO $$ BEGIN
  CREATE TYPE public.movement_reason_code AS ENUM (
    'story_momentum','speculation','investor_optimism','investor_fear',
    'market_correction','hype_surge','meme_activity','whale_buying',
    'whale_selling','event_reaction','long_term_growth','normal_volatility'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Table =====
CREATE TABLE IF NOT EXISTS public.price_movement_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  price_history_id uuid REFERENCES public.price_history(id) ON DELETE SET NULL,
  pct_change numeric(8,2) NOT NULL,
  price_before numeric(12,2),
  price_after numeric(12,2),
  summary text NOT NULL,
  reason_codes public.movement_reason_code[] NOT NULL DEFAULT '{}',
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL,
  source_ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pme_char_created_idx
  ON public.price_movement_explanations(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pme_created_idx
  ON public.price_movement_explanations(created_at DESC);

GRANT SELECT ON public.price_movement_explanations TO anon, authenticated;
GRANT ALL ON public.price_movement_explanations TO service_role;
ALTER TABLE public.price_movement_explanations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Explanations are publicly readable" ON public.price_movement_explanations;
CREATE POLICY "Explanations are publicly readable"
  ON public.price_movement_explanations FOR SELECT USING (true);

-- ===== Daily report explanation columns =====
ALTER TABLE public.daily_market_reports
  ADD COLUMN IF NOT EXISTS gainer_explanation text,
  ADD COLUMN IF NOT EXISTS loser_explanation text,
  ADD COLUMN IF NOT EXISTS trending_explanation text,
  ADD COLUMN IF NOT EXISTS discussed_explanation text;

-- ===== Explanation generator =====
CREATE OR REPLACE FUNCTION public.generate_movement_explanation(
  _character_id uuid,
  _pct_change numeric,
  _source text DEFAULT 'manual',
  _source_ref_id uuid DEFAULT NULL,
  _price_history_id uuid DEFAULT NULL,
  _threshold numeric DEFAULT 2.0
) RETURNS public.price_movement_explanations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_char RECORD;
  v_codes public.movement_reason_code[] := '{}';
  v_parts text[] := '{}';
  v_factors jsonb := '{}'::jsonb;
  v_summary text;
  v_dir text;
  v_abs numeric := abs(_pct_change);
  v_rumor RECORD;
  v_event RECORD;
  v_buy_vol numeric;
  v_sell_vol numeric;
  v_row public.price_movement_explanations;
BEGIN
  SELECT c.id, c.name, c.slug, c.category, c.momentum, c.current_price, c.previous_price,
         COALESCE(a.narrative_potential,50) AS np,
         COALESCE(a.hype_rating,50) AS hr,
         COALESCE(a.investor_confidence,50) AS ic,
         COALESCE(a.volatility_rating,50) AS vr
    INTO v_char
  FROM public.characters c
  LEFT JOIN public.character_attributes a ON a.character_id = c.id
  WHERE c.id = _character_id;
  IF v_char.id IS NULL THEN RAISE EXCEPTION 'Character not found'; END IF;

  v_dir := CASE WHEN _pct_change >= 0 THEN 'gained' ELSE 'declined' END;

  IF v_abs < _threshold THEN
    v_codes := ARRAY['normal_volatility']::public.movement_reason_code[];
    v_summary := format('%s %s %s%% on normal market volatility.',
      v_char.name, v_dir, to_char(v_abs,'FM999990.00'));
  ELSE
    -- Source-linked reasons (highest signal)
    IF _source = 'event' AND _source_ref_id IS NOT NULL THEN
      SELECT id, title, event_type INTO v_event FROM public.market_events WHERE id = _source_ref_id;
      v_codes := v_codes || 'event_reaction'::public.movement_reason_code;
      v_parts := v_parts || COALESCE('reaction to "' || v_event.title || '"', 'a canon market event');
      v_factors := v_factors || jsonb_build_object('event_id', _source_ref_id, 'event_title', v_event.title);
    ELSIF _source = 'rumor' AND _source_ref_id IS NOT NULL THEN
      SELECT id, title INTO v_rumor FROM public.market_rumors WHERE id = _source_ref_id;
      v_codes := v_codes || 'speculation'::public.movement_reason_code;
      v_parts := v_parts || COALESCE('renewed speculation ("' || v_rumor.title || '")', 'renewed speculation');
      v_factors := v_factors || jsonb_build_object('rumor_id', _source_ref_id, 'rumor_title', v_rumor.title);
    END IF;

    -- Investor confidence
    IF _pct_change > 0 AND v_char.ic >= 65 THEN
      v_codes := v_codes || 'investor_optimism'::public.movement_reason_code;
      v_parts := v_parts || 'rising investor confidence';
    ELSIF _pct_change < 0 AND v_char.ic <= 35 THEN
      v_codes := v_codes || 'investor_fear'::public.movement_reason_code;
      v_parts := v_parts || 'weak investor confidence';
    END IF;

    -- Hype
    IF _pct_change > 0 AND v_char.hr >= 65 THEN
      v_codes := v_codes || 'hype_surge'::public.movement_reason_code;
      v_parts := v_parts || 'elevated community hype';
    END IF;

    -- Narrative
    IF _pct_change > 0 AND v_char.np >= 65 THEN
      v_codes := v_codes || 'story_momentum'::public.movement_reason_code;
      v_parts := v_parts || 'strong narrative potential';
    END IF;

    -- Momentum
    IF _pct_change > 0 AND v_char.momentum > 0.5 THEN
      v_codes := v_codes || 'long_term_growth'::public.movement_reason_code;
      v_parts := v_parts || 'sustained positive momentum';
    ELSIF _pct_change < 0 AND v_char.momentum < -0.5 THEN
      v_codes := v_codes || 'market_correction'::public.movement_reason_code;
      v_parts := v_parts || 'weakening momentum';
    END IF;

    -- Meme
    IF v_char.category = 'meme' AND v_abs >= 4 THEN
      v_codes := v_codes || 'meme_activity'::public.movement_reason_code;
      v_parts := v_parts || 'meme-stock trading activity';
    END IF;

    -- Whale activity (last 24h)
    SELECT COALESCE(SUM(CASE WHEN side='buy' THEN shares ELSE 0 END),0),
           COALESCE(SUM(CASE WHEN side='sell' THEN shares ELSE 0 END),0)
      INTO v_buy_vol, v_sell_vol
      FROM public.transactions
      WHERE character_id = _character_id AND created_at > now() - interval '24 hours';
    IF _pct_change > 0 AND v_buy_vol >= 50 AND v_buy_vol > v_sell_vol * 2 THEN
      v_codes := v_codes || 'whale_buying'::public.movement_reason_code;
      v_parts := v_parts || 'heavy buy-side volume';
      v_factors := v_factors || jsonb_build_object('buy_volume_24h', v_buy_vol);
    ELSIF _pct_change < 0 AND v_sell_vol >= 50 AND v_sell_vol > v_buy_vol * 2 THEN
      v_codes := v_codes || 'whale_selling'::public.movement_reason_code;
      v_parts := v_parts || 'heavy sell-side pressure';
      v_factors := v_factors || jsonb_build_object('sell_volume_24h', v_sell_vol);
    END IF;

    -- Active rumor in background
    IF _source <> 'rumor' THEN
      SELECT mr.id, mr.title INTO v_rumor
      FROM public.market_rumor_impacts mri
      JOIN public.market_rumors mr ON mr.id = mri.rumor_id
      WHERE mri.character_id = _character_id AND mr.status = 'active'
      ORDER BY mr.created_at DESC LIMIT 1;
      IF v_rumor.id IS NOT NULL THEN
        v_codes := v_codes || 'speculation'::public.movement_reason_code;
        v_parts := v_parts || 'an active rumor in circulation';
        v_factors := v_factors || jsonb_build_object('active_rumor_id', v_rumor.id);
      END IF;
    END IF;

    IF array_length(v_codes,1) IS NULL THEN
      v_codes := ARRAY['normal_volatility']::public.movement_reason_code[];
      v_summary := format('%s %s %s%% on normal market volatility.',
        v_char.name, v_dir, to_char(v_abs,'FM999990.00'));
    ELSE
      v_summary := format('%s %s %s%% due to %s.',
        v_char.name, v_dir, to_char(v_abs,'FM999990.00'),
        array_to_string(v_parts[1:LEAST(COALESCE(array_length(v_parts,1),0),3)], ' and '));
    END IF;
  END IF;

  v_factors := v_factors || jsonb_build_object(
    'narrative_potential', v_char.np,
    'hype_rating', v_char.hr,
    'investor_confidence', v_char.ic,
    'volatility_rating', v_char.vr,
    'momentum', v_char.momentum,
    'category', v_char.category,
    'pct_change', _pct_change,
    'threshold', _threshold
  );

  INSERT INTO public.price_movement_explanations
    (character_id, price_history_id, pct_change, price_before, price_after,
     summary, reason_codes, factors, source, source_ref_id)
  VALUES (_character_id, _price_history_id, _pct_change,
          v_char.previous_price, v_char.current_price,
          v_summary, v_codes, v_factors, _source, _source_ref_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END $fn$;

-- ===== Updated daily market cycle (adds explanations + report explanations) =====
CREATE OR REPLACE FUNCTION public.run_daily_market_cycle()
 RETURNS public.daily_market_reports
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
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
  v_ph_id uuid;
  v_gainer_exp text;
  v_loser_exp text;
  v_trending_exp text;
  v_discussed_exp text;
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
    VALUES (v_char.id, v_new_price, 'Daily drift', v_change_pct, 'daily_drift')
    RETURNING id INTO v_ph_id;

    -- Log explanation for any meaningful move
    IF abs(v_change_pct) >= 2.0 THEN
      PERFORM public.generate_movement_explanation(
        v_char.id, v_change_pct, 'daily_drift', NULL, v_ph_id, 2.0);
    END IF;

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

  -- Pull latest explanation summaries (already generated above) for report
  SELECT summary INTO v_gainer_exp FROM public.price_movement_explanations
    WHERE character_id = v_gainer.id ORDER BY created_at DESC LIMIT 1;
  SELECT summary INTO v_loser_exp FROM public.price_movement_explanations
    WHERE character_id = v_loser.id ORDER BY created_at DESC LIMIT 1;
  SELECT summary INTO v_trending_exp FROM public.price_movement_explanations
    WHERE character_id = v_trending ORDER BY created_at DESC LIMIT 1;
  SELECT summary INTO v_discussed_exp FROM public.price_movement_explanations
    WHERE character_id = v_most_disc ORDER BY created_at DESC LIMIT 1;

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
     trending_id, most_discussed_id, headline, summary,
     gainer_explanation, loser_explanation, trending_explanation, discussed_explanation)
  VALUES
    (v_today, v_sentiment, v_avg,
     v_gainer.id, v_gainer.pct,
     v_loser.id, v_loser.pct,
     v_trending, v_most_disc, v_headline, v_summary,
     v_gainer_exp, v_loser_exp, v_trending_exp, v_discussed_exp)
  RETURNING * INTO v_report;

  PERFORM public.expire_old_rumors();

  RETURN v_report;
END $fn$;

-- ===== Updated apply_market_event with explanations =====
CREATE OR REPLACE FUNCTION public.apply_market_event(_event_id uuid)
 RETURNS public.market_events
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_event public.market_events;
  v_impact RECORD;
  v_new_price numeric;
  v_ph_id uuid;
BEGIN
  SELECT * INTO v_event FROM public.market_events WHERE id = _event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.status = 'published' THEN RAISE EXCEPTION 'Event already published'; END IF;

  FOR v_impact IN
    SELECT i.id, i.character_id, i.pct_change, c.current_price
    FROM public.market_event_impacts i
    JOIN public.characters c ON c.id = i.character_id
    WHERE i.event_id = _event_id
    FOR UPDATE OF c
  LOOP
    v_new_price := GREATEST(ROUND(v_impact.current_price * (1 + v_impact.pct_change/100.0), 2), 0.01);

    UPDATE public.characters
      SET previous_price = current_price,
          current_price = v_new_price,
          updated_at = now()
      WHERE id = v_impact.character_id;

    UPDATE public.market_event_impacts
      SET price_before = v_impact.current_price,
          price_after = v_new_price
      WHERE id = v_impact.id;

    INSERT INTO public.price_history (character_id, price, note, source_event_id, pct_change, source)
    VALUES (v_impact.character_id, v_new_price, v_event.title, v_event.id, v_impact.pct_change, 'event')
    RETURNING id INTO v_ph_id;

    IF abs(v_impact.pct_change) >= 2.0 THEN
      PERFORM public.generate_movement_explanation(
        v_impact.character_id, v_impact.pct_change, 'event', v_event.id, v_ph_id, 2.0);
    END IF;
  END LOOP;

  UPDATE public.market_events
    SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
    WHERE id = _event_id
    RETURNING * INTO v_event;

  RETURN v_event;
END $fn$;

-- ===== Updated generate_market_rumor with explanations =====
CREATE OR REPLACE FUNCTION public.generate_market_rumor()
 RETURNS public.market_rumors
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_titles text[] := ARRAY[
    'Bounty revision leaked','Awakening rumored','Crew alliance whispered',
    'Return theory gains traction','Forum hype surges','Insider sighting reported',
    'Cover story speculation','Shanks-tier rumor surfaces'
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
  v_ph_id uuid;
BEGIN
  v_idx := 1 + floor(random() * array_length(v_titles, 1))::int;

  SELECT c.id, c.name, c.slug, c.current_price, c.momentum
  INTO v_char
  FROM public.characters c
  LEFT JOIN public.character_attributes a ON a.character_id = c.id
  ORDER BY random() * (COALESCE(a.hype_rating, 50) + 10) *
    CASE c.category WHEN 'meme' THEN 2.5 WHEN 'speculative' THEN 1.8 WHEN 'growth' THEN 1.2 ELSE 1 END DESC
  LIMIT 1;
  IF v_char.id IS NULL THEN RAISE EXCEPTION 'No characters available'; END IF;

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
  VALUES (v_char.id, v_new, 'Rumor: ' || v_rumor.title, v_pct, 'rumor', v_rumor.id)
  RETURNING id INTO v_ph_id;

  IF abs(v_pct) >= 2.0 THEN
    PERFORM public.generate_movement_explanation(
      v_char.id, v_pct, 'rumor', v_rumor.id, v_ph_id, 2.0);
  END IF;

  RETURN v_rumor;
END $fn$;
