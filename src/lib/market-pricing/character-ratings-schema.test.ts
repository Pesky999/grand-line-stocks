import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationPath = join(
  migrationsDir,
  "20260706024147_91f9dd9e-0b70-4939-96f1-950cbd8caa73.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();

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

test("only one migration defines the character pricing ratings base table", () => {
  const matchingMigrations = readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith(".sql"))
    .filter((filename) => {
      const migrationSql = readFileSync(join(migrationsDir, filename), "utf8");
      return /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.character_pricing_ratings\b/i.test(
        stripSqlComments(migrationSql),
      );
    });

  assert.deepEqual(
    matchingMigrations,
    ["20260706024147_91f9dd9e-0b70-4939-96f1-950cbd8caa73.sql"],
    `expected exactly one base character_pricing_ratings migration, found: ${matchingMigrations.join(", ")}`,
  );
});

test("character pricing ratings table stores only persisted rating inputs and audit metadata", () => {
  expectSql(/CREATE TABLE IF NOT EXISTS public\.character_pricing_ratings/i, "table is created");
  expectSql(
    /character_id uuid PRIMARY KEY REFERENCES public\.characters\(id\) ON DELETE CASCADE/i,
    "one current row per character",
  );

  for (const field of [
    "narrative_importance",
    "current_relevance",
    "strength_status",
    "popularity",
    "future_potential",
    "investor_confidence",
    "volatility",
  ]) {
    expectSql(
      new RegExp(`${field} integer NOT NULL CHECK \\(${field} BETWEEN 0 AND 100\\)`, "i"),
      `${field} is bounded from 0 through 100`,
    );
    expectSql(
      new RegExp(`IF _${field} IS NULL OR _${field} NOT BETWEEN 0 AND 100`, "i"),
      `${field} RPC input rejects null and out-of-range values`,
    );
  }

  expectSql(/stock_category public\.stock_category NOT NULL/i, "stock category is persisted");
  expectSql(
    /comparable_adjustment numeric\(4,2\) NOT NULL CHECK \(comparable_adjustment BETWEEN 0\.75 AND 1\.25\)/i,
    "comparable adjustment is bounded",
  );
  expectSql(
    /IF _comparable_adjustment IS NULL OR _comparable_adjustment NOT BETWEEN 0\.75 AND 1\.25/i,
    "comparable adjustment RPC input rejects null and out-of-range values",
  );
  expectSql(
    /uncertainty_discount_pct numeric\(5,2\) NOT NULL CHECK \(uncertainty_discount_pct BETWEEN 0 AND 25\)/i,
    "uncertainty discount is bounded",
  );
  expectSql(
    /IF _uncertainty_discount_pct IS NULL OR _uncertainty_discount_pct NOT BETWEEN 0 AND 25/i,
    "uncertainty discount RPC input rejects null and out-of-range values",
  );
  expectSql(
    /launch_catalyst_pct numeric\(5,2\) NOT NULL CHECK \(launch_catalyst_pct BETWEEN -30 AND 30\)/i,
    "launch catalyst is bounded",
  );
  expectSql(
    /IF _launch_catalyst_pct IS NULL OR _launch_catalyst_pct NOT BETWEEN -30 AND 30/i,
    "launch catalyst RPC input rejects null and out-of-range values",
  );
  expectSql(/pricing_algorithm_version text NOT NULL/i, "algorithm version is stored");
  expectSql(
    /ratings_status text NOT NULL CHECK \(ratings_status IN \('draft', 'approved'\)\)/i,
    "only draft and approved states are allowed",
  );

  for (const forbidden of [
    "weighted_score",
    "base_fair_value",
    "suggested_opening_price",
    "suggested_post_catalyst_price",
    "confidence",
    "warnings",
  ]) {
    rejectSql(new RegExp(`\\b${forbidden}\\b`, "i"), `${forbidden} is not stored`);
  }
});

test("approval metadata and admin filtering invariants are encoded in SQL", () => {
  expectSql(
    /ratings_status = 'draft' AND approved_at IS NULL AND approved_by IS NULL/i,
    "draft rows clear approval metadata",
  );
  expectSql(
    /ratings_status = 'approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL/i,
    "approved rows require approval metadata",
  );
  expectSql(
    /CREATE INDEX IF NOT EXISTS idx_character_pricing_ratings_status_updated/i,
    "status and updated timestamp index exists",
  );
  expectSql(/CREATE TRIGGER character_pricing_ratings_touch/i, "updated_at trigger exists");
});

test("ratings table is admin-read only and write access is RPC-only", () => {
  expectSql(
    /REVOKE ALL ON TABLE public\.character_pricing_ratings FROM PUBLIC, anon, authenticated/i,
    "browser roles start with no table privileges",
  );
  expectSql(
    /GRANT SELECT ON TABLE public\.character_pricing_ratings TO authenticated/i,
    "authenticated role receives select for RLS-filtered admin reads",
  );
  expectSql(
    /ALTER TABLE public\.character_pricing_ratings ENABLE ROW LEVEL SECURITY/i,
    "RLS is enabled",
  );
  expectSql(
    /CREATE POLICY "Admins read character pricing ratings"[\s\S]*FOR SELECT[\s\S]*TO authenticated[\s\S]*public\.has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/i,
    "only admins can read through RLS",
  );
  rejectSql(
    /GRANT (INSERT|UPDATE|DELETE|ALL) ON TABLE public\.character_pricing_ratings TO authenticated/i,
    "authenticated role is not granted direct write privileges",
  );
});

test("write RPCs derive identity from auth.uid and require admin role", () => {
  for (const functionName of [
    "save_character_pricing_draft",
    "approve_character_pricing_ratings",
    "reset_character_pricing_ratings",
  ]) {
    expectSql(
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}`, "i"),
      `${functionName} exists`,
    );
    expectSql(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}[\\s\\S]*SECURITY DEFINER[\\s\\S]*SET search_path = pg_catalog, public, pg_temp`,
        "i",
      ),
      `${functionName} is security definer with fixed search_path`,
    );
    expectSql(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}[\\s\\S]*v_user uuid := auth\\.uid\\(\\)`,
        "i",
      ),
      `${functionName} derives the user from auth.uid`,
    );
    expectSql(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}[\\s\\S]*public\\.has_role\\(v_user, 'admin'::public\\.app_role\\)`,
        "i",
      ),
      `${functionName} requires an admin role`,
    );
  }

  rejectSql(/_created_by/i, "created_by is not accepted from client input");
  rejectSql(/_updated_by/i, "updated_by is not accepted from client input");
  rejectSql(/_approved_by/i, "approved_by is not accepted from client input");
});

test("save draft, approval, and reset RPCs preserve the intended state transitions", () => {
  expectSql(
    /ratings_status,\s+created_by,\s+updated_by,\s+approved_at,\s+approved_by/i,
    "draft insert sets metadata columns",
  );
  expectSql(/ratings_status = 'draft'/i, "save draft writes draft status");
  expectSql(/updated_by = v_user/i, "save draft derives updated_by");
  expectSql(/approved_at = NULL/i, "save draft clears approved_at");
  expectSql(/approved_by = NULL/i, "save draft clears approved_by");
  rejectSql(/ON CONFLICT \(character_id\)[\s\S]*created_at\s*=/i, "upsert preserves created_at");
  rejectSql(/ON CONFLICT \(character_id\)[\s\S]*created_by\s*=/i, "upsert preserves created_by");
  expectSql(
    /UPDATE public\.character_pricing_ratings AS r[\s\S]*WHERE r\.character_id = _character_id[\s\S]*AND r\.ratings_status = 'draft'[\s\S]*AND r\.pricing_algorithm_version = v_expected_version[\s\S]*RETURNING \* INTO v_approved/i,
    "approval uses one atomic update predicate for draft status and expected algorithm version",
  );
  expectSql(/v_current\.ratings_status <> 'draft'/i, "approval requires a draft");
  expectSql(
    /v_current\.pricing_algorithm_version IS DISTINCT FROM v_expected_version/i,
    "approval rejects stale algorithm versions",
  );
  expectSql(/ratings_status = 'approved'/i, "approval writes approved status");
  expectSql(/approved_by = v_user/i, "approval derives approved_by");
  expectSql(/DELETE FROM public\.character_pricing_ratings/i, "reset deletes the current row");
  expectSql(/RETURNING true INTO v_deleted/i, "reset observes whether a row was deleted");
  expectSql(/RETURN COALESCE\(v_deleted, false\)/i, "reset returns false when no row existed");
});

test("RPC execute privileges are limited to authenticated callers", () => {
  for (const functionName of [
    "save_character_pricing_draft",
    "approve_character_pricing_ratings",
    "reset_character_pricing_ratings",
  ]) {
    expectSql(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}[^;]*FROM PUBLIC, anon, authenticated;`,
        "i",
      ),
      `${functionName} revokes execution from browser roles before granting`,
    );
    expectSql(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}[^;]*TO authenticated;`, "i"),
      `${functionName} grants execution only to authenticated callers`,
    );
    rejectSql(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${functionName}[^;]*TO (PUBLIC|anon|service_role)`,
        "i",
      ),
      `${functionName} is not executable by PUBLIC, anon, or service_role through this migration`,
    );
  }
});

test("migration does not mutate live market, financial, event, or pricing history state", () => {
  for (const forbidden of [
    /UPDATE\s+public\.characters/i,
    /INSERT\s+INTO\s+public\.price_history/i,
    /UPDATE\s+public\.price_history/i,
    /DELETE\s+FROM\s+public\.price_history/i,
    /\bpublic\.user_wallets\b/i,
    /\bpublic\.user_holdings\b/i,
    /\bpublic\.transactions\b/i,
    /\bpublic\.market_events\b/i,
    /\bpublic\.market_event_impacts\b/i,
    /\bpublic\.market_rumors\b/i,
    /\bpublic\.market_rumor_impacts\b/i,
  ]) {
    rejectSql(forbidden, `migration avoids ${forbidden}`);
  }
});
