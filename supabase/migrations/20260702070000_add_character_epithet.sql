BEGIN;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS epithet text NULL;

COMMIT;
