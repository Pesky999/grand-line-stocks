import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist`);
  return source.slice(startIndex, endIndex);
}

const marketSource = read("src/lib/api/market.functions.ts");
const pricingFunctionsSource = read("src/lib/api/character-pricing-ratings.functions.ts");
const panelSource = read("src/components/admin/PricingPreviewPanel.tsx");
const lifecycleSql = read(
  "supabase/migrations/20260804010000_market_listing_lifecycle_and_pricing_v1_2.sql",
);
const catalogSql = read("supabase/migrations/20260804020000_reprice_and_expand_market_to_112.sql");

test("public market reads list only published characters while admins can load private drafts", () => {
  const publicList = between(
    marketSource,
    "export const listCharacters",
    "export const getCharacter",
  );
  const publicDetail = between(
    marketSource,
    "export const getCharacter",
    "export const adminListCharacters",
  );
  const adminList = between(
    marketSource,
    "export const adminListCharacters",
    "export const listNews",
  );

  assert.match(publicList, /getPublicSupabaseClient\(\)/);
  assert.match(publicList, /\.eq\("is_listed", true\)/);
  assert.match(publicDetail, /\.eq\("is_listed", true\)/);
  assert.match(adminList, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(adminList, /context\.supabase\.rpc\("has_role"/);
  assert.match(adminList, /context\.supabase[\s\S]*\.from\("characters"\)/);
  assert.doesNotMatch(adminList, /await admin\(\)/);
  assert.doesNotMatch(adminList, /\.eq\("is_listed", true\)/);
});

test("new character creation is private and cannot set a client-supplied market price", () => {
  const create = between(
    marketSource,
    "export const adminCreateCharacter",
    "export const adminUpdateCharacter",
  );
  const input = between(
    marketSource,
    "const adminCreateCharacterInput",
    "const adminUpdateCharacterInput",
  );

  assert.match(create, /is_listed: false/);
  assert.doesNotMatch(input, /current_price|previous_price|category|momentum|is_listed/);
  assert.doesNotMatch(create, /price_history/);
});

test("database RLS exposes listed characters plus admin-visible drafts", () => {
  assert.match(lifecycleSql, /ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT true/);
  assert.match(
    lifecycleSql,
    /CREATE POLICY "Listed characters are publicly readable"[\s\S]*TO anon, authenticated[\s\S]*is_listed[\s\S]*public\.has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/,
  );
});

test("the V1.2 database formula exactly encodes the approved score stretch", () => {
  assert.match(lifecycleSql, /v_version <> '1\.2\.0'/);
  assert.match(
    lifecycleSql,
    /v_weighted_score :=[\s\S]*_narrative_importance \* 0\.25[\s\S]*_investor_confidence \* 0\.10/,
  );
  assert.match(
    lifecycleSql,
    /v_pricing_score := 79\.85 \+ \(\(v_weighted_score - 79\.85\) \* 1\.50\)/,
  );
  assert.match(
    lifecycleSql,
    /50 \* pg_catalog\.exp\(\(0\.035835 \* v_pricing_score\)::double precision\)::numeric/,
  );
  assert.match(lifecycleSql, /v_applied_price := pg_catalog\.round/);
});

test("IPO publication is caller-scoped, admin-only, atomic, and price-authoritative", () => {
  const sql = between(
    lifecycleSql,
    "CREATE OR REPLACE FUNCTION public.publish_character_ipo",
    "CREATE OR REPLACE FUNCTION public.reject_unlisted_character_transaction",
  );
  const server = between(
    pricingFunctionsSource,
    "export const publishCharacterIpo",
    "export const resetCharacterPricingRatings",
  );

  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(sql, /v_user uuid := auth\.uid\(\)/);
  assert.match(sql, /public\.has_role\(v_user, 'admin'::public\.app_role\)/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /IF v_character\.is_listed THEN/);
  assert.match(sql, /previous_price = v_applied_price/);
  assert.match(sql, /current_price = v_applied_price/);
  assert.match(sql, /momentum = 0/);
  assert.match(sql, /is_listed = true/);
  assert.match(sql, /'ipo'/);
  assert.match(sql, /'percentageChange', 0/);
  assert.doesNotMatch(sql.slice(0, sql.indexOf("RETURNS jsonb")), /_applied_price/);
  assert.match(server, /calculateIpoPricing/);
  assert.match(server, /\.rpc\("publish_character_ipo"/);
  assert.doesNotMatch(server, /_applied_price/);
});

test("repricing rejects private drafts and trading has a database-level listing guard", () => {
  const reprice = between(
    lifecycleSql,
    "CREATE OR REPLACE FUNCTION public.save_and_apply_character_pricing",
    "CREATE OR REPLACE FUNCTION public.publish_character_ipo",
  );

  assert.match(reprice, /IF NOT v_character\.is_listed THEN/);
  assert.match(reprice, /publish its IPO instead/);
  assert.match(
    lifecycleSql,
    /CREATE TRIGGER transactions_require_listed_character[\s\S]*BEFORE INSERT ON public\.transactions/,
  );
  assert.match(lifecycleSql, /WHERE c\.id = NEW\.character_id[\s\S]*AND c\.is_listed/);
});

test("admin pricing UI clearly separates private IPO publication from live repricing", () => {
  assert.match(panelSource, /character\.is_listed \? "" : " — PRIVATE DRAFT"/);
  assert.match(panelSource, /Publish IPO/);
  assert.match(panelSource, /Save Ratings & Apply Price/);
  assert.match(panelSource, /publishCharacterIpo/);
  assert.match(panelSource, /pricingScore\.toFixed\(4\)/);
  assert.match(panelSource, /makes the character public and tradable/);
});

test("catalog launch is fail-closed and verifies the exact 68-to-112 expansion", () => {
  assert.match(catalogSql, /requires exactly one administrator/);
  assert.match(catalogSql, /expected exactly 68 existing characters/);
  assert.match(catalogSql, /private character drafts exist/);
  assert.match(catalogSql, /definition must contain exactly 68 rows/);
  assert.match(catalogSql, /definition must contain exactly 44 rows/);
  assert.match(catalogSql, /do not reproduce approved prices/);
  assert.match(catalogSql, /rubric prices do not match approved prices/);
  assert.match(catalogSql, /IS DISTINCT FROM \(112, 40, 28, 30, 14\)/);
  assert.match(
    catalogSql,
    /Every listed character must have approved Market Pricing V1\.2 ratings/,
  );
  assert.match(catalogSql, /^BEGIN;/);
  assert.match(catalogSql, /COMMIT;\s*$/);
});

test("catalog preserves existing adjustments and records corrected approved additions", () => {
  const existingUpdate = between(
    catalogSql,
    "UPDATE public.character_pricing_ratings AS r",
    "UPDATE public.characters AS c",
  );

  assert.doesNotMatch(
    existingUpdate,
    /SET[\s\S]*comparable_adjustment\s*=|SET[\s\S]*uncertainty_discount_pct\s*=|SET[\s\S]*launch_catalyst_pct\s*=/,
  );
  assert.match(
    catalogSql,
    /\('shiki', 'Shiki',[\s\S]*87, 74, 98, 84, 78, 82, 65, 'speculative', 10, 970\.41, 75\)/,
  );
  assert.match(
    catalogSql,
    /\('s-hawk', 'S-Hawk',[\s\S]*75, 45, 92, 72, 88, 75, 70, 'speculative', 15, 515\.64, 104\)/,
  );
  assert.match(
    catalogSql,
    /n\.stock_category, 1, n\.uncertainty_discount_pct, 0,[\s\S]*'1\.2\.0', 'approved'/,
  );
});

test("all 44 new listing rows reproduce the approved V1.2 prices and distribution", () => {
  const block = between(catalogSql, "INSERT INTO _new_market_catalog VALUES", "DO $guard$");
  const rows = block
    .split("\n")
    .filter((line) => /^\s+\('/.test(line))
    .map((line) => {
      const match = line.match(
        /, (\d+), (\d+), (\d+), (\d+), (\d+), (\d+), (\d+), '(blue_chip|growth|speculative|meme)', (\d+(?:\.\d+)?), (\d+\.\d{2}), (\d+)\)[,;]$/,
      );
      assert.ok(match, `new catalog row should have an auditable numeric tail: ${line}`);
      const [, n, r, s, p, f, c, v, category, discount, expectedPrice, displayOrder] = match;
      return {
        ratings: [n, r, s, p, f, c, v].map(Number),
        category,
        discount: Number(discount),
        expectedPrice: Number(expectedPrice),
        displayOrder: Number(displayOrder),
      };
    });

  assert.equal(rows.length, 44);
  assert.deepEqual(
    rows.map((row) => row.displayOrder),
    Array.from({ length: 44 }, (_, index) => index + 69),
  );

  const counts = new Map<string, number>();
  let priceSum = 0;
  for (const row of rows) {
    const [n, r, s, p, f, c] = row.ratings;
    const weightedScore = n * 0.25 + r * 0.2 + s * 0.15 + p * 0.15 + f * 0.15 + c * 0.1;
    const pricingScore = 79.85 + (weightedScore - 79.85) * 1.5;
    const calculated =
      Math.round(50 * Math.exp(0.035835 * pricingScore) * (1 - row.discount / 100) * 100) / 100;
    assert.equal(calculated, row.expectedPrice);
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    priceSum += row.expectedPrice;
  }

  assert.deepEqual(Object.fromEntries(counts), {
    blue_chip: 7,
    growth: 16,
    speculative: 15,
    meme: 6,
  });
  assert.equal(Math.round(priceSum * 100) / 100, 32179.47);
});

test("the 68-character rerating baseline matches the approved workbook totals", () => {
  const block = between(catalogSql, "INSERT INTO _existing_market_catalog VALUES", "DO $guard$");
  const rows = block
    .split("\n")
    .filter((line) => /^\s+\('/.test(line))
    .map((line) => {
      const match = line.match(
        /, (\d+), (\d+), (\d+), (\d+), (\d+), (\d+), (\d+), '(blue_chip|growth|speculative|meme)', (\d+\.\d{2})\)[,;]$/,
      );
      assert.ok(match, `existing catalog row should have an auditable numeric tail: ${line}`);
      return { category: match[8], expectedPrice: Number(match[9]) };
    });

  assert.equal(rows.length, 68);
  const counts = new Map<string, number>();
  let priceSum = 0;
  for (const row of rows) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    priceSum += row.expectedPrice;
  }
  assert.deepEqual(Object.fromEntries(counts), {
    blue_chip: 33,
    growth: 12,
    speculative: 15,
    meme: 8,
  });
  assert.equal(Math.round(priceSum * 100) / 100, 66415.81);
});
