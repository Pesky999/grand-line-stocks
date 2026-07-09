BEGIN;

CREATE TYPE public.daily_crew_role AS ENUM (
  'captain',
  'fighter',
  'navigator',
  'strategist',
  'support'
);

CREATE TYPE public.daily_crew_mission_status AS ENUM (
  'draft',
  'scheduled',
  'published',
  'archived'
);

CREATE TYPE public.daily_crew_rank AS ENUM (
  's',
  'a',
  'b',
  'c',
  'fail'
);

CREATE TYPE public.daily_crew_reveal_policy AS ENUM (
  'immediate',
  'next_day',
  'manual'
);

CREATE TABLE public.daily_crew_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_date date NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  brief text NOT NULL CHECK (char_length(btrim(brief)) BETWEEN 1 AND 2000),
  mission_tags text[] NOT NULL DEFAULT '{}',
  status public.daily_crew_mission_status NOT NULL DEFAULT 'draft',
  reveal_policy public.daily_crew_reveal_policy NOT NULL DEFAULT 'next_day',
  reveal_at timestamptz,
  max_score integer NOT NULL DEFAULT 100 CHECK (max_score = 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_crew_mission_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.daily_crew_missions(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE RESTRICT,
  display_order integer NOT NULL CHECK (display_order BETWEEN 1 AND 12),
  is_straw_hat boolean NOT NULL DEFAULT false,
  visible_tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, character_id),
  UNIQUE (mission_id, display_order)
);

CREATE TABLE public.daily_crew_role_requirements (
  mission_id uuid NOT NULL REFERENCES public.daily_crew_missions(id) ON DELETE CASCADE,
  role public.daily_crew_role NOT NULL,
  subtype_key text NOT NULL CHECK (subtype_key ~ '^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$'),
  subtype_label text CHECK (subtype_label IS NULL OR char_length(btrim(subtype_label)) BETWEEN 1 AND 120),
  max_points integer NOT NULL DEFAULT 18 CHECK (max_points BETWEEN 1 AND 18),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, role)
);

CREATE TABLE public.daily_crew_character_role_scores (
  mission_id uuid NOT NULL,
  character_id uuid NOT NULL,
  role public.daily_crew_role NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 18),
  explanation text NOT NULL CHECK (char_length(btrim(explanation)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, character_id, role),
  FOREIGN KEY (mission_id, character_id)
    REFERENCES public.daily_crew_mission_pool(mission_id, character_id)
    ON DELETE CASCADE,
  FOREIGN KEY (mission_id, role)
    REFERENCES public.daily_crew_role_requirements(mission_id, role)
    ON DELETE CASCADE
);

CREATE TABLE public.daily_crew_perfect_solution (
  mission_id uuid NOT NULL,
  role public.daily_crew_role NOT NULL,
  character_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, role),
  UNIQUE (mission_id, character_id),
  FOREIGN KEY (mission_id, role)
    REFERENCES public.daily_crew_role_requirements(mission_id, role)
    ON DELETE CASCADE,
  FOREIGN KEY (mission_id, character_id)
    REFERENCES public.daily_crew_mission_pool(mission_id, character_id)
    ON DELETE CASCADE
);

CREATE TABLE public.daily_crew_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.daily_crew_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  rank public.daily_crew_rank NOT NULL,
  reward_amount integer NOT NULL DEFAULT 0 CHECK (reward_amount >= 0),
  reward_paid boolean NOT NULL DEFAULT false,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, user_id),
  UNIQUE (id, mission_id)
);

CREATE TABLE public.daily_crew_submission_roles (
  submission_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  role public.daily_crew_role NOT NULL,
  character_id uuid NOT NULL,
  role_score integer NOT NULL CHECK (role_score BETWEEN 0 AND 18),
  explanation text NOT NULL CHECK (char_length(btrim(explanation)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, role),
  UNIQUE (submission_id, character_id),
  FOREIGN KEY (submission_id, mission_id)
    REFERENCES public.daily_crew_submissions(id, mission_id)
    ON DELETE CASCADE,
  FOREIGN KEY (mission_id, character_id)
    REFERENCES public.daily_crew_mission_pool(mission_id, character_id)
    ON DELETE CASCADE,
  FOREIGN KEY (mission_id, role)
    REFERENCES public.daily_crew_role_requirements(mission_id, role)
    ON DELETE CASCADE
);

CREATE INDEX idx_daily_crew_missions_status_date
  ON public.daily_crew_missions (status, mission_date DESC);

CREATE INDEX idx_daily_crew_pool_mission_order
  ON public.daily_crew_mission_pool (mission_id, display_order);

CREATE INDEX idx_daily_crew_submissions_user_submitted
  ON public.daily_crew_submissions (user_id, submitted_at DESC);

CREATE OR REPLACE FUNCTION public.validate_daily_crew_mission(_mission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_pool_count integer;
  v_pool_straw_hats integer;
  v_requirement_count integer;
  v_requirement_role_count integer;
  v_solution_count integer;
  v_solution_role_count integer;
  v_solution_straw_hats integer;
  v_score_count integer;
  v_solution_score_total integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_straw_hat)
    INTO v_pool_count, v_pool_straw_hats
  FROM public.daily_crew_mission_pool
  WHERE mission_id = _mission_id;

  SELECT count(*), count(DISTINCT role)
    INTO v_requirement_count, v_requirement_role_count
  FROM public.daily_crew_role_requirements
  WHERE mission_id = _mission_id;

  SELECT count(*), count(DISTINCT s.role), count(*) FILTER (WHERE p.is_straw_hat)
    INTO v_solution_count, v_solution_role_count, v_solution_straw_hats
  FROM public.daily_crew_perfect_solution AS s
  JOIN public.daily_crew_mission_pool AS p
    ON p.mission_id = s.mission_id
   AND p.character_id = s.character_id
  WHERE s.mission_id = _mission_id;

  SELECT count(*)
    INTO v_score_count
  FROM public.daily_crew_character_role_scores
  WHERE mission_id = _mission_id;

  SELECT COALESCE(sum(scores.score), 0)
    INTO v_solution_score_total
  FROM public.daily_crew_perfect_solution AS s
  JOIN public.daily_crew_character_role_scores AS scores
    ON scores.mission_id = s.mission_id
   AND scores.character_id = s.character_id
   AND scores.role = s.role
  WHERE s.mission_id = _mission_id;

  RETURN
    v_pool_count = 12
    AND v_pool_straw_hats <= 5
    AND v_requirement_count = 5
    AND v_requirement_role_count = 5
    AND v_solution_count = 5
    AND v_solution_role_count = 5
    AND v_solution_straw_hats <= 3
    AND v_score_count = 60
    AND v_solution_score_total = 90;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_daily_crew_pool_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_straw_hats integer;
BEGIN
  SELECT count(*)
    INTO v_straw_hats
  FROM public.daily_crew_mission_pool
  WHERE mission_id = NEW.mission_id
    AND is_straw_hat
    AND id IS DISTINCT FROM NEW.id;

  IF NEW.is_straw_hat THEN
    v_straw_hats := v_straw_hats + 1;
  END IF;

  IF v_straw_hats > 5 THEN
    RAISE EXCEPTION 'Daily Crew Builder mission pool cannot include more than 5 Straw Hats';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_daily_crew_solution_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_straw_hats integer;
BEGIN
  SELECT count(*)
    INTO v_straw_hats
  FROM public.daily_crew_perfect_solution AS s
  JOIN public.daily_crew_mission_pool AS p
    ON p.mission_id = s.mission_id
   AND p.character_id = s.character_id
  WHERE s.mission_id = NEW.mission_id
    AND p.is_straw_hat
    AND s.role IS DISTINCT FROM NEW.role;

  IF EXISTS (
    SELECT 1
    FROM public.daily_crew_mission_pool AS p
    WHERE p.mission_id = NEW.mission_id
      AND p.character_id = NEW.character_id
      AND p.is_straw_hat
  ) THEN
    v_straw_hats := v_straw_hats + 1;
  END IF;

  IF v_straw_hats > 3 THEN
    RAISE EXCEPTION 'Daily Crew Builder perfect solution cannot include more than 3 Straw Hats';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_daily_crew_publish_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.status = 'published'::public.daily_crew_mission_status
     AND NOT public.validate_daily_crew_mission(NEW.id) THEN
    RAISE EXCEPTION 'Daily Crew Builder mission is not ready to publish';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER daily_crew_missions_touch
  BEFORE UPDATE ON public.daily_crew_missions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER daily_crew_submissions_touch
  BEFORE UPDATE ON public.daily_crew_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER daily_crew_pool_limits
  BEFORE INSERT OR UPDATE ON public.daily_crew_mission_pool
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_crew_pool_limits();

CREATE TRIGGER daily_crew_solution_limits
  BEFORE INSERT OR UPDATE ON public.daily_crew_perfect_solution
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_crew_solution_limits();

CREATE TRIGGER daily_crew_publish_ready
  BEFORE INSERT OR UPDATE OF status ON public.daily_crew_missions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_crew_publish_ready();

REVOKE ALL ON TABLE public.daily_crew_missions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_mission_pool FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_role_requirements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_character_role_scores FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_perfect_solution FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_submission_roles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.daily_crew_missions TO anon, authenticated;
GRANT SELECT ON TABLE public.daily_crew_mission_pool TO anon, authenticated;
GRANT SELECT ON TABLE public.daily_crew_submissions TO authenticated;
GRANT SELECT ON TABLE public.daily_crew_submission_roles TO authenticated;

GRANT ALL ON TABLE public.daily_crew_missions TO service_role;
GRANT ALL ON TABLE public.daily_crew_mission_pool TO service_role;
GRANT ALL ON TABLE public.daily_crew_role_requirements TO service_role;
GRANT ALL ON TABLE public.daily_crew_character_role_scores TO service_role;
GRANT ALL ON TABLE public.daily_crew_perfect_solution TO service_role;
GRANT ALL ON TABLE public.daily_crew_submissions TO service_role;
GRANT ALL ON TABLE public.daily_crew_submission_roles TO service_role;

REVOKE EXECUTE ON FUNCTION public.validate_daily_crew_mission(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_daily_crew_pool_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_daily_crew_solution_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_daily_crew_publish_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_daily_crew_mission(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_daily_crew_pool_limits() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_daily_crew_solution_limits() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_daily_crew_publish_ready() TO service_role;

ALTER TABLE public.daily_crew_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_mission_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_role_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_character_role_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_perfect_solution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_submission_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published daily crew missions are public"
  ON public.daily_crew_missions
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published'::public.daily_crew_mission_status);

CREATE POLICY "Admins read daily crew missions"
  ON public.daily_crew_missions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Published daily crew mission pools are public"
  ON public.daily_crew_mission_pool
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.daily_crew_missions AS m
      WHERE m.id = daily_crew_mission_pool.mission_id
        AND m.status = 'published'::public.daily_crew_mission_status
    )
  );

CREATE POLICY "Admins read daily crew mission pools"
  ON public.daily_crew_mission_pool
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users read own daily crew submissions"
  ON public.daily_crew_submissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users read own daily crew submission roles"
  ON public.daily_crew_submission_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.daily_crew_submissions AS s
      WHERE s.id = daily_crew_submission_roles.submission_id
        AND s.user_id = auth.uid()
    )
  );

COMMIT;