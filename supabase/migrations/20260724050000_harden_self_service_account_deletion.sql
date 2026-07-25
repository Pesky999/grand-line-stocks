BEGIN;

-- Self-service account deletion relies on a hard Auth user deletion as the
-- authoritative operation. This migration hardens only constraints: owned data
-- cascades, while shared administrative/editorial audit references are
-- anonymized with SET NULL. It intentionally performs no player-data updates,
-- deletes, backfills, or tombstone inserts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.legacy_records AS lr
    WHERE lr.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users AS au WHERE au.id = lr.user_id
      )
  ) THEN
    RAISE EXCEPTION 'Cannot harden legacy_records.user_id: orphan user references exist';
  END IF;
END $$;

ALTER TABLE public.legacy_records
  DROP CONSTRAINT IF EXISTS legacy_records_user_id_fkey;

ALTER TABLE public.legacy_records
  ADD CONSTRAINT legacy_records_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT legacy_records_user_id_fkey ON public.legacy_records
  IS 'Account-owned Legacy progress is removed when the owning Auth user is hard-deleted.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.identity_moderation_flags AS flags
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles AS profiles WHERE profiles.id = flags.profile_id
    )
  ) THEN
    RAISE EXCEPTION 'Cannot harden identity_moderation_flags.profile_id: orphan profile references exist';
  END IF;
END $$;

ALTER TABLE public.identity_moderation_flags
  DROP CONSTRAINT IF EXISTS identity_moderation_flags_profile_id_fkey;

ALTER TABLE public.identity_moderation_flags
  ADD CONSTRAINT identity_moderation_flags_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT identity_moderation_flags_profile_id_fkey
  ON public.identity_moderation_flags
  IS 'Profile-specific moderation flags are removed with the deleted profile.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.identity_moderation_actions AS actions
    WHERE actions.profile_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles AS profiles WHERE profiles.id = actions.profile_id
      )
  ) THEN
    RAISE EXCEPTION 'Cannot harden identity_moderation_actions.profile_id: orphan profile references exist';
  END IF;
END $$;

ALTER TABLE public.identity_moderation_actions
  DROP CONSTRAINT IF EXISTS identity_moderation_actions_profile_id_fkey;

ALTER TABLE public.identity_moderation_actions
  ADD CONSTRAINT identity_moderation_actions_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT identity_moderation_actions_profile_id_fkey
  ON public.identity_moderation_actions
  IS 'Moderation actions about a deleted profile are removed with that profile.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.character_pricing_ratings AS ratings
    WHERE ratings.created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users AS au WHERE au.id = ratings.created_by
      )
  ) THEN
    RAISE EXCEPTION 'Cannot harden character_pricing_ratings.created_by: orphan user references exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.character_pricing_ratings AS ratings
    WHERE ratings.updated_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users AS au WHERE au.id = ratings.updated_by
      )
  ) THEN
    RAISE EXCEPTION 'Cannot harden character_pricing_ratings.updated_by: orphan user references exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.character_pricing_ratings AS ratings
    WHERE ratings.approved_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users AS au WHERE au.id = ratings.approved_by
      )
  ) THEN
    RAISE EXCEPTION 'Cannot harden character_pricing_ratings.approved_by: orphan user references exist';
  END IF;
END $$;

ALTER TABLE public.character_pricing_ratings
  DROP CONSTRAINT IF EXISTS character_pricing_ratings_created_by_fkey;

ALTER TABLE public.character_pricing_ratings
  ADD CONSTRAINT character_pricing_ratings_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.character_pricing_ratings
  DROP CONSTRAINT IF EXISTS character_pricing_ratings_updated_by_fkey;

ALTER TABLE public.character_pricing_ratings
  ADD CONSTRAINT character_pricing_ratings_updated_by_fkey
  FOREIGN KEY (updated_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.character_pricing_ratings
  DROP CONSTRAINT IF EXISTS character_pricing_ratings_approved_by_fkey;

ALTER TABLE public.character_pricing_ratings
  ADD CONSTRAINT character_pricing_ratings_approved_by_fkey
  FOREIGN KEY (approved_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.character_pricing_ratings
  DROP CONSTRAINT IF EXISTS character_pricing_ratings_approval_metadata_check;

ALTER TABLE public.character_pricing_ratings
  ADD CONSTRAINT character_pricing_ratings_approval_metadata_check CHECK (
    (
      ratings_status = 'draft'
      AND approved_at IS NULL
      AND approved_by IS NULL
    )
    OR
    (
      ratings_status = 'approved'
      AND approved_at IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT character_pricing_ratings_created_by_fkey
  ON public.character_pricing_ratings
  IS 'Shared pricing drafts remain while deleted author references are anonymized.';

COMMENT ON CONSTRAINT character_pricing_ratings_updated_by_fkey
  ON public.character_pricing_ratings
  IS 'Shared pricing records remain while deleted editor references are anonymized.';

COMMENT ON CONSTRAINT character_pricing_ratings_approved_by_fkey
  ON public.character_pricing_ratings
  IS 'Shared approved pricing records remain while deleted approver references are anonymized.';

COMMENT ON CONSTRAINT character_pricing_ratings_approval_metadata_check
  ON public.character_pricing_ratings
  IS 'Approved pricing requires an approval timestamp; the approver reference may be null after account deletion anonymizes audit actors.';

COMMIT;
