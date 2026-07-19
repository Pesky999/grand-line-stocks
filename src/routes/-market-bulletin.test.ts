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
const homeSource = read("src/routes/index.tsx");
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

test("market bulletin route renders V2 public structure", () => {
  assert.match(bulletinSource, /createFileRoute\("\/market-bulletin"\)/);
  assert.match(bulletinSource, /Market Bulletin/);
  assert.match(bulletinSource, /Market Snapshot/);
  assert.match(bulletinSource, /Featured Daily Brief/);
  assert.equal((bulletinSource.match(/The Wire/g) ?? []).length, 1);
  assert.doesNotMatch(
    bulletinSource,
    /function NewsSection|function EventsSection|function ReportsSection/,
  );
  assert.doesNotMatch(bulletinSource, /id="news"|id="events"|id="reports"/);
});

test("Market Snapshot labels the discussed report character accurately", () => {
  const snapshotSource = sourceBetween(
    bulletinSource,
    "function MarketSnapshot",
    "function SnapshotCell",
  );

  assert.match(snapshotSource, /label="Most discussed"/);
  assert.doesNotMatch(snapshotSource, /label="Latest brief"/);
});

test("homepage uses public catalyst terminology", () => {
  assert.match(homeSource, /Recent Catalysts/);
  assert.match(homeSource, /No catalysts yet\./);
  assert.doesNotMatch(homeSource, /Recent Events/);
});

test("separate News Events Reports panels and placeholders were removed", () => {
  assert.doesNotMatch(bulletinSource, /Event Wire/);
  assert.doesNotMatch(bulletinSource, /Active Rumors/);
  assert.doesNotMatch(bulletinSource, /Report Archive/);
  assert.doesNotMatch(bulletinSource, /No rumors circulating/);
});

test("market bulletin reuses public loaders and avoids privileged report history", () => {
  for (const loader of [
    "listNews",
    "listRecentEvents",
    "getMarketSentiment",
    "getLatestReport",
    "listActiveSpeculation",
  ]) {
    assert.match(bulletinSource, new RegExp(`\\b${loader}\\b`), `${loader} is reused`);
  }

  assert.doesNotMatch(bulletinSource, /listActiveRumors/);
  assert.doesNotMatch(bulletinSource, /listReports/);
  assert.doesNotMatch(bulletinSource, /supabaseAdmin|client\.server/);
});

test("Wire filter labels and feed search validation exist", () => {
  assert.match(bulletinSource, /validateSearch/);
  assert.match(bulletinSource, /normalizeWireFeed\(raw\.feed\)/);
  assert.match(bulletinSource, /hash="wire"/);
  assert.match(bulletinSource, /aria-pressed=\{feed === option\.feed\}/);

  for (const label of ["All", "News", "Catalysts", "Speculation", "Reports"]) {
    assert.match(bulletinSource, new RegExp(`label: "${label}"`), `${label} filter exists`);
  }
});

test("admin management links remain behind the admin check", () => {
  const adminBlock = sourceBetween(
    bulletinSource,
    "{isAdmin && (",
    "<MarketSnapshot sentiment={sentiment} latest={latest} />",
  );

  assert.match(bulletinSource, /amIAdmin/);
  assert.match(adminBlock, /to="\/admin"[\s\S]*label="Post News"/);
  assert.match(adminBlock, /to="\/events-admin"[\s\S]*label="Manage Catalysts"/);
  assert.match(adminBlock, /to="\/market-admin"[\s\S]*label="Market Console"/);
});

test("public speculation API uses clean speculation naming and shape", () => {
  assert.match(livingMarketSource, /export const listActiveSpeculation/);
  assert.doesNotMatch(livingMarketSource, /export const listActiveRumors/);

  const speculationSource = sourceBetween(
    livingMarketSource,
    "export const listActiveSpeculation",
    "// ---------- Admin actions ----------",
  );

  assert.match(speculationSource, /\.from\("market_rumors"\)/);
  assert.match(speculationSource, /market_rumor_impacts\(characters\(slug,name\)\)/);
  assert.match(speculationSource, /createdAt: row\.created_at/);
  assert.match(speculationSource, /expiresAt: row\.expires_at/);
  assert.doesNotMatch(speculationSource, /pct_change|price_before|price_after/);
});

test("speculation UI is unconfirmed and has no price-effect direction", () => {
  const speculationEntry = sourceBetween(
    bulletinSource,
    "function SpeculationWireEntry",
    "function ReportWireEntry",
  );

  assert.match(speculationEntry, /UNCONFIRMED/);
  assert.match(speculationEntry, /NO PRICE EFFECT/);
  assert.match(
    speculationEntry,
    /Community speculation\. This entry does not affect stock prices\./,
  );
  assert.doesNotMatch(speculationEntry, /UP|DOWN|pct|percent|priceBefore|priceAfter|%/);
});

test("catalyst UI still renders verified impacts", () => {
  const catalystEntry = sourceBetween(
    bulletinSource,
    "function CatalystWireEntry",
    "function SpeculationWireEntry",
  );

  assert.match(catalystEntry, /UP/);
  assert.match(catalystEntry, /DOWN/);
  assert.match(catalystEntry, /impact\.pctChange/);
  assert.match(catalystEntry, /impact\.priceBefore/);
  assert.match(catalystEntry, /impact\.priceAfter/);
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
  assert.doesNotMatch(
    listAttributesSource,
    /await admin\(\)|supabaseAdmin|client\.server|SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test("market console exposes back preview save and apply controls", () => {
  assert.match(marketAdminSource, /to="\/market-bulletin"/);
  assert.match(marketAdminSource, /Back to Market Bulletin/);
  assert.match(marketAdminSource, /Preview/);
  assert.match(marketAdminSource, /Save/);
  assert.match(marketAdminSource, /Apply/);
  assert.match(marketAdminSource, /No pending changes for this character/);
});

test("top-level navigation keeps only Market Bulletin", () => {
  assert.match(navSource, /to: "\/market-bulletin", label: "Market Bulletin"/);
  assert.doesNotMatch(navSource, /to: "\/news"/);
  assert.doesNotMatch(navSource, /to: "\/events"/);
  assert.doesNotMatch(navSource, /to: "\/market-report"/);
  assert.doesNotMatch(navSource, /label: "News"/);
  assert.doesNotMatch(navSource, /label: "Events"/);
  assert.doesNotMatch(navSource, /label: "Report"/);
});

test("legacy public routes redirect to Wire filters", () => {
  const redirects = [
    ["src/routes/news.tsx", "news"],
    ["src/routes/events.tsx", "catalysts"],
    ["src/routes/market-report.tsx", "reports"],
    ["src/routes/reports.tsx", "reports"],
  ] as const;

  for (const [path, feed] of redirects) {
    const source = read(path);
    assert.match(source, /redirect\(\{ to: "\/market-bulletin"/, `${path} redirects to bulletin`);
    assert.match(
      source,
      new RegExp(`search: \\{ feed: "${feed}" \\}`),
      `${path} redirects to ${feed}`,
    );
    assert.match(source, /hash: "wire"/, `${path} redirects to Wire anchor`);
    assert.doesNotMatch(source, /hash: "news"|hash: "events"|hash: "reports"/);
  }
});
