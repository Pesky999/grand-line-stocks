import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationDir = join(process.cwd(), "supabase/migrations");
const safeguardMigrationName = "20260719010000_disable_legacy_rumor_price_generation.sql";
const historicalMigrationName = "20260615000154_94d1f0df-7953-4c2d-a73b-677a31c32b2a.sql";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function readMigration(name: string) {
  return readFileSync(join(migrationDir, name), "utf8");
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

const migrationNames = readdirSync(migrationDir).filter((name) => name.endsWith(".sql"));
const safeguardSql = readMigration(safeguardMigrationName);
const historicalSql = readMigration(historicalMigrationName);
const supabaseTypes = read("src/integrations/supabase/types.ts");

test("speculation safeguard migration exists and drops only the legacy generator", () => {
  assert.ok(migrationNames.includes(safeguardMigrationName));
  assert.match(safeguardSql, /DROP FUNCTION IF EXISTS public\.generate_market_rumor\(\);/);
  assert.match(safeguardSql, /informational and non-price-moving/i);
});

test("speculation safeguard migration avoids destructive data changes and cascade", () => {
  for (const forbidden of [
    /\bCASCADE\b/i,
    /DELETE\s+FROM\s+public\.market_rumors/i,
    /DELETE\s+FROM\s+public\.market_rumor_impacts/i,
    /DELETE\s+FROM\s+public\.price_history/i,
    /UPDATE\s+public\.characters/i,
    /\bTRUNCATE\b/i,
  ]) {
    assert.doesNotMatch(safeguardSql, forbidden);
  }
});

test("speculation safeguard migration does not redefine or replace the generator", () => {
  assert.doesNotMatch(
    safeguardSql,
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.generate_market_rumor/i,
  );
  assert.doesNotMatch(safeguardSql, /RETURNS\s+public\.market_rumors/i);
  assert.doesNotMatch(safeguardSql, /RETURN\s+NULL|RETURN\s+v_rumor/i);
});

test("speculation safeguard migration sorts after the historical generator migration", () => {
  assert.ok(
    safeguardMigrationName.localeCompare(historicalMigrationName) > 0,
    "forward safeguard migration must sort after the migration that created generate_market_rumor",
  );
});

test("current TypeScript and TSX application files do not invoke generate_market_rumor", () => {
  const appFiles = listFiles(join(process.cwd(), "src")).filter(
    (file) =>
      /\.[cm]?[tj]sx?$/.test(file) &&
      !/\.test\.[cm]?[tj]sx?$/.test(file) &&
      !file.endsWith(join("src", "integrations", "supabase", "types.ts")),
  );
  for (const file of appFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /(?:rpc\(["']generate_market_rumor["']|generate_market_rumor\()/,
      file,
    );
  }
});

test("checked-in Supabase function contract no longer exposes generate_market_rumor", () => {
  assert.doesNotMatch(supabaseTypes, /\bgenerate_market_rumor:\s*\{/);
  assert.match(supabaseTypes, /\bexpire_old_rumors:\s*\{/);
  assert.match(supabaseTypes, /\bgenerate_movement_explanation:\s*\{/);
  assert.match(supabaseTypes, /\brun_daily_market_cycle:\s*\{/);
});

test("legacy speculation table contracts remain available", () => {
  assert.match(supabaseTypes, /\bmarket_rumors:\s*\{/);
  assert.match(supabaseTypes, /\bmarket_rumor_impacts:\s*\{/);
  assert.match(supabaseTypes, /referencedRelation: "market_rumors"/);
});

test("checked-in cron migration commands do not invoke generate_market_rumor", () => {
  const cronSources = migrationNames
    .map((name) => [name, readMigration(name)] as const)
    .filter(([, source]) =>
      /cron\.schedule|SELECT\s+cron\.schedule|PERFORM\s+cron\.schedule/i.test(source),
    );

  assert.ok(cronSources.length > 0, "repository should contain checked-in cron migrations");
  for (const [name, source] of cronSources) {
    assert.doesNotMatch(source, /generate_market_rumor\(\)/i, name);
  }
});

test("historical generator definition remains untouched and is disabled only forward", () => {
  assert.match(historicalSql, /CREATE OR REPLACE FUNCTION public\.generate_market_rumor\(\)/);
  assert.match(historicalSql, /INSERT INTO public\.market_rumor_impacts/);
  assert.match(historicalSql, /UPDATE public\.characters/);
  assert.match(historicalSql, /INSERT INTO public\.price_history/);
  assert.match(safeguardSql, /DROP FUNCTION IF EXISTS public\.generate_market_rumor\(\);/);
});

test("Market Bulletin policy documents the retired legacy generator", () => {
  const docs = read("docs/market-bulletin-v2.md");
  assert.match(docs, /legacy automatic rumor-price generator has been retired/i);
  assert.match(docs, /Historical speculation and historical price records are preserved/i);
  assert.match(docs, /Speculation is no longer an automatic price-generation mechanism/i);
  assert.match(docs, /Verified market events remain the authoritative price-moving workflow/i);
});
