CREATE OR REPLACE FUNCTION public.execute_trade_authenticated(
  _slug text,
  _side text,
  _shares integer
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_slug text := btrim(_slug);
  v_price numeric;
  v_tx public.transactions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_slug IS NULL OR v_slug = '' THEN
    RAISE EXCEPTION 'Character slug is required';
  END IF;

  IF _side IS NULL OR _side NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'Invalid side';
  END IF;

  IF _shares IS NULL OR _shares < 1 OR _shares > 10000 THEN
    RAISE EXCEPTION 'Shares must be an integer from 1 through 10000';
  END IF;

  SELECT c.current_price
    INTO v_price
  FROM public.characters AS c
  WHERE c.slug = v_slug
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  IF v_price <= 0 THEN
    RAISE EXCEPTION 'Character price must be greater than zero';
  END IF;

  SELECT *
    INTO v_tx
  FROM public.execute_trade(v_user, v_slug, _side, _shares::numeric);

  RETURN v_tx;
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_trade_authenticated(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_trade_authenticated(text, text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.execute_trade(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_trade(uuid, text, text, numeric) TO service_role;