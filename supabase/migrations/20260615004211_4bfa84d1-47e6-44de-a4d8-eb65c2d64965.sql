
REVOKE EXECUTE ON FUNCTION public.generate_movement_explanation(uuid, numeric, text, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_daily_market_cycle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_market_rumor() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_market_event(uuid) FROM PUBLIC, anon, authenticated;
