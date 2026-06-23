DROP POLICY IF EXISTS "events public read" ON public.market_events;
DROP POLICY IF EXISTS "impacts public read" ON public.market_event_impacts;

CREATE POLICY "events published read" ON public.market_events
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "events admin read" ON public.market_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "impacts published read" ON public.market_event_impacts
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.market_events AS e
      WHERE e.id = event_id
        AND e.status = 'published'
    )
  );

CREATE POLICY "impacts admin read" ON public.market_event_impacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));