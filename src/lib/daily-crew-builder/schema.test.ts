/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const baseMigrationPath = join(
  migrationsDir,
  "20260709030000_create_daily_crew_builder_schema.sql",
);
const pool15MigrationPath = join(
  migrationsDir,
  "20260709120000_update_daily_crew_builder_pool_15.sql",
);
const persistenceMigrationPath = join(
  migrationsDir,
  "20260710130000_seed_daily_crew_builder_missions.sql",
);
const roleLaneCorrectionMigrationPath = join(
  migrationsDir,
  "20260711130000_correct_daily_crew_builder_role_lanes.sql",
);
const payoutMigrationPath = join(
  migrationsDir,
  "20260711140000_award_daily_crew_builder_reward.sql",
);
const simplifiedJobsMigrationPath = join(
  migrationsDir,
  "20260711150000_simplify_daily_crew_builder_jobs.sql",
);
const missionLifecycleMigrationPath = join(
  migrationsDir,
  "20260713120000_daily_crew_mission_lifecycle.sql",
);
const authoringBackendMigrationPath = join(
  migrationsDir,
  "20260713130000_daily_crew_authoring_backend.sql",
);
const removedDuplicateWalletMigrationPath = join(
  migrationsDir,
  "20260709010521_db0aade3-3c7b-4b2e-b4bc-ff7e1eb423cb.sql",
);
const baseSql = readFileSync(baseMigrationPath, "utf8");
const pool15Sql = readFileSync(pool15MigrationPath, "utf8");
const persistenceSql = readFileSync(persistenceMigrationPath, "utf8");
const roleLaneCorrectionSql = readFileSync(roleLaneCorrectionMigrationPath, "utf8");
const payoutSql = readFileSync(payoutMigrationPath, "utf8");
const simplifiedJobsSql = readFileSync(simplifiedJobsMigrationPath, "utf8");
const missionLifecycleSql = readFileSync(missionLifecycleMigrationPath, "utf8");
const authoringBackendSql = readFileSync(authoringBackendMigrationPath, "utf8");
const sql = `${baseSql}\n${pool15Sql}`;

function stripSqlComments(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const sqlWithoutComments = stripSqlComments(sql);

function expectSql(pattern: RegExp, message: string): void {
  assert.match(sql, pattern, message);
}

function expectPool15Sql(pattern: RegExp, message: string): void {
  assert.match(pool15Sql, pattern, message);
}

function expectPersistenceSql(pattern: RegExp, message: string): void {
  assert.match(persistenceSql, pattern, message);
}

function expectRoleLaneCorrectionSql(pattern: RegExp, message: string): void {
  assert.match(roleLaneCorrectionSql, pattern, message);
}

function expectPayoutSql(pattern: RegExp, message: string): void {
  assert.match(payoutSql, pattern, message);
}

function expectSimplifiedJobsSql(pattern: RegExp, message: string): void {
  assert.match(simplifiedJobsSql, pattern, message);
}

function expectMissionLifecycleSql(pattern: RegExp, message: string): void {
  assert.match(missionLifecycleSql, pattern, message);
}

function expectAuthoringBackendSql(pattern: RegExp, message: string): void {
  assert.match(authoringBackendSql, pattern, message);
}

function rejectSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(sqlWithoutComments, pattern, message);
}

function rejectPool15Sql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(stripSqlComments(pool15Sql), pattern, message);
}

function rejectPersistenceSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(stripSqlComments(persistenceSql), pattern, message);
}

function rejectRoleLaneCorrectionSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(stripSqlComments(roleLaneCorrectionSql), pattern, message);
}

function rejectPayoutSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(stripSqlComments(payoutSql), pattern, message);
}

function rejectSimplifiedJobsSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(stripSqlComments(simplifiedJobsSql), pattern, message);
}

function rejectMissionLifecycleSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(stripSqlComments(missionLifecycleSql), pattern, message);
}

function rejectAuthoringBackendSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(stripSqlComments(authoringBackendSql), pattern, message);
}

const tables = [
  "daily_crew_missions",
  "daily_crew_mission_pool",
  "daily_crew_role_requirements",
  "daily_crew_character_role_scores",
  "daily_crew_perfect_solution",
  "daily_crew_submissions",
  "daily_crew_submission_roles",
];

const hiddenTables = [
  "daily_crew_role_requirements",
  "daily_crew_character_role_scores",
  "daily_crew_perfect_solution",
];

test("Daily Crew Builder migration creates the expected enums and tables", () => {
  expectSql(
    /CREATE TYPE public\.daily_crew_role AS ENUM \(\s*'captain',\s*'fighter',\s*'navigator',\s*'strategist',\s*'support'\s*\)/i,
    "role enum exists",
  );
  expectSql(
    /CREATE TYPE public\.daily_crew_mission_status AS ENUM \(\s*'draft',\s*'scheduled',\s*'published',\s*'archived'\s*\)/i,
    "mission status enum exists",
  );
  expectSql(
    /CREATE TYPE public\.daily_crew_rank AS ENUM \(\s*'s',\s*'a',\s*'b',\s*'c',\s*'fail'\s*\)/i,
    "rank enum exists",
  );
  expectSql(
    /CREATE TYPE public\.daily_crew_reveal_policy AS ENUM \(\s*'immediate',\s*'next_day',\s*'manual'\s*\)/i,
    "reveal policy enum exists",
  );

  for (const table of tables) {
    expectSql(new RegExp(`CREATE TABLE public\\.${table}\\b`, "i"), `${table} table exists`);
  }
});

test("mission and pool tables support public-safe daily puzzle setup", () => {
  expectSql(/mission_date date NOT NULL UNIQUE/i, "one mission date can exist only once");
  expectSql(/slug text NOT NULL UNIQUE/i, "mission slug is unique");
  expectSql(
    /max_score integer NOT NULL DEFAULT 100 CHECK \(max_score = 100\)/i,
    "mission max score is fixed to 100",
  );
  expectSql(
    /status public\.daily_crew_mission_status NOT NULL DEFAULT 'draft'/i,
    "missions start as draft",
  );
  expectSql(
    /reveal_policy public\.daily_crew_reveal_policy NOT NULL DEFAULT 'next_day'/i,
    "reveal policy is stored",
  );
  expectSql(/mission_tags text\[\] NOT NULL DEFAULT '\{\}'/i, "mission tags are supported");

  expectSql(
    /character_id uuid NOT NULL REFERENCES public\.characters\(id\) ON DELETE RESTRICT/i,
    "pool references market characters",
  );
  expectSql(
    /display_order integer NOT NULL CHECK \(display_order BETWEEN 1 AND 12\)/i,
    "historical base migration created the original pool display order check",
  );
  expectPool15Sql(
    /DROP CONSTRAINT IF EXISTS daily_crew_mission_pool_display_order_check/i,
    "pool-15 migration drops the generated display-order constraint",
  );
  expectPool15Sql(
    /ADD CONSTRAINT daily_crew_mission_pool_display_order_check\s+CHECK \(display_order BETWEEN 1 AND 15\)/i,
    "current pool display order is 1 through 15",
  );
  expectSql(
    /is_straw_hat boolean NOT NULL DEFAULT false/i,
    "pool stores explicit Straw Hat membership",
  );
  expectSql(/visible_tags text\[\] NOT NULL DEFAULT '\{\}'/i, "pool can expose safe visible tags");
  expectSql(/UNIQUE \(mission_id, character_id\)/i, "pool cannot repeat a character");
  expectSql(/UNIQUE \(mission_id, display_order\)/i, "pool cannot repeat display order");
});

test("hidden role requirements, role scores, and perfect solution are modeled separately", () => {
  expectSql(/role public\.daily_crew_role NOT NULL/i, "role enum is used");
  expectSql(/subtype_key text NOT NULL CHECK \(subtype_key ~ /i, "hidden subtype key is stored");
  expectSql(/subtype_label text CHECK/i, "optional subtype label is supported");
  expectSql(
    /max_points integer NOT NULL DEFAULT 18 CHECK \(max_points BETWEEN 1 AND 18\)/i,
    "role requirements cap points",
  );
  expectSql(
    /score integer NOT NULL CHECK \(score BETWEEN 0 AND 18\)/i,
    "character role scores are bounded",
  );
  expectSql(
    /role_score integer NOT NULL CHECK \(role_score BETWEEN 0 AND 18\)/i,
    "submitted role scores are bounded",
  );
  expectSql(
    /PRIMARY KEY \(mission_id, role\)/i,
    "requirements and perfect solution use one row per mission role",
  );
  expectSql(
    /FOREIGN KEY \(mission_id, character_id\)[\s\S]*REFERENCES public\.daily_crew_mission_pool\(mission_id, character_id\)/i,
    "scores and perfect solution must reference characters in the curated pool",
  );
  expectSql(
    /FOREIGN KEY \(mission_id, role\)[\s\S]*REFERENCES public\.daily_crew_role_requirements\(mission_id, role\)/i,
    "scores and perfect solution must reference configured role requirements",
  );
  expectSql(
    /CREATE TABLE public\.daily_crew_perfect_solution[\s\S]*UNIQUE \(mission_id, character_id\)/i,
    "perfect solution cannot assign the same character to multiple roles",
  );
});

test("submissions are one per user per mission and prepare future idempotent rewards", () => {
  expectSql(
    /user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/i,
    "submissions belong to auth users",
  );
  expectSql(
    /score integer NOT NULL CHECK \(score BETWEEN 0 AND 100\)/i,
    "submission score is bounded",
  );
  expectSql(/rank public\.daily_crew_rank NOT NULL/i, "submission rank uses the rank enum");
  expectSql(
    /reward_amount integer NOT NULL DEFAULT 0 CHECK \(reward_amount >= 0\)/i,
    "reward amount is non-negative",
  );
  expectSql(
    /reward_paid boolean NOT NULL DEFAULT false/i,
    "reward-paid state is present for future idempotency",
  );
  expectSql(
    /score_breakdown jsonb NOT NULL DEFAULT '\{\}'::jsonb/i,
    "score breakdown can be stored without hidden table reads",
  );
  expectSql(/UNIQUE \(mission_id, user_id\)/i, "users can submit once per mission");
  expectSql(
    /UNIQUE \(id, mission_id\)/i,
    "submissions expose a safe composite parent key for role rows",
  );
  expectSql(/PRIMARY KEY \(submission_id, role\)/i, "submitted assignments have one row per role");
  expectSql(
    /mission_id uuid NOT NULL/i,
    "submitted role rows carry mission identity for composite foreign keys",
  );
  expectSql(
    /CREATE TABLE public\.daily_crew_submission_roles[\s\S]*UNIQUE \(submission_id, character_id\)/i,
    "submitted crews cannot assign the same character to multiple roles",
  );
  expectSql(
    /FOREIGN KEY \(submission_id, mission_id\)[\s\S]*REFERENCES public\.daily_crew_submissions\(id, mission_id\)/i,
    "submitted role rows must match the parent submission mission",
  );
  expectSql(
    /FOREIGN KEY \(mission_id, character_id\)[\s\S]*REFERENCES public\.daily_crew_mission_pool\(mission_id, character_id\)/i,
    "submitted characters must belong to the curated mission pool",
  );
  expectSql(
    /FOREIGN KEY \(mission_id, role\)[\s\S]*REFERENCES public\.daily_crew_role_requirements\(mission_id, role\)/i,
    "submitted roles must belong to the mission role requirements",
  );
});

test("pool and publishing safeguards encode the v1 mission constraints", () => {
  expectSql(
    /CREATE OR REPLACE FUNCTION public\.validate_daily_crew_mission\(_mission_id uuid\)/i,
    "validation function exists",
  );
  expectSql(/v_pool_count = 15/i, "published validation requires 15 pool characters");
  expectSql(/v_pool_straw_hats <= 5/i, "published validation enforces the pool Straw Hat cap");
  expectSql(/v_requirement_count = 5/i, "published validation requires five role requirements");
  expectSql(
    /v_requirement_role_count = 5/i,
    "published validation requires five distinct requirement roles",
  );
  expectSql(/v_solution_count = 5/i, "published validation requires five perfect solution rows");
  expectSql(
    /v_solution_role_count = 5/i,
    "published validation requires five distinct solution roles",
  );
  expectSql(
    /v_solution_straw_hats <= 3/i,
    "published validation enforces the perfect solution Straw Hat cap",
  );
  expectSql(
    /v_score_count = 75/i,
    "published validation requires scores for every pool character and role",
  );
  expectSql(
    /v_solution_score_total = 90/i,
    "published validation requires a full-max perfect solution role score",
  );
  expectSql(
    /JOIN public\.daily_crew_character_role_scores AS scores[\s\S]*scores\.mission_id = s\.mission_id[\s\S]*scores\.character_id = s\.character_id[\s\S]*scores\.role = s\.role/i,
    "perfect solution score total joins by mission, character, and role",
  );
  expectSql(/CREATE TRIGGER daily_crew_pool_limits/i, "pool limit trigger exists");
  expectSql(/CREATE TRIGGER daily_crew_solution_limits/i, "solution limit trigger exists");
  expectSql(/CREATE TRIGGER daily_crew_publish_ready/i, "publish readiness trigger exists");
  expectSql(
    /NEW\.status = 'published'::public\.daily_crew_mission_status/i,
    "publish readiness only runs for published missions",
  );
});

test("RLS and grants expose only public-safe data to browser roles", () => {
  for (const table of tables) {
    expectSql(
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      `${table} has RLS enabled`,
    );
    expectSql(
      new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, "i"),
      `${table} starts with browser privileges revoked`,
    );
    expectSql(
      new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`, "i"),
      `${table} is manageable by service role`,
    );
  }

  expectSql(
    /GRANT SELECT ON TABLE public\.daily_crew_missions TO anon, authenticated/i,
    "published mission details are public-readable",
  );
  expectSql(
    /GRANT SELECT ON TABLE public\.daily_crew_mission_pool TO anon, authenticated/i,
    "published mission pool is public-readable",
  );
  expectSql(
    /CREATE POLICY "Published daily crew missions are public"[\s\S]*status = 'published'::public\.daily_crew_mission_status/i,
    "only published missions are public",
  );
  expectSql(
    /CREATE POLICY "Published daily crew mission pools are public"[\s\S]*m\.status = 'published'::public\.daily_crew_mission_status/i,
    "only published mission pools are public",
  );

  for (const table of hiddenTables) {
    rejectSql(
      new RegExp(
        `GRANT SELECT ON TABLE public\\.${table} TO (?:anon|authenticated|anon, authenticated|authenticated, anon)`,
        "i",
      ),
      `${table} is not granted browser select access`,
    );
    rejectSql(
      new RegExp(
        `CREATE POLICY [\\s\\S]*ON public\\.${table}[\\s\\S]*TO (?:anon|authenticated)`,
        "i",
      ),
      `${table} has no browser-readable policy`,
    );
  }
});

test("users can read only their own submission data and cannot write directly", () => {
  expectSql(
    /GRANT SELECT ON TABLE public\.daily_crew_submissions TO authenticated/i,
    "users can read own submissions through RLS",
  );
  expectSql(
    /GRANT SELECT ON TABLE public\.daily_crew_submission_roles TO authenticated/i,
    "users can read own submitted roles through RLS",
  );
  expectSql(
    /CREATE POLICY "Users read own daily crew submissions"[\s\S]*auth\.uid\(\) = user_id/i,
    "submission read policy is owner-only",
  );
  expectSql(
    /CREATE POLICY "Users read own daily crew submission roles"[\s\S]*s\.user_id = auth\.uid\(\)/i,
    "submission role read policy is owner-only",
  );

  for (const table of ["daily_crew_submissions", "daily_crew_submission_roles"]) {
    rejectSql(
      new RegExp(
        `GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\\.${table} TO authenticated`,
        "i",
      ),
      `${table} does not grant direct authenticated writes`,
    );
  }
});

test("Phase 1 does not mutate wallets, stock prices, or seed daily missions", () => {
  rejectSql(/UPDATE\s+public\.user_wallets\b/i, "migration does not update wallets");
  rejectSql(/INSERT\s+INTO\s+public\.user_wallets\b/i, "migration does not insert wallets");
  rejectSql(
    /UPDATE\s+public\.characters[\s\S]*(?:current_price|previous_price|momentum|category)/i,
    "migration does not update market character pricing",
  );
  rejectSql(/INSERT\s+INTO\s+public\.transactions\b/i, "migration does not write transactions");
  rejectSql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.award_daily_crew/i,
    "migration does not add reward payout RPC",
  );
  rejectSql(/pg_cron|cron\.schedule|cron\.unschedule/i, "migration does not use cron");
  rejectSql(
    /INSERT\s+INTO\s+public\.daily_crew_/i,
    "migration does not seed missions or submissions",
  );
});

test("pool-15 alignment migration is schema-only and does not introduce payout or browser-hidden grants", () => {
  expectPool15Sql(
    /ALTER TABLE public\.daily_crew_mission_pool/i,
    "alignment migration updates only the mission pool table constraint",
  );
  expectPool15Sql(
    /CREATE OR REPLACE FUNCTION public\.validate_daily_crew_mission\(_mission_id uuid\)/i,
    "alignment migration updates only publish validation logic",
  );
  expectPool15Sql(/SECURITY DEFINER/i, "validation function remains security definer");
  expectPool15Sql(
    /SET search_path = pg_catalog, public, pg_temp/i,
    "validation function keeps the safe search path",
  );
  expectPool15Sql(/v_pool_count = 15/i, "alignment migration requires 15 pool characters");
  expectPool15Sql(/v_score_count = 75/i, "alignment migration requires 75 role score rows");
  expectPool15Sql(/v_pool_straw_hats <= 5/i, "alignment migration preserves pool Straw Hat cap");
  expectPool15Sql(
    /v_solution_straw_hats <= 3/i,
    "alignment migration preserves perfect solution Straw Hat cap",
  );
  expectPool15Sql(
    /v_solution_score_total = 90/i,
    "alignment migration preserves full-max perfect role scoring",
  );
  expectPool15Sql(
    /REVOKE EXECUTE ON FUNCTION public\.validate_daily_crew_mission\(uuid\) FROM PUBLIC, anon, authenticated/i,
    "browser roles cannot execute validation",
  );
  expectPool15Sql(
    /GRANT EXECUTE ON FUNCTION public\.validate_daily_crew_mission\(uuid\) TO service_role/i,
    "service_role can execute validation",
  );

  rejectPool15Sql(/\buser_wallets\b/i, "alignment migration does not touch wallets");
  rejectPool15Sql(/\btransactions\b/i, "alignment migration does not touch transactions");
  rejectPool15Sql(
    /INSERT\s+INTO\s+public\.daily_crew_missions\b/i,
    "alignment migration does not seed daily missions",
  );
  rejectPool15Sql(
    /INSERT\s+INTO\s+public\.daily_crew_submissions\b/i,
    "alignment migration does not seed submissions",
  );
  rejectPool15Sql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.award_daily_crew/i,
    "alignment migration does not add payout RPC",
  );

  for (const table of hiddenTables) {
    rejectPool15Sql(
      new RegExp(
        `GRANT SELECT ON TABLE public\\.${table} TO (?:anon|authenticated|anon, authenticated|authenticated, anon)`,
        "i",
      ),
      `${table} remains hidden from browser roles`,
    );
  }
});

test("persistence migration seeds the two current missions from public market characters", () => {
  expectPersistenceSql(
    /2026-07-10[\s\S]*storm-gate-rescue[\s\S]*Storm Gate Rescue/i,
    "Storm Gate Rescue is seeded",
  );
  expectPersistenceSql(
    /2026-07-11[\s\S]*covert-harbor-infiltration[\s\S]*Covert Harbor Infiltration/i,
    "Covert Harbor Infiltration is seeded",
  );
  expectPersistenceSql(
    /INSERT INTO public\.daily_crew_missions[\s\S]*'draft'::public\.daily_crew_mission_status/i,
    "seed missions are initially inserted as draft",
  );
  expectPersistenceSql(
    /public\.validate_daily_crew_mission\(v_mission_id\)[\s\S]*UPDATE public\.daily_crew_missions[\s\S]*status = 'published'::public\.daily_crew_mission_status/i,
    "seed missions are published only after validation passes",
  );
  expectPersistenceSql(
    /JOIN public\.characters AS characters[\s\S]*characters\.slug = seed_characters\.market_slug/i,
    "seed resolves real market characters by slug",
  );
  expectPersistenceSql(
    /Daily Crew Builder seed missing public\.characters slugs/i,
    "missing market slugs fail clearly",
  );
  expectPersistenceSql(
    /public\.validate_daily_crew_mission\(v_mission_id\)/i,
    "seed validates each mission",
  );

  for (const slug of [
    "nefertari-vivi",
    "bartholomew-kuma",
    "monkey-d-dragon",
    "coby",
    "charlotte-katakuri",
    "jewelry-bonney",
  ]) {
    expectPersistenceSql(new RegExp(`'${slug}'`, "i"), `${slug} market slug is used`);
  }

  expectPersistenceSql(/'char-sabo', 'sabo'/i, "Sabo replaces the missing support character");
  expectPersistenceSql(
    /'char-boa', 'boa'/i,
    "Boa Hancock replaces the missing disruption character",
  );
  expectPersistenceSql(/'char-jinbe', 'jinbe'/i, "existing v1 seed still uses Jinbe");
  rejectPersistenceSql(/\bkoala\b/i, "seed migration does not reference Koala");
  rejectPersistenceSql(/\bperona\b/i, "seed migration does not reference Perona");
  rejectPersistenceSql(
    /grand_line_guess_characters/i,
    "Daily Crew Builder does not use Grand Line Guess character tables",
  );
  rejectPersistenceSql(
    /daily_crew_builder_character/i,
    "no separate Daily Crew Builder character roster table is introduced",
  );
});

test("persistence RPC records unpaid submissions and remains service-role only", () => {
  expectPersistenceSql(
    /CREATE OR REPLACE FUNCTION public\.record_daily_crew_builder_submission\(/i,
    "recording RPC exists",
  );
  expectPersistenceSql(/SECURITY DEFINER/i, "recording RPC is security definer");
  expectPersistenceSql(
    /SET search_path = pg_catalog, public, pg_temp/i,
    "recording RPC has safe search path",
  );
  expectPersistenceSql(
    /missions\.status = 'published'::public\.daily_crew_mission_status/i,
    "RPC requires published mission",
  );
  expectPersistenceSql(/_score < 0 OR _score > 100/i, "RPC validates score range");
  expectPersistenceSql(
    /v_expected_rank := CASE[\s\S]*WHEN _score >= 90[\s\S]*WHEN _score >= 80[\s\S]*WHEN _score >= 70[\s\S]*WHEN _score >= 60/i,
    "RPC validates rank from score",
  );
  expectPersistenceSql(
    /_reward_amount <> v_expected_reward/i,
    "RPC validates future reward amount",
  );
  expectPersistenceSql(
    /reward_paid,\s*score_breakdown[\s\S]*false,\s*_score_breakdown/i,
    "RPC forces reward_paid false",
  );
  expectPersistenceSql(
    /_assignments IS NULL OR jsonb_typeof\(_assignments\) <> 'array'/i,
    "RPC rejects missing or non-array assignments",
  );
  expectPersistenceSql(/INSERT INTO public\.daily_crew_submissions/i, "RPC inserts the submission");
  expectPersistenceSql(
    /INSERT INTO public\.daily_crew_submission_roles/i,
    "RPC inserts submitted role rows",
  );
  expectPersistenceSql(
    /JOIN public\.daily_crew_mission_pool AS pool/i,
    "RPC validates submitted characters against the mission pool",
  );
  expectPersistenceSql(
    /JOIN public\.daily_crew_role_requirements AS requirements/i,
    "RPC validates submitted roles against requirements",
  );
  expectPersistenceSql(
    /JOIN public\.daily_crew_character_role_scores AS scores/i,
    "RPC stores role scores from hidden score rows",
  );
  expectPersistenceSql(/alreadySubmitted/i, "RPC returns idempotent already-submitted state");
  expectPersistenceSql(
    /REVOKE EXECUTE ON FUNCTION public\.record_daily_crew_builder_submission[\s\S]*FROM PUBLIC, anon, authenticated/i,
    "browser roles cannot execute persistence RPC",
  );
  expectPersistenceSql(
    /GRANT EXECUTE ON FUNCTION public\.record_daily_crew_builder_submission[\s\S]*TO service_role/i,
    "service_role can execute persistence RPC",
  );
  expectPersistenceSql(
    /NOTIFY pgrst, 'reload schema'/i,
    "schema cache reload notification is included",
  );

  rejectPersistenceSql(/\buser_wallets\b/i, "persistence migration does not touch wallets");
  rejectPersistenceSql(/\btransactions\b/i, "persistence migration does not write transactions");
  rejectPersistenceSql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.award_daily_crew/i,
    "persistence migration does not add payout RPC",
  );
  rejectPersistenceSql(/reward_paid\s*=\s*true/i, "persistence migration never marks rewards paid");
});

test("mission lifecycle migration allows only today's published or scheduled submissions", () => {
  assert.equal(
    existsSync(missionLifecycleMigrationPath),
    true,
    "mission lifecycle migration exists",
  );
  expectMissionLifecycleSql(
    /CREATE OR REPLACE FUNCTION public\.record_daily_crew_builder_submission\(\s*_mission_id uuid,\s*_user_id uuid,\s*_score integer,\s*_rank public\.daily_crew_rank,\s*_reward_amount integer,\s*_score_breakdown jsonb,\s*_assignments jsonb\s*\)\s*RETURNS jsonb/i,
    "recording RPC signature is preserved",
  );
  expectMissionLifecycleSql(/SECURITY DEFINER/i, "recording RPC remains security definer");
  expectMissionLifecycleSql(
    /SET search_path = pg_catalog, public, pg_temp/i,
    "recording RPC has safe search path",
  );
  expectMissionLifecycleSql(
    /missions\.id = _mission_id[\s\S]*missions\.mission_date = \(pg_catalog\.now\(\) AT TIME ZONE 'UTC'\)::date/i,
    "recording RPC remains scoped to today's UTC mission",
  );
  expectMissionLifecycleSql(
    /missions\.status IN \(\s*'published'::public\.daily_crew_mission_status,\s*'scheduled'::public\.daily_crew_mission_status\s*\)/i,
    "recording RPC accepts published or scheduled missions",
  );
  expectMissionLifecycleSql(
    /v_required_role_count NOT IN \(3, 5\)/i,
    "dynamic job count validation is preserved",
  );
  expectMissionLifecycleSql(
    /v_assignment_count <> v_required_role_count/i,
    "assignment count validation is preserved",
  );
  expectMissionLifecycleSql(
    /JOIN public\.daily_crew_mission_pool AS pool/i,
    "submitted characters remain limited to the mission pool",
  );
  expectMissionLifecycleSql(
    /JOIN public\.daily_crew_role_requirements AS requirements/i,
    "submitted roles remain limited to mission jobs",
  );
  expectMissionLifecycleSql(
    /JOIN public\.daily_crew_character_role_scores AS scores/i,
    "hidden score validation is preserved",
  );
  expectMissionLifecycleSql(
    /_reward_amount <> v_expected_reward/i,
    "future reward amount validation is preserved",
  );
  expectMissionLifecycleSql(
    /reward_paid,\s*score_breakdown[\s\S]*false,\s*_score_breakdown/i,
    "recorded submissions remain unpaid",
  );
  expectMissionLifecycleSql(
    /alreadySubmitted/i,
    "duplicate submission handling remains idempotent",
  );
  expectMissionLifecycleSql(
    /REVOKE EXECUTE ON FUNCTION public\.record_daily_crew_builder_submission[\s\S]*FROM PUBLIC, anon, authenticated/i,
    "browser roles cannot execute recording RPC",
  );
  expectMissionLifecycleSql(
    /GRANT EXECUTE ON FUNCTION public\.record_daily_crew_builder_submission[\s\S]*TO service_role/i,
    "service_role can execute recording RPC",
  );
  expectMissionLifecycleSql(
    /NOTIFY pgrst, 'reload schema'/i,
    "schema cache reload notification is included",
  );

  rejectMissionLifecycleSql(
    /missions\.status\s*=\s*'published'::public\.daily_crew_mission_status/i,
    "recording RPC no longer requires only published missions",
  );
  rejectMissionLifecycleSql(
    /UPDATE\s+public\.daily_crew_missions\b/i,
    "mission lifecycle migration does not mutate mission status",
  );
  rejectMissionLifecycleSql(
    /\buser_wallets\b/i,
    "mission lifecycle migration does not touch wallets",
  );
  rejectMissionLifecycleSql(
    /\bwallet_ledger_entries\b/i,
    "mission lifecycle migration does not write wallet ledger entries",
  );
  rejectMissionLifecycleSql(
    /\btransactions\b/i,
    "mission lifecycle migration does not write transactions",
  );
  rejectMissionLifecycleSql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.award_daily_crew_builder_reward/i,
    "mission lifecycle migration does not change payout RPC",
  );
  rejectMissionLifecycleSql(/\bcron\b/i, "mission lifecycle migration does not add cron behavior");
});

test("role-lane correction updates only seeded Daily Crew role data", () => {
  expectRoleLaneCorrectionSql(/storm-gate-rescue/i, "Storm Gate seeded mission is corrected");
  expectRoleLaneCorrectionSql(
    /covert-harbor-infiltration/i,
    "Covert Harbor seeded mission is corrected",
  );
  expectRoleLaneCorrectionSql(
    /JOIN public\.daily_crew_missions AS missions[\s\S]*missions\.slug = scores\.mission_slug/i,
    "correction identifies seeded missions by mission slug",
  );
  expectRoleLaneCorrectionSql(
    /JOIN public\.characters AS characters[\s\S]*characters\.slug = seed_characters\.market_slug/i,
    "correction resolves market characters by slug",
  );
  expectRoleLaneCorrectionSql(
    /Daily Crew Builder role-lane correction missing public\.characters slugs/i,
    "correction fails clearly when market character slugs are missing",
  );
  expectRoleLaneCorrectionSql(
    /UPDATE public\.daily_crew_mission_pool AS pool[\s\S]*SET visible_tags = pool_tags\.visible_tags/i,
    "correction updates public-safe visible role tags",
  );
  expectRoleLaneCorrectionSql(
    /UPDATE public\.daily_crew_character_role_scores AS score_rows[\s\S]*score = scores\.score[\s\S]*explanation = scores\.explanation/i,
    "correction updates hidden role score rows",
  );
  expectRoleLaneCorrectionSql(
    /UPDATE public\.daily_crew_perfect_solution AS solution_rows[\s\S]*SET character_id = characters\.id/i,
    "correction updates the hidden perfect solution",
  );
  expectRoleLaneCorrectionSql(/v_updated_tags <> 30/i, "correction expects all 30 pool tag rows");
  expectRoleLaneCorrectionSql(
    /v_updated_scores <> 150/i,
    "correction expects all 150 hidden role score rows",
  );
  expectRoleLaneCorrectionSql(
    /v_updated_solution <> 10/i,
    "correction expects all 10 perfect-solution rows",
  );
  expectRoleLaneCorrectionSql(
    /public\.validate_daily_crew_mission\(v_mission_id\)[\s\S]*status = 'published'::public\.daily_crew_mission_status/i,
    "correction validates each mission before preserving published status",
  );
  expectRoleLaneCorrectionSql(
    /\('covert-harbor-infiltration', 'char-usopp', 9, 6, 18, 14, 13\)/i,
    "Covert Harbor gives Usopp the max navigator lane",
  );
  expectRoleLaneCorrectionSql(
    /\('covert-harbor-infiltration', 'char-koby', 10, 11, 15, 12, 11\)/i,
    "Covert Harbor keeps Koby as a strong but non-perfect navigator alternative",
  );
  expectRoleLaneCorrectionSql(
    /\('covert-harbor-infiltration', 'navigator', 'char-usopp'\)/i,
    "Covert Harbor perfect navigator is Usopp",
  );
  expectRoleLaneCorrectionSql(
    /\('covert-harbor-infiltration', 'support', 'char-chopper'\)/i,
    "Covert Harbor perfect support is Chopper",
  );
  expectRoleLaneCorrectionSql(
    /\('storm-gate-rescue', 'support', 'char-marco'\)/i,
    "Storm Gate perfect support remains Marco",
  );

  rejectRoleLaneCorrectionSql(/\buser_wallets\b/i, "correction does not touch wallets");
  rejectRoleLaneCorrectionSql(/\btransactions\b/i, "correction does not write transactions");
  rejectRoleLaneCorrectionSql(
    /\bgrand_line_guess\b/i,
    "correction does not touch Grand Line Guess",
  );
  rejectRoleLaneCorrectionSql(
    /INSERT\s+INTO\s+public\.daily_crew_submissions\b/i,
    "correction does not insert submissions",
  );
  rejectRoleLaneCorrectionSql(
    /UPDATE\s+public\.daily_crew_submissions\b/i,
    "correction does not update submissions",
  );
  rejectRoleLaneCorrectionSql(
    /INSERT\s+INTO\s+public\.daily_crew_submission_roles\b/i,
    "correction does not insert submitted roles",
  );
  rejectRoleLaneCorrectionSql(
    /UPDATE\s+public\.daily_crew_submission_roles\b/i,
    "correction does not update submitted roles",
  );
  rejectRoleLaneCorrectionSql(/\breward_paid\b/i, "correction does not modify payout state");
  rejectRoleLaneCorrectionSql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.award_daily_crew/i,
    "correction does not add payout RPC",
  );
  rejectRoleLaneCorrectionSql(
    /INSERT\s+INTO\s+public\.daily_crew_missions\b/i,
    "correction does not create missions",
  );
  rejectRoleLaneCorrectionSql(
    /INSERT\s+INTO\s+public\.daily_crew_mission_pool\b/i,
    "correction does not create pool rows",
  );
  rejectRoleLaneCorrectionSql(/ALTER\s+TABLE\b/i, "correction does not evolve schema");
  rejectRoleLaneCorrectionSql(/\bkoala\b/i, "correction does not introduce Koala");
  rejectRoleLaneCorrectionSql(/\bperona\b/i, "correction does not introduce Perona");
});

test("Daily Crew Builder payout RPC pays stored rewards idempotently and remains service-role only", () => {
  expectPayoutSql(
    /CREATE OR REPLACE FUNCTION public\.award_daily_crew_builder_reward\(\s*_submission_id uuid,\s*_user_id uuid\s*\)\s*RETURNS jsonb/i,
    "payout RPC exists with the approved signature",
  );
  expectPayoutSql(/SECURITY DEFINER/i, "payout RPC is security definer");
  expectPayoutSql(
    /SET search_path = pg_catalog, public, pg_temp/i,
    "payout RPC uses a fixed safe search path",
  );
  expectPayoutSql(
    /FROM public\.daily_crew_submissions[\s\S]*WHERE id = _submission_id[\s\S]*FOR UPDATE/i,
    "payout RPC locks the target submission row",
  );
  expectPayoutSql(/v_submission\.user_id <> _user_id/i, "payout RPC verifies submission ownership");
  expectPayoutSql(
    /IF v_submission\.reward_paid THEN[\s\S]*'alreadyPaid', true/i,
    "paid submissions return idempotently",
  );
  expectPayoutSql(
    /INSERT INTO public\.user_wallets \(user_id\)\s*VALUES \(_user_id\)\s*ON CONFLICT \(user_id\) DO NOTHING/i,
    "missing wallets are created using database defaults",
  );
  expectPayoutSql(
    /v_wallet_balance public\.user_wallets\.berries%TYPE/i,
    "wallet balance return value preserves wallet column precision",
  );
  expectPayoutSql(
    /FROM public\.user_wallets[\s\S]*WHERE user_id = _user_id[\s\S]*FOR UPDATE/i,
    "wallet row is locked before payout",
  );
  expectPayoutSql(
    /IF v_submission\.reward_amount > 0 THEN[\s\S]*UPDATE public\.user_wallets[\s\S]*berries = berries \+ v_submission\.reward_amount/i,
    "positive rewards increment berries by the stored reward amount",
  );
  expectPayoutSql(
    /UPDATE public\.daily_crew_submissions[\s\S]*reward_paid = true/i,
    "payout RPC marks the stored submission paid",
  );
  expectPayoutSql(
    /'rewardAmount', v_submission\.reward_amount/i,
    "RPC returns the stored reward amount",
  );
  expectPayoutSql(
    /'walletBalance', v_wallet_balance/i,
    "RPC returns wallet balance for UI confirmation",
  );
  expectPayoutSql(
    /REVOKE EXECUTE ON FUNCTION public\.award_daily_crew_builder_reward\(uuid, uuid\) FROM PUBLIC, anon, authenticated/i,
    "browser roles cannot execute payout directly",
  );
  expectPayoutSql(
    /GRANT EXECUTE ON FUNCTION public\.award_daily_crew_builder_reward\(uuid, uuid\) TO service_role/i,
    "service role can execute payout",
  );
  expectPayoutSql(/NOTIFY pgrst, 'reload schema'/i, "schema cache reload notification is included");

  rejectPayoutSql(/_reward_amount/i, "payout RPC does not accept or trust a client reward amount");
  rejectPayoutSql(/\btransactions\b/i, "payout RPC does not write stock transaction history");
  rejectPayoutSql(/\buser_holdings\b/i, "payout RPC does not touch holdings");
  rejectPayoutSql(/UPDATE\s+public\.characters\b/i, "payout RPC does not touch character prices");
  rejectPayoutSql(/\bprice_history\b/i, "payout RPC does not touch price history");
  rejectPayoutSql(/\bgrand_line_guess\b/i, "payout RPC does not touch Grand Line Guess tables");
  rejectPayoutSql(
    /INSERT\s+INTO\s+public\.daily_crew_submissions\b/i,
    "payout RPC does not create submissions",
  );
  rejectPayoutSql(
    /INSERT\s+INTO\s+public\.daily_crew_submission_roles\b/i,
    "payout RPC does not touch submitted role rows",
  );
  rejectPayoutSql(
    /UPDATE\s+public\.daily_crew_submission_roles\b/i,
    "payout RPC does not touch submitted role rows",
  );
  rejectPayoutSql(
    /UPDATE\s+public\.daily_crew_missions\b/i,
    "payout RPC does not touch mission setup",
  );
  rejectPayoutSql(
    /UPDATE\s+public\.daily_crew_mission_pool\b/i,
    "payout RPC does not touch mission setup",
  );
  rejectPayoutSql(
    /UPDATE\s+public\.daily_crew_character_role_scores\b/i,
    "payout RPC does not touch hidden scores",
  );
});

test("simplified jobs migration supports three-job missions without changing payout", () => {
  expectSimplifiedJobsSql(
    /ADD COLUMN IF NOT EXISTS display_label text[\s\S]*ADD COLUMN IF NOT EXISTS display_order integer/i,
    "role requirements gain public display labels and order",
  );
  expectSimplifiedJobsSql(
    /daily_crew_role_requirements_max_points_check[\s\S]*CHECK \(max_points BETWEEN 1 AND 30\)/i,
    "role requirements can support 30-point simplified jobs",
  );
  expectSimplifiedJobsSql(
    /daily_crew_character_role_scores_score_check[\s\S]*CHECK \(score BETWEEN 0 AND 30\)/i,
    "hidden role scores can support 30-point jobs",
  );
  expectSimplifiedJobsSql(
    /daily_crew_submission_roles_role_score_check[\s\S]*CHECK \(role_score BETWEEN 0 AND 30\)/i,
    "submitted role scores can persist 30-point jobs",
  );
  expectSimplifiedJobsSql(
    /v_pool_count IN \(9, 15\)/i,
    "validation supports legacy and simplified pool sizes",
  );
  expectSimplifiedJobsSql(
    /v_pool_straw_hats <= 5/i,
    "validation keeps the shared five Straw Hat pool cap",
  );
  expectSimplifiedJobsSql(
    /v_requirement_count IN \(3, 5\)/i,
    "validation supports legacy and simplified job counts",
  );
  expectSimplifiedJobsSql(
    /v_score_count = v_pool_count \* v_requirement_count/i,
    "validation requires full score coverage",
  );
  expectSimplifiedJobsSql(/v_requirement_max_points_total = 90/i, "role max points still total 90");
  expectSimplifiedJobsSql(
    /v_solution_score_total = 90/i,
    "perfect solution still has 90 role-fit points",
  );
  expectSimplifiedJobsSql(/'covert-harbor-extraction'/i, "simplified mission is seeded");
  expectSimplifiedJobsSql(
    /DATE '2026-07-12'/i,
    "simplified mission is scheduled after the existing seeded missions",
  );
  expectSimplifiedJobsSql(
    /'draft'::public\.daily_crew_mission_status/i,
    "simplified mission is inserted as draft first",
  );
  expectSimplifiedJobsSql(
    /public\.validate_daily_crew_mission\(v_mission_id\)[\s\S]*status = 'published'::public\.daily_crew_mission_status/i,
    "simplified mission is published only after validation passes",
  );
  expectSimplifiedJobsSql(/'Operation Lead'/i, "operation lead is a public job label");
  expectSimplifiedJobsSql(/'Scout \/ Lookout'/i, "Scout / Lookout is a public job label");
  expectSimplifiedJobsSql(/'Emergency Support'/i, "emergency support is a public job label");
  expectSimplifiedJobsSql(
    /'char-robin', 'robin'/i,
    "simplified seed uses the known market slug for Robin",
  );
  expectSimplifiedJobsSql(
    /'char-chopper', 'chopper'/i,
    "simplified seed uses the known market slug for Chopper",
  );
  expectSimplifiedJobsSql(
    /'char-law', 'law'/i,
    "simplified seed uses the known market slug for Law",
  );
  expectSimplifiedJobsSql(
    /'char-law', 3, false, ARRAY\['captain', 'surgeon', 'tactical'\]/i,
    "simplified seed uses Law as a non-Straw-Hat pool member",
  );
  expectSimplifiedJobsSql(
    /'char-shanks'[\s\S]*'char-usopp'[\s\S]*'char-chopper'/i,
    "perfect trio is seeded",
  );
  expectSimplifiedJobsSql(
    /v_required_role_count NOT IN \(3, 5\)/i,
    "submission RPC supports only approved role counts",
  );
  expectSimplifiedJobsSql(
    /v_assignment_count <> v_required_role_count/i,
    "submission RPC validates dynamic assignment counts",
  );
  expectSimplifiedJobsSql(
    /v_valid_assignment_count <> v_required_role_count/i,
    "submission RPC validates dynamic mission jobs",
  );
  expectSimplifiedJobsSql(
    /v_inserted_role_count <> v_required_role_count/i,
    "submission RPC persists dynamic role counts",
  );
  expectSimplifiedJobsSql(
    /GRANT EXECUTE ON FUNCTION public\.record_daily_crew_builder_submission[\s\S]*TO service_role/i,
    "recording RPC remains service-role only",
  );

  const simplifiedPoolSeedRows = [
    ...simplifiedJobsSql.matchAll(/\('char-[^']+',\s*\d+,\s*(true|false),\s*ARRAY\[/gi),
  ];
  assert.equal(
    simplifiedPoolSeedRows.filter((row) => row[1].toLowerCase() === "true").length,
    5,
    "simplified seed pool has no more than five Straw Hats",
  );

  rejectSimplifiedJobsSql(
    /ALTER TYPE public\.daily_crew_role ADD VALUE/i,
    "simplified jobs avoid enum changes",
  );
  rejectSimplifiedJobsSql(
    /CASE WHEN v_pool_count = 9 THEN 6 ELSE 5 END/i,
    "simplified jobs do not allow a six Straw Hat pool",
  );
  rejectSimplifiedJobsSql(/'char-jinbe'/i, "simplified mission seed does not include Jinbe");
  rejectSimplifiedJobsSql(
    /\bnico-robin\b/i,
    "simplified seed does not use the wrong Robin market slug",
  );
  rejectSimplifiedJobsSql(
    /\btony-tony-chopper\b/i,
    "simplified seed does not use the wrong Chopper market slug",
  );
  rejectSimplifiedJobsSql(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.award_daily_crew/i,
    "simplified jobs do not change payout RPC",
  );
  rejectSimplifiedJobsSql(/\btransactions\b/i, "simplified jobs do not write transactions");
  rejectSimplifiedJobsSql(
    /UPDATE\s+public\.user_wallets\b/i,
    "simplified jobs do not update wallets",
  );
  rejectSimplifiedJobsSql(
    /UPDATE\s+public\.characters\b/i,
    "simplified jobs do not touch character prices",
  );
  rejectSimplifiedJobsSql(
    /UPDATE\s+public\.daily_crew_submissions\b/i,
    "simplified jobs do not update saved submissions",
  );
  rejectSimplifiedJobsSql(/\bgrand_line_guess\b/i, "simplified jobs do not touch Grand Line Guess");
});

test("the previously removed duplicate wallet migration is not reintroduced", () => {
  assert.equal(
    existsSync(removedDuplicateWalletMigrationPath),
    false,
    "duplicate Lovable-style wallet migration should remain absent",
  );
});

test("Daily Crew Builder authoring backend adds service-role-only atomic RPCs", () => {
  expectAuthoringBackendSql(
    /CREATE OR REPLACE FUNCTION public\.validate_daily_crew_mission\(\s*_mission_id uuid\s*\)\s*RETURNS boolean\s*LANGUAGE plpgsql\s*STABLE\s*SECURITY DEFINER\s*SET search_path = pg_catalog, public, pg_temp/i,
    "validator keeps the latest effective signature, stability, security, and search path",
  );
  expectAuthoringBackendSql(
    /REVOKE EXECUTE ON FUNCTION public\.validate_daily_crew_mission\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
    "validator remains revoked from browser roles",
  );
  expectAuthoringBackendSql(
    /GRANT EXECUTE ON FUNCTION public\.validate_daily_crew_mission\(uuid\)[\s\S]*TO service_role/i,
    "validator remains executable only by service_role",
  );
  expectAuthoringBackendSql(
    /CREATE OR REPLACE FUNCTION public\.admin_save_daily_crew_builder_mission\(\s*_mission_id uuid,\s*_mission_date date,\s*_slug text,\s*_title text,\s*_brief text,\s*_mission_tags text\[\],\s*_reveal_policy public\.daily_crew_reveal_policy,\s*_reveal_at timestamptz,\s*_pool jsonb,\s*_jobs jsonb,\s*_scores jsonb,\s*_perfect_solution jsonb\s*\)\s*RETURNS jsonb/i,
    "authoring RPC has the exact approved signature",
  );
  expectAuthoringBackendSql(
    /CREATE OR REPLACE FUNCTION public\.admin_set_daily_crew_builder_mission_status\(\s*_mission_id uuid,\s*_target_status public\.daily_crew_mission_status\s*\)\s*RETURNS jsonb/i,
    "status RPC has the exact approved signature",
  );
  for (const functionName of [
    "admin_save_daily_crew_builder_mission",
    "admin_set_daily_crew_builder_mission_status",
  ]) {
    expectAuthoringBackendSql(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}[\\s\\S]*LANGUAGE plpgsql[\\s\\S]*SECURITY DEFINER[\\s\\S]*SET search_path = pg_catalog, public, pg_temp`,
        "i",
      ),
      `${functionName} is a fixed-search-path SECURITY DEFINER function`,
    );
    expectAuthoringBackendSql(
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${functionName}[\\s\\S]*FROM PUBLIC, anon, authenticated`,
        "i",
      ),
      `${functionName} is revoked from browser roles`,
    );
    expectAuthoringBackendSql(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}[\\s\\S]*TO service_role`, "i"),
      `${functionName} is executable only by service_role`,
    );
  }
  expectAuthoringBackendSql(/BEGIN;[\s\S]*COMMIT;/i, "migration is transactional");
  expectAuthoringBackendSql(
    /DELETE FROM public\.daily_crew_perfect_solution[\s\S]*DELETE FROM public\.daily_crew_character_role_scores[\s\S]*DELETE FROM public\.daily_crew_role_requirements[\s\S]*DELETE FROM public\.daily_crew_mission_pool[\s\S]*UPDATE public\.daily_crew_missions[\s\S]*INSERT INTO public\.daily_crew_mission_pool[\s\S]*INSERT INTO public\.daily_crew_role_requirements[\s\S]*INSERT INTO public\.daily_crew_character_role_scores[\s\S]*INSERT INTO public\.daily_crew_perfect_solution/i,
    "draft updates clear children, update metadata, and insert replacement configuration in dependency-safe order",
  );
  expectAuthoringBackendSql(
    /v_ready := public\.validate_daily_crew_mission\(v_mission_id\);[\s\S]*IF NOT v_ready THEN[\s\S]*RAISE EXCEPTION/i,
    "authoring save calls final mission validation and rolls back when not ready",
  );
  expectAuthoringBackendSql(/NOTIFY pgrst, 'reload schema'/i, "PostgREST schema is reloaded");
});

test("Daily Crew Builder mission readiness validator requires exact format pairings", () => {
  expectAuthoringBackendSql(
    /\(\s*\(v_pool_count = 9 AND v_requirement_count = 3\)\s*OR \(v_pool_count = 15 AND v_requirement_count = 5\)\s*\)/i,
    "validator accepts exactly 9/3 and 15/5 mission formats",
  );
  rejectAuthoringBackendSql(
    /v_pool_count\s+IN\s*\(\s*9\s*,\s*15\s*\)[\s\S]*v_requirement_count\s+IN\s*\(\s*3\s*,\s*5\s*\)/i,
    "validator no longer accepts independent pool/job count checks that allow 9/5 or 15/3",
  );
  rejectAuthoringBackendSql(
    /v_requirement_count\s+IN\s*\(\s*3\s*,\s*5\s*\)/i,
    "validator rejects the stale independent job-count predicate",
  );
  expectAuthoringBackendSql(
    /v_pool_straw_hats <= 5/i,
    "validator preserves the pool Straw Hat cap",
  );
  expectAuthoringBackendSql(
    /v_requirement_role_count = v_requirement_count/i,
    "validator preserves distinct role coverage",
  );
  expectAuthoringBackendSql(
    /v_requirement_display_order_count = v_requirement_count/i,
    "validator preserves distinct job display-order coverage",
  );
  expectAuthoringBackendSql(
    /v_requirement_max_points_total = 90/i,
    "validator preserves the 90 role-fit point total",
  );
  expectAuthoringBackendSql(
    /v_solution_count = v_requirement_count[\s\S]*v_solution_role_count = v_requirement_count/i,
    "validator preserves perfect-solution role coverage",
  );
  expectAuthoringBackendSql(
    /v_solution_straw_hats <= 3/i,
    "validator preserves the perfect-solution Straw Hat cap",
  );
  expectAuthoringBackendSql(
    /v_score_count = v_pool_count \* v_requirement_count/i,
    "validator preserves complete score-matrix coverage",
  );
  expectAuthoringBackendSql(
    /v_solution_score_total = 90/i,
    "validator preserves full-max perfect-solution scoring",
  );
});

test("Daily Crew Builder authoring save validates drafts and supported formats", () => {
  expectAuthoringBackendSql(
    /_mission_date IS NULL OR _mission_date < v_today/i,
    "authoring rejects past mission dates",
  );
  expectAuthoringBackendSql(
    /_slug !~ '\^\[a-z0-9\]\(\?:\[a-z0-9-\]\{0,78\}\[a-z0-9\]\)\?\$'/i,
    "authoring validates the existing slug format",
  );
  expectAuthoringBackendSql(
    /char_length\(v_title\) NOT BETWEEN 1 AND 120/i,
    "title is trimmed and bounded",
  );
  expectAuthoringBackendSql(
    /char_length\(v_brief\) NOT BETWEEN 1 AND 2000/i,
    "brief is trimmed and bounded",
  );
  expectAuthoringBackendSql(
    /array_length\(_mission_tags, 1\), 0\) > 8/i,
    "mission tags are bounded",
  );
  expectAuthoringBackendSql(
    /\(v_pool_count = 9 AND v_job_count = 3\)[\s\S]*OR \(v_pool_count = 15 AND v_job_count = 5\)/i,
    "authoring supports exactly 9/3 and 15/5 mission formats",
  );
  expectAuthoringBackendSql(
    /v_score_count <> v_pool_count \* v_job_count/i,
    "score matrix must cover every pool character and job",
  );
  expectAuthoringBackendSql(
    /v_solution_count <> v_job_count/i,
    "perfect solution must include one row per configured job",
  );
  expectAuthoringBackendSql(
    /INSERT INTO public\.daily_crew_missions[\s\S]*'draft'::public\.daily_crew_mission_status/i,
    "created authoring missions always start as draft",
  );
  expectAuthoringBackendSql(
    /IF v_existing_mission\.status <> 'draft'::public\.daily_crew_mission_status THEN[\s\S]*Only draft Daily Crew Builder missions can be edited/i,
    "only drafts can be edited",
  );
  expectAuthoringBackendSql(
    /FROM public\.daily_crew_submissions[\s\S]*WHERE mission_id = _mission_id[\s\S]*Daily Crew Builder missions with submissions cannot be edited/i,
    "missions with submissions cannot be edited",
  );
  expectAuthoringBackendSql(
    /USING ERRCODE = '23505'/i,
    "duplicate date and slug conflicts remain explicit",
  );
});

test("Daily Crew Builder authoring save validates pool, jobs, scores, and perfect solution", () => {
  expectAuthoringBackendSql(
    /count\(DISTINCT character_id\) AS character_count/i,
    "pool rejects duplicate characters",
  );
  expectAuthoringBackendSql(
    /count\(DISTINCT display_order\) AS display_order_count/i,
    "pool and jobs reject duplicate display orders",
  );
  expectAuthoringBackendSql(/straw_hat_count > 5/i, "pool keeps the five Straw Hat cap");
  expectAuthoringBackendSql(
    /LEFT JOIN public\.characters AS characters/i,
    "pool character IDs must exist",
  );
  expectAuthoringBackendSql(
    /COALESCE\(array_length\(visible_tags, 1\), 0\) > 5/i,
    "visible tags are bounded",
  );
  expectAuthoringBackendSql(
    /value <> btrim\(value\)[\s\S]*char_length\(value\) > 40/i,
    "tags must be trimmed and bounded",
  );
  expectAuthoringBackendSql(
    /subtype_key !~ '\^\[a-z0-9\]\(\?:\[a-z0-9_-\]\{0,62\}\[a-z0-9\]\)\?\$'/i,
    "job subtype keys use the existing format",
  );
  expectAuthoringBackendSql(
    /char_length\(display_label\) NOT BETWEEN 1 AND 120/i,
    "job labels are trimmed and bounded",
  );
  expectAuthoringBackendSql(
    /max_points < 1[\s\S]*max_points > 30/i,
    "job max points are from 1 through 30",
  );
  expectAuthoringBackendSql(/max_points_total <> 90/i, "job max points total exactly 90");
  expectAuthoringBackendSql(
    /count\(DISTINCT \(character_id, role\)\) AS pair_count/i,
    "score matrix rejects duplicate character-role pairs",
  );
  expectAuthoringBackendSql(
    /scores\.score < 0[\s\S]*scores\.score > jobs\.max_points/i,
    "scores cannot exceed the configured job max",
  );
  expectAuthoringBackendSql(
    /LEFT JOIN pool_input AS pool[\s\S]*LEFT JOIN job_input AS jobs/i,
    "scores cannot use characters or roles outside the mission",
  );
  expectAuthoringBackendSql(
    /count\(DISTINCT role\) AS role_count[\s\S]*count\(DISTINCT character_id\) AS character_count/i,
    "perfect solution rejects duplicate roles and characters",
  );
  expectAuthoringBackendSql(
    /scores\.score <> jobs\.max_points/i,
    "perfect solution characters must be max-score fits",
  );
  expectAuthoringBackendSql(
    /IF v_invalid_count > 3 THEN[\s\S]*perfect solution cannot include more than 3 Straw Hats/i,
    "perfect solution keeps the three Straw Hat cap",
  );
});

test("Daily Crew Builder authoring status RPC enforces allowed scheduling transitions", () => {
  expectAuthoringBackendSql(
    /_target_status = 'published'::public\.daily_crew_mission_status[\s\S]*cannot be manually published/i,
    "status RPC cannot set published",
  );
  expectAuthoringBackendSql(
    /v_mission\.status = 'draft'::public\.daily_crew_mission_status[\s\S]*_target_status = 'scheduled'::public\.daily_crew_mission_status/i,
    "draft can become scheduled",
  );
  expectAuthoringBackendSql(
    /v_mission\.mission_date < v_today[\s\S]*past missions cannot be scheduled/i,
    "past draft missions cannot be scheduled",
  );
  expectAuthoringBackendSql(
    /IF NOT v_ready THEN[\s\S]*mission is not ready to schedule/i,
    "draft to scheduled requires validation readiness",
  );
  expectAuthoringBackendSql(
    /v_mission\.status = 'scheduled'::public\.daily_crew_mission_status[\s\S]*_target_status = 'draft'::public\.daily_crew_mission_status[\s\S]*v_mission\.mission_date <= v_today OR v_submission_count > 0/i,
    "scheduled can return to draft only before its UTC date and before submissions",
  );
  expectAuthoringBackendSql(
    /v_mission\.status = 'draft'::public\.daily_crew_mission_status[\s\S]*_target_status = 'archived'::public\.daily_crew_mission_status/i,
    "draft can archive",
  );
  expectAuthoringBackendSql(
    /v_mission\.status = 'scheduled'::public\.daily_crew_mission_status[\s\S]*_target_status = 'archived'::public\.daily_crew_mission_status[\s\S]*v_mission\.mission_date = v_today/i,
    "active scheduled mission cannot archive",
  );
  expectAuthoringBackendSql(
    /v_mission\.status = 'archived'::public\.daily_crew_mission_status[\s\S]*_target_status = 'draft'::public\.daily_crew_mission_status[\s\S]*v_mission\.mission_date < v_today OR v_submission_count > 0/i,
    "archived can return to draft only when current or future and without submissions",
  );
  expectAuthoringBackendSql(
    /v_mission\.status = 'published'::public\.daily_crew_mission_status[\s\S]*_target_status = 'archived'::public\.daily_crew_mission_status[\s\S]*v_mission\.mission_date >= v_today/i,
    "only past published missions can archive",
  );
  expectAuthoringBackendSql(
    /RETURN jsonb_build_object\([\s\S]*'poolCount', v_pool_count,[\s\S]*'jobCount', v_job_count,[\s\S]*'scoreCount', v_score_count,[\s\S]*'submissionCount', v_submission_count/i,
    "status RPC returns the same operational count fields as the authoring RPC",
  );
});

test("Daily Crew Builder scheduled and published missions both require readiness", () => {
  expectAuthoringBackendSql(
    /CREATE OR REPLACE FUNCTION public\.validate_daily_crew_mission\([\s\S]*\(v_pool_count = 9 AND v_requirement_count = 3\)[\s\S]*\(v_pool_count = 15 AND v_requirement_count = 5\)[\s\S]*CREATE OR REPLACE FUNCTION public\.enforce_daily_crew_publish_ready\(\)[\s\S]*public\.validate_daily_crew_mission\(NEW\.id\)/i,
    "scheduled and published readiness uses the corrected paired-format validator",
  );
  expectAuthoringBackendSql(
    /CREATE OR REPLACE FUNCTION public\.enforce_daily_crew_publish_ready\(\)[\s\S]*NEW\.status IN \(\s*'scheduled'::public\.daily_crew_mission_status,\s*'published'::public\.daily_crew_mission_status\s*\)[\s\S]*NOT public\.validate_daily_crew_mission\(NEW\.id\)/i,
    "readiness trigger now guards scheduled and published missions",
  );
  expectAuthoringBackendSql(
    /REVOKE EXECUTE ON FUNCTION public\.enforce_daily_crew_publish_ready\(\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
    "readiness trigger function remains revoked from browser roles",
  );
  expectAuthoringBackendSql(
    /GRANT EXECUTE ON FUNCTION public\.enforce_daily_crew_publish_ready\(\)[\s\S]*TO service_role/i,
    "readiness trigger function remains service-role executable",
  );
});

test("Daily Crew Builder authoring backend does not broaden gameplay or financial scope", () => {
  rejectAuthoringBackendSql(/\bcron\b/i, "authoring backend does not add cron");
  rejectAuthoringBackendSql(
    /CREATE\s+TRIGGER/i,
    "authoring backend preserves the existing trigger",
  );
  rejectAuthoringBackendSql(/CREATE\s+POLICY/i, "authoring backend does not change browser RLS");
  rejectAuthoringBackendSql(
    /record_daily_crew_builder_submission/i,
    "authoring backend does not change submission RPC",
  );
  rejectAuthoringBackendSql(
    /award_daily_crew_builder_reward/i,
    "authoring backend does not change payout RPC",
  );
  rejectAuthoringBackendSql(
    /UPDATE\s+public\.user_wallets\b/i,
    "authoring backend does not mutate wallets",
  );
  rejectAuthoringBackendSql(
    /\bwallet_ledger_entries\b/i,
    "authoring backend does not write ledger entries",
  );
  rejectAuthoringBackendSql(
    /\btransactions\b/i,
    "authoring backend does not write stock transactions",
  );
  rejectAuthoringBackendSql(
    /UPDATE\s+public\.characters\b/i,
    "authoring backend does not change character prices",
  );
  rejectAuthoringBackendSql(
    /grand_line_guess/i,
    "authoring backend does not touch Grand Line Guess",
  );
  rejectAuthoringBackendSql(
    /INSERT\s+INTO\s+public\.daily_crew_submissions\b/i,
    "authoring backend does not create player submissions",
  );
  rejectAuthoringBackendSql(
    /UPDATE\s+public\.daily_crew_submissions\b/i,
    "authoring backend does not update player submissions",
  );
  rejectAuthoringBackendSql(
    /INSERT\s+INTO\s+public\.daily_crew_submission_roles\b/i,
    "authoring backend does not create player submission roles",
  );
});
