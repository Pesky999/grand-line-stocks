-- Optional stock-trading onboarding and page coaching.
-- This migration stores progress only; it does not change trading, wallets, holdings, prices,
-- rewards, achievements, account deletion, or any game data.

CREATE TABLE IF NOT EXISTS public.user_onboarding_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_tutorial_version integer NOT NULL DEFAULT 1,
  stock_tutorial_status text NOT NULL DEFAULT 'not_started',
  stock_tutorial_offer text NOT NULL DEFAULT 'first_login',
  stock_tutorial_last_step integer NOT NULL DEFAULT 0,
  page_tips_disabled boolean NOT NULL DEFAULT false,
  page_tip_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT user_onboarding_progress_version_check CHECK (stock_tutorial_version > 0),
  CONSTRAINT user_onboarding_progress_step_check CHECK (
    stock_tutorial_last_step BETWEEN 0 AND 5
  ),
  CONSTRAINT user_onboarding_progress_status_check CHECK (
    stock_tutorial_status IN ('not_started', 'in_progress', 'completed', 'skipped')
  ),
  CONSTRAINT user_onboarding_progress_offer_check CHECK (
    stock_tutorial_offer IN ('first_login', 'soft', 'none')
  ),
  CONSTRAINT user_onboarding_progress_page_tip_versions_check CHECK (
    pg_catalog.jsonb_typeof(page_tip_versions) = 'object'
  )
);

DROP TRIGGER IF EXISTS user_onboarding_progress_updated_at ON public.user_onboarding_progress;
CREATE TRIGGER user_onboarding_progress_updated_at
  BEFORE UPDATE ON public.user_onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.user_onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own onboarding progress" ON public.user_onboarding_progress;
CREATE POLICY "Users can read own onboarding progress"
  ON public.user_onboarding_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.user_onboarding_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_onboarding_progress TO authenticated;
GRANT ALL ON public.user_onboarding_progress TO service_role;

CREATE TABLE IF NOT EXISTS public.user_onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  tutorial_version integer NOT NULL DEFAULT 1,
  step_key text,
  page_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT user_onboarding_events_version_check CHECK (tutorial_version > 0),
  CONSTRAINT user_onboarding_events_metadata_check CHECK (
    pg_catalog.jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT user_onboarding_events_name_check CHECK (
    event_name IN (
      'onboarding_offer_seen',
      'stock_tutorial_started',
      'stock_tutorial_step_completed',
      'stock_tutorial_skipped',
      'stock_tutorial_completed',
      'stock_tutorial_replayed',
      'first_live_trade_started',
      'first_live_trade_completed',
      'page_tip_seen',
      'page_tip_completed',
      'page_tips_skipped'
    )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'user_onboarding_events_user_dedupe_key'
  ) THEN
    ALTER TABLE public.user_onboarding_events
      ADD CONSTRAINT user_onboarding_events_user_dedupe_key UNIQUE (user_id, dedupe_key);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_user_onboarding_events_user_created
  ON public.user_onboarding_events (user_id, created_at DESC);

ALTER TABLE public.user_onboarding_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_onboarding_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_onboarding_events TO service_role;

CREATE OR REPLACE FUNCTION public.create_onboarding_progress_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_onboarding_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_onboarding_progress_for_profile()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_onboarding_progress_for_profile()
  TO service_role;

DROP TRIGGER IF EXISTS create_onboarding_progress_for_profile_trigger ON public.profiles;
CREATE TRIGGER create_onboarding_progress_for_profile_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_onboarding_progress_for_profile();

DO $$
DECLARE
  v_traded_count integer := 0;
  v_no_trade_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT
      p.id AS user_id,
      EXISTS (
        SELECT 1
        FROM public.transactions t
        WHERE t.user_id = p.id
      ) AS has_traded
    FROM public.profiles p
    LEFT JOIN public.user_onboarding_progress existing
      ON existing.user_id = p.id
    WHERE existing.user_id IS NULL
  ),
  inserted AS (
    INSERT INTO public.user_onboarding_progress (
      user_id,
      stock_tutorial_offer,
      page_tips_disabled
    )
    SELECT
      user_id,
      CASE WHEN has_traded THEN 'none' ELSE 'soft' END,
      has_traded
    FROM candidates
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id, stock_tutorial_offer
  )
  SELECT
    count(*) FILTER (WHERE stock_tutorial_offer = 'none'),
    count(*) FILTER (WHERE stock_tutorial_offer = 'soft'),
    count(*)
  INTO v_traded_count, v_no_trade_count, v_inserted_count
  FROM inserted;

  RAISE NOTICE
    'Stock onboarding backfill: traded=%, no_trade=%, total_inserted=%',
    v_traded_count,
    v_no_trade_count,
    v_inserted_count;
END;
$$;
