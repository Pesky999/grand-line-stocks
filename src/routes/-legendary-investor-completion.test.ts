/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const legacyRoutePath = join(process.cwd(), "src/routes/_authenticated/legacy-log.tsx");
const legacyRouteSource = existsSync(legacyRoutePath) ? readFileSync(legacyRoutePath, "utf8") : "";
const authenticatedRouteSource = read("src/routes/_authenticated/route.tsx");
const terminalShellSource = read("src/components/TerminalShell.tsx");
const profileSource = read("src/routes/_authenticated/profile.tsx");
const routeTreeSource = read("src/routeTree.gen.ts");

test("Legacy Log route is registered under the authenticated route group", () => {
  assert.equal(existsSync(legacyRoutePath), true);
  assert.match(legacyRouteSource, /createFileRoute\("\/_authenticated\/legacy-log"\)/);
  assert.match(legacyRouteSource, /Legacy Log — Berry Street/);
  assert.match(routeTreeSource, /AuthenticatedLegacyLogRouteImport/);
  assert.match(routeTreeSource, /'\/legacy-log': typeof AuthenticatedLegacyLogRoute/);
  assert.match(routeTreeSource, /'\/_authenticated\/legacy-log'/);
});

test("TerminalShell includes authenticated Legacy navigation in desktop and mobile menus", () => {
  assert.match(terminalShellSource, /\{ to: "\/legacy-log", label: "Legacy", chip: "F8" \}/);
  assert.match(terminalShellSource, /nav\.map\(\(item\) =>/);
  assert.match(terminalShellSource, /\[\{item\.chip\}\] \{item\.label\.toUpperCase\(\)\}/);
  assert.match(terminalShellSource, /\[\{item\.chip\}\]/);
});

test("profile Prestige section keeps public profile link and adds Legacy Log link", () => {
  assert.match(profileSource, /to="\/legacy-log"/);
  assert.match(profileSource, /open Legacy Log/);
  assert.match(profileSource, /to="\/u\/\$username"/);
  assert.match(profileSource, /view public profile/);
  assert.match(profileSource, /Achievements \(\{ach\.length\}\)/);
});

test("authenticated layout records daily activity without blocking navigation", () => {
  assert.match(authenticatedRouteSource, /function AuthenticatedLayout\(\)/);
  assert.match(authenticatedRouteSource, /recordMyDailyActivity\(\)/);
  assert.match(
    authenticatedRouteSource,
    /queryClient\.invalidateQueries\(\{ queryKey: meQueryKey \}\)/,
  );
  assert.match(
    authenticatedRouteSource,
    /queryClient\.invalidateQueries\(\{ queryKey: \["public-profile"\] \}\)/,
  );
  assert.match(
    authenticatedRouteSource,
    /queryClient\.invalidateQueries\(\{ queryKey: LEGACY_LOG_QUERY_KEY \}\)/,
  );
  assert.match(authenticatedRouteSource, /\.catch\(\(\) => \{/);
  assert.doesNotMatch(authenticatedRouteSource, /toast\./);
});

test("public routes do not record daily activity", () => {
  for (const path of [
    "src/routes/index.tsx",
    "src/routes/u.$username.tsx",
    "src/routes/leaderboards.tsx",
    "src/routes/character.$slug.tsx",
  ]) {
    assert.doesNotMatch(read(path), /recordMyDailyActivity|record_my_daily_activity/);
  }
});

test("Legacy Log shows all achievement filters, tiers, and locked criteria", () => {
  assert.match(legacyRouteSource, /Achievement Catalog/);
  assert.match(legacyRouteSource, /All/);
  assert.match(legacyRouteSource, /Unlocked/);
  assert.match(legacyRouteSource, /Locked/);
  assert.match(legacyRouteSource, /ACHIEVEMENT_TIER_ORDER\.map/);
  assert.match(legacyRouteSource, /progressLabel/);
  assert.match(legacyRouteSource, /progressPercent !== null/);
  assert.match(legacyRouteSource, /achievement\.unlocked \? "unlocked" : "locked"/);
});

test("Legacy Log displays title ladder thresholds and specialization explanations", () => {
  assert.match(legacyRouteSource, /Reputation Title Ladder/);
  assert.match(legacyRouteSource, /TITLE_LADDER\.map/);
  for (const threshold of ["0", "100", "300", "600", "850", "950"]) {
    assert.match(read("src/lib/legendary.ts"), new RegExp(`threshold: ${threshold}`));
  }
  assert.match(legacyRouteSource, /Specializations are dynamic classifications/);
  assert.match(legacyRouteSource, /SPEC_ORDER\.map/);
  assert.match(read("src/lib/legendary.ts"), /generalist: "Balanced activity/);
  assert.match(read("src/lib/legendary.ts"), /whale: "Large average positions/);
});

test("Legacy Log records section keeps the two-template MVP scope", () => {
  assert.match(legacyRouteSource, /Legacy Records/);
  assert.match(legacyRouteSource, /First Millionaire Pirate/);
  assert.match(legacyRouteSource, /First\s+\[Character\]\s+Millionaire/);
  assert.match(legacyRouteSource, /No first-to legacy records claimed yet\./);
  assert.doesNotMatch(legacyRouteSource, /characters\.map|listCharacters|all characters/i);
});

test("browser routes do not import server-only Legendary modules", () => {
  for (const [name, source] of [
    ["Legacy Log", legacyRouteSource],
    ["profile", profileSource],
    ["authenticated layout", authenticatedRouteSource],
  ] as const) {
    assert.doesNotMatch(
      source,
      /client\.server|supabaseAdmin|\.server\.ts/,
      `${name} route stays browser-safe`,
    );
  }
});
