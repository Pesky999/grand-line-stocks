BEGIN;

CREATE OR REPLACE FUNCTION public.save_and_apply_character_pricing(
  _character_id uuid,
  _narrative_importance integer,
  _current_relevance integer,
  _strength_status integer,
  _popularity integer,
  _future_potential integer,
  _investor_confidence integer,
  _volatility integer,
  _stock_category public.stock_category,
  _comparable_adjustment numeric,
  _uncertainty_discount_pct numeric,
  _launch_catalyst_pct numeric,
  _pricing_algorithm_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_version text := pg_catalog.btrim(_pricing_algorithm_version);
  v_expected_version constant text := '1.1.0';
  v_character public.characters;
  v_saved public.character_pricing_ratings;
  v_now timestamptz := pg_catalog.now();
  v_price_history_id uuid;
  v_percentage_change numeric;
  v_weighted_score numeric;
  v_raw_base_fair_value numeric;
  v_raw_comparable_adjusted_fair_value numeric;
  v_raw_suggested_opening_price numeric;
  v_raw_suggested_post_catalyst_price numeric;
  v_applied_price numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_role(v_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF _character_id IS NULL THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  IF _narrative_importance IS NULL OR _narrative_importance NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'narrative_importance must be between 0 and 100';
  END IF;
  IF _current_relevance IS NULL OR _current_relevance NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'current_relevance must be between 0 and 100';
  END IF;
  IF _strength_status IS NULL OR _strength_status NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'strength_status must be between 0 and 100';
  END IF;
  IF _popularity IS NULL OR _popularity NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'popularity must be between 0 and 100';
  END IF;
  IF _future_potential IS NULL OR _future_potential NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'future_potential must be between 0 and 100';
  END IF;
  IF _investor_confidence IS NULL OR _investor_confidence NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'investor_confidence must be between 0 and 100';
  END IF;
  IF _volatility IS NULL OR _volatility NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'volatility must be between 0 and 100';
  END IF;
  IF _stock_category IS NULL THEN
    RAISE EXCEPTION 'stock_category is required';
  END IF;
  IF _comparable_adjustment IS NULL OR _comparable_adjustment NOT BETWEEN 0.75 AND 1.25 THEN
    RAISE EXCEPTION 'comparable_adjustment must be between 0.75 and 1.25';
  END IF;
  IF _uncertainty_discount_pct IS NULL OR _uncertainty_discount_pct NOT BETWEEN 0 AND 25 THEN
    RAISE EXCEPTION 'uncertainty_discount_pct must be between 0 and 25';
  END IF;
  IF _launch_catalyst_pct IS NULL OR _launch_catalyst_pct NOT BETWEEN -30 AND 30 THEN
    RAISE EXCEPTION 'launch_catalyst_pct must be between -30 and 30';
  END IF;
  IF v_version IS NULL OR v_version = '' THEN
    RAISE EXCEPTION 'pricing_algorithm_version is required';
  END IF;
  IF v_version <> v_expected_version THEN
    RAISE EXCEPTION 'Unsupported pricing algorithm version' USING ERRCODE = '22023';
  END IF;

  /*
    Market Pricing V1.1.0 parity with src/lib/market-pricing/v1.ts:
    weightedScore =
      narrativeImportance * 0.25 +
      currentRelevance * 0.20 +
      strengthStatus * 0.15 +
      popularity * 0.15 +
      futurePotential * 0.15 +
      investorConfidence * 0.10

    Volatility is persisted but excluded from fundamental fair value.

    rawBaseFairValue = 50 * exp(0.035835 * weightedScore)
    comparableAdjustedFairValue = rawBaseFairValue * comparableAdjustment
    suggestedOpeningPrice = comparableAdjustedFairValue * (1 - uncertaintyDiscountPct / 100)
    suggestedPostCatalystPrice = suggestedOpeningPrice * (1 + launchCatalystPct / 100)
    appliedPrice = round(suggestedPostCatalystPrice, 2)
  */
  v_weighted_score :=
    (_narrative_importance * 0.25) +
    (_current_relevance * 0.20) +
    (_strength_status * 0.15) +
    (_popularity * 0.15) +
    (_future_potential * 0.15) +
    (_investor_confidence * 0.10);
  v_raw_base_fair_value := 50 * pg_catalog.exp((0.035835 * v_weighted_score)::double precision)::numeric;
  v_raw_comparable_adjusted_fair_value := v_raw_base_fair_value * _comparable_adjustment;
  v_raw_suggested_opening_price :=
    v_raw_comparable_adjusted_fair_value * (1 - (_uncertainty_discount_pct / 100));
  v_raw_suggested_post_catalyst_price :=
    v_raw_suggested_opening_price * (1 + (_launch_catalyst_pct / 100));
  v_applied_price := pg_catalog.round(v_raw_suggested_post_catalyst_price, 2);

  IF v_applied_price <= 0 OR v_applied_price > 99999 THEN
    RAISE EXCEPTION 'calculated applied price is outside the supported market price range';
  END IF;

  SELECT *
    INTO v_character
  FROM public.characters AS c
  WHERE c.id = _character_id
  FOR UPDATE;

  IF v_character.id IS NULL THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  v_percentage_change := CASE
    WHEN v_character.current_price IS NULL OR v_character.current_price = 0 THEN 0
    ELSE ((v_applied_price - v_character.current_price) / v_character.current_price) * 100
  END;

  INSERT INTO public.character_pricing_ratings (
    character_id,
    narrative_importance,
    current_relevance,
    strength_status,
    popularity,
    future_potential,
    investor_confidence,
    volatility,
    stock_category,
    comparable_adjustment,
    uncertainty_discount_pct,
    launch_catalyst_pct,
    pricing_algorithm_version,
    ratings_status,
    created_by,
    updated_by,
    approved_at,
    approved_by
  )
  VALUES (
    _character_id,
    _narrative_importance,
    _current_relevance,
    _strength_status,
    _popularity,
    _future_potential,
    _investor_confidence,
    _volatility,
    _stock_category,
    _comparable_adjustment,
    _uncertainty_discount_pct,
    _launch_catalyst_pct,
    v_version,
    'approved',
    v_user,
    v_user,
    v_now,
    v_user
  )
  ON CONFLICT (character_id) DO UPDATE SET
    narrative_importance = EXCLUDED.narrative_importance,
    current_relevance = EXCLUDED.current_relevance,
    strength_status = EXCLUDED.strength_status,
    popularity = EXCLUDED.popularity,
    future_potential = EXCLUDED.future_potential,
    investor_confidence = EXCLUDED.investor_confidence,
    volatility = EXCLUDED.volatility,
    stock_category = EXCLUDED.stock_category,
    comparable_adjustment = EXCLUDED.comparable_adjustment,
    uncertainty_discount_pct = EXCLUDED.uncertainty_discount_pct,
    launch_catalyst_pct = EXCLUDED.launch_catalyst_pct,
    pricing_algorithm_version = EXCLUDED.pricing_algorithm_version,
    ratings_status = 'approved',
    updated_at = v_now,
    updated_by = v_user,
    approved_at = v_now,
    approved_by = v_user
  RETURNING * INTO v_saved;

  UPDATE public.characters AS c
    SET previous_price = v_character.current_price,
        current_price = v_applied_price,
        category = _stock_category
  WHERE c.id = _character_id;

  INSERT INTO public.price_history (character_id, price, note, pct_change, source)
  VALUES (
    _character_id,
    v_applied_price,
    'Market Pricing Preview applied valuation using algorithm ' || v_version,
    v_percentage_change,
    'pricing_rebase'
  )
  RETURNING id INTO v_price_history_id;

  RETURN jsonb_build_object(
    'ratings', to_jsonb(v_saved),
    'appliedAt', v_now,
    'priceHistoryId', v_price_history_id,
    'pricingAlgorithmVersion', v_version,
    'previousLivePrice', v_character.current_price,
    'newLivePrice', v_applied_price,
    'percentageChange', v_percentage_change,
    'previousCategory', v_character.category,
    'newCategory', _stock_category
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_and_apply_character_pricing(
  uuid, integer, integer, integer, integer, integer, integer, integer,
  public.stock_category, numeric, numeric, numeric, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_and_apply_character_pricing(
  uuid, integer, integer, integer, integer, integer, integer, integer,
  public.stock_category, numeric, numeric, numeric, text
) TO authenticated;

COMMIT;
