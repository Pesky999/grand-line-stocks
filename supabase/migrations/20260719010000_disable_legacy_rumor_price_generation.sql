-- Retire the legacy automatic rumor price generator.
--
-- Market Bulletin V2 treats public speculation as informational and non-price-moving.
-- Historical market_rumors, market_rumor_impacts, character prices, momentum, and
-- price_history rows are intentionally preserved. This forward migration removes
-- only the automatic function that could create a rumor and directly move prices.
--
-- If an unknown dependency still exists, migration application should fail
-- safely rather than silently removing related objects.
DROP FUNCTION IF EXISTS public.generate_market_rumor();
