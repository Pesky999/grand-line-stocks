BEGIN;

CREATE TEMP TABLE daily_crew_seed_characters (
  fixture_id text PRIMARY KEY,
  market_slug text NOT NULL
) ON COMMIT DROP;

INSERT INTO daily_crew_seed_characters (fixture_id, market_slug) VALUES
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

CREATE TEMP TABLE daily_crew_seed_missions (
  mission_date date PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  brief text NOT NULL,
  mission_tags text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO daily_crew_seed_missions (mission_date, slug, title, brief, mission_tags) VALUES
  (
    '2026-07-10',
    'storm-gate-rescue',
    'Storm Gate Rescue',
    'Assemble a crew that can cross a hostile weather gate, break the blockade, and extract stranded allies.',
    ARRAY['rescue', 'storm', 'blockade']
  ),
  (
    '2026-07-11',
    'covert-harbor-infiltration',
    'Covert Harbor Infiltration',
    'Choose a five-role crew that can enter a guarded harbor, read the shifting patrols, and leave no trace.',
    ARRAY['stealth', 'harbor', 'intel']
  );

CREATE TEMP TABLE daily_crew_seed_pool (
  mission_slug text NOT NULL,
  fixture_id text NOT NULL,
  display_order integer NOT NULL,
  is_straw_hat boolean NOT NULL,
  visible_tags text[] NOT NULL,
  PRIMARY KEY (mission_slug, fixture_id)
) ON COMMIT DROP;

INSERT INTO daily_crew_seed_pool (mission_slug, fixture_id, display_order, is_straw_hat, visible_tags) VALUES
  ('storm-gate-rescue', 'char-luffy', 1, true, ARRAY['Straw Hat', 'captain', 'high-risk']),
  ('storm-gate-rescue', 'char-zoro', 2, true, ARRAY['Straw Hat', 'fighter']),
  ('storm-gate-rescue', 'char-nami', 3, true, ARRAY['Straw Hat', 'navigator']),
  ('storm-gate-rescue', 'char-sanji', 4, true, ARRAY['Straw Hat', 'fighter', 'support']),
  ('storm-gate-rescue', 'char-robin', 5, true, ARRAY['Straw Hat', 'scholar']),
  ('storm-gate-rescue', 'char-law', 6, false, ARRAY['captain', 'strategist']),
  ('storm-gate-rescue', 'char-kid', 7, false, ARRAY['captain', 'fighter']),
  ('storm-gate-rescue', 'char-boa', 8, false, ARRAY['captain', 'fighter']),
  ('storm-gate-rescue', 'char-marco', 9, false, ARRAY['support', 'fighter']),
  ('storm-gate-rescue', 'char-vivi', 10, false, ARRAY['diplomat', 'navigator']),
  ('storm-gate-rescue', 'char-sabo', 11, false, ARRAY['fighter', 'strategist']),
  ('storm-gate-rescue', 'char-kuma', 12, false, ARRAY['support', 'fighter']),
  ('storm-gate-rescue', 'char-mihawk', 13, false, ARRAY['fighter']),
  ('storm-gate-rescue', 'char-crocodile', 14, false, ARRAY['strategist', 'captain']),
  ('storm-gate-rescue', 'char-yamato', 15, false, ARRAY['fighter', 'support']),
  ('covert-harbor-infiltration', 'char-chopper', 1, true, ARRAY['Straw Hat', 'support']),
  ('covert-harbor-infiltration', 'char-franky', 2, true, ARRAY['Straw Hat', 'engineer']),
  ('covert-harbor-infiltration', 'char-brook', 3, true, ARRAY['Straw Hat', 'support']),
  ('covert-harbor-infiltration', 'char-usopp', 4, true, ARRAY['Straw Hat', 'tactician']),
  ('covert-harbor-infiltration', 'char-jinbe', 5, true, ARRAY['Straw Hat', 'fighter']),
  ('covert-harbor-infiltration', 'char-shanks', 6, false, ARRAY['captain', 'emperor']),
  ('covert-harbor-infiltration', 'char-buggy', 7, false, ARRAY['captain', 'wildcard']),
  ('covert-harbor-infiltration', 'char-dragon', 8, false, ARRAY['strategist', 'revolutionary']),
  ('covert-harbor-infiltration', 'char-sabo', 9, false, ARRAY['fighter', 'strategist', 'revolutionary']),
  ('covert-harbor-infiltration', 'char-garp', 10, false, ARRAY['fighter', 'marine']),
  ('covert-harbor-infiltration', 'char-koby', 11, false, ARRAY['navigator', 'marine']),
  ('covert-harbor-infiltration', 'char-smoker', 12, false, ARRAY['fighter', 'marine']),
  ('covert-harbor-infiltration', 'char-katakuri', 13, false, ARRAY['fighter', 'strategist']),
  ('covert-harbor-infiltration', 'char-boa', 14, false, ARRAY['captain', 'fighter', 'disruption']),
  ('covert-harbor-infiltration', 'char-bonney', 15, false, ARRAY['captain', 'wildcard']);

CREATE TEMP TABLE daily_crew_seed_role_requirements (
  mission_slug text NOT NULL,
  role public.daily_crew_role NOT NULL,
  subtype_key text NOT NULL,
  subtype_label text NOT NULL,
  max_points integer NOT NULL,
  PRIMARY KEY (mission_slug, role)
) ON COMMIT DROP;

INSERT INTO daily_crew_seed_role_requirements (mission_slug, role, subtype_key, subtype_label, max_points) VALUES
  ('storm-gate-rescue', 'captain', 'storm_gate_command', 'Hidden command profile', 18),
  ('storm-gate-rescue', 'fighter', 'storm_gate_duelist', 'Hidden combat profile', 18),
  ('storm-gate-rescue', 'navigator', 'storm_gate_route', 'Hidden route profile', 18),
  ('storm-gate-rescue', 'strategist', 'storm_gate_scheme', 'Hidden strategy profile', 18),
  ('storm-gate-rescue', 'support', 'storm_gate_stabilizer', 'Hidden support profile', 18),
  ('covert-harbor-infiltration', 'captain', 'covert_harbor_command', 'Hidden command profile', 18),
  ('covert-harbor-infiltration', 'fighter', 'covert_harbor_duelist', 'Hidden combat profile', 18),
  ('covert-harbor-infiltration', 'navigator', 'covert_harbor_route', 'Hidden route profile', 18),
  ('covert-harbor-infiltration', 'strategist', 'covert_harbor_scheme', 'Hidden strategy profile', 18),
  ('covert-harbor-infiltration', 'support', 'covert_harbor_stabilizer', 'Hidden support profile', 18);

CREATE TEMP TABLE daily_crew_seed_role_scores (
  mission_slug text NOT NULL,
  fixture_id text NOT NULL,
  role public.daily_crew_role NOT NULL,
  score integer NOT NULL,
  explanation text NOT NULL,
  PRIMARY KEY (mission_slug, fixture_id, role)
) ON COMMIT DROP;

INSERT INTO daily_crew_seed_role_scores (mission_slug, fixture_id, role, score, explanation) VALUES
  ('storm-gate-rescue', 'char-luffy', 'captain', 18, 'Monkey D. Luffy brings a 18/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-luffy', 'fighter', 16, 'Monkey D. Luffy brings a 16/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-luffy', 'navigator', 5, 'Monkey D. Luffy brings a 5/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-luffy', 'strategist', 10, 'Monkey D. Luffy brings a 10/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-luffy', 'support', 8, 'Monkey D. Luffy brings a 8/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-zoro', 'captain', 12, 'Roronoa Zoro brings a 12/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-zoro', 'fighter', 18, 'Roronoa Zoro brings a 18/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-zoro', 'navigator', 4, 'Roronoa Zoro brings a 4/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-zoro', 'strategist', 7, 'Roronoa Zoro brings a 7/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-zoro', 'support', 7, 'Roronoa Zoro brings a 7/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-nami', 'captain', 9, 'Nami brings a 9/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-nami', 'fighter', 4, 'Nami brings a 4/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-nami', 'navigator', 18, 'Nami brings a 18/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-nami', 'strategist', 14, 'Nami brings a 14/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-nami', 'support', 12, 'Nami brings a 12/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sanji', 'captain', 10, 'Sanji brings a 10/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sanji', 'fighter', 17, 'Sanji brings a 17/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sanji', 'navigator', 7, 'Sanji brings a 7/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sanji', 'strategist', 9, 'Sanji brings a 9/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sanji', 'support', 14, 'Sanji brings a 14/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-robin', 'captain', 11, 'Nico Robin brings a 11/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-robin', 'fighter', 8, 'Nico Robin brings a 8/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-robin', 'navigator', 11, 'Nico Robin brings a 11/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-robin', 'strategist', 17, 'Nico Robin brings a 17/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-robin', 'support', 13, 'Nico Robin brings a 13/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-law', 'captain', 15, 'Trafalgar Law brings a 15/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-law', 'fighter', 13, 'Trafalgar Law brings a 13/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-law', 'navigator', 12, 'Trafalgar Law brings a 12/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-law', 'strategist', 18, 'Trafalgar Law brings a 18/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-law', 'support', 15, 'Trafalgar Law brings a 15/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kid', 'captain', 16, 'Eustass Kid brings a 16/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kid', 'fighter', 16, 'Eustass Kid brings a 16/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kid', 'navigator', 4, 'Eustass Kid brings a 4/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kid', 'strategist', 8, 'Eustass Kid brings a 8/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kid', 'support', 5, 'Eustass Kid brings a 5/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-boa', 'captain', 14, 'Boa Hancock brings a 14/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-boa', 'fighter', 15, 'Boa Hancock brings a 15/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-boa', 'navigator', 7, 'Boa Hancock brings a 7/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-boa', 'strategist', 12, 'Boa Hancock brings a 12/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-boa', 'support', 10, 'Boa Hancock brings a 10/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-marco', 'captain', 13, 'Marco brings a 13/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-marco', 'fighter', 15, 'Marco brings a 15/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-marco', 'navigator', 9, 'Marco brings a 9/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-marco', 'strategist', 14, 'Marco brings a 14/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-marco', 'support', 18, 'Marco brings a 18/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-vivi', 'captain', 12, 'Nefertari Vivi brings a 12/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-vivi', 'fighter', 3, 'Nefertari Vivi brings a 3/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-vivi', 'navigator', 15, 'Nefertari Vivi brings a 15/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-vivi', 'strategist', 15, 'Nefertari Vivi brings a 15/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-vivi', 'support', 17, 'Nefertari Vivi brings a 17/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sabo', 'captain', 14, 'Sabo brings a 14/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sabo', 'fighter', 17, 'Sabo brings a 17/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sabo', 'navigator', 6, 'Sabo brings a 6/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sabo', 'strategist', 13, 'Sabo brings a 13/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-sabo', 'support', 11, 'Sabo brings a 11/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kuma', 'captain', 9, 'Bartholomew Kuma brings a 9/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kuma', 'fighter', 16, 'Bartholomew Kuma brings a 16/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kuma', 'navigator', 8, 'Bartholomew Kuma brings a 8/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kuma', 'strategist', 10, 'Bartholomew Kuma brings a 10/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-kuma', 'support', 16, 'Bartholomew Kuma brings a 16/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-mihawk', 'captain', 11, 'Dracule Mihawk brings a 11/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-mihawk', 'fighter', 18, 'Dracule Mihawk brings a 18/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-mihawk', 'navigator', 4, 'Dracule Mihawk brings a 4/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-mihawk', 'strategist', 11, 'Dracule Mihawk brings a 11/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-mihawk', 'support', 8, 'Dracule Mihawk brings a 8/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-crocodile', 'captain', 15, 'Crocodile brings a 15/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-crocodile', 'fighter', 13, 'Crocodile brings a 13/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-crocodile', 'navigator', 7, 'Crocodile brings a 7/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-crocodile', 'strategist', 16, 'Crocodile brings a 16/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-crocodile', 'support', 9, 'Crocodile brings a 9/18 support fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-yamato', 'captain', 13, 'Yamato brings a 13/18 captain fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-yamato', 'fighter', 17, 'Yamato brings a 17/18 fighter fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-yamato', 'navigator', 5, 'Yamato brings a 5/18 navigator fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-yamato', 'strategist', 9, 'Yamato brings a 9/18 strategist fit to the Storm Gate rescue.'),
  ('storm-gate-rescue', 'char-yamato', 'support', 12, 'Yamato brings a 12/18 support fit to the Storm Gate rescue.'),
  ('covert-harbor-infiltration', 'char-chopper', 'captain', 7, 'Tony Tony Chopper brings a 7/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-chopper', 'fighter', 9, 'Tony Tony Chopper brings a 9/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-chopper', 'navigator', 6, 'Tony Tony Chopper brings a 6/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-chopper', 'strategist', 8, 'Tony Tony Chopper brings a 8/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-chopper', 'support', 18, 'Tony Tony Chopper brings a 18/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-franky', 'captain', 9, 'Franky brings a 9/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-franky', 'fighter', 14, 'Franky brings a 14/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-franky', 'navigator', 11, 'Franky brings a 11/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-franky', 'strategist', 13, 'Franky brings a 13/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-franky', 'support', 15, 'Franky brings a 15/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-brook', 'captain', 8, 'Brook brings a 8/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-brook', 'fighter', 12, 'Brook brings a 12/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-brook', 'navigator', 10, 'Brook brings a 10/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-brook', 'strategist', 10, 'Brook brings a 10/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-brook', 'support', 17, 'Brook brings a 17/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-usopp', 'captain', 10, 'Usopp brings a 10/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-usopp', 'fighter', 8, 'Usopp brings a 8/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-usopp', 'navigator', 16, 'Usopp brings a 16/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-usopp', 'strategist', 15, 'Usopp brings a 15/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-usopp', 'support', 14, 'Usopp brings a 14/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-jinbe', 'captain', 14, 'Jinbe brings a 14/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-jinbe', 'fighter', 18, 'Jinbe brings a 18/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-jinbe', 'navigator', 14, 'Jinbe brings a 14/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-jinbe', 'strategist', 13, 'Jinbe brings a 13/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-jinbe', 'support', 15, 'Jinbe brings a 15/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-shanks', 'captain', 18, 'Shanks brings a 18/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-shanks', 'fighter', 17, 'Shanks brings a 17/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-shanks', 'navigator', 10, 'Shanks brings a 10/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-shanks', 'strategist', 15, 'Shanks brings a 15/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-shanks', 'support', 13, 'Shanks brings a 13/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-buggy', 'captain', 13, 'Buggy brings a 13/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-buggy', 'fighter', 4, 'Buggy brings a 4/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-buggy', 'navigator', 8, 'Buggy brings a 8/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-buggy', 'strategist', 9, 'Buggy brings a 9/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-buggy', 'support', 8, 'Buggy brings a 8/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-dragon', 'captain', 17, 'Monkey D. Dragon brings a 17/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-dragon', 'fighter', 13, 'Monkey D. Dragon brings a 13/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-dragon', 'navigator', 11, 'Monkey D. Dragon brings a 11/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-dragon', 'strategist', 18, 'Monkey D. Dragon brings a 18/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-dragon', 'support', 12, 'Monkey D. Dragon brings a 12/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-sabo', 'captain', 14, 'Sabo brings a 14/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-sabo', 'fighter', 17, 'Sabo brings a 17/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-sabo', 'navigator', 6, 'Sabo brings a 6/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-sabo', 'strategist', 15, 'Sabo brings a 15/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-sabo', 'support', 18, 'Sabo brings a 18/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-garp', 'captain', 13, 'Monkey D. Garp brings a 13/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-garp', 'fighter', 18, 'Monkey D. Garp brings a 18/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-garp', 'navigator', 7, 'Monkey D. Garp brings a 7/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-garp', 'strategist', 10, 'Monkey D. Garp brings a 10/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-garp', 'support', 9, 'Monkey D. Garp brings a 9/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-koby', 'captain', 12, 'Koby brings a 12/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-koby', 'fighter', 12, 'Koby brings a 12/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-koby', 'navigator', 18, 'Koby brings a 18/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-koby', 'strategist', 14, 'Koby brings a 14/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-koby', 'support', 13, 'Koby brings a 13/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-smoker', 'captain', 11, 'Smoker brings a 11/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-smoker', 'fighter', 15, 'Smoker brings a 15/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-smoker', 'navigator', 9, 'Smoker brings a 9/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-smoker', 'strategist', 13, 'Smoker brings a 13/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-smoker', 'support', 10, 'Smoker brings a 10/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-katakuri', 'captain', 14, 'Charlotte Katakuri brings a 14/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-katakuri', 'fighter', 17, 'Charlotte Katakuri brings a 17/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-katakuri', 'navigator', 9, 'Charlotte Katakuri brings a 9/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-katakuri', 'strategist', 16, 'Charlotte Katakuri brings a 16/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-katakuri', 'support', 11, 'Charlotte Katakuri brings a 11/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-boa', 'captain', 14, 'Boa Hancock brings a 14/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-boa', 'fighter', 15, 'Boa Hancock brings a 15/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-boa', 'navigator', 7, 'Boa Hancock brings a 7/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-boa', 'strategist', 13, 'Boa Hancock brings a 13/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-boa', 'support', 16, 'Boa Hancock brings a 16/18 support fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-bonney', 'captain', 15, 'Jewelry Bonney brings a 15/18 captain fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-bonney', 'fighter', 13, 'Jewelry Bonney brings a 13/18 fighter fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-bonney', 'navigator', 10, 'Jewelry Bonney brings a 10/18 navigator fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-bonney', 'strategist', 11, 'Jewelry Bonney brings a 11/18 strategist fit to the covert harbor infiltration.'),
  ('covert-harbor-infiltration', 'char-bonney', 'support', 14, 'Jewelry Bonney brings a 14/18 support fit to the covert harbor infiltration.');

CREATE TEMP TABLE daily_crew_seed_perfect_solution (
  mission_slug text NOT NULL,
  role public.daily_crew_role NOT NULL,
  fixture_id text NOT NULL,
  PRIMARY KEY (mission_slug, role)
) ON COMMIT DROP;

INSERT INTO daily_crew_seed_perfect_solution (mission_slug, role, fixture_id) VALUES
  ('storm-gate-rescue', 'captain', 'char-luffy'),
  ('storm-gate-rescue', 'fighter', 'char-zoro'),
  ('storm-gate-rescue', 'navigator', 'char-nami'),
  ('storm-gate-rescue', 'strategist', 'char-law'),
  ('storm-gate-rescue', 'support', 'char-marco'),
  ('covert-harbor-infiltration', 'captain', 'char-shanks'),
  ('covert-harbor-infiltration', 'fighter', 'char-jinbe'),
  ('covert-harbor-infiltration', 'navigator', 'char-koby'),
  ('covert-harbor-infiltration', 'strategist', 'char-dragon'),
  ('covert-harbor-infiltration', 'support', 'char-sabo');

DO $seed$
DECLARE
  v_missing_slugs text;
  v_mission record;
  v_mission_id uuid;
BEGIN
  SELECT string_agg(c.market_slug, ', ' ORDER BY c.market_slug)
    INTO v_missing_slugs
  FROM daily_crew_seed_characters AS c
  LEFT JOIN public.characters AS market
    ON market.slug = c.market_slug
  WHERE market.id IS NULL;

  IF v_missing_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder seed missing public.characters slugs: %', v_missing_slugs;
  END IF;

  INSERT INTO public.daily_crew_missions (
    mission_date,
    slug,
    title,
    brief,
    mission_tags,
    status,
    reveal_policy,
    max_score
  )
  SELECT
    mission_date,
    slug,
    title,
    brief,
    mission_tags,
    'published'::public.daily_crew_mission_status,
    'next_day'::public.daily_crew_reveal_policy,
    100
  FROM daily_crew_seed_missions
  ON CONFLICT (slug) DO UPDATE SET
    mission_date = EXCLUDED.mission_date,
    title = EXCLUDED.title,
    brief = EXCLUDED.brief,
    mission_tags = EXCLUDED.mission_tags,
    status = EXCLUDED.status,
    reveal_policy = EXCLUDED.reveal_policy,
    max_score = EXCLUDED.max_score,
    updated_at = now();

  INSERT INTO public.daily_crew_mission_pool (
    mission_id,
    character_id,
    display_order,
    is_straw_hat,
    visible_tags
  )
  SELECT
    missions.id,
    characters.id,
    pool.display_order,
    pool.is_straw_hat,
    pool.visible_tags
  FROM daily_crew_seed_pool AS pool
  JOIN public.daily_crew_missions AS missions
    ON missions.slug = pool.mission_slug
  JOIN daily_crew_seed_characters AS seed_characters
    ON seed_characters.fixture_id = pool.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  ON CONFLICT (mission_id, character_id) DO UPDATE SET
    display_order = EXCLUDED.display_order,
    is_straw_hat = EXCLUDED.is_straw_hat,
    visible_tags = EXCLUDED.visible_tags;

  INSERT INTO public.daily_crew_role_requirements (
    mission_id,
    role,
    subtype_key,
    subtype_label,
    max_points
  )
  SELECT
    missions.id,
    requirements.role,
    requirements.subtype_key,
    requirements.subtype_label,
    requirements.max_points
  FROM daily_crew_seed_role_requirements AS requirements
  JOIN public.daily_crew_missions AS missions
    ON missions.slug = requirements.mission_slug
  ON CONFLICT (mission_id, role) DO UPDATE SET
    subtype_key = EXCLUDED.subtype_key,
    subtype_label = EXCLUDED.subtype_label,
    max_points = EXCLUDED.max_points;

  INSERT INTO public.daily_crew_character_role_scores (
    mission_id,
    character_id,
    role,
    score,
    explanation
  )
  SELECT
    missions.id,
    characters.id,
    scores.role,
    scores.score,
    scores.explanation
  FROM daily_crew_seed_role_scores AS scores
  JOIN public.daily_crew_missions AS missions
    ON missions.slug = scores.mission_slug
  JOIN daily_crew_seed_characters AS seed_characters
    ON seed_characters.fixture_id = scores.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  ON CONFLICT (mission_id, character_id, role) DO UPDATE SET
    score = EXCLUDED.score,
    explanation = EXCLUDED.explanation;

  INSERT INTO public.daily_crew_perfect_solution (
    mission_id,
    role,
    character_id
  )
  SELECT
    missions.id,
    solution.role,
    characters.id
  FROM daily_crew_seed_perfect_solution AS solution
  JOIN public.daily_crew_missions AS missions
    ON missions.slug = solution.mission_slug
  JOIN daily_crew_seed_characters AS seed_characters
    ON seed_characters.fixture_id = solution.fixture_id
  JOIN public.characters AS characters
    ON characters.slug = seed_characters.market_slug
  ON CONFLICT (mission_id, role) DO UPDATE SET
    character_id = EXCLUDED.character_id;

  FOR v_mission IN
    SELECT slug
    FROM daily_crew_seed_missions
    ORDER BY mission_date
  LOOP
    SELECT id
      INTO v_mission_id
    FROM public.daily_crew_missions
    WHERE slug = v_mission.slug;

    IF NOT public.validate_daily_crew_mission(v_mission_id) THEN
      RAISE EXCEPTION 'Daily Crew Builder seed mission failed validation: %', v_mission.slug;
    END IF;
  END LOOP;
END;
$seed$;

CREATE OR REPLACE FUNCTION public.record_daily_crew_builder_submission(
  _mission_id uuid,
  _user_id uuid,
  _score integer,
  _rank public.daily_crew_rank,
  _reward_amount integer,
  _score_breakdown jsonb,
  _assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_expected_rank public.daily_crew_rank;
  v_expected_reward integer;
  v_existing_submission public.daily_crew_submissions%ROWTYPE;
  v_submission public.daily_crew_submissions%ROWTYPE;
  v_assignment_count integer;
  v_distinct_role_count integer;
  v_distinct_character_count integer;
  v_null_character_count integer;
  v_valid_assignment_count integer;
  v_inserted_role_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_crew_missions AS missions
    WHERE missions.id = _mission_id
      AND missions.status = 'published'::public.daily_crew_mission_status
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder mission is not published';
  END IF;

  IF _score < 0 OR _score > 100 THEN
    RAISE EXCEPTION 'Daily Crew Builder score must be from 0 through 100';
  END IF;

  v_expected_rank := CASE
    WHEN _score >= 90 THEN 's'::public.daily_crew_rank
    WHEN _score >= 80 THEN 'a'::public.daily_crew_rank
    WHEN _score >= 70 THEN 'b'::public.daily_crew_rank
    WHEN _score >= 60 THEN 'c'::public.daily_crew_rank
    ELSE 'fail'::public.daily_crew_rank
  END;

  IF _rank <> v_expected_rank THEN
    RAISE EXCEPTION 'Daily Crew Builder rank does not match score';
  END IF;

  v_expected_reward := CASE _rank
    WHEN 's'::public.daily_crew_rank THEN 1000
    WHEN 'a'::public.daily_crew_rank THEN 700
    WHEN 'b'::public.daily_crew_rank THEN 400
    WHEN 'c'::public.daily_crew_rank THEN 200
    ELSE 0
  END;

  IF _reward_amount <> v_expected_reward OR _reward_amount < 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder reward amount does not match rank';
  END IF;

  IF _score_breakdown IS NULL OR jsonb_typeof(_score_breakdown) <> 'object' THEN
    RAISE EXCEPTION 'Daily Crew Builder score breakdown must be a JSON object';
  END IF;

  SELECT *
    INTO v_existing_submission
  FROM public.daily_crew_submissions
  WHERE mission_id = _mission_id
    AND user_id = _user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadySubmitted', true,
      'submissionId', v_existing_submission.id,
      'submittedAt', v_existing_submission.submitted_at,
      'score', v_existing_submission.score,
      'rank', v_existing_submission.rank,
      'rewardAmount', v_existing_submission.reward_amount,
      'rewardPaid', v_existing_submission.reward_paid,
      'scoreBreakdown', v_existing_submission.score_breakdown
    );
  END IF;

  IF _assignments IS NULL OR jsonb_typeof(_assignments) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder assignments must be a JSON array';
  END IF;

  WITH assignments AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId"::uuid AS character_id
    FROM jsonb_to_recordset(_assignments) AS parsed(role text, "characterId" uuid)
  )
  SELECT
    count(*),
    count(DISTINCT role),
    count(DISTINCT character_id),
    count(*) FILTER (WHERE character_id IS NULL)
    INTO
      v_assignment_count,
      v_distinct_role_count,
      v_distinct_character_count,
      v_null_character_count
  FROM assignments;

  IF v_assignment_count <> 5
     OR v_distinct_role_count <> 5
     OR v_distinct_character_count <> 5
     OR v_null_character_count <> 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder assignments must include five unique roles and characters';
  END IF;

  WITH assignments AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId"::uuid AS character_id
    FROM jsonb_to_recordset(_assignments) AS parsed(role text, "characterId" uuid)
  )
  SELECT count(*)
    INTO v_valid_assignment_count
  FROM assignments AS a
  JOIN public.daily_crew_mission_pool AS pool
    ON pool.mission_id = _mission_id
   AND pool.character_id = a.character_id
  JOIN public.daily_crew_role_requirements AS requirements
    ON requirements.mission_id = _mission_id
   AND requirements.role = a.role
  JOIN public.daily_crew_character_role_scores AS scores
    ON scores.mission_id = _mission_id
   AND scores.character_id = a.character_id
   AND scores.role = a.role;

  IF v_valid_assignment_count <> 5 THEN
    RAISE EXCEPTION 'Daily Crew Builder assignments must match the mission pool and roles';
  END IF;

  INSERT INTO public.daily_crew_submissions (
    mission_id,
    user_id,
    score,
    rank,
    reward_amount,
    reward_paid,
    score_breakdown
  )
  VALUES (
    _mission_id,
    _user_id,
    _score,
    _rank,
    _reward_amount,
    false,
    _score_breakdown
  )
  RETURNING *
  INTO v_submission;

  WITH assignments AS (
    SELECT
      parsed.role::public.daily_crew_role AS role,
      parsed."characterId"::uuid AS character_id
    FROM jsonb_to_recordset(_assignments) AS parsed(role text, "characterId" uuid)
  ),
  inserted_roles AS (
    INSERT INTO public.daily_crew_submission_roles (
      submission_id,
      mission_id,
      role,
      character_id,
      role_score,
      explanation
    )
    SELECT
      v_submission.id,
      _mission_id,
      a.role,
      a.character_id,
      scores.score,
      scores.explanation
    FROM assignments AS a
    JOIN public.daily_crew_character_role_scores AS scores
      ON scores.mission_id = _mission_id
     AND scores.character_id = a.character_id
     AND scores.role = a.role
    RETURNING 1
  )
  SELECT count(*)
    INTO v_inserted_role_count
  FROM inserted_roles;

  IF v_inserted_role_count <> 5 THEN
    RAISE EXCEPTION 'Daily Crew Builder submission role persistence failed';
  END IF;

  RETURN jsonb_build_object(
    'alreadySubmitted', false,
    'submissionId', v_submission.id,
    'submittedAt', v_submission.submitted_at,
    'score', v_submission.score,
    'rank', v_submission.rank,
    'rewardAmount', v_submission.reward_amount,
    'rewardPaid', v_submission.reward_paid,
    'scoreBreakdown', v_submission.score_breakdown
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
      INTO v_existing_submission
    FROM public.daily_crew_submissions
    WHERE mission_id = _mission_id
      AND user_id = _user_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'alreadySubmitted', true,
        'submissionId', v_existing_submission.id,
        'submittedAt', v_existing_submission.submitted_at,
        'score', v_existing_submission.score,
        'rank', v_existing_submission.rank,
        'rewardAmount', v_existing_submission.reward_amount,
        'rewardPaid', v_existing_submission.reward_paid,
        'scoreBreakdown', v_existing_submission.score_breakdown
      );
    END IF;

    RAISE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_daily_crew_builder_submission(
  uuid,
  uuid,
  integer,
  public.daily_crew_rank,
  integer,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_daily_crew_builder_submission(
  uuid,
  uuid,
  integer,
  public.daily_crew_rank,
  integer,
  jsonb,
  jsonb
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
