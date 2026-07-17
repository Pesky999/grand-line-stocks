BEGIN;

CREATE OR REPLACE FUNCTION public.admin_bulk_import_daily_crew_builder_templates(
  _templates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_template_count integer;
  v_item jsonb;
  v_item_index integer;
  v_slug text;
  v_conflict_slug text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_error_message text;
  v_error_state text;
BEGIN
  IF _templates IS NULL OR jsonb_typeof(_templates) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder bulk template import requires a JSON array';
  END IF;

  v_template_count := jsonb_array_length(_templates);

  IF v_template_count < 1 OR v_template_count > 50 THEN
    RAISE EXCEPTION 'Daily Crew Builder bulk template import requires 1 to 50 templates';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_templates) AS entries(value)
    WHERE jsonb_typeof(entries.value) <> 'object'
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder bulk template import entries must be JSON objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_templates) AS entries(value)
    WHERE entries.value->>'slug' IS NULL
       OR btrim(entries.value->>'slug') = ''
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder bulk template import entries require nonblank slugs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_templates) AS entries(value)
    WHERE entries.value ?| ARRAY[
      'templateId',
      'missionId',
      'missionDate',
      'revealAt',
      'status',
      'targetStatus',
      'sourceTemplateId',
      'sourceTemplateRevision',
      'sourceRotationPlanId',
      'rotationPlanId',
      'slots'
    ]
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder bulk template import is create-only and cannot include template, mission, status, reveal timestamp, or rotation fields';
  END IF;

  SELECT normalized.slug
    INTO v_conflict_slug
  FROM (
    SELECT lower(btrim(entries.value->>'slug')) AS slug
    FROM jsonb_array_elements(_templates) AS entries(value)
  ) AS normalized
  GROUP BY normalized.slug
  HAVING count(*) > 1
  LIMIT 1;

  IF v_conflict_slug IS NOT NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder bulk template slug repeats inside the batch: %', v_conflict_slug
      USING ERRCODE = '23505';
  END IF;

  SELECT normalized.slug
    INTO v_conflict_slug
  FROM (
    SELECT lower(btrim(entries.value->>'slug')) AS slug
    FROM jsonb_array_elements(_templates) AS entries(value)
  ) AS normalized
  JOIN public.daily_crew_mission_templates AS existing
    ON lower(btrim(existing.slug)) = normalized.slug
  LIMIT 1;

  IF v_conflict_slug IS NOT NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder template slug already exists: %', v_conflict_slug
      USING ERRCODE = '23505';
  END IF;

  FOR v_item, v_item_index IN
    SELECT entries.value, entries.ordinality::integer
    FROM jsonb_array_elements(_templates) WITH ORDINALITY AS entries(value, ordinality)
    ORDER BY entries.ordinality
  LOOP
    v_slug := lower(btrim(v_item->>'slug'));

    BEGIN
      SELECT public.admin_save_daily_crew_builder_template(
        _template_id := NULL,
        _slug := v_slug,
        _title := v_item->>'title',
        _brief := v_item->>'brief',
        _mission_tags := COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_item->'missionTags')),
          ARRAY[]::text[]
        ),
        _reveal_policy := (v_item->>'revealPolicy')::public.daily_crew_reveal_policy,
        _is_active := TRUE,
        _pool := v_item->'pool',
        _jobs := v_item->'jobs',
        _scores := v_item->'scores',
        _perfect_solution := v_item->'perfectSolution'
      )
      INTO v_result;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_error_message = MESSAGE_TEXT,
        v_error_state = RETURNED_SQLSTATE;

      RAISE EXCEPTION 'Daily Crew Builder bulk template import failed at item % (%): %',
        v_item_index,
        COALESCE(v_slug, 'unknown slug'),
        v_error_message
        USING ERRCODE = v_error_state;
    END;

    IF (v_result->>'isActive')::boolean IS DISTINCT FROM TRUE
       OR (v_result->>'ready')::boolean IS DISTINCT FROM TRUE
       OR (v_result->>'revision')::integer <> 1
       OR (v_result->>'instanceCount')::integer <> 0 THEN
      RAISE EXCEPTION 'Daily Crew Builder bulk template import returned an invalid result at item % (%)',
        v_item_index,
        v_slug;
    END IF;

    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  IF jsonb_array_length(v_results) <> v_template_count THEN
    RAISE EXCEPTION 'Daily Crew Builder bulk template import returned an unexpected result count';
  END IF;

  RETURN jsonb_build_object(
    'importedCount', v_template_count,
    'templates', v_results
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_bulk_import_daily_crew_builder_templates(jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_bulk_import_daily_crew_builder_templates(jsonb)
TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
