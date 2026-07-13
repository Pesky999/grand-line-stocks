import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
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

function readAllMigrations() {
  return readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
    .map((filename) => read(`supabase/migrations/${filename}`))
    .join("\n");
}

const eventsSource = read("src/lib/api/events.functions.ts");
const allMigrations = readAllMigrations();
const createEventsMigration = read(
  "supabase/migrations/20260613024617_73324d86-6e68-4dbd-b886-352d791f0cf8.sql",
);
const publicEventPolicyMigration = read(
  "supabase/migrations/20260623010000_fix_market_event_public_select_policies.sql",
);
const migrationStatements = allMigrations
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

test("listRecentEvents throws public event query failures instead of hiding permission errors", () => {
  const listRecentEventsSource = sourceBetween(
    eventsSource,
    "export const listRecentEvents",
    "export const getCharacterEvents",
  );

  assert.doesNotMatch(eventsSource, /isMarketEventsPermissionError/);
  assert.doesNotMatch(
    eventsSource,
    /Temporary compatibility fallback|permission denied for function has_role/,
  );
  assert.match(listRecentEventsSource, /\.from\("market_events"\)/);
  assert.match(listRecentEventsSource, /\.eq\("status", "published"\)/);
  assert.match(
    listRecentEventsSource,
    /if \(error\) throwPublicEventQueryError\("Could not load published market events", error\);/,
  );
  assert.match(
    listRecentEventsSource,
    /return recentMarketEventRowsSchema\.parse\(rows \?\? \[\]\);/,
  );
  assert.doesNotMatch(listRecentEventsSource, /if \(error[\s\S]*?return \[\]/);
});

test("getMarketSentiment checks query errors before neutral empty-state calculation", () => {
  const sentimentSource = sourceBetween(
    eventsSource,
    "export const getMarketSentiment",
    "// ---------- Admin ----------",
  );

  assert.match(sentimentSource, /const \{ data: events, error \} = await db/);
  assert.match(sentimentSource, /\.from\("market_events"\)/);
  assert.match(sentimentSource, /\.eq\("status", "published"\)/);
  assert.match(
    sentimentSource,
    /if \(error\) throwPublicEventQueryError\("Could not load market sentiment events", error\);/,
  );
  assert.match(
    sentimentSource,
    /const parsedEvents = sentimentEventRowsSchema\.parse\(events \?\? \[\]\);/,
  );
  assert.match(sentimentSource, /const avg = count \? totalPct \/ count : 0;/);
  assert.match(sentimentSource, /events7d: parsedEvents\.length/);
  assert.doesNotMatch(sentimentSource, /as any|events\?\.length/);
});

test("public event row validation coerces numeric database strings and rejects malformed rows", () => {
  assert.match(eventsSource, /const numeric = z\.coerce\.number\(\);/);
  assert.match(eventsSource, /pct_change: numeric/);
  assert.match(eventsSource, /default_pct_change: numeric/);
  assert.match(eventsSource, /price_before: nullableNumeric\.optional\(\)/);
  assert.match(eventsSource, /price_after: nullableNumeric\.optional\(\)/);
  assert.doesNotMatch(eventsSource, /z\.union\(\[z\.number\(\), z\.string\(\)\]\)/);
});

test("getCharacterEvents distinguishes lookup failure from character-not-found", () => {
  const characterEventsSource = sourceBetween(
    eventsSource,
    "export const getCharacterEvents",
    "export const getMarketSentiment",
  );

  assert.match(characterEventsSource, /error: characterError/);
  assert.match(
    characterEventsSource,
    /if \(characterError\)\s+throwPublicEventQueryError\("Could not load character for market events", characterError\);/,
  );
  assert.match(characterEventsSource, /if \(!ch\) return \[\];/);
  assert.match(characterEventsSource, /\.from\("market_event_impacts"\)/);
  assert.match(characterEventsSource, /\.eq\("market_events\.status", "published"\)/);
  assert.match(
    characterEventsSource,
    /if \(error\) throwPublicEventQueryError\("Could not load character market events", error\);/,
  );
  assert.match(characterEventsSource, /return characterEventRowsSchema\.parse\(rows \?\? \[\]\);/);
});

test("public event reads keep using the publishable-key client, not service-role access", () => {
  const pubSource = sourceBetween(eventsSource, "function pub()", "async function requireAdmin");
  const publicSource = sourceBetween(
    eventsSource,
    "// ---------- Public ----------",
    "// ---------- Admin ----------",
  );

  assert.match(pubSource, /createClient<Database>/);
  assert.match(pubSource, /process\.env\.SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(publicSource, /supabaseAdmin|client\.server|SUPABASE_SERVICE_ROLE_KEY/);
});

test("market event RLS keeps public published reads separate from authenticated admin reads", () => {
  const publishedEventsPolicy = sourceBetween(
    publicEventPolicyMigration,
    'CREATE POLICY "events published read"',
    'CREATE POLICY "events admin read"',
  );
  const adminEventsPolicy = sourceBetween(
    publicEventPolicyMigration,
    'CREATE POLICY "events admin read"',
    'CREATE POLICY "impacts published read"',
  );
  const publishedImpactsPolicy = sourceBetween(
    publicEventPolicyMigration,
    'CREATE POLICY "impacts published read"',
    'CREATE POLICY "impacts admin read"',
  );
  const adminImpactsPolicy = publicEventPolicyMigration.slice(
    publicEventPolicyMigration.indexOf('CREATE POLICY "impacts admin read"'),
  );

  assert.match(publishedEventsPolicy, /FOR SELECT TO anon, authenticated/);
  assert.match(publishedEventsPolicy, /USING \(status = 'published'\);/);
  assert.doesNotMatch(publishedEventsPolicy, /has_role|draft|scheduled/);

  assert.match(adminEventsPolicy, /FOR SELECT TO authenticated/);
  assert.match(adminEventsPolicy, /public\.has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/);
  assert.doesNotMatch(adminEventsPolicy, /TO anon/);

  assert.match(publishedImpactsPolicy, /FOR SELECT TO anon, authenticated/);
  assert.match(publishedImpactsPolicy, /e\.status = 'published'/);
  assert.doesNotMatch(publishedImpactsPolicy, /has_role|draft|scheduled/);

  assert.match(adminImpactsPolicy, /FOR SELECT TO authenticated/);
  assert.match(adminImpactsPolicy, /public\.has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/);
  assert.doesNotMatch(adminImpactsPolicy, /TO anon/);
});

test("legacy public event policies are removed before corrected policies are created", () => {
  assert.match(
    publicEventPolicyMigration,
    /DROP POLICY IF EXISTS "events public read" ON public\.market_events;/,
  );
  assert.match(
    publicEventPolicyMigration,
    /DROP POLICY IF EXISTS "impacts public read" ON public\.market_event_impacts;/,
  );
  assert.match(publicEventPolicyMigration, /CREATE POLICY "events published read"/);
  assert.match(publicEventPolicyMigration, /CREATE POLICY "events admin read"/);
  assert.match(publicEventPolicyMigration, /CREATE POLICY "impacts published read"/);
  assert.match(publicEventPolicyMigration, /CREATE POLICY "impacts admin read"/);
});

test("table grants allow public SELECT while RLS limits rows and browser writes stay admin-gated", () => {
  assert.match(createEventsMigration, /GRANT SELECT ON public\.market_events TO anon;/);
  assert.match(
    createEventsMigration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.market_events TO authenticated;/,
  );
  assert.match(createEventsMigration, /GRANT SELECT ON public\.market_event_impacts TO anon;/);
  assert.match(
    createEventsMigration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.market_event_impacts TO authenticated;/,
  );
  assert.match(
    createEventsMigration,
    /CREATE POLICY "events admin write" ON public\.market_events[\s\S]*?FOR ALL TO authenticated/,
  );
  assert.match(
    createEventsMigration,
    /CREATE POLICY "impacts admin write" ON public\.market_event_impacts[\s\S]*?FOR ALL TO authenticated/,
  );
});

test("event policy history does not expose has_role or user_roles to anon", () => {
  assert.match(
    allMigrations,
    /REVOKE EXECUTE ON FUNCTION public\.has_role\(uuid, public\.app_role\) FROM PUBLIC, anon;/,
  );
  assert.match(
    allMigrations,
    /GRANT EXECUTE ON FUNCTION public\.has_role\(uuid, public\.app_role\) TO authenticated, service_role;/,
  );
  const hasRoleGrants = migrationStatements.filter((statement) =>
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.has_role/i.test(statement),
  );
  assert.ok(hasRoleGrants.length > 0, "has_role execute grants should be explicit");
  for (const statement of hasRoleGrants) {
    const grantedRoles = statement.match(/\bTO\b\s+(.+)$/i)?.[1] ?? "";
    assert.doesNotMatch(grantedRoles, /\b(?:anon|PUBLIC)\b/i);
  }
  assert.doesNotMatch(allMigrations, /GRANT\s+SELECT\s+ON\s+public\.user_roles\s+TO\s+anon/i);
});
