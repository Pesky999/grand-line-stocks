
REVOKE EXECUTE ON FUNCTION public.run_daily_market_cycle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_market_rumor() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_old_rumors() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_market_cycle() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_market_rumor() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_old_rumors() TO service_role;
