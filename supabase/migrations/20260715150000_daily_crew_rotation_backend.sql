BEGIN;

CREATE TABLE public.daily_crew_rotation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_crew_rotation_plans_name_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT daily_crew_rotation_plans_revision_check
    CHECK (revision > 0)
);

CREATE TABLE public.daily_crew_rotation_plan_slots (
  plan_id uuid NOT NULL REFERENCES public.daily_crew_rotation_plans(id) ON DELETE CASCADE,
  slot_number integer NOT NULL,
  template_id uuid NOT NULL REFERENCES public.daily_crew_mission_templates(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, slot_number),
  CONSTRAINT daily_crew_rotation_plan_slots_slot_number_check
    CHECK (slot_number BETWEEN 1 AND 30)
);

CREATE INDEX idx_daily_crew_rotation_plan_slots_template
  ON public.daily_crew_rotation_plan_slots (template_id, plan_id);

CREATE INDEX idx_daily_crew_rotation_plan_slots_plan_order
  ON public.daily_crew_rotation_plan_slots (plan_id, slot_number);

CREATE TRIGGER daily_crew_rotation_plans_touch
  BEFORE UPDATE ON public.daily_crew_rotation_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.daily_crew_missions
  ADD COLUMN source_rotation_plan_id uuid,
  ADD COLUMN source_rotation_plan_revision integer,
  ADD COLUMN source_rotation_slot integer,
  ADD CONSTRAINT daily_crew_missions_source_rotation_plan_fkey
    FOREIGN KEY (source_rotation_plan_id)
    REFERENCES public.daily_crew_rotation_plans(id),
  ADD CONSTRAINT daily_crew_missions_source_rotation_all_or_null_check
    CHECK (
      (
        source_rotation_plan_id IS NULL
        AND source_rotation_plan_revision IS NULL
        AND source_rotation_slot IS NULL
      )
      OR (
        source_rotation_plan_id IS NOT NULL
        AND source_rotation_plan_revision IS NOT NULL
        AND source_rotation_slot IS NOT NULL
      )
    ),
  ADD CONSTRAINT daily_crew_missions_source_rotation_revision_check
    CHECK (
      source_rotation_plan_revision IS NULL
      OR source_rotation_plan_revision > 0
    ),
  ADD CONSTRAINT daily_crew_missions_source_rotation_slot_check
    CHECK (
      source_rotation_slot IS NULL
      OR source_rotation_slot BETWEEN 1 AND 30
    );

CREATE INDEX idx_daily_crew_missions_source_rotation_date
  ON public.daily_crew_missions (source_rotation_plan_id, mission_date DESC)
  WHERE source_rotation_plan_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.clear_daily_crew_mission_rotation_source_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  UPDATE public.daily_crew_missions
  SET
    source_rotation_plan_id = NULL,
    source_rotation_plan_revision = NULL,
    source_rotation_slot = NULL
  WHERE source_rotation_plan_id = OLD.id;

  RETURN OLD;
END;
$function$;

CREATE TRIGGER daily_crew_rotation_source_delete
  BEFORE DELETE ON public.daily_crew_rotation_plans
  FOR EACH ROW EXECUTE FUNCTION public.clear_daily_crew_mission_rotation_source_on_delete();

CREATE OR REPLACE FUNCTION public.validate_daily_crew_rotation_plan(_plan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_plan_exists boolean;
  v_slot_count integer;
  v_slot_number_count integer;
  v_min_slot_number integer;
  v_max_slot_number integer;
  v_missing_template_count integer;
  v_inactive_template_count integer;
  v_unready_template_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.daily_crew_rotation_plans
    WHERE id = _plan_id
  )
    INTO v_plan_exists;

  SELECT
    count(*),
    count(DISTINCT slot_number),
    min(slot_number),
    max(slot_number)
    INTO
      v_slot_count,
      v_slot_number_count,
      v_min_slot_number,
      v_max_slot_number
  FROM public.daily_crew_rotation_plan_slots
  WHERE plan_id = _plan_id;

  SELECT
    count(*) FILTER (WHERE templates.id IS NULL),
    count(*) FILTER (WHERE templates.id IS NOT NULL AND NOT templates.is_active),
    count(*) FILTER (
      WHERE templates.id IS NOT NULL
        AND NOT public.validate_daily_crew_template(templates.id)
    )
    INTO
      v_missing_template_count,
      v_inactive_template_count,
      v_unready_template_count
  FROM public.daily_crew_rotation_plan_slots AS slots
  LEFT JOIN public.daily_crew_mission_templates AS templates
    ON templates.id = slots.template_id
  WHERE slots.plan_id = _plan_id;

  RETURN
    v_plan_exists
    AND v_slot_count = 30
    AND v_slot_number_count = 30
    AND v_min_slot_number = 1
    AND v_max_slot_number = 30
    AND v_missing_template_count = 0
    AND v_inactive_template_count = 0
    AND v_unready_template_count = 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_daily_crew_rotation_plan(
  _plan_id uuid,
  _name text,
  _slots jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_plan_id uuid;
  v_existing_plan public.daily_crew_rotation_plans%ROWTYPE;
  v_name text := btrim(COALESCE(_name, ''));
  v_slot_count integer;
  v_unique_template_count integer;
  v_invalid_count integer;
  v_revision integer;
  v_ready boolean;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan name is required';
  END IF;

  IF _slots IS NULL OR jsonb_typeof(_slots) <> 'array' THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan slots must be a JSON array';
  END IF;

  v_slot_count := jsonb_array_length(_slots);

  IF v_slot_count > 30 THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plans support at most 30 slots';
  END IF;

  SELECT count(*)
    INTO v_invalid_count
  FROM jsonb_array_elements(_slots) AS slot(value)
  WHERE jsonb_typeof(slot.value) <> 'object'
     OR NOT (slot.value ? 'slotNumber')
     OR NOT (slot.value ? 'templateId')
     OR slot.value->>'slotNumber' IS NULL
     OR slot.value->>'templateId' IS NULL
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(slot.value) AS key(value)
       WHERE key.value NOT IN ('slotNumber', 'templateId')
     );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan slots are malformed';
  END IF;

  WITH slot_input AS (
    SELECT
      (slot.value->>'slotNumber')::integer AS slot_number,
      (slot.value->>'templateId')::uuid AS template_id
    FROM jsonb_array_elements(_slots) AS slot(value)
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM slot_input
  WHERE slot_number NOT BETWEEN 1 AND 30
     OR template_id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan slots must use slots 1 through 30 and valid templates';
  END IF;

  WITH slot_input AS (
    SELECT (slot.value->>'slotNumber')::integer AS slot_number
    FROM jsonb_array_elements(_slots) AS slot(value)
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM (
    SELECT slot_number
    FROM slot_input
    GROUP BY slot_number
    HAVING count(*) > 1
  ) AS duplicate_slots;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan slots cannot repeat slot numbers'
      USING ERRCODE = '23505';
  END IF;

  WITH slot_input AS (
    SELECT (slot.value->>'templateId')::uuid AS template_id
    FROM jsonb_array_elements(_slots) AS slot(value)
  )
  SELECT count(*)
    INTO v_invalid_count
  FROM slot_input AS input
  LEFT JOIN public.daily_crew_mission_templates AS templates
    ON templates.id = input.template_id
  WHERE templates.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan references an unknown template';
  END IF;

  IF _plan_id IS NULL THEN
    INSERT INTO public.daily_crew_rotation_plans (name, revision)
    VALUES (v_name, 1)
    RETURNING id, revision
    INTO v_plan_id, v_revision;
  ELSE
    SELECT *
      INTO v_existing_plan
    FROM public.daily_crew_rotation_plans
    WHERE id = _plan_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Daily Crew Builder rotation plan not found';
    END IF;

    v_plan_id := _plan_id;

    DELETE FROM public.daily_crew_rotation_plan_slots
    WHERE plan_id = v_plan_id;

    UPDATE public.daily_crew_rotation_plans
    SET
      name = v_name,
      revision = revision + 1
    WHERE id = v_plan_id
    RETURNING revision
    INTO v_revision;
  END IF;

  INSERT INTO public.daily_crew_rotation_plan_slots (
    plan_id,
    slot_number,
    template_id
  )
  SELECT
    v_plan_id,
    (slot.value->>'slotNumber')::integer,
    (slot.value->>'templateId')::uuid
  FROM jsonb_array_elements(_slots) AS slot(value)
  ORDER BY (slot.value->>'slotNumber')::integer;

  SELECT
    count(*),
    count(DISTINCT template_id)
    INTO v_slot_count, v_unique_template_count
  FROM public.daily_crew_rotation_plan_slots
  WHERE plan_id = v_plan_id;

  v_ready := public.validate_daily_crew_rotation_plan(v_plan_id);

  RETURN jsonb_build_object(
    'planId', v_plan_id,
    'name', v_name,
    'revision', v_revision,
    'slotCount', v_slot_count,
    'uniqueTemplateCount', v_unique_template_count,
    'ready', v_ready
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_preview_daily_crew_rotation(
  _plan_id uuid,
  _start_date date,
  _target_status public.daily_crew_mission_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_today date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_plan public.daily_crew_rotation_plans%ROWTYPE;
  v_slot_number integer;
  v_mission_date date;
  v_template_id uuid;
  v_template_title text;
  v_template_slug text;
  v_template_revision integer;
  v_template_active boolean;
  v_template_ready boolean;
  v_generated_slug text;
  v_date_conflict boolean;
  v_slug_conflict boolean;
  v_blocking_reasons text[];
  v_slots jsonb := '[]'::jsonb;
  v_plan_ready boolean;
  v_slot_count integer;
  v_unique_template_count integer;
  v_conflict_count integer := 0;
BEGIN
  IF _plan_id IS NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan is required';
  END IF;

  IF _start_date IS NULL OR _start_date < v_today THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation start date must be today or later';
  END IF;

  IF _target_status IS NULL OR _target_status NOT IN (
    'draft'::public.daily_crew_mission_status,
    'scheduled'::public.daily_crew_mission_status
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder rotations can only generate draft or scheduled missions';
  END IF;

  SELECT *
    INTO v_plan
  FROM public.daily_crew_rotation_plans
  WHERE id = _plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan not found';
  END IF;

  SELECT
    count(*),
    count(DISTINCT template_id)
    INTO v_slot_count, v_unique_template_count
  FROM public.daily_crew_rotation_plan_slots
  WHERE plan_id = _plan_id;

  v_plan_ready := public.validate_daily_crew_rotation_plan(_plan_id);

  FOR v_slot_number IN 1..30 LOOP
    v_mission_date := _start_date + (v_slot_number - 1);
    v_template_id := NULL;
    v_template_title := NULL;
    v_template_slug := NULL;
    v_template_revision := NULL;
    v_template_active := NULL;
    v_template_ready := false;
    v_generated_slug := NULL;
    v_blocking_reasons := ARRAY[]::text[];

    IF v_slot_count <> 30 THEN
      v_blocking_reasons := v_blocking_reasons || ARRAY['incomplete_plan'];
    END IF;

    SELECT
      templates.id,
      templates.title,
      templates.slug,
      templates.revision,
      templates.is_active,
      CASE
        WHEN templates.id IS NULL THEN false
        ELSE public.validate_daily_crew_template(templates.id)
      END
      INTO
        v_template_id,
        v_template_title,
        v_template_slug,
        v_template_revision,
        v_template_active,
        v_template_ready
    FROM public.daily_crew_rotation_plan_slots AS slots
    LEFT JOIN public.daily_crew_mission_templates AS templates
      ON templates.id = slots.template_id
    WHERE slots.plan_id = _plan_id
      AND slots.slot_number = v_slot_number;

    IF v_template_id IS NULL THEN
      v_template_ready := false;
      v_blocking_reasons := v_blocking_reasons || ARRAY['missing_slot'];
    ELSE
      v_generated_slug := v_template_slug || '-' || v_mission_date::text;

      IF NOT COALESCE(v_template_active, false) THEN
        v_blocking_reasons := v_blocking_reasons || ARRAY['inactive_template'];
      END IF;

      IF NOT v_template_ready THEN
        v_blocking_reasons := v_blocking_reasons || ARRAY['unready_template'];
      END IF;

      IF char_length(v_generated_slug) > 80 THEN
        v_blocking_reasons := v_blocking_reasons || ARRAY['generated_slug_too_long'];
      END IF;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.daily_crew_missions
      WHERE mission_date = v_mission_date
    )
      INTO v_date_conflict;

    IF v_date_conflict THEN
      v_blocking_reasons := v_blocking_reasons || ARRAY['date_conflict'];
    END IF;

    IF v_generated_slug IS NULL THEN
      v_slug_conflict := false;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.daily_crew_missions
        WHERE slug = v_generated_slug
      )
        INTO v_slug_conflict;

      IF v_slug_conflict THEN
        v_blocking_reasons := v_blocking_reasons || ARRAY['slug_conflict'];
      END IF;
    END IF;

    IF array_length(v_blocking_reasons, 1) IS NOT NULL THEN
      v_conflict_count := v_conflict_count + 1;
    END IF;

    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'slotNumber', v_slot_number,
      'missionDate', v_mission_date,
      'templateId', v_template_id,
      'templateTitle', v_template_title,
      'templateSlug', v_template_slug,
      'templateRevision', v_template_revision,
      'templateActive', v_template_active,
      'templateReady', v_template_ready,
      'generatedSlug', v_generated_slug,
      'dateConflict', v_date_conflict,
      'slugConflict', v_slug_conflict,
      'blockingReasons', to_jsonb(v_blocking_reasons)
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'planId', v_plan.id,
    'planName', v_plan.name,
    'planRevision', v_plan.revision,
    'startDate', _start_date,
    'endDate', _start_date + 29,
    'targetStatus', _target_status,
    'slotCount', v_slot_count,
    'uniqueTemplateCount', v_unique_template_count,
    'planReady', v_plan_ready,
    'conflictCount', v_conflict_count,
    'readyToGenerate', v_plan_ready AND v_conflict_count = 0,
    'slots', v_slots
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_generate_daily_crew_rotation(
  _plan_id uuid,
  _start_date date,
  _target_status public.daily_crew_mission_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_today date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_plan public.daily_crew_rotation_plans%ROWTYPE;
  v_template_id uuid;
  v_template public.daily_crew_mission_templates%ROWTYPE;
  v_slot record;
  v_mission_date date;
  v_generated_slug text;
  v_created jsonb;
  v_status_result jsonb;
  v_mission_id uuid;
  v_updated_count integer;
  v_missions jsonb := '[]'::jsonb;
  v_created_count integer := 0;
BEGIN
  IF _plan_id IS NULL THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan is required';
  END IF;

  IF _start_date IS NULL OR _start_date < v_today THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation start date must be today or later';
  END IF;

  IF _target_status IS NULL OR _target_status NOT IN (
    'draft'::public.daily_crew_mission_status,
    'scheduled'::public.daily_crew_mission_status
  ) THEN
    RAISE EXCEPTION 'Daily Crew Builder rotations can only generate draft or scheduled missions';
  END IF;

  SELECT *
    INTO v_plan
  FROM public.daily_crew_rotation_plans
  WHERE id = _plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan not found';
  END IF;

  FOR v_template_id IN
    SELECT DISTINCT template_id
    FROM public.daily_crew_rotation_plan_slots
    WHERE plan_id = v_plan.id
    ORDER BY template_id
  LOOP
    SELECT *
      INTO v_template
    FROM public.daily_crew_mission_templates
    WHERE id = v_template_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Daily Crew Builder rotation plan references an unknown template';
    END IF;

    IF NOT v_template.is_active THEN
      RAISE EXCEPTION 'Daily Crew Builder rotation plan references an inactive template';
    END IF;

    IF NOT public.validate_daily_crew_template(v_template.id) THEN
      RAISE EXCEPTION 'Daily Crew Builder rotation plan references an unready template';
    END IF;
  END LOOP;

  IF NOT public.validate_daily_crew_rotation_plan(v_plan.id) THEN
    RAISE EXCEPTION 'Daily Crew Builder rotation plan is not ready to generate';
  END IF;

  FOR v_slot IN
    SELECT
      slots.slot_number,
      templates.id AS template_id,
      templates.slug AS template_slug
    FROM public.daily_crew_rotation_plan_slots AS slots
    JOIN public.daily_crew_mission_templates AS templates
      ON templates.id = slots.template_id
    WHERE slots.plan_id = v_plan.id
    ORDER BY slots.slot_number
  LOOP
    v_mission_date := _start_date + (v_slot.slot_number - 1);
    v_generated_slug := v_slot.template_slug || '-' || v_mission_date::text;

    IF char_length(v_generated_slug) > 80 THEN
      RAISE EXCEPTION 'Daily Crew Builder generated mission slug is too long';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_missions
      WHERE mission_date = v_mission_date
    ) THEN
      RAISE EXCEPTION 'Daily Crew Builder mission date already exists'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.daily_crew_missions
      WHERE slug = v_generated_slug
    ) THEN
      RAISE EXCEPTION 'Daily Crew Builder mission slug already exists'
        USING ERRCODE = '23505';
    END IF;
  END LOOP;

  FOR v_slot IN
    SELECT
      slots.slot_number,
      templates.id AS template_id
    FROM public.daily_crew_rotation_plan_slots AS slots
    JOIN public.daily_crew_mission_templates AS templates
      ON templates.id = slots.template_id
    WHERE slots.plan_id = v_plan.id
    ORDER BY slots.slot_number
  LOOP
    v_mission_date := _start_date + (v_slot.slot_number - 1);

    v_created := public.admin_create_daily_crew_builder_mission_from_template(
      v_slot.template_id,
      v_mission_date
    );
    v_mission_id := (v_created->>'missionId')::uuid;

    UPDATE public.daily_crew_missions
    SET
      source_rotation_plan_id = v_plan.id,
      source_rotation_plan_revision = v_plan.revision,
      source_rotation_slot = v_slot.slot_number
    WHERE id = v_mission_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'Daily Crew Builder rotation source metadata update failed';
    END IF;

    IF _target_status = 'scheduled'::public.daily_crew_mission_status THEN
      v_status_result := public.admin_set_daily_crew_builder_mission_status(
        v_mission_id,
        'scheduled'::public.daily_crew_mission_status
      );
    ELSE
      v_status_result := NULL;
    END IF;

    v_created_count := v_created_count + 1;
    v_missions := v_missions || jsonb_build_array(jsonb_build_object(
      'slotNumber', v_slot.slot_number,
      'missionId', v_mission_id,
      'missionDate', v_mission_date,
      'slug', v_created->>'slug',
      'status', COALESCE(v_status_result->>'status', v_created->>'status'),
      'sourceTemplateId', v_created->>'sourceTemplateId',
      'sourceTemplateRevision', (v_created->>'sourceTemplateRevision')::integer,
      'sourceRotationPlanId', v_plan.id,
      'sourceRotationPlanRevision', v_plan.revision
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'planId', v_plan.id,
    'planName', v_plan.name,
    'planRevision', v_plan.revision,
    'startDate', _start_date,
    'endDate', _start_date + 29,
    'targetStatus', _target_status,
    'createdCount', v_created_count,
    'missions', v_missions
  );
END;
$function$;

REVOKE ALL ON TABLE public.daily_crew_rotation_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.daily_crew_rotation_plan_slots FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.daily_crew_rotation_plans TO service_role;
GRANT ALL ON TABLE public.daily_crew_rotation_plan_slots TO service_role;

ALTER TABLE public.daily_crew_rotation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_crew_rotation_plan_slots ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.clear_daily_crew_mission_rotation_source_on_delete()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_daily_crew_rotation_plan(uuid)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_save_daily_crew_rotation_plan(uuid, text, jsonb)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_preview_daily_crew_rotation(
  uuid,
  date,
  public.daily_crew_mission_status
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_generate_daily_crew_rotation(
  uuid,
  date,
  public.daily_crew_mission_status
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.clear_daily_crew_mission_rotation_source_on_delete()
TO service_role;

GRANT EXECUTE ON FUNCTION public.validate_daily_crew_rotation_plan(uuid)
TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_save_daily_crew_rotation_plan(uuid, text, jsonb)
TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_preview_daily_crew_rotation(
  uuid,
  date,
  public.daily_crew_mission_status
) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_generate_daily_crew_rotation(
  uuid,
  date,
  public.daily_crew_mission_status
) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
