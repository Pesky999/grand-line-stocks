-- Market expansion wave 1: add display_order + 29 new characters. Idempotent.
BEGIN;

-- 1) Add display_order column + supporting index
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS display_order integer;

CREATE INDEX IF NOT EXISTS idx_characters_display_order
  ON public.characters (display_order NULLS LAST, name);

-- 2) Assign 1..29 to existing rows only when NO row has display_order yet.
--    Ordering matches the current Live Quotes table: current_price DESC, name ASC.
WITH should_seed AS (
  SELECT COUNT(*) = 0 AS ok
  FROM public.characters
  WHERE display_order IS NOT NULL
),
ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY current_price DESC, name ASC)::int AS rn
  FROM public.characters
  WHERE display_order IS NULL
)
UPDATE public.characters c
SET display_order = ranked.rn
FROM ranked, should_seed
WHERE c.id = ranked.id
  AND c.display_order IS NULL
  AND should_seed.ok;

-- 3) Insert 29 new characters (skip existing slugs).
INSERT INTO public.characters
  (slug, name, crew, role, bounty, image_url, description,
   current_price, previous_price, category, momentum, display_order)
SELECT v.slug, v.name, v.crew, NULL::text, v.bounty, NULL::text, NULL::text,
       v.price, v.price, v.category::public.stock_category, 0::numeric, v.display_order
FROM (VALUES
  ('gol-d-roger',             'Gol D. Roger',                'Roger Pirates',              5564800000::bigint, 1400.00::numeric, 'blue_chip',   30),
  ('edward-newgate',          'Edward Newgate (Whitebeard)', 'Whitebeard Pirates',         5046000000::bigint, 1380.00::numeric, 'blue_chip',   31),
  ('monkey-d-dragon',         'Monkey D. Dragon',            'Revolutionary Army',         NULL::bigint,       1200.00::numeric, 'blue_chip',   32),
  ('portgas-d-ace',           'Portgas D. Ace',              'Whitebeard Pirates',         550000000::bigint,   500.00::numeric, 'growth',      33),
  ('sabo',                    'Sabo',                        'Revolutionary Army',         602000000::bigint,   520.00::numeric, 'growth',      34),
  ('donquixote-doflamingo',   'Donquixote Doflamingo',       'Donquixote Pirates',         340000000::bigint,   480.00::numeric, 'blue_chip',   35),
  ('silvers-rayleigh',        'Silvers Rayleigh',            'Roger Pirates',              NULL::bigint,        900.00::numeric, 'blue_chip',   36),
  ('kozuki-oden',             'Kozuki Oden',                 'Kozuki Family',              NULL::bigint,        400.00::numeric, 'growth',      37),
  ('bartholomew-kuma',        'Bartholomew Kuma',            'Revolutionary Army',         296000000::bigint,   350.00::numeric, 'growth',      38),
  ('jewelry-bonney',          'Jewelry Bonney',              'Bonney Pirates',             320000000::bigint,   300.00::numeric, 'growth',      39),
  ('scopper-gaban',           'Scopper Gaban',               'Roger Pirates',              NULL::bigint,        220.00::numeric, 'speculative', 40),
  ('saint-figarland-garling', 'Saint Figarland Garling',     'Holy Knights',               NULL::bigint,        700.00::numeric, 'meme',        41),
  ('marco',                   'Marco',                       'Whitebeard Pirates',         1374000000::bigint,  600.00::numeric, 'blue_chip',   42),
  ('charlotte-katakuri',      'Charlotte Katakuri',          'Big Mom Pirates',            1057000000::bigint,  620.00::numeric, 'blue_chip',   43),
  ('enel',                    'Enel',                        'Independent',                NULL::bigint,        280.00::numeric, 'speculative', 44),
  ('rob-lucci',               'Rob Lucci',                   'Cipher Pol',                 NULL::bigint,        450.00::numeric, 'meme',        45),
  ('issho',                   'Issho (Fujitora)',            'Marines',                    NULL::bigint,        830.00::numeric, 'meme',        46),
  ('aramaki',                 'Aramaki (Ryokugyu)',          'Marines',                    NULL::bigint,        800.00::numeric, 'meme',        47),
  ('sengoku',                 'Sengoku',                     'Marines',                    NULL::bigint,        780.00::numeric, 'meme',        48),
  ('nefertari-vivi',          'Nefertari Vivi',              'Alabasta Kingdom',           NULL::bigint,        260.00::numeric, 'growth',      49),
  ('shirahoshi',              'Shirahoshi',                  'Ryugu Kingdom',              NULL::bigint,        190.00::numeric, 'speculative', 50),
  ('kozuki-momonosuke',       'Kozuki Momonosuke',           'Kozuki Family',              NULL::bigint,        180.00::numeric, 'speculative', 51),
  ('hajrudin',                'Hajrudin',                    'New Giant Warrior Pirates',  1150000000::bigint,  340.00::numeric, 'growth',      52),
  ('jaguar-d-saul',           'Jaguar D. Saul',              'Giant',                      NULL::bigint,        160.00::numeric, 'speculative', 53),
  ('killer',                  'Killer',                      'Kid Pirates',                200000000::bigint,   240.00::numeric, 'growth',      54),
  ('smoker',                  'Smoker',                      'Marines',                    NULL::bigint,        320.00::numeric, 'meme',        55),
  ('emporio-ivankov',         'Emporio Ivankov',             'Revolutionary Army',         NULL::bigint,        210.00::numeric, 'speculative', 56),
  ('king',                    'King',                        'Beasts Pirates',             1390000000::bigint,  460.00::numeric, 'blue_chip',   57),
  ('queen',                   'Queen',                       'Beasts Pirates',             1320000000::bigint,  440.00::numeric, 'blue_chip',   58)
) AS v(slug, name, crew, bounty, price, category, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.characters c WHERE c.slug = v.slug
);

-- 4) Seed one IPO row per newly inserted character.
INSERT INTO public.price_history (character_id, price, note, source)
SELECT c.id, c.current_price, 'IPO', 'seed'
FROM public.characters c
WHERE c.slug IN (
  'gol-d-roger','edward-newgate','monkey-d-dragon','portgas-d-ace','sabo',
  'donquixote-doflamingo','silvers-rayleigh','kozuki-oden','bartholomew-kuma',
  'jewelry-bonney','scopper-gaban','saint-figarland-garling','marco',
  'charlotte-katakuri','enel','rob-lucci','issho','aramaki','sengoku',
  'nefertari-vivi','shirahoshi','kozuki-momonosuke','hajrudin','jaguar-d-saul',
  'killer','smoker','emporio-ivankov','king','queen'
)
AND NOT EXISTS (
  SELECT 1 FROM public.price_history ph
  WHERE ph.character_id = c.id AND ph.note = 'IPO' AND ph.source = 'seed'
);

COMMIT;