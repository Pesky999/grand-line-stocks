DROP POLICY IF EXISTS "Stats public read"
ON public.grand_line_guess_stats;

CREATE POLICY "Users can read own guess stats"
ON public.grand_line_guess_stats
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);
