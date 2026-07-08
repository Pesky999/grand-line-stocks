import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

const bulletinSource = read("src/routes/market-bulletin.tsx");
const terminalShellSource = read("src/components/TerminalShell.tsx");
const marketAdminSource = read("src/routes/_authenticated/market-admin.tsx");
const livingMarketSource = read("src/lib/api/living-market.functions.ts");
const navSource = terminalShellSource.slice(
  terminalShellSource.indexOf("const NAV"),
  terminalShellSource.indexOf("export function TerminalShell"),
);

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

test("market bulletin route renders the three vertical sections", () => {
  assert.match(bulletinSource, /createFileRoute\("\/market-bulletin"\)/);
  assert.match(bulletinSource, /Market Bulletin/);
  assert.match(bulletinSource, /id="news"/);
  assert.match(bulletinSource, /id="events"/);
  assert.match(bulletinSource, /id="reports"/);
  assert.doesNotMatch(bulletinSource, /Tabs|Accordion|segmented/i);
});

test("market bulletin reuses public data loaders and avoids privileged report history", () => {
  for (const loader of ["listNews", "listRecentEvents", "getMarketSentiment", "getLatestReport", "listActiveRumors"]) {
    assert.match(bulletinSource, new RegExp(`\\b${loader}\\b`), `${loader} is reused`);
  }

  assert.doesNotMatch(bulletinSource, /listReports/);
  assert.doesNotMatch(bulletinSource, /supabaseAdmin|client\.server/);
});

test("admin controls are present only behind the admin check", () => {
  assert.match(bulletinSource, /amIAdmin/);
  assert.match(bulletinSource, /action=\{isAdmin \? \{ to: "\/admin", label: "Post News" \} : undefined\}/);
  assert.match(bulletinSource, /action=\{isAdmin \? \{ to: "\/events-admin", label: "Manage Events" \} : undefined\}/);
  assert.match(bulletinSource, /action=\{isAdmin \? \{ to: "\/market-admin", label: "Open Market Console" \} : undefined\}/);
});

test("market console initial attribute load avoids service role access", () => {
  assert.match(marketAdminSource, /adminListAttributes/);
  assert.match(marketAdminSource, /ensureQueryData\(attrsQO\)/);

  const listAttributesSource = sourceBetween(
    livingMarketSource,
    "export const adminListAttributes",
    "export const adminUpdateAttributes",
  );

  assert.match(listAttributesSource, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(listAttributesSource, /requireAdmin\(context\.userId, context\.supabase\)/);
  assert.match(listAttributesSource, /const db = context\.supabase/);
  assert.doesNotMatch(listAttributesSource, /await admin\(\)|supabaseAdmin|client\.server|SUPABASE_SERVICE_ROLE_KEY/);
});

test("market console exposes back preview save and apply controls", () => {
  assert.match(marketAdminSource, /to="\/market-bulletin"/);
  assert.match(marketAdminSource, /Back to Market Bulletin/);
  assert.match(marketAdminSource, /Preview/);
  assert.match(marketAdminSource, /Save/);
  assert.match(marketAdminSource, /Apply/);
  assert.match(marketAdminSource, /No pending changes for this character/);
});

test("market console save and apply operations are split", () => {
  const updateAttributesSource = sourceBetween(
    livingMarketSource,
    "export const adminUpdateAttributes",
    "export const adminApplyCategory",
  );
  const applyCategorySource = livingMarketSource.slice(livingMarketSource.indexOf("export const adminApplyCategory"));

  assert.match(updateAttributesSource, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(updateAttributesSource, /requireAdmin\(context\.userId, context\.supabase\)/);
  assert.doesNotMatch(updateAttributesSource, /category: z\.enum|updateCharacterCategoryWithAdminClient/);

  assert.match(applyCategorySource, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(applyCategorySource, /category: z\.enum\(CATEGORIES\)/);
  assert.match(applyCategorySource, /requireAdmin\(context\.userId, context\.supabase\)/);
  assert.match(applyCategorySource, /updateCharacterCategoryWithAdminClient/);
  assert.match(marketAdminSource, /adminUpdateAttributes\(\{\s*data: \{\s*slug: c\.slug,\s*narrative_potential/s);
  assert.match(marketAdminSource, /adminApplyCategory\(\{ data: \{ slug: c\.slug, category: cat \} \}\)/);
  assert.match(marketAdminSource, /window\.confirm/);
});

test("top-level navigation replaces separate news events and reports entries", () => {
  assert.match(navSource, /to: "\/market-bulletin", label: "Market Bulletin"/);
  assert.doesNotMatch(navSource, /to: "\/news"/);
  assert.doesNotMatch(navSource, /to: "\/events"/);
  assert.doesNotMatch(navSource, /to: "\/market-report"/);
  assert.doesNotMatch(navSource, /label: "News"/);
  assert.doesNotMatch(navSource, /label: "Events"/);
  assert.doesNotMatch(navSource, /label: "Report"/);
});

test("legacy public routes redirect to anchored market bulletin sections", () => {
  const redirects = [
    ["src/routes/news.tsx", "news"],
    ["src/routes/events.tsx", "events"],
    ["src/routes/market-report.tsx", "reports"],
    ["src/routes/reports.tsx", "reports"],
  ] as const;

  for (const [path, hash] of redirects) {
    const source = read(path);
    assert.match(source, /redirect\(\{ to: "\/market-bulletin"/, `${path} redirects to bulletin`);
    assert.match(source, new RegExp(`hash: "${hash}"`), `${path} redirects to ${hash}`);
  }
});
