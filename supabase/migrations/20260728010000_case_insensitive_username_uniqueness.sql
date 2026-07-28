BEGIN;

-- Preserve each stored username's casing while preventing case-only duplicates.
-- If conflicting usernames already exist, PostgreSQL rejects this migration
-- instead of renaming or deleting any account.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique_idx
  ON public.profiles (lower(username));

COMMIT;
