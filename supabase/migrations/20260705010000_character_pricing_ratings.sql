BEGIN;

CREATE TABLE IF NOT EXISTS public.character_pricing_ratings (
  character_id uuid PRIMARY KEY REFERENCES public.characters(id) ON DELETE CASCADE,
  narrative_importance integer NOT NULL CHECK (narrative_importance BETWEEN 0 AND 100),
  current_relevance integer NOT NULL CHECK (current_relevance BETWEEN 0 AND 100),
  strength_status integer NOT NULL CHECK (strength_status BETWEEN 0 AND 100),
  popularity integer NOT NULL CHECK (popularity BETWEEN 0 AND 100),
  future_potential integer NOT NULL CHECK (future_potential BETWEEN 0 AND 100),
  investor_confidence integer NOT NULL CHECK (investor_confidence BETWEEN 0 AND 100),
  volatility integer NOT NULL CHECK (volatility BETWEEN 0 AND 100),
  stock_category public.stock_category NOT NULL,
  comparable_adjustment numeric(4,2) NOT NULL CHECK (comparable_adjustment BETWEEN 0.75 AND 1.25),
  uncertainty_discount_pct numeric(5,2) NOT NULL CHECK (uncertainty_discount_pct BETWEEN 0 AND 25),
  launch_catalyst_pct numeric(5,2) NOT NULL CHECK (launch_catalyst_pct BETWEEN -30 AND 30),
  pricing_algorithm_version text NOT NULL,
  ratings_status text NOT NULL CHECK (ratings_status IN ('draft', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  CONSTRAINT character_pricing_ratings_approval_metadata_check CHECK (
    (ratings_status = 'draft' AND approved_at IS NULL AND approved_by IS NULL)
    OR
    (ratings_status = 'approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_character_pricing_ratings_status_updated
  ON public.character_pricing_ratings (ratings_status, updated_at DESC);

DROP TRIGGER IF EXISTS character_pricing_ratings_touch ON public.character_pricing_ratings;
CREATE TRIGGER character_pricing_ratings_touch
  BEFORE UPDATE ON public.character_pricing_ratings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

REVOKE ALL ON TABLE public.character_pricing_ratings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.character_pricing_ratings TO authenticated;
GRANT ALL ON TABLE public.character_pricing_ratings TO service_role;

ALTER TABLE public.character_pricing_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read character pricing ratings" ON public.character_pricing_ratings;
CREATE POLICY "Admins read character pricing ratings"
  ON public.character_pricing_ratings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.save_character_pricing_draft(
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
RETURNS public.character_pricing_ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_version text := pg_catalog.btrim(_pricing_algorithm_version);
  v_saved public.character_pricing_ratings;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_role(v_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF _character_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.characters AS c WHERE c.id = _character_id
  ) THEN
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
    'draft',
    v_user,
    v_user,
    NULL,
    NULL
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
    ratings_status = 'draft',
    updated_at = pg_catalog.now(),
    updated_by = v_user,
    approved_at = NULL,
    approved_by = NULL
  RETURNING * INTO v_saved;

  RETURN v_saved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_character_pricing_ratings(
  _character_id uuid,
  _expected_pricing_algorithm_version text
)
RETURNS public.character_pricing_ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_expected_version text := pg_catalog.btrim(_expected_pricing_algorithm_version);
  v_current public.character_pricing_ratings;
  v_approved public.character_pricing_ratings;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_role(v_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF _character_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.characters AS c WHERE c.id = _character_id
  ) THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  IF v_expected_version IS NULL OR v_expected_version = '' THEN
    RAISE EXCEPTION 'expected pricing algorithm version is required';
  END IF;

  UPDATE public.character_pricing_ratings AS r
    SET ratings_status = 'approved',
        approved_at = pg_catalog.now(),
        approved_by = v_user,
        updated_at = pg_catalog.now(),
        updated_by = v_user
  WHERE r.character_id = _character_id
    AND r.ratings_status = 'draft'
    AND r.pricing_algorithm_version = v_expected_version
  RETURNING * INTO v_approved;

  IF v_approved.character_id IS NOT NULL THEN
    RETURN v_approved;
  END IF;

  SELECT *
    INTO v_current
  FROM public.character_pricing_ratings AS r
  WHERE r.character_id = _character_id;

  IF v_current.character_id IS NULL THEN
    RAISE EXCEPTION 'Draft character pricing ratings not found';
  END IF;

  IF v_current.ratings_status <> 'draft' THEN
    RAISE EXCEPTION 'Character pricing ratings must be a draft before approval';
  END IF;

  IF v_current.pricing_algorithm_version IS DISTINCT FROM v_expected_version THEN
    RAISE EXCEPTION 'Character pricing ratings algorithm version is stale';
  END IF;

  RAISE EXCEPTION 'Character pricing ratings approval failed';

  RETURN v_approved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_character_pricing_ratings(
  _character_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_deleted boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_role(v_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF _character_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.characters AS c WHERE c.id = _character_id
  ) THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  DELETE FROM public.character_pricing_ratings
  WHERE character_id = _character_id
  RETURNING true INTO v_deleted;

  RETURN COALESCE(v_deleted, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_character_pricing_draft(
  uuid, integer, integer, integer, integer, integer, integer, integer,
  public.stock_category, numeric, numeric, numeric, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_character_pricing_draft(
  uuid, integer, integer, integer, integer, integer, integer, integer,
  public.stock_category, numeric, numeric, numeric, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_character_pricing_ratings(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_character_pricing_ratings(uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.reset_character_pricing_ratings(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_character_pricing_ratings(uuid)
  TO authenticated;

COMMIT;
