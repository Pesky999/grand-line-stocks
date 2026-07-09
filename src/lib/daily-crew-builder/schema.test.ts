/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationPath = join(
  migrationsDir,
  "20260709030000_create_daily_crew_builder_schema.sql",
);
const removedDuplicateWalletMigrationPath = join(
  migrationsDir,
  "20260709010521_db0aade3-3c7b-4b2e-b4bc-ff7e1eb423cb.sql",
);
const sql = readFileSync(migrationPath, "utf8");

function stripSqlComments(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const sqlWithoutComments = stripSqlComments(sql);

function expectSql(pattern: RegExp, message: string): void {
  assert.match(sql, pattern, message);
}

function rejectSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(sqlWithoutComments, pattern, message);
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
  expectSql(/max_score integer NOT NULL DEFAULT 100 CHECK \(max_score = 100\)/i, "mission max score is fixed to 100");
  expectSql(/status public\.daily_crew_mission_status NOT NULL DEFAULT 'draft'/i, "missions start as draft");
  expectSql(/reveal_policy public\.daily_crew_reveal_policy NOT NULL DEFAULT 'next_day'/i, "reveal policy is stored");
  expectSql(/mission_tags text\[\] NOT NULL DEFAULT '\{\}'/i, "mission tags are supported");

  expectSql(/character_id uuid NOT NULL REFERENCES public\.characters\(id\) ON DELETE RESTRICT/i, "pool references market characters");
  expectSql(/display_order integer NOT NULL CHECK \(display_order BETWEEN 1 AND 12\)/i, "pool display order is 1 through 12");
  expectSql(/is_straw_hat boolean NOT NULL DEFAULT false/i, "pool stores explicit Straw Hat membership");
  expectSql(/visible_tags text\[\] NOT NULL DEFAULT '\{\}'/i, "pool can expose safe visible tags");
  expectSql(/UNIQUE \(mission_id, character_id\)/i, "pool cannot repeat a character");
  expectSql(/UNIQUE \(mission_id, display_order\)/i, "pool cannot repeat display order");
});

test("hidden role requirements, role scores, and perfect solution are modeled separately", () => {
  expectSql(/role public\.daily_crew_role NOT NULL/i, "role enum is used");
  expectSql(/subtype_key text NOT NULL CHECK \(subtype_key ~ /i, "hidden subtype key is stored");
  expectSql(/subtype_label text CHECK/i, "optional subtype label is supported");
  expectSql(/max_points integer NOT NULL DEFAULT 18 CHECK \(max_points BETWEEN 1 AND 18\)/i, "role requirements cap points");
  expectSql(/score integer NOT NULL CHECK \(score BETWEEN 0 AND 18\)/i, "character role scores are bounded");
  expectSql(/role_score integer NOT NULL CHECK \(role_score BETWEEN 0 AND 18\)/i, "submitted role scores are bounded");
  expectSql(/PRIMARY KEY \(mission_id, role\)/i, "requirements and perfect solution use one row per mission role");
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
  expectSql(/user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/i, "submissions belong to auth users");
  expectSql(/score integer NOT NULL CHECK \(score BETWEEN 0 AND 100\)/i, "submission score is bounded");
  expectSql(/rank public\.daily_crew_rank NOT NULL/i, "submission rank uses the rank enum");
  expectSql(/reward_amount integer NOT NULL DEFAULT 0 CHECK \(reward_amount >= 0\)/i, "reward amount is non-negative");
  expectSql(/reward_paid boolean NOT NULL DEFAULT false/i, "reward-paid state is present for future idempotency");
  expectSql(/score_breakdown jsonb NOT NULL DEFAULT '\{\}'::jsonb/i, "score breakdown can be stored without hidden table reads");
  expectSql(/UNIQUE \(mission_id, user_id\)/i, "users can submit once per mission");
  expectSql(/UNIQUE \(id, mission_id\)/i, "submissions expose a safe composite parent key for role rows");
  expectSql(/PRIMARY KEY \(submission_id, role\)/i, "submitted assignments have one row per role");
  expectSql(/mission_id uuid NOT NULL/i, "submitted role rows carry mission identity for composite foreign keys");
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
  expectSql(/CREATE OR REPLACE FUNCTION public\.validate_daily_crew_mission\(_mission_id uuid\)/i, "validation function exists");
  expectSql(/v_pool_count = 12/i, "published validation requires 12 pool characters");
  expectSql(/v_pool_straw_hats <= 5/i, "published validation enforces the pool Straw Hat cap");
  expectSql(/v_requirement_count = 5/i, "published validation requires five role requirements");
  expectSql(/v_requirement_role_count = 5/i, "published validation requires five distinct requirement roles");
  expectSql(/v_solution_count = 5/i, "published validation requires five perfect solution rows");
  expectSql(/v_solution_role_count = 5/i, "published validation requires five distinct solution roles");
  expectSql(/v_solution_straw_hats <= 3/i, "published validation enforces the perfect solution Straw Hat cap");
  expectSql(/CREATE TRIGGER daily_crew_pool_limits/i, "pool limit trigger exists");
  expectSql(/CREATE TRIGGER daily_crew_solution_limits/i, "solution limit trigger exists");
  expectSql(/CREATE TRIGGER daily_crew_publish_ready/i, "publish readiness trigger exists");
  expectSql(/NEW\.status = 'published'::public\.daily_crew_mission_status/i, "publish readiness only runs for published missions");
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

  expectSql(/GRANT SELECT ON TABLE public\.daily_crew_missions TO anon, authenticated/i, "published mission details are public-readable");
  expectSql(/GRANT SELECT ON TABLE public\.daily_crew_mission_pool TO anon, authenticated/i, "published mission pool is public-readable");
  expectSql(/CREATE POLICY "Published daily crew missions are public"[\s\S]*status = 'published'::public\.daily_crew_mission_status/i, "only published missions are public");
  expectSql(/CREATE POLICY "Published daily crew mission pools are public"[\s\S]*m\.status = 'published'::public\.daily_crew_mission_status/i, "only published mission pools are public");

  for (const table of hiddenTables) {
    rejectSql(
      new RegExp(`GRANT SELECT ON TABLE public\\.${table} TO (?:anon|authenticated|anon, authenticated|authenticated, anon)`, "i"),
      `${table} is not granted browser select access`,
    );
    rejectSql(
      new RegExp(`CREATE POLICY [\\s\\S]*ON public\\.${table}[\\s\\S]*TO (?:anon|authenticated)`, "i"),
      `${table} has no browser-readable policy`,
    );
  }
});

test("users can read only their own submission data and cannot write directly", () => {
  expectSql(/GRANT SELECT ON TABLE public\.daily_crew_submissions TO authenticated/i, "users can read own submissions through RLS");
  expectSql(/GRANT SELECT ON TABLE public\.daily_crew_submission_roles TO authenticated/i, "users can read own submitted roles through RLS");
  expectSql(/CREATE POLICY "Users read own daily crew submissions"[\s\S]*auth\.uid\(\) = user_id/i, "submission read policy is owner-only");
  expectSql(/CREATE POLICY "Users read own daily crew submission roles"[\s\S]*s\.user_id = auth\.uid\(\)/i, "submission role read policy is owner-only");

  for (const table of ["daily_crew_submissions", "daily_crew_submission_roles"]) {
    rejectSql(
      new RegExp(`GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\\.${table} TO authenticated`, "i"),
      `${table} does not grant direct authenticated writes`,
    );
  }
});

test("Phase 1 does not mutate wallets, stock prices, or seed daily missions", () => {
  rejectSql(/UPDATE\s+public\.user_wallets\b/i, "migration does not update wallets");
  rejectSql(/INSERT\s+INTO\s+public\.user_wallets\b/i, "migration does not insert wallets");
  rejectSql(/UPDATE\s+public\.characters[\s\S]*(?:current_price|previous_price|momentum|category)/i, "migration does not update market character pricing");
  rejectSql(/INSERT\s+INTO\s+public\.transactions\b/i, "migration does not write transactions");
  rejectSql(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.award_daily_crew/i, "migration does not add reward payout RPC");
  rejectSql(/pg_cron|cron\.schedule|cron\.unschedule/i, "migration does not use cron");
  rejectSql(/INSERT\s+INTO\s+public\.daily_crew_/i, "migration does not seed missions or submissions");
});

test("the previously removed duplicate wallet migration is not reintroduced", () => {
  assert.equal(
    existsSync(removedDuplicateWalletMigrationPath),
    false,
    "duplicate Lovable-style wallet migration should remain absent",
  );
});
