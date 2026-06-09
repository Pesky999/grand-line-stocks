
-- characters
CREATE TABLE public.characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  crew TEXT,
  role TEXT,
  bounty BIGINT DEFAULT 0,
  image_url TEXT,
  description TEXT,
  current_price NUMERIC(12,2) NOT NULL DEFAULT 100,
  previous_price NUMERIC(12,2) NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.characters TO anon, authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Characters are publicly readable" ON public.characters FOR SELECT USING (true);

-- price history
CREATE TABLE public.price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX price_history_character_created_idx ON public.price_history(character_id, created_at DESC);
GRANT SELECT ON public.price_history TO anon, authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Price history is publicly readable" ON public.price_history FOR SELECT USING (true);

-- news
CREATE TABLE public.news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  impact TEXT NOT NULL DEFAULT 'neutral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX news_created_idx ON public.news(created_at DESC);
GRANT SELECT ON public.news TO anon, authenticated;
GRANT ALL ON public.news TO service_role;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "News is publicly readable" ON public.news FOR SELECT USING (true);

-- trivia
CREATE TABLE public.trivia_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  choices JSONB NOT NULL,
  answer_index INT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'easy',
  reward INT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trivia_questions TO anon, authenticated;
GRANT ALL ON public.trivia_questions TO service_role;
ALTER TABLE public.trivia_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trivia is publicly readable" ON public.trivia_questions FOR SELECT USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER characters_touch BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
