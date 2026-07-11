BEGIN;

CREATE TEMP TABLE daily_crew_role_lane_missions (
  mission_slug text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO daily_crew_role_lane_missions (mission_slug) VALUES
  ('storm-gate-rescue'),
  ('covert-harbor-infiltration');

CREATE TEMP TABLE daily_crew_role_lane_characters (
  fixture_id text PRIMARY KEY,
  market_slug text NOT NULL
) ON COMMIT DROP;

INSERT INTO daily_crew_role_lane_characters (fixture_id, market_slug) VALUES
  ('char-luffy', 'luffy'),
  ('char-zoro', 'zoro'),
  ('char-nami', 'nami'),
  ('char-sanji', 'sanji'),
  ('char-robin', 'robin'),
  ('char-law', 'law'),
  ('char-kid', 'kid'),
  ('char-boa', 'boa'),
  ('char-marco', 'marco'),
  ('char-vivi', 'nefertari-vivi'),
  ('char-sabo', 'sabo'),
  ('char-kuma', 'bartholomew-kuma'),
  ('char-mihawk', 'mihawk'),
  ('char-crocodile', 'crocodile'),
  ('char-yamato', 'yamato'),
  ('char-chopper', 'chopper'),
  ('char-franky', 'franky'),
  ('char-brook', 'brook'),
  ('char-usopp', 'usopp'),
  ('char-jinbe', 'jinbe'),
  ('char-shanks', 'shanks'),
  ('char-buggy', 'buggy'),
  ('char-dragon', 'monkey-d-dragon'),
  ('char-garp', 'garp'),
  ('char-koby', 'coby'),
  ('char-smoker', 'smoker'),
  ('char-katakuri', 'charlotte-katakuri'),
  ('char-bonney', 'jewelry-bonney');

CREATE TEMP TABLE daily_crew_role_lane_pool_tags (
  mission_slug text NOT NULL,
  fixture_id text NOT NULL,
  visible_tags text[] NOT NULL,
  PRIMARY KEY (mission_slug, fixture_id)
) ON COMMIT DROP;

INSERT INTO daily_crew_role_lane_pool_tags (mission_slug, fixture_id, visible_tags) VALUES
  ('storm-gate-rescue', 'char-luffy', ARRAY['Straw Hat', 'captain', 'high-risk']),
  ('storm-gate-rescue', 'char-zoro', ARRAY['Straw Hat', 'fighter']),
  ('storm-gate-rescue', 'char-nami', ARRAY['Straw Hat', 'navigator']),
  ('storm-gate-rescue', 'char-sanji', ARRAY['Straw Hat', 'support', 'fighter']),
  ('storm-gate-rescue', 'char-robin', ARRAY['Straw Hat', 'scholar', 'strategist']),
  ('storm-gate-rescue', 'char-law', ARRAY['captain', 'strategist']),
  ('storm-gate-rescue', 'char-kid', ARRAY['captain', 'fighter']),
  ('storm-gate-rescue', 'char-boa', ARRAY['captain', 'fighter']),
  ('storm-gate-rescue', 'char-marco', ARRAY['support', 'fighter']),
  ('storm-gate-rescue', 'char-vivi', ARRAY['diplomat', 'navigator']),
  ('storm-gate-rescue', 'char-sabo', ARRAY['fighter', 'strategist']),
  ('storm-gate-rescue', 'char-kuma', ARRAY['transport', 'route', 'support']),
  ('storm-gate-rescue', 'char-mihawk', ARRAY['fighter']),
  ('storm-gate-rescue', 'char-crocodile', ARRAY['strategist', 'captain']),
  ('storm-gate-rescue', 'char-yamato', ARRAY['support', 'fighter']),
  ('covert-harbor-infiltration', 'char-chopper', ARRAY['Straw Hat', 'support']),
  ('covert-harbor-infiltration', 'char-franky', ARRAY['Straw Hat', 'shipwright', 'route']),
  ('covert-harbor-infiltration', 'char-brook', ARRAY['Straw Hat', 'support']),
  ('covert-harbor-infiltration', 'char-usopp', ARRAY['Straw Hat', 'scout', 'tactician']),
  ('covert-harbor-infiltration', 'char-jinbe', ARRAY['Straw Hat', 'fighter']),
  ('covert-harbor-infiltration', 'char-shanks', ARRAY['captain', 'emperor']),
  ('covert-harbor-infiltration', 'char-buggy', ARRAY['captain', 'wildcard']),
  ('covert-harbor-infiltration', 'char-dragon', ARRAY['strategist', 'revolutionary']),
  ('covert-harbor-infiltration', 'char-sabo', ARRAY['strategist', 'fighter', 'revolutionary']),
  ('covert-harbor-infiltration', 'char-garp', ARRAY['fighter', 'marine']),
  ('covert-harbor-infiltration', 'char-koby', ARRAY['scout', 'navigator', 'marine']),
  ('covert-harbor-infiltration', 'char-smoker', ARRAY['strategist', 'marine', 'fighter']),
  ('covert-harbor-infiltration', 'char-katakuri', ARRAY['fighter', 'strategist']),
  ('covert-harbor-infiltration', 'char-boa', ARRAY['support', 'captain', 'disruption']),
  ('covert-harbor-infiltration', 'char-bonney', ARRAY['captain', 'wildcard']);

CREATE TEMP TABLE daily_crew_role_lane_score_rows (
  mission_slug text NOT NULL,
  fixture_id text NOT NULL,
  captain_score integer NOT NULL,
  fighter_score integer NOT NULL,
  navigator_score integer NOT NULL,
  strategist_score integer NOT NULL,
  support_score integer NOT NULL,
  PRIMARY KEY (mission_slug, fixture_id)
) ON COMMIT DROP;

INSERT INTO daily_crew_role_lane_score_rows (
  mission_slug,
  fixture_id,
  captain_score,
  fighter_score,
  navigator_score,
  strategist_score,
  support_score
) VALUES
  ('storm-gate-rescue', 'char-luffy', 18, 16, 5, 10, 8),
  ('storm-gate-rescue', 'char-zoro', 7, 18, 3, 5, 6),
  ('storm-gate-rescue', 'char-nami', 5, 3, 18, 14, 11),
  ('storm-gate-rescue', 'char-sanji', 7, 14, 6, 7, 16),
  ('storm-gate-rescue', 'char-robin', 9, 7, 10, 17, 12),
  ('storm-gate-rescue', 'char-law', 14, 12, 11, 18, 13),
  ('storm-gate-rescue', 'char-kid', 16, 14, 3, 6, 4),
  ('storm-gate-rescue', 'char-boa', 15, 13, 5, 10, 9),
  ('storm-gate-rescue', 'char-marco', 12, 13, 8, 12, 18),
  ('storm-gate-rescue', 'char-vivi', 11, 2, 16, 13, 14),
  ('storm-gate-rescue', 'char-sabo', 13, 16, 5, 14, 10),
  ('storm-gate-rescue', 'char-kuma', 6, 12, 15, 8, 14),
  ('storm-gate-rescue', 'char-mihawk', 10, 17, 2, 9, 5),
  ('storm-gate-rescue', 'char-crocodile', 14, 12, 5, 16, 6),
  ('storm-gate-rescue', 'char-yamato', 12, 14, 4, 7, 15),
  ('covert-harbor-infiltration', 'char-chopper', 5, 7, 5, 6, 18),
  ('covert-harbor-infiltration', 'char-franky', 8, 13, 16, 12, 14),
  ('covert-harbor-infiltration', 'char-brook', 7, 11, 9, 8, 16),
  ('covert-harbor-infiltration', 'char-usopp', 9, 6, 18, 14, 13),
  ('covert-harbor-infiltration', 'char-jinbe', 12, 18, 13, 12, 14),
  ('covert-harbor-infiltration', 'char-shanks', 18, 14, 9, 14, 12),
  ('covert-harbor-infiltration', 'char-buggy', 15, 3, 7, 8, 6),
  ('covert-harbor-infiltration', 'char-dragon', 14, 12, 10, 18, 11),
  ('covert-harbor-infiltration', 'char-sabo', 13, 14, 5, 16, 10),
  ('covert-harbor-infiltration', 'char-garp', 12, 17, 5, 8, 7),
  ('covert-harbor-infiltration', 'char-koby', 10, 11, 15, 12, 11),
  ('covert-harbor-infiltration', 'char-smoker', 10, 14, 7, 15, 8),
  ('covert-harbor-infiltration', 'char-katakuri', 13, 16, 7, 13, 9),
  ('covert-harbor-infiltration', 'char-boa', 13, 14, 5, 11, 15),
  ('covert-harbor-infiltration', 'char-bonney', 16, 12, 9, 10, 13);

CREATE TEMP TABLE daily_crew_role_lane_scores ON COMMIT DROP AS
SELECT
  score_rows.mission_slug,
  score_rows.fixture_id,
  expanded_scores.role,
  expanded_scores.score,
  characters.name
    || ' brings a '
    || expanded_scores.score::text
    || '/18 '
    || expanded_scores.role::text
    || ' fit to '
    || CASE score_rows.mission_slug
      WHEN 'storm-gate-rescue' THEN 'the Storm Gate rescue'
      WHEN 'covert-harbor-infiltration' THEN 'the covert harbor infiltration'
    END
    || '.' AS explanation
FROM daily_crew_role_lane_score_rows AS score_rows
JOIN daily_crew_role_lane_characters AS seed_characters
  ON seed_characters.fixture_id = score_rows.fixture_id
JOIN public.characters AS characters
  ON characters.slug = seed_characters.market_slug
CROSS JOIN LATERAL (
  VALUES
    ('captain'::public.daily_crew_role, score_rows.captain_score),
    ('fighter'::public.daily_crew_role, score_rows.fighter_score),
    ('navigator'::public.daily_crew_role, score_rows.navigator_score),
    ('strategist'::public.daily_crew_role, score_rows.strategist_score),
    ('support'::public.daily_crew_role, score_rows.support_score)
) AS expanded_scores(role, score);

CREATE TEMP TABLE daily_crew_role_lane_perfect_solution (
  mission_slug text NOT NULL,
  role public.daily_crew_role NOT NULL,
  fixture_id text NOT NULL,
  PRIMARY KEY (mission_slug, role)
) ON COMMIT DROP;

INSERT INTO daily_crew_role_lane_perfect_solution (mission_slug, role, fixture_id) VALUES
  ('storm-gate-rescue', 'captain', 'char-luffy'),
  ('storm-gate-rescue', 'fighter', 'char-zoro'),
  ('storm-gate-rescue', 'navigator', 'char-nami'),
  ('storm-gate-rescue', 'strategist', 'char-law'),
  ('storm-gate-rescue', 'support', 'char-marco'),
  ('covert-harbor-infiltration', 'captain', 'char-shanks'),
  ('covert-harbor-infiltration', 'fighter', 'char-jinbe'),
  ('covert-harbor-infiltration', 'navigator', 'char-usopp'),
  ('covert-harbor-infiltration', 'strategist', 'char-dragon'),
  ('covert-harbor-infiltration', 'support', 'char-chopper');

DO $role_lanes$
DECLARE
  v_missing_missions text;
  v_missing_slugs text;
  v_mission record;
  v_mission_id uuid;
  v_updated_solution integer;
  v_updated_tags integer;
  v_updated_scores integer;
BEGIN
  SELECT string_agg(seed_missions.mission_slug, ', ' ORDER BY seed_missions.mission_slug)
    INTO v_missing_missions
  FROM daily_crew_role_lane_missions AS seed_missions
  LEFT JOIN public.daily_crew_missions AS missions
    ON missions.slug = seed_missions.mission_slug
  WHERE missions.id IS NULL;

  IF v_missing_missions IS NOT NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder role-lane correction missing missions: %', v_missing_missions;
  END IF;

  SELECT string_agg(seed_characters.market_slug, ', ' ORDER BY seed_characters.market_slug)
    INTO v_missing_slugs
  FROM daily_crew_role_lane_characters AS seed_characters
  LEFT JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  WHERE characters.id IS NULL;

  IF v_missing_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder role-lane correction missing public.characters slugs: %', v_missing_slugs;
  END IF;

  UPDATE public.daily_crew_mission_pool AS pool
  SET visible_tags = pool_tags.visible_tags
  FROM daily_crew_role_lane_pool_tags AS pool_tags
  JOIN public.daily_crew_missions AS missions
    ON missions.slug = pool_tags.mission_slug
  JOIN daily_crew_role_lane_characters AS seed_characters
    ON seed_characters.fixture_id = pool_tags.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  WHERE pool.mission_id = missions.id
    AND pool.character_id = characters.id;

  GET DIAGNOSTICS v_updated_tags = ROW_COUNT;

  IF v_updated_tags <> 30 THEN
    RAISE EXCEPTION 'Daily Crew Builder role-lane correction expected 30 pool tag updates, got %', v_updated_tags;
  END IF;

  UPDATE public.daily_crew_character_role_scores AS score_rows
  SET
    score = scores.score,
    explanation = scores.explanation
  FROM daily_crew_role_lane_scores AS scores
  JOIN public.daily_crew_missions AS missions
    ON missions.slug = scores.mission_slug
  JOIN daily_crew_role_lane_characters AS seed_characters
    ON seed_characters.fixture_id = scores.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  WHERE score_rows.mission_id = missions.id
    AND score_rows.character_id = characters.id
    AND score_rows.role = scores.role;

  GET DIAGNOSTICS v_updated_scores = ROW_COUNT;

  IF v_updated_scores <> 150 THEN
    RAISE EXCEPTION 'Daily Crew Builder role-lane correction expected 150 role score updates, got %', v_updated_scores;
  END IF;

  UPDATE public.daily_crew_perfect_solution AS solution_rows
  SET character_id = characters.id
  FROM daily_crew_role_lane_perfect_solution AS solution
  JOIN public.daily_crew_missions AS missions
    ON missions.slug = solution.mission_slug
  JOIN daily_crew_role_lane_characters AS seed_characters
    ON seed_characters.fixture_id = solution.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  WHERE solution_rows.mission_id = missions.id
    AND solution_rows.role = solution.role;

  GET DIAGNOSTICS v_updated_solution = ROW_COUNT;

  IF v_updated_solution <> 10 THEN
    RAISE EXCEPTION 'Daily Crew Builder role-lane correction expected 10 perfect solution updates, got %', v_updated_solution;
  END IF;

  FOR v_mission IN
    SELECT mission_slug
    FROM daily_crew_role_lane_missions
    ORDER BY mission_slug
  LOOP
    SELECT id
      INTO v_mission_id
    FROM public.daily_crew_missions
    WHERE slug = v_mission.mission_slug;

    IF NOT public.validate_daily_crew_mission(v_mission_id) THEN
      RAISE EXCEPTION 'Daily Crew Builder role-lane correction failed validation: %', v_mission.mission_slug;
    END IF;

    UPDATE public.daily_crew_missions
    SET
      status = 'published'::public.daily_crew_mission_status,
      updated_at = now()
    WHERE id = v_mission_id;
  END LOOP;
END;
$role_lanes$;

NOTIFY pgrst, 'reload schema';

COMMIT;
