BEGIN;

SELECT plan(19);

SELECT is(
  public.identity_username_legacy_format_valid('agent11'),
  true,
  'legacy username format allows plain alphanumeric usernames'
);

SELECT is(
  public.identity_username_legacy_format_valid('agent_11'),
  true,
  'legacy username format allows a single internal underscore'
);

SELECT is(
  public.identity_username_legacy_format_valid('agent__11'),
  false,
  'legacy username format rejects literal consecutive underscores'
);

SELECT is(
  (
    SELECT identity_result.allowed
    FROM public.evaluate_public_identity('agent11', 'username') AS identity_result
    LIMIT 1
  ),
  true,
  'public identity evaluation allows a valid username'
);

SELECT lives_ok(
  $$ SELECT * FROM public.evaluate_public_identity('agent11', 'username') $$,
  'public identity evaluation does not raise ambiguous-column errors'
);

SELECT results_eq(
  $$ SELECT allowed, violation_code, category, term_id IS NULL AS term_id_is_null
     FROM public.evaluate_public_identity('agent__11', 'username') $$,
  $$ VALUES (false, 'invalid_format'::text, 'format'::text, true) $$,
  'invalid username formats return the generic format rejection'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS triggers
    JOIN pg_catalog.pg_class AS tables
      ON tables.oid = triggers.tgrelid
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = tables.relnamespace
    WHERE schemas.nspname = 'public'
      AND tables.relname = 'profiles'
      AND triggers.tgname = 'create_onboarding_progress_for_profile_trigger'
      AND NOT triggers.tgisinternal
  ),
  'create_onboarding_progress_for_profile_trigger exists on public.profiles'
);

DO $$
DECLARE
  v_user_id uuid := '11111111-2222-4333-8444-555555555555'::uuid;
  v_character_id uuid := '22222222-3333-4444-8555-666666666666'::uuid;
BEGIN
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'account-lifecycle@example.invalid',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"agentlife01","display_name":"Agent Life"}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  );

  INSERT INTO public.characters (
    id,
    slug,
    name,
    crew,
    role,
    bounty,
    current_price,
    previous_price,
    category
  )
  VALUES (
    v_character_id,
    'account-lifecycle-test',
    'Account Lifecycle Test',
    'Test Crew',
    'Tester',
    0,
    100,
    100,
    'growth'::public.stock_category
  );

  INSERT INTO public.character_pricing_ratings (
    character_id,
    narrative_importance,
    current_relevance,
    strength_status,
    popularity,
    future_potential,
    investor_confidence,
    volatility,
    stock_category,
    comparable_adjustment,
    uncertainty_discount_pct,
    launch_catalyst_pct,
    pricing_algorithm_version,
    ratings_status,
    created_by,
    updated_by,
    approved_at,
    approved_by
  )
  VALUES (
    v_character_id,
    50,
    50,
    50,
    50,
    50,
    50,
    50,
    'growth'::public.stock_category,
    1.00,
    0,
    0,
    'test',
    'approved',
    v_user_id,
    v_user_id,
    pg_catalog.now(),
    v_user_id
  );

  INSERT INTO public.identity_moderation_flags (
    profile_id,
    field,
    observed_value,
    normalized_value,
    violation_code,
    category
  )
  VALUES (
    v_user_id,
    'username',
    'agentlife01',
    'agentlife01',
    'test_flag',
    'common_profanity'
  );

  INSERT INTO public.identity_moderation_actions (
    profile_id,
    actor_user_id,
    action_type,
    field,
    previous_value,
    new_value,
    reason
  )
  VALUES (
    v_user_id,
    v_user_id,
    'flag_review',
    'username',
    'agentlife01',
    'agentlife01',
    'account lifecycle cascade test'
  );
END $$;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.user_onboarding_progress
    WHERE user_id = '11111111-2222-4333-8444-555555555555'::uuid
  ),
  'a newly inserted profile creates an onboarding progress row'
);

SELECT is(
  (
    SELECT constraints.confdeltype
    FROM pg_catalog.pg_constraint AS constraints
    WHERE constraints.conname = 'identity_moderation_flags_profile_id_fkey'
  ),
  'c'::"char",
  'identity moderation flags cascade with deleted profiles'
);

SELECT is(
  (
    SELECT constraints.confdeltype
    FROM pg_catalog.pg_constraint AS constraints
    WHERE constraints.conname = 'identity_moderation_actions_profile_id_fkey'
  ),
  'c'::"char",
  'identity moderation actions cascade with deleted profiles'
);

SELECT is(
  (
    SELECT constraints.confdeltype
    FROM pg_catalog.pg_constraint AS constraints
    WHERE constraints.conname = 'character_pricing_ratings_created_by_fkey'
  ),
  'n'::"char",
  'character pricing created_by is set null on deleted users'
);

SELECT is(
  (
    SELECT constraints.confdeltype
    FROM pg_catalog.pg_constraint AS constraints
    WHERE constraints.conname = 'character_pricing_ratings_updated_by_fkey'
  ),
  'n'::"char",
  'character pricing updated_by is set null on deleted users'
);

SELECT is(
  (
    SELECT constraints.confdeltype
    FROM pg_catalog.pg_constraint AS constraints
    WHERE constraints.conname = 'character_pricing_ratings_approved_by_fkey'
  ),
  'n'::"char",
  'character pricing approved_by is set null on deleted users'
);

DELETE FROM auth.users
WHERE id = '11111111-2222-4333-8444-555555555555'::uuid;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.character_pricing_ratings
    WHERE character_id = '22222222-3333-4444-8555-666666666666'::uuid
      AND ratings_status = 'approved'
      AND approved_at IS NOT NULL
  ),
  'account deletion preserves shared approved pricing rows'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.character_pricing_ratings
    WHERE character_id = '22222222-3333-4444-8555-666666666666'::uuid
      AND created_by IS NULL
      AND updated_by IS NULL
      AND approved_by IS NULL
  ),
  'account deletion nulls shared pricing audit actors'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = '11111111-2222-4333-8444-555555555555'::uuid
  ),
  'account deletion cascades owned profile data'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.user_onboarding_progress
    WHERE user_id = '11111111-2222-4333-8444-555555555555'::uuid
  ),
  'account deletion cascades owned onboarding progress'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.identity_moderation_flags
    WHERE profile_id = '11111111-2222-4333-8444-555555555555'::uuid
  ),
  'account deletion cascades owned moderation flags'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.identity_moderation_actions
    WHERE profile_id = '11111111-2222-4333-8444-555555555555'::uuid
  ),
  'account deletion cascades owned moderation actions'
);

SELECT * FROM finish();

ROLLBACK;
