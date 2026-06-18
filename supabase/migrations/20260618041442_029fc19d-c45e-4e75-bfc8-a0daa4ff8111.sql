-- Grand Line Guess: character deduction game schema

CREATE TABLE public.grand_line_guess_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  gender text,
  affiliation text,
  affiliation_category text,
  devil_fruit_display text,
  devil_fruit_name text,
  has_devil_fruit boolean NOT NULL DEFAULT false,
  haki_raw text,
  has_armament boolean NOT NULL DEFAULT false,
  has_observation boolean NOT NULL DEFAULT false,
  has_conquerors boolean NOT NULL DEFAULT false,
  bounty_display text,
  bounty_numeric bigint,
  bounty_unknown boolean NOT NULL DEFAULT false,
  bounty_is_minimum boolean NOT NULL DEFAULT false,
  height_cm integer,
  height_unknown boolean NOT NULL DEFAULT false,
  first_arc text,
  first_arc_order integer,
  active boolean NOT NULL DEFAULT true,
  daily_eligible boolean NOT NULL DEFAULT true,
  practice_eligible boolean NOT NULL DEFAULT true,
  data_quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grand_line_guess_characters TO anon, authenticated;
GRANT ALL ON public.grand_line_guess_characters TO service_role;
ALTER TABLE public.grand_line_guess_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Characters public read" ON public.grand_line_guess_characters FOR SELECT USING (active = true);

CREATE TABLE public.grand_line_guess_daily_puzzles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_date date NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.grand_line_guess_characters(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, puzzle_date)
);
GRANT SELECT ON public.grand_line_guess_daily_puzzles TO authenticated;
GRANT ALL ON public.grand_line_guess_daily_puzzles TO service_role;
ALTER TABLE public.grand_line_guess_daily_puzzles ENABLE ROW LEVEL SECURITY;
-- Owner sees their own puzzle ONLY after solved/expired so character_id is never leaked during play.
CREATE POLICY "Puzzles owner read solved only" ON public.grand_line_guess_daily_puzzles FOR SELECT USING (auth.uid() = user_id AND status IN ('solved','expired'));

CREATE TABLE public.grand_line_guess_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id uuid NOT NULL REFERENCES public.grand_line_guess_daily_puzzles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guessed_character_id uuid NOT NULL REFERENCES public.grand_line_guess_characters(id),
  attempt_number integer NOT NULL,
  feedback jsonb NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(puzzle_id, user_id, guessed_character_id),
  UNIQUE(puzzle_id, user_id, attempt_number)
);
GRANT SELECT ON public.grand_line_guess_attempts TO authenticated;
GRANT ALL ON public.grand_line_guess_attempts TO service_role;
ALTER TABLE public.grand_line_guess_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Attempts owner read" ON public.grand_line_guess_attempts FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.grand_line_guess_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id uuid NOT NULL REFERENCES public.grand_line_guess_daily_puzzles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solved boolean NOT NULL DEFAULT false,
  attempts_used integer NOT NULL DEFAULT 0,
  hints_used integer NOT NULL DEFAULT 0,
  reward_paid boolean NOT NULL DEFAULT false,
  reward_amount integer NOT NULL DEFAULT 0,
  solved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(puzzle_id, user_id)
);
GRANT SELECT ON public.grand_line_guess_results TO authenticated;
GRANT ALL ON public.grand_line_guess_results TO service_role;
ALTER TABLE public.grand_line_guess_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Results owner read" ON public.grand_line_guess_results FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.grand_line_guess_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  games_played integer NOT NULL DEFAULT 0,
  games_won integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  average_attempts numeric NOT NULL DEFAULT 0,
  one_shot_wins integer NOT NULL DEFAULT 0,
  total_rewards_earned integer NOT NULL DEFAULT 0,
  last_played_date date,
  last_win_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grand_line_guess_stats TO authenticated;
GRANT ALL ON public.grand_line_guess_stats TO service_role;
ALTER TABLE public.grand_line_guess_stats ENABLE ROW LEVEL SECURITY;
-- Stats are public-safe (no PII): used to render public profile cards.
CREATE POLICY "Stats public read" ON public.grand_line_guess_stats FOR SELECT USING (true);
