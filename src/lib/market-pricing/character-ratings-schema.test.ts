import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationPath = join(
  migrationsDir,
  "20260706024147_91f9dd9e-0b70-4939-96f1-950cbd8caa73.sql",
);
const applyMigrationPath = join(
  migrationsDir,
  "20260707010000_save_and_apply_character_pricing.sql",
);
const pricingSource = readFileSync(join(process.cwd(), "src/lib/market-pricing/v1.ts"), "utf8");
const sql = readFileSync(migrationPath, "utf8");

function stripSqlComments(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const sqlWithoutComments = stripSqlComments(sql);
const applySql = readFileSync(applyMigrationPath, "utf8");
const applySqlWithoutComments = stripSqlComments(applySql);

function expectSql(pattern: RegExp, message: string): void {
  assert.match(sql, pattern, message);
}

function rejectSql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(sqlWithoutComments, pattern, message);
}

function expectApplySql(pattern: RegExp, message: string): void {
  assert.match(applySql, pattern, message);
}

function rejectApplySql(pattern: RegExp, message: string): void {
  assert.doesNotMatch(applySqlWithoutComments, pattern, message);
}

function expectPricingSource(pattern: RegExp, message: string): void {
  assert.match(pricingSource, pattern, message);
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

test("save-and-apply migration defines only the direct pricing application RPC", () => {
  expectApplySql(
    /CREATE OR REPLACE FUNCTION public\.save_and_apply_character_pricing\(\s*_character_id uuid,/i,
    "direct save-and-apply RPC exists",
  );
  expectApplySql(/RETURNS jsonb/i, "RPC returns a compact application result");
  expectApplySql(/SECURITY DEFINER/i, "RPC is security definer");
  expectApplySql(
    /SET search_path = pg_catalog, public, pg_temp/i,
    "RPC has a fixed safe search_path",
  );
  expectApplySql(/v_user uuid := auth\.uid\(\)/i, "RPC derives identity from auth.uid");
  expectApplySql(
    /public\.has_role\(v_user, 'admin'::public\.app_role\)/i,
    "RPC independently requires admin role",
  );
  rejectApplySql(/character_pricing_applications/i, "no separate application audit table exists");
  rejectApplySql(
    /approve_and_apply_character_pricing_ratings/i,
    "legacy approve-and-apply RPC name is absent",
  );
  rejectApplySql(
    /CREATE\s+TABLE|ALTER\s+TABLE\s+public\.characters|CREATE\s+POLICY|ALTER\s+POLICY/i,
    "migration does not create tables or alter policies",
  );
});

test("save-and-apply RPC validates ratings, IPO inputs, and algorithm version", () => {
  for (const field of [
    "narrative_importance",
    "current_relevance",
    "strength_status",
    "popularity",
    "future_potential",
    "investor_confidence",
    "volatility",
  ]) {
    expectApplySql(
      new RegExp(`IF _${field} IS NULL OR _${field} NOT BETWEEN 0 AND 100`, "i"),
      `${field} is bounded from 0 through 100`,
    );
  }
  expectApplySql(/IF _stock_category IS NULL/i, "stock category is required");
  expectApplySql(
    /IF _comparable_adjustment IS NULL OR _comparable_adjustment NOT BETWEEN 0\.75 AND 1\.25/i,
    "comparable adjustment is bounded",
  );
  expectApplySql(
    /IF _uncertainty_discount_pct IS NULL OR _uncertainty_discount_pct NOT BETWEEN 0 AND 25/i,
    "uncertainty discount is bounded",
  );
  expectApplySql(
    /IF _launch_catalyst_pct IS NULL OR _launch_catalyst_pct NOT BETWEEN -30 AND 30/i,
    "launch catalyst is bounded",
  );
  expectApplySql(/IF v_version IS NULL OR v_version = ''/i, "algorithm version is required");
  expectApplySql(
    /v_expected_version constant text := '1\.1\.0'/i,
    "the SQL migration pins the current pricing algorithm version",
  );
  expectApplySql(
    /IF v_version <> v_expected_version/i,
    "stale or unsupported pricing algorithm versions are rejected",
  );
  expectApplySql(
    /v_applied_price <= 0 OR v_applied_price > 99999/i,
    "the database-calculated applied price is bounded",
  );
});

test("save-and-apply SQL calculates the authoritative post-catalyst price", () => {
  rejectApplySql(/\b_applied_price\b/i, "direct RPC callers cannot provide an arbitrary price");
  expectPricingSource(/MARKET_PRICING_ALGORITHM_VERSION = "1\.1\.0"/, "source version is 1.1.0");
  expectPricingSource(/MARKET_PRICING_BASE_FAIR_VALUE_MULTIPLIER = 50/, "source multiplier is 50");
  expectPricingSource(
    /MARKET_PRICING_BASE_FAIR_VALUE_EXPONENT = 0\.035835/,
    "source exponent is 0.035835",
  );
  expectApplySql(/v_expected_version constant text := '1\.1\.0'/i, "SQL version is 1.1.0");
  expectApplySql(
    /v_weighted_score :=\s+\(_narrative_importance \* 0\.25\) \+\s+\(_current_relevance \* 0\.20\) \+\s+\(_strength_status \* 0\.15\) \+\s+\(_popularity \* 0\.15\) \+\s+\(_future_potential \* 0\.15\) \+\s+\(_investor_confidence \* 0\.10\);/i,
    "SQL uses the exact current fundamental weights and excludes volatility",
  );
  expectApplySql(
    /v_raw_base_fair_value := 50 \* pg_catalog\.exp\(\(0\.035835 \* v_weighted_score\)::double precision\)::numeric/i,
    "SQL uses the current base multiplier and exponent",
  );
  expectApplySql(
    /v_raw_comparable_adjusted_fair_value := v_raw_base_fair_value \* _comparable_adjustment/i,
    "SQL applies comparable adjustment",
  );
  expectApplySql(
    /v_raw_suggested_opening_price :=\s+v_raw_comparable_adjusted_fair_value \* \(1 - \(_uncertainty_discount_pct \/ 100\)\)/i,
    "SQL applies uncertainty discount",
  );
  expectApplySql(
    /v_raw_suggested_post_catalyst_price :=\s+v_raw_suggested_opening_price \* \(1 \+ \(_launch_catalyst_pct \/ 100\)\)/i,
    "SQL applies launch catalyst",
  );
  expectApplySql(
    /v_applied_price := pg_catalog\.round\(v_raw_suggested_post_catalyst_price, 2\)/i,
    "SQL rounds the final post-catalyst price to two decimals",
  );
  expectApplySql(/current_price = v_applied_price/i, "SQL applies the calculated price");
  expectApplySql(/'newLivePrice', v_applied_price/i, "SQL returns the calculated price");
});

test("pricing formula parity cases document expected post-catalyst prices", () => {
  const roundBerryValue = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const calculateExpected = (input: {
    narrativeImportance: number;
    currentRelevance: number;
    strengthStatus: number;
    popularity: number;
    futurePotential: number;
    investorConfidence: number;
    comparableAdjustment: number;
    uncertaintyDiscountPct: number;
    launchCatalystPct: number;
  }) => {
    const weightedScore =
      input.narrativeImportance * 0.25 +
      input.currentRelevance * 0.2 +
      input.strengthStatus * 0.15 +
      input.popularity * 0.15 +
      input.futurePotential * 0.15 +
      input.investorConfidence * 0.1;
    const rawBaseFairValue = 50 * Math.exp(0.035835 * weightedScore);
    const rawComparableAdjustedFairValue = rawBaseFairValue * input.comparableAdjustment;
    const rawSuggestedOpeningPrice =
      rawComparableAdjustedFairValue * (1 - input.uncertaintyDiscountPct / 100);
    const rawSuggestedPostCatalystPrice =
      rawSuggestedOpeningPrice * (1 + input.launchCatalystPct / 100);
    return roundBerryValue(rawSuggestedPostCatalystPrice);
  };

  const cases = [
    {
      name: "neutral/default-style inputs",
      input: {
        narrativeImportance: 50,
        currentRelevance: 50,
        strengthStatus: 50,
        popularity: 50,
        futurePotential: 50,
        investorConfidence: 50,
        comparableAdjustment: 1,
        uncertaintyDiscountPct: 0,
        launchCatalystPct: 0,
      },
      expected: 300,
    },
    {
      name: "non-default comparable adjustment",
      input: {
        narrativeImportance: 50,
        currentRelevance: 50,
        strengthStatus: 50,
        popularity: 50,
        futurePotential: 50,
        investorConfidence: 50,
        comparableAdjustment: 1.1,
        uncertaintyDiscountPct: 0,
        launchCatalystPct: 0,
      },
      expected: 330,
    },
    {
      name: "uncertainty discount",
      input: {
        narrativeImportance: 50,
        currentRelevance: 50,
        strengthStatus: 50,
        popularity: 50,
        futurePotential: 50,
        investorConfidence: 50,
        comparableAdjustment: 1,
        uncertaintyDiscountPct: 10,
        launchCatalystPct: 0,
      },
      expected: 270,
    },
    {
      name: "positive launch catalyst",
      input: {
        narrativeImportance: 50,
        currentRelevance: 50,
        strengthStatus: 50,
        popularity: 50,
        futurePotential: 50,
        investorConfidence: 50,
        comparableAdjustment: 1,
        uncertaintyDiscountPct: 0,
        launchCatalystPct: 12,
      },
      expected: 336,
    },
    {
      name: "negative launch catalyst",
      input: {
        narrativeImportance: 50,
        currentRelevance: 50,
        strengthStatus: 50,
        popularity: 50,
        futurePotential: 50,
        investorConfidence: 50,
        comparableAdjustment: 1,
        uncertaintyDiscountPct: 0,
        launchCatalystPct: -12,
      },
      expected: 264,
    },
    {
      name: "high rating combination",
      input: {
        narrativeImportance: 100,
        currentRelevance: 100,
        strengthStatus: 100,
        popularity: 100,
        futurePotential: 100,
        investorConfidence: 100,
        comparableAdjustment: 1.25,
        uncertaintyDiscountPct: 0,
        launchCatalystPct: 30,
      },
      expected: 2924.94,
    },
    {
      name: "low rating combination",
      input: {
        narrativeImportance: 0,
        currentRelevance: 0,
        strengthStatus: 0,
        popularity: 0,
        futurePotential: 0,
        investorConfidence: 0,
        comparableAdjustment: 0.75,
        uncertaintyDiscountPct: 25,
        launchCatalystPct: -30,
      },
      expected: 19.69,
    },
  ];

  for (const { name, input, expected } of cases) {
    assert.equal(calculateExpected(input), expected, name);
  }
});

test("save-and-apply RPC atomically saves ratings, updates live price, and records history", () => {
  expectApplySql(/FROM public\.characters AS c[\s\S]*FOR UPDATE/i, "character row is locked");
  expectApplySql(
    /INSERT INTO public\.character_pricing_ratings[\s\S]*ON CONFLICT \(character_id\) DO UPDATE SET/i,
    "ratings are upserted",
  );
  expectApplySql(/ratings_status[\s\S]*'approved'/i, "ratings are saved as approved");
  expectApplySql(/created_by[\s\S]*v_user/i, "insert derives created_by");
  expectApplySql(/updated_by = v_user/i, "update derives updated_by");
  expectApplySql(/approved_at = v_now/i, "approval timestamp is updated");
  expectApplySql(/approved_by = v_user/i, "approval identity is updated");
  expectApplySql(
    /UPDATE public\.characters AS c[\s\S]*previous_price = v_character\.current_price[\s\S]*current_price = v_applied_price[\s\S]*category = _stock_category/i,
    "selected character price and category are updated",
  );
  rejectApplySql(/momentum\s*=/i, "momentum is not modified");
  expectApplySql(
    /INSERT INTO public\.price_history \(character_id, price, note, pct_change, source\)/i,
    "price history is inserted",
  );
  expectApplySql(/'pricing_rebase'/i, "price history source is pricing_rebase");
  expectApplySql(
    /Market Pricing Preview applied valuation using algorithm/i,
    "history note is clear",
  );
});

test("save-and-apply RPC returns the frontend contract and exact privileges", () => {
  for (const key of [
    "ratings",
    "appliedAt",
    "priceHistoryId",
    "pricingAlgorithmVersion",
    "previousLivePrice",
    "newLivePrice",
    "percentageChange",
    "previousCategory",
    "newCategory",
  ]) {
    expectApplySql(new RegExp(`'${key}'`, "i"), `${key} is returned`);
  }
  expectApplySql(
    /REVOKE ALL ON FUNCTION public\.save_and_apply_character_pricing\([^;]*FROM PUBLIC, anon, authenticated;/i,
    "execution is revoked before granting",
  );
  expectApplySql(
    /GRANT EXECUTE ON FUNCTION public\.save_and_apply_character_pricing\([^;]*TO authenticated;/i,
    "authenticated callers may execute the admin-checked RPC",
  );
  rejectApplySql(
    /GRANT EXECUTE ON FUNCTION public\.save_and_apply_character_pricing\([^;]*TO (PUBLIC|anon|service_role)/i,
    "RPC is not granted to PUBLIC, anon, or service_role by this migration",
  );
});

test("save-and-apply migration does not touch unrelated financial, event, or rumor data", () => {
  for (const forbidden of [
    /\bpublic\.user_wallets\b/i,
    /\bpublic\.user_holdings\b/i,
    /\bpublic\.transactions\b/i,
    /\bpublic\.market_events\b/i,
    /\bpublic\.market_event_impacts\b/i,
    /\bpublic\.market_rumors\b/i,
    /\bpublic\.market_rumor_impacts\b/i,
    /\bpublic\.news\b/i,
  ]) {
    rejectApplySql(forbidden, `save-and-apply migration avoids ${forbidden}`);
  }
});
