
REVOKE EXECUTE ON FUNCTION public.apply_market_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_market_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_due_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_market_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_market_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_due_events() TO service_role;
