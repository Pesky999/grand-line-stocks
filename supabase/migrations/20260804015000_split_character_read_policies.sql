BEGIN;

DROP POLICY IF EXISTS "Listed characters are publicly readable" ON public.characters;
DROP POLICY IF EXISTS "Administrators can read character drafts" ON public.characters;

CREATE POLICY "Listed characters are publicly readable"
  ON public.characters
  FOR SELECT
  TO anon, authenticated
  USING (is_listed);

CREATE POLICY "Administrators can read character drafts"
  ON public.characters
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

NOTIFY pgrst, 'reload schema';

COMMIT;
