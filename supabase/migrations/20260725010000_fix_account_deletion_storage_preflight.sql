BEGIN;

CREATE OR REPLACE FUNCTION public.my_account_owns_storage_objects()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM storage.objects
      WHERE storage.objects.owner_id = auth.uid()::text
    )
  END
$$;

COMMENT ON FUNCTION public.my_account_owns_storage_objects()
  IS 'Read-only ownership existence check for authenticated self-service account deletion. Returns only whether auth.uid() owns storage.objects rows.';

REVOKE EXECUTE ON FUNCTION public.my_account_owns_storage_objects() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_account_owns_storage_objects() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_account_owns_storage_objects() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
