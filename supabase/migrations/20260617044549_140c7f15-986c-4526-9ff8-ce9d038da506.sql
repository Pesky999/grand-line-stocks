CREATE OR REPLACE FUNCTION public.check_legacy_for_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.user_stats;
  v_username text;
  rec RECORD;
BEGIN
  SELECT * INTO s FROM public.user_stats WHERE user_id=_user_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id=_user_id;

  IF s.current_net_worth >= 1000000 THEN
    PERFORM record_legacy_if_first('first_millionaire',
      'First Millionaire Pirate',
      'First investor to ever cross ฿1,000,000 net worth: @' || v_username,
      _user_id, NULL, s.current_net_worth);
  END IF;

  FOR rec IN
    SELECT h.character_id AS character_id, c.slug AS slug, c.name AS name,
           (h.shares * c.current_price) AS pv
    FROM public.user_holdings h
    JOIN public.characters c ON c.id = h.character_id
    WHERE h.user_id = _user_id
      AND h.shares * c.current_price >= 1000000
  LOOP
    PERFORM record_legacy_if_first('first_' || rec.slug || '_millionaire',
      'First ' || rec.name || ' Millionaire',
      'First investor to hold ฿1M+ of ' || rec.name || ': @' || v_username,
      _user_id, rec.character_id, rec.pv);
  END LOOP;
END $function$;