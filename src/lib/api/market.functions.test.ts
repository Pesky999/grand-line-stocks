import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

const marketSource = read("src/lib/api/market.functions.ts");
const characterRouteSource = read("src/routes/character.$slug.tsx");
const initialMarketMigration = read(
  "supabase/migrations/20260609203133_e914c326-8782-4455-b4ab-a55ac2e5e2a6.sql",
);

test("public getCharacter uses the publishable-key client and not the service-role helper", () => {
  const getCharacterSource = sourceBetween(
    marketSource,
    "export const getCharacter",
    "export const listNews",
  );

  assert.match(getCharacterSource, /const db = getPublicSupabaseClient\(\);/);
  assert.doesNotMatch(
    getCharacterSource,
    /await admin\(\)|supabaseAdmin|client\.server|SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test("public getCharacter selects only public character fields and preserves slug validation", () => {
  const getCharacterSource = sourceBetween(
    marketSource,
    "export const getCharacter",
    "export const listNews",
  );
  const characterSelectSource = sourceBetween(
    marketSource,
    "const characterSelect =",
    "const characterRowSchema",
  );

  for (const field of [
    "id",
    "slug",
    "name",
    "crew",
    "role",
    "bounty",
    "image_url",
    "description",
    "current_price",
    "previous_price",
    "category",
    "momentum",
    "updated_at",
    "created_at",
    "display_order",
  ]) {
    assert.match(characterSelectSource, new RegExp(`\\b${field}\\b`));
  }

  assert.match(getCharacterSource, /z\.object\(\{ slug: z\.string\(\) \}\)\.parse\(d\)/);
  assert.match(getCharacterSource, /\.from\("characters"\)[\s\S]*?\.select\(characterSelect\)/);
  assert.doesNotMatch(getCharacterSource, /\.select\("\*"\)/);
});

test("public getCharacter throws lookup errors and only treats successful empty lookup as not found", () => {
  const getCharacterSource = sourceBetween(
    marketSource,
    "export const getCharacter",
    "export const listNews",
  );

  assert.match(getCharacterSource, /const \{ data: row, error \} = await db/);
  assert.match(getCharacterSource, /if \(error\) throw error;/);
  assert.match(getCharacterSource, /if \(!row\) throw new Error\("Not found"\);/);
  assert.doesNotMatch(getCharacterSource, /if \(error\)\s+return/);
});

test("public getCharacter throws price-history query errors instead of returning an empty chart", () => {
  const getCharacterSource = sourceBetween(
    marketSource,
    "export const getCharacter",
    "export const listNews",
  );

  assert.match(getCharacterSource, /error: historyError/);
  assert.match(getCharacterSource, /if \(historyError\) throw historyError;/);
  assert.doesNotMatch(getCharacterSource, /if \(historyError\)\s+return/);
});

test("public getCharacter keeps the newest bounded price-history query and chart ordering helper", () => {
  const getCharacterSource = sourceBetween(
    marketSource,
    "export const getCharacter",
    "export const listNews",
  );

  assert.match(getCharacterSource, /\.from\("price_history"\)/);
  assert.match(getCharacterSource, /\.select\("id,price,note,created_at"\)/);
  assert.match(getCharacterSource, /\.eq\("character_id", character\.id\)/);
  assert.match(getCharacterSource, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(getCharacterSource, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(getCharacterSource, /\.limit\(CHARACTER_PRICE_HISTORY_WINDOW\)/);
  assert.match(getCharacterSource, /selectLatestPriceHistoryWindowForChart\(history\)/);
});

test("public getCharacter validates Supabase numeric and nested row shapes narrowly", () => {
  assert.match(marketSource, /const numeric = z\.coerce\.number\(\);/);
  assert.match(marketSource, /current_price: numeric/);
  assert.match(marketSource, /previous_price: numeric/);
  assert.match(marketSource, /momentum: numeric/);
  assert.match(marketSource, /price: numeric/);
  assert.match(marketSource, /display_order: z\.coerce\.number\(\)\.int\(\)\.nullable\(\)/);
  assert.doesNotMatch(marketSource, /\bas any\b/);
});

test("character page loader depends on public-safe route loaders and no service-role secret", () => {
  assert.match(
    characterRouteSource,
    /import \{ getCharacter \} from "@\/lib\/api\/market\.functions";/,
  );
  assert.match(characterRouteSource, /context\.queryClient\.ensureQueryData\(qo\(params\.slug\)\)/);
  assert.match(characterRouteSource, /getCharacterEvents/);
  assert.match(characterRouteSource, /getCharacterIntel/);
  assert.match(characterRouteSource, /listCharacterTopHolders/);
  assert.doesNotMatch(
    characterRouteSource,
    /supabaseAdmin|client\.server|SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test("admin character mutations retain the admin/service-role path", () => {
  const adminCreateSource = sourceBetween(
    marketSource,
    "export const adminCreateCharacter",
    "export const adminUpdateCharacter",
  );
  const adminUpdateSource = sourceBetween(
    marketSource,
    "export const adminUpdateCharacter",
    "export const adminPostNews",
  );
  const adminNewsSource = sourceBetween(
    marketSource,
    "export const adminPostNews",
    "export const amIAdmin",
  );

  for (const source of [adminCreateSource, adminUpdateSource, adminNewsSource]) {
    assert.match(source, /await requireAdminRole\(context\.userId\);/);
    assert.match(source, /const db = await admin\(\);/);
  }
});

test("repository migrations already allow public read access for characters and price history", () => {
  assert.match(
    initialMarketMigration,
    /GRANT SELECT ON public\.characters TO anon, authenticated;/,
  );
  assert.match(
    initialMarketMigration,
    /GRANT SELECT ON public\.price_history TO anon, authenticated;/,
  );
  assert.match(initialMarketMigration, /ALTER TABLE public\.characters ENABLE ROW LEVEL SECURITY;/);
  assert.match(
    initialMarketMigration,
    /ALTER TABLE public\.price_history ENABLE ROW LEVEL SECURITY;/,
  );
  assert.match(
    initialMarketMigration,
    /CREATE POLICY "Characters are publicly readable" ON public\.characters FOR SELECT USING \(true\);/,
  );
  assert.match(
    initialMarketMigration,
    /CREATE POLICY "Price history is publicly readable" ON public\.price_history FOR SELECT USING \(true\);/,
  );
  assert.doesNotMatch(
    initialMarketMigration,
    /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*ON public\.(?:characters|price_history) TO anon/i,
  );
});
