BEGIN;

CREATE TEMP TABLE _catalog_admin (
  user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _catalog_admin (user_id)
SELECT ur.user_id
FROM public.user_roles AS ur
WHERE ur.role = 'admin'::public.app_role;

DO $guard$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM _catalog_admin) <> 1 THEN
    RAISE EXCEPTION
      'Market catalog launch requires exactly one administrator for approval metadata';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.characters) <> 68 THEN
    RAISE EXCEPTION
      'Market catalog launch expected exactly 68 existing characters';
  END IF;
  IF EXISTS (SELECT 1 FROM public.characters WHERE NOT is_listed) THEN
    RAISE EXCEPTION
      'Market catalog launch cannot run while private character drafts exist';
  END IF;
END;
$guard$;

CREATE TEMP TABLE _existing_market_catalog (
  name text PRIMARY KEY,
  narrative_importance integer NOT NULL,
  current_relevance integer NOT NULL,
  strength_status integer NOT NULL,
  popularity integer NOT NULL,
  future_potential integer NOT NULL,
  investor_confidence integer NOT NULL,
  volatility integer NOT NULL,
  stock_category public.stock_category NOT NULL,
  expected_price numeric(12,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO _existing_market_catalog VALUES
  ('Monkey D. Luffy', 100, 100, 99, 100, 100, 99, 30, 'blue_chip', 2420.74),
  ('Shanks', 98, 90, 99, 99, 98, 94, 25, 'blue_chip', 2010.99),
  ('Marshall D. Teach', 99, 92, 98, 87, 100, 93, 35, 'blue_chip', 1895.53),
  ('Imu', 100, 100, 100, 82, 100, 72, 45, 'blue_chip', 1825.54),
  ('Loki', 94, 97, 97, 90, 98, 84, 50, 'growth', 1781.91),
  ('Roronoa Zoro', 90, 91, 96, 99, 94, 95, 30, 'blue_chip', 1734.65),
  ('Monkey D. Dragon', 97, 83, 97, 91, 99, 90, 35, 'blue_chip', 1675.09),
  ('Saint Figarland Garling', 96, 93, 96, 82, 97, 88, 50, 'blue_chip', 1652.73),
  ('Sanji', 89, 92, 93, 93, 93, 91, 35, 'blue_chip', 1562.04),
  ('Nico Robin', 95, 88, 80, 94, 95, 93, 30, 'blue_chip', 1512.46),
  ('Sabo', 93, 84, 94, 91, 96, 88, 45, 'blue_chip', 1512.46),
  ('Coby', 92, 80, 91, 92, 97, 89, 45, 'growth', 1425.63),
  ('Ethanbaron V. Nusjuro', 91, 88, 97, 78, 92, 82, 55, 'blue_chip', 1329.41),
  ('Sakazuki', 95, 82, 98, 69, 96, 89, 30, 'speculative', 1322.28),
  ('Kuzan', 91, 84, 95, 88, 92, 76, 55, 'speculative', 1315.19),
  ('Nami', 88, 86, 79, 98, 88, 94, 35, 'blue_chip', 1311.66),
  ('Jewelry Bonney', 89, 88, 85, 90, 91, 84, 55, 'growth', 1297.64),
  ('Scopper Gaban', 84, 90, 96, 89, 83, 86, 45, 'blue_chip', 1273.45),
  ('Sir Crocodile', 87, 78, 91, 92, 91, 88, 45, 'blue_chip', 1236.36),
  ('Monkey D. Garp', 92, 80, 96, 90, 78, 84, 55, 'blue_chip', 1219.85),
  ('Dracule Mihawk', 87, 70, 98, 90, 95, 87, 25, 'blue_chip', 1213.31),
  ('Trafalgar D. Water Law', 90, 66, 93, 97, 90, 87, 60, 'blue_chip', 1181.14),
  ('Tony Tony Chopper', 84, 86, 80, 96, 84, 90, 40, 'blue_chip', 1168.51),
  ('Usopp', 88, 90, 72, 91, 91, 80, 60, 'growth', 1162.24),
  ('Nefertari Vivi', 96, 86, 45, 92, 95, 91, 40, 'blue_chip', 1101.42),
  ('Dr. Vegapunk', 94, 86, 76, 87, 80, 79, 50, 'blue_chip', 1098.46),
  ('Brook', 82, 88, 81, 89, 84, 85, 45, 'growth', 1077.99),
  ('Bartholomew Kuma', 91, 74, 90, 93, 72, 89, 35, 'blue_chip', 1077.99),
  ('Buggy the Clown', 90, 85, 58, 94, 94, 78, 80, 'meme', 1049.40),
  ('Gol D. Roger', 97, 62, 100, 94, 62, 90, 15, 'blue_chip', 1040.98),
  ('Issho (Fujitora)', 86, 64, 94, 86, 90, 86, 40, 'blue_chip', 1005.23),
  ('Silvers Rayleigh', 88, 68, 97, 92, 68, 92, 25, 'blue_chip', 1002.54),
  ('Borsalino', 85, 72, 96, 87, 82, 78, 45, 'speculative', 994.49),
  ('Jinbe', 81, 78, 90, 84, 78, 87, 30, 'blue_chip', 950.07),
  ('Boa Hancock', 81, 62, 91, 96, 86, 84, 50, 'blue_chip', 932.36),
  ('Franky', 80, 81, 83, 84, 82, 84, 45, 'growth', 929.86),
  ('Shiryu', 84, 72, 93, 77, 91, 74, 65, 'blue_chip', 929.86),
  ('Shirahoshi', 95, 72, 50, 88, 97, 84, 45, 'growth', 922.39),
  ('Emporio Ivankov', 84, 70, 85, 81, 87, 82, 50, 'speculative', 890.72),
  ('Kozuki Momonosuke', 84, 68, 80, 79, 95, 82, 45, 'growth', 878.83),
  ('Benn Beckman', 78, 68, 94, 84, 85, 83, 45, 'growth', 876.47),
  ('Yamato', 77, 62, 93, 95, 84, 77, 65, 'speculative', 844.11),
  ('Hajrudin', 74, 84, 86, 74, 88, 72, 60, 'growth', 823.93),
  ('Donquixote Doflamingo', 82, 55, 92, 93, 80, 79, 55, 'speculative', 799.93),
  ('Marco', 79, 58, 92, 91, 72, 82, 40, 'blue_chip', 743.94),
  ('Charlotte Katakuri', 77, 48, 93, 97, 80, 78, 60, 'blue_chip', 718.40),
  ('Sengoku', 82, 50, 94, 86, 70, 87, 30, 'blue_chip', 701.23),
  ('Jaguar D. Saul', 79, 76, 74, 84, 70, 72, 40, 'meme', 688.16),
  ('Aramaki (Ryokugyu)', 78, 62, 95, 67, 82, 67, 60, 'speculative', 646.91),
  ('Portgas D. Ace', 86, 45, 93, 98, 45, 92, 30, 'blue_chip', 643.44),
  ('Rob Lucci', 77, 60, 92, 83, 68, 73, 50, 'growth', 639.99),
  ('Eustass Kid', 80, 48, 93, 85, 84, 57, 80, 'speculative', 626.38),
  ('Smoker', 74, 50, 80, 86, 86, 72, 65, 'speculative', 590.42),
  ('Kozuki Oden', 86, 45, 97, 93, 35, 89, 30, 'blue_chip', 579.41),
  ('Edward Newgate (Whitebeard)', 89, 40, 100, 91, 30, 88, 20, 'speculative', 550.57),
  ('Kaido', 88, 34, 100, 92, 38, 80, 35, 'meme', 524.57),
  ('Charlotte Linlin', 86, 30, 99, 89, 42, 74, 45, 'blue_chip', 473.64),
  ('Enel', 75, 24, 86, 83, 91, 62, 80, 'speculative', 457.37),
  ('Urouge', 68, 42, 84, 70, 83, 56, 75, 'growth', 406.36),
  ('Helmeppo', 60, 55, 77, 68, 78, 68, 60, 'meme', 399.86),
  ('King', 66, 30, 95, 83, 58, 63, 65, 'speculative', 358.14),
  ('Carrot', 66, 42, 68, 74, 72, 62, 65, 'speculative', 339.40),
  ('Killer', 61, 28, 89, 81, 68, 54, 65, 'speculative', 317.34),
  ('Bepo', 56, 42, 74, 82, 58, 58, 75, 'meme', 290.41),
  ('Queen', 60, 26, 88, 65, 28, 52, 70, 'speculative', 191.47),
  ('Jaygarcia Saturn', 78, 18, 94, 57, 5, 20, 75, 'meme', 154.01),
  ('Don Krieg', 32, 18, 40, 50, 28, 32, 85, 'meme', 65.17),
  ('Gaimon', 24, 8, 14, 62, 15, 28, 95, 'meme', 41.38);

DO $guard$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM _existing_market_catalog) <> 68 THEN
    RAISE EXCEPTION 'Existing catalog definition must contain exactly 68 rows';
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.characters AS c
    JOIN _existing_market_catalog AS e ON e.name = c.name
  ) <> 68 THEN
    RAISE EXCEPTION 'Existing market characters do not exactly match the approved 68-character catalog';
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.character_pricing_ratings AS r
    JOIN public.characters AS c ON c.id = r.character_id
    JOIN _existing_market_catalog AS e ON e.name = c.name
  ) <> 68 THEN
    RAISE EXCEPTION 'All 68 existing characters require stored pricing inputs before rerating';
  END IF;
END;
$guard$;

CREATE TEMP TABLE _existing_reprice ON COMMIT DROP AS
SELECT
  c.id AS character_id,
  e.*,
  r.comparable_adjustment,
  r.uncertainty_discount_pct,
  r.launch_catalyst_pct,
  calculated.applied_price
FROM _existing_market_catalog AS e
JOIN public.characters AS c ON c.name = e.name
JOIN public.character_pricing_ratings AS r ON r.character_id = c.id
CROSS JOIN LATERAL public.calculate_market_price_v1_2(
  e.narrative_importance,
  e.current_relevance,
  e.strength_status,
  e.popularity,
  e.future_potential,
  e.investor_confidence,
  e.volatility,
  r.comparable_adjustment,
  r.uncertainty_discount_pct,
  r.launch_catalyst_pct,
  '1.2.0'
) AS calculated;

DO $guard$
DECLARE
  v_mismatches text;
BEGIN
  SELECT pg_catalog.string_agg(
    name || ': expected ' || expected_price || ', calculated ' || applied_price,
    '; ' ORDER BY name
  )
  INTO v_mismatches
  FROM _existing_reprice
  WHERE applied_price <> expected_price;

  IF v_mismatches IS NOT NULL THEN
    RAISE EXCEPTION 'Preserved pricing inputs do not reproduce approved prices: %', v_mismatches;
  END IF;
END;
$guard$;

UPDATE public.character_pricing_ratings AS r
SET narrative_importance = e.narrative_importance,
    current_relevance = e.current_relevance,
    strength_status = e.strength_status,
    popularity = e.popularity,
    future_potential = e.future_potential,
    investor_confidence = e.investor_confidence,
    volatility = e.volatility,
    stock_category = e.stock_category,
    pricing_algorithm_version = '1.2.0',
    ratings_status = 'approved',
    updated_at = pg_catalog.now(),
    updated_by = a.user_id,
    approved_at = pg_catalog.now(),
    approved_by = a.user_id
FROM _existing_reprice AS e
CROSS JOIN _catalog_admin AS a
WHERE r.character_id = e.character_id;

UPDATE public.characters AS c
SET previous_price = e.expected_price,
    current_price = e.expected_price,
    category = e.stock_category,
    momentum = 0
FROM _existing_reprice AS e
WHERE c.id = e.character_id;

INSERT INTO public.price_history (character_id, price, note, pct_change, source)
SELECT
  e.character_id,
  e.expected_price,
  'Market Pricing V1.2 launch baseline',
  0,
  'pricing_rebase'
FROM _existing_reprice AS e;

CREATE TEMP TABLE _new_market_catalog (
  slug text PRIMARY KEY,
  name text UNIQUE NOT NULL,
  crew text,
  role text,
  description text,
  narrative_importance integer NOT NULL,
  current_relevance integer NOT NULL,
  strength_status integer NOT NULL,
  popularity integer NOT NULL,
  future_potential integer NOT NULL,
  investor_confidence integer NOT NULL,
  volatility integer NOT NULL,
  stock_category public.stock_category NOT NULL,
  uncertainty_discount_pct numeric(5,2) NOT NULL,
  expected_price numeric(12,2) NOT NULL,
  display_order integer UNIQUE NOT NULL
) ON COMMIT DROP;

INSERT INTO _new_market_catalog VALUES
  ('joy-boy', 'Joy Boy', 'Ancient Kingdom', 'Historical Liberator', 'An ancient figure whose legacy is inseparable from the Void Century, liberation, and the final meaning of the world.', 100, 73, 100, 88, 97, 91, 35, 'blue_chip', 5, 1549.49, 69),
  ('rocks-d-xebec', 'Rocks D. Xebec', 'Rocks Pirates', 'Captain', 'A legendary rival from the previous era whose ambitions and unresolved history connect directly to the endgame.', 99, 96, 100, 96, 82, 91, 40, 'blue_chip', 5, 1850.23, 70),
  ('saint-figarland-shamrock', 'Saint Figarland Shamrock', 'Holy Knights', 'Commander', 'A leading Holy Knight positioned at the center of the World Government conflict and the current final-saga power structure.', 97, 90, 97, 85, 98, 85, 60, 'growth', 10, 1574.19, 71),
  ('king-harald', 'King Harald', 'Elbaf', 'Former King', 'A defining ruler in Elbaf history whose legacy shapes the giants, their politics, and the active arc.', 94, 94, 99, 82, 72, 88, 40, 'blue_chip', 5, 1361.96, 72),
  ('manmayer-gunko', 'Manmayer Gunko', 'Holy Knights', 'Holy Knight', 'A highly active Holy Knight with major immediate relevance, strong implied power, and substantial unresolved upside.', 92, 96, 94, 82, 95, 75, 75, 'growth', 15, 1306.79, 73),
  ('topman-warcury', 'Topman Warcury', 'Five Elders', 'Warrior God of Justice', 'A top World Government authority with extreme combat implications and direct final-saga importance.', 94, 70, 98, 72, 91, 84, 55, 'blue_chip', 10, 1040.65, 74),
  ('shiki', 'Shiki', 'Golden Lion Pirates', 'Captain', 'A legendary pirate with world-class historical strength and meaningful but uncertain potential for renewed relevance.', 87, 74, 98, 84, 78, 82, 65, 'speculative', 10, 970.41, 75),
  ('marcus-mars', 'Marcus Mars', 'Five Elders', 'Warrior God of Environment', 'A Five Elder with major authority, immense implied power, and high endgame potential despite limited individual development.', 91, 68, 97, 66, 90, 80, 60, 'speculative', 15, 847.78, 76),
  ('dorry', 'Dorry', 'Giant Warrior Pirates', 'Co-Captain', 'A legendary giant captain whose renewed activity and Elbaf importance support a stable premium valuation.', 80, 88, 91, 84, 77, 88, 40, 'blue_chip', 5, 1049.40, 77),
  ('brogy', 'Brogy', 'Giant Warrior Pirates', 'Co-Captain', 'A legendary giant captain with current relevance, elite reliability, and direct ties to Elbaf and the Straw Hats.', 80, 88, 91, 83, 77, 88, 40, 'blue_chip', 5, 1040.98, 78),
  ('van-augur', 'Van Augur', 'Blackbeard Pirates', 'Sniper', 'A dangerous Blackbeard commander with strong current positioning and major endgame matchup potential.', 85, 73, 89, 82, 91, 82, 60, 'growth', 10, 949.77, 79),
  ('shepherd-ju-peter', 'Shepherd Ju Peter', 'Five Elders', 'Warrior God of Agriculture', 'A Five Elder with enormous implied strength and future importance, balanced by uncertainty around his individual role.', 89, 66, 96, 62, 89, 78, 65, 'speculative', 15, 761.37, 80),
  ('jesus-burgess', 'Jesus Burgess', 'Blackbeard Pirates', 'Helmsman', 'A core Blackbeard commander with significant strength, active positioning, and a likely endgame confrontation.', 83, 70, 89, 70, 85, 78, 60, 'growth', 10, 757.83, 81),
  ('charlotte-pudding', 'Charlotte Pudding', 'Big Mom Pirates', 'Chocolatier', 'A character with rare historical utility, strong emotional ties, and major unresolved value in the final race.', 83, 55, 62, 82, 91, 84, 55, 'growth', 10, 619.49, 82),
  ('saint-shepherd-sommers', 'Saint Shepherd Sommers', 'Holy Knights', 'Holy Knight', 'An active Holy Knight with high present relevance and implied strength, but considerable outcome uncertainty.', 80, 88, 91, 62, 80, 62, 80, 'speculative', 20, 659.30, 83),
  ('laffitte', 'Laffitte', 'Blackbeard Pirates', 'Navigator', 'A mysterious Blackbeard officer with strategic value and substantial future upside, tempered by limited exposure.', 86, 58, 86, 75, 91, 72, 75, 'speculative', 15, 676.45, 84),
  ('nefertari-d-lili', 'Nefertari D. Lili', 'Alabasta Kingdom', 'Historical Queen', 'A foundational historical figure whose choices connect the Nefertari family directly to the Void Century.', 99, 60, 35, 70, 98, 84, 55, 'growth', 15, 591.39, 85),
  ('saint-rimoshifu-killingham', 'Saint Rimoshifu Killingham', 'Holy Knights', 'Holy Knight', 'An active Holy Knight with strong immediate positioning and high uncertainty around power, motives, and longevity.', 79, 84, 90, 60, 82, 60, 80, 'speculative', 20, 611.50, 86),
  ('donquixote-rosinante', 'Donquixote Rosinante (Corazon)', 'Marines', 'Undercover Officer', 'A beloved historical character whose sacrifice remains central to Law and one of the story''s strongest emotional legacies.', 78, 35, 68, 98, 45, 92, 25, 'blue_chip', 5, 424.22, 87),
  ('catarina-devon', 'Catarina Devon', 'Blackbeard Pirates', 'Titanic Captain', 'A dangerous Blackbeard commander whose abilities create major infiltration risk and endgame speculation.', 82, 69, 88, 68, 88, 76, 70, 'speculative', 15, 691.15, 88),
  ('magellan', 'Magellan', 'Impel Down', 'Vice Warden', 'An exceptionally powerful institutional defender with strong recognition but uncertain final-saga involvement.', 76, 43, 92, 80, 74, 88, 35, 'speculative', 10, 553.36, 89),
  ('stussy', 'Stussy', 'Cipher Pol', 'Intelligence Agent', 'A deeply connected intelligence figure with uncertain loyalties and meaningful Egghead-era consequences.', 82, 60, 82, 70, 84, 68, 75, 'speculative', 15, 563.46, 90),
  ('vinsmoke-reiju', 'Vinsmoke Reiju', 'Germa 66', 'Officer', 'A capable and popular Germa officer whose future alliance value provides steady upside.', 76, 45, 76, 79, 78, 86, 45, 'growth', 10, 503.68, 91),
  ('bentham-bon-clay', 'Bentham (Bon Clay)', 'Newkama Land', 'Ally', 'An exceptionally popular ally with a history of decisive sacrifices and enduring return potential.', 78, 45, 72, 96, 80, 90, 50, 'meme', 5, 629.75, 92),
  ('gecko-moria', 'Gecko Moria', 'Thriller Bark Pirates', 'Captain', 'A former Warlord with major historical connections and renewed uncertainty around his role in the pirate conflict.', 78, 50, 84, 84, 79, 72, 70, 'speculative', 15, 535.41, 93),
  ('cavendish', 'Cavendish', 'Beautiful Pirates', 'Captain', 'A popular Grand Fleet captain with strong combat utility and meaningful upside if the fleet returns.', 70, 35, 78, 91, 70, 80, 65, 'growth', 10, 424.08, 94),
  ('x-drake', 'X Drake', 'SWORD', 'Marine Captain', 'A powerful undercover Marine whose allegiance and unresolved status create a volatile future asset.', 78, 49, 84, 72, 83, 70, 75, 'speculative', 15, 491.29, 95),
  ('bartolomeo', 'Bartolomeo', 'Barto Club', 'Captain', 'A fiercely popular Grand Fleet member whose loyalty and unpredictable actions drive high-risk upside.', 73, 47, 75, 86, 82, 77, 80, 'meme', 15, 482.13, 96),
  ('perona', 'Perona', 'Independent', 'Ghost Princess', 'A fan-favorite with unusual abilities, strong demand, and useful ties to Mihawk and Moria.', 70, 38, 69, 96, 75, 84, 50, 'meme', 5, 476.19, 97),
  ('yasopp', 'Yasopp', 'Red Hair Pirates', 'Sniper', 'An elite Red Hair officer with a major personal connection to Usopp and strong endgame matchup potential.', 82, 57, 91, 73, 88, 81, 60, 'growth', 10, 704.79, 98),
  ('caesar-clown', 'Caesar Clown', 'Independent', 'Scientist', 'A volatile scientist with recurring utility, broad recognition, and unreliable but persistent comeback potential.', 68, 38, 73, 78, 66, 72, 85, 'meme', 15, 323.04, 99),
  ('karasu', 'Karasu', 'Revolutionary Army', 'Northern Commander', 'A senior Revolutionary commander with strong current positioning and substantial final-conflict upside.', 83, 68, 86, 65, 90, 80, 60, 'growth', 10, 731.81, 100),
  ('big-news-morgans', 'Big News Morgans', 'World Economy News Paper', 'President', 'The world''s dominant information broker can shape public perception and has unusually strong final-saga utility.', 86, 62, 50, 77, 90, 85, 60, 'growth', 10, 604.68, 101),
  ('vegapunk-lilith', 'Vegapunk Lilith', 'Vegapunk Satellites', 'Scientist', 'A highly capable Vegapunk satellite with current scientific relevance and meaningful long-term potential.', 82, 85, 65, 80, 92, 86, 60, 'growth', 10, 866.83, 102),
  ('zunesha', 'Zunesha', 'Independent', 'Ancient Elephant', 'An ancient world-scale figure connected to Joy Boy, the Minks, and unresolved historical commands.', 96, 42, 98, 75, 90, 75, 70, 'speculative', 15, 723.47, 103),
  ('s-hawk', 'S-Hawk', 'Seraphim', 'Living Weapon', 'A powerful Seraphim modeled after Mihawk with enormous combat upside and uncertain independence.', 75, 45, 92, 72, 88, 75, 70, 'speculative', 15, 515.64, 104),
  ('lucky-roux', 'Lucky Roux', 'Red Hair Pirates', 'Combatant', 'A trusted Red Hair officer with elite implied capability and reliable endgame positioning.', 78, 48, 91, 70, 84, 78, 60, 'growth', 10, 563.87, 105),
  ('avalo-pizarro', 'Avalo Pizarro', 'Blackbeard Pirates', 'Titanic Captain', 'A Blackbeard commander with dangerous large-scale abilities and a likely role in the endgame conflict.', 82, 60, 91, 62, 88, 78, 70, 'speculative', 15, 619.04, 106),
  ('doc-q', 'Doc Q', 'Blackbeard Pirates', 'Doctor', 'A Blackbeard commander with unpredictable disease powers and strong future matchup potential.', 80, 55, 84, 64, 87, 76, 75, 'speculative', 15, 538.30, 107),
  ('wapol', 'Wapol', 'Black Drum Kingdom', 'King', 'An unlikely political and information asset whose survival and knowledge create volatile narrative upside.', 80, 52, 35, 65, 82, 74, 80, 'meme', 15, 336.33, 108),
  ('koala', 'Koala', 'Revolutionary Army', 'Officer', 'A popular Revolutionary officer with personal history, organizational value, and steady final-saga upside.', 74, 48, 70, 82, 80, 80, 55, 'growth', 10, 486.39, 109),
  ('kaku', 'Kaku', 'Cipher Pol', 'Agent', 'A recognizable Cipher Pol fighter whose evolving loyalties and combat value preserve meaningful upside.', 72, 55, 83, 75, 72, 80, 55, 'growth', 10, 502.33, 110),
  ('tashigi', 'Tashigi', 'Marines', 'Officer', 'A principled Marine with long-running ties to the Straw Hats and unresolved institutional growth potential.', 72, 38, 67, 77, 82, 76, 60, 'growth', 10, 396.53, 111),
  ('ulti', 'Ulti', 'Beasts Pirates', 'Tobiroppo', 'A highly recognizable and volatile fighter whose popularity sustains value beyond current relevance.', 58, 25, 86, 80, 60, 78, 75, 'meme', 15, 272.72, 112);

DO $guard$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM _new_market_catalog) <> 44 THEN
    RAISE EXCEPTION 'New catalog definition must contain exactly 44 rows';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.characters AS c
    JOIN _new_market_catalog AS n ON n.slug = c.slug
  ) THEN
    RAISE EXCEPTION 'One or more approved new-character slugs already exist';
  END IF;
END;
$guard$;

CREATE TEMP TABLE _new_market_prices ON COMMIT DROP AS
SELECT n.*, calculated.applied_price
FROM _new_market_catalog AS n
CROSS JOIN LATERAL public.calculate_market_price_v1_2(
  n.narrative_importance,
  n.current_relevance,
  n.strength_status,
  n.popularity,
  n.future_potential,
  n.investor_confidence,
  n.volatility,
  1,
  n.uncertainty_discount_pct,
  0,
  '1.2.0'
) AS calculated;

DO $guard$
DECLARE
  v_mismatches text;
BEGIN
  SELECT pg_catalog.string_agg(
    name || ': expected ' || expected_price || ', calculated ' || applied_price,
    '; ' ORDER BY name
  )
  INTO v_mismatches
  FROM _new_market_prices
  WHERE applied_price <> expected_price;

  IF v_mismatches IS NOT NULL THEN
    RAISE EXCEPTION 'New-character rubric prices do not match approved prices: %', v_mismatches;
  END IF;
END;
$guard$;

INSERT INTO public.characters (
  slug, name, crew, role, bounty, image_url, description,
  current_price, previous_price, category, momentum, display_order, is_listed
)
SELECT
  n.slug, n.name, n.crew, n.role, NULL::bigint, NULL::text, n.description,
  n.expected_price, n.expected_price, n.stock_category, 0, n.display_order, true
FROM _new_market_prices AS n;

INSERT INTO public.character_pricing_ratings (
  character_id, narrative_importance, current_relevance, strength_status,
  popularity, future_potential, investor_confidence, volatility, stock_category,
  comparable_adjustment, uncertainty_discount_pct, launch_catalyst_pct,
  pricing_algorithm_version, ratings_status, created_by, updated_by,
  approved_at, approved_by
)
SELECT
  c.id, n.narrative_importance, n.current_relevance, n.strength_status,
  n.popularity, n.future_potential, n.investor_confidence, n.volatility,
  n.stock_category, 1, n.uncertainty_discount_pct, 0,
  '1.2.0', 'approved', a.user_id, a.user_id, pg_catalog.now(), a.user_id
FROM _new_market_prices AS n
JOIN public.characters AS c ON c.slug = n.slug
CROSS JOIN _catalog_admin AS a;

INSERT INTO public.price_history (character_id, price, note, pct_change, source)
SELECT
  c.id,
  n.expected_price,
  'Initial public offering using Market Pricing algorithm 1.2.0',
  0,
  'ipo'
FROM _new_market_prices AS n
JOIN public.characters AS c ON c.slug = n.slug;

DO $guard$
DECLARE
  v_total integer;
  v_blue_chip integer;
  v_growth integer;
  v_speculative integer;
  v_meme integer;
BEGIN
  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (WHERE category = 'blue_chip')::integer,
    pg_catalog.count(*) FILTER (WHERE category = 'growth')::integer,
    pg_catalog.count(*) FILTER (WHERE category = 'speculative')::integer,
    pg_catalog.count(*) FILTER (WHERE category = 'meme')::integer
  INTO v_total, v_blue_chip, v_growth, v_speculative, v_meme
  FROM public.characters
  WHERE is_listed;

  IF (v_total, v_blue_chip, v_growth, v_speculative, v_meme)
    IS DISTINCT FROM (112, 40, 28, 30, 14) THEN
    RAISE EXCEPTION
      'Final catalog totals are invalid: total %, blue_chip %, growth %, speculative %, meme %',
      v_total, v_blue_chip, v_growth, v_speculative, v_meme;
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.character_pricing_ratings AS r
    JOIN public.characters AS c ON c.id = r.character_id
    WHERE c.is_listed
      AND r.ratings_status = 'approved'
      AND r.pricing_algorithm_version = '1.2.0'
  ) <> 112 THEN
    RAISE EXCEPTION 'Every listed character must have approved Market Pricing V1.2 ratings';
  END IF;
END;
$guard$;

NOTIFY pgrst, 'reload schema';

COMMIT;
