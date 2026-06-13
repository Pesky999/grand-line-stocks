
-- Enums
CREATE TYPE public.event_type AS ENUM (
  'story_event','battle_result','character_reveal','power_up',
  'political_event','community_event','market_correction','meme_event'
);
CREATE TYPE public.event_status AS ENUM ('draft','scheduled','published');

-- market_events
CREATE TABLE public.market_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  event_type public.event_type NOT NULL,
  status public.event_status NOT NULL DEFAULT 'draft',
  default_pct_change numeric(6,2) NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_events TO authenticated;
GRANT ALL ON public.market_events TO service_role;
ALTER TABLE public.market_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events public read" ON public.market_events
  FOR SELECT USING (status = 'published' OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "events admin write" ON public.market_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER market_events_touch BEFORE UPDATE ON public.market_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX market_events_status_idx ON public.market_events(status, created_at DESC);
CREATE INDEX market_events_scheduled_idx ON public.market_events(scheduled_for)
  WHERE status = 'scheduled';

-- market_event_impacts
CREATE TABLE public.market_event_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.market_events(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  pct_change numeric(6,2) NOT NULL,
  price_before numeric(12,2),
  price_after numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, character_id)
);
GRANT SELECT ON public.market_event_impacts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_event_impacts TO authenticated;
GRANT ALL ON public.market_event_impacts TO service_role;
ALTER TABLE public.market_event_impacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "impacts public read" ON public.market_event_impacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.market_events e WHERE e.id = event_id
            AND (e.status = 'published' OR public.has_role(auth.uid(),'admin')))
  );
CREATE POLICY "impacts admin write" ON public.market_event_impacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX impacts_char_idx ON public.market_event_impacts(character_id, created_at DESC);

-- price_history additions
ALTER TABLE public.price_history
  ADD COLUMN source_event_id uuid REFERENCES public.market_events(id) ON DELETE SET NULL,
  ADD COLUMN pct_change numeric(6,2);
CREATE INDEX price_history_source_event_idx ON public.price_history(source_event_id);

-- Preview function (dry run)
CREATE OR REPLACE FUNCTION public.preview_market_event(_event_id uuid)
RETURNS TABLE (character_id uuid, slug text, name text, price_before numeric, price_after numeric, pct_change numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.slug, c.name,
         c.current_price AS price_before,
         ROUND(c.current_price * (1 + i.pct_change/100.0), 2) AS price_after,
         i.pct_change
  FROM public.market_event_impacts i
  JOIN public.characters c ON c.id = i.character_id
  WHERE i.event_id = _event_id
  ORDER BY i.pct_change DESC;
$$;

-- Atomic apply function
CREATE OR REPLACE FUNCTION public.apply_market_event(_event_id uuid)
RETURNS public.market_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_event public.market_events;
  v_impact RECORD;
  v_new_price numeric;
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

    INSERT INTO public.price_history (character_id, price, note, source_event_id, pct_change)
    VALUES (v_impact.character_id, v_new_price, v_event.title, v_event.id, v_impact.pct_change);
  END LOOP;

  UPDATE public.market_events
    SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
    WHERE id = _event_id
    RETURNING * INTO v_event;

  RETURN v_event;
END;
$function$;

-- Cron-friendly: publish all due scheduled events
CREATE OR REPLACE FUNCTION public.publish_due_events()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_count int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.market_events
    WHERE status = 'scheduled' AND scheduled_for IS NOT NULL AND scheduled_for <= now()
    ORDER BY scheduled_for
  LOOP
    PERFORM public.apply_market_event(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
