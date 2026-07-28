/// <reference types="node" />

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const CANONICAL_REVISION = "stock-onboarding-v1";

const GUARDED_FILES = {
  "package.json": "c7a324f719903681bc875637c24da478c578f4e80552ffee2acc897339c99280",
  "src/integrations/supabase/types.ts":
    "f0cb322c476e544ce7efb52c8b1fb5052da9b62fca9867e8fd0293b2df1d785b",
  "src/routeTree.gen.ts": "7b4184d7680d9721b7dec277a8d17f8278bcbbad0a1e47a78361f7ceecb392cb",
} as const;

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function normalizeLineEndings(source: string) {
  return source.replace(/\r\n/g, "\n");
}

function normalizedSha256(path: string) {
  return createHash("sha256")
    .update(normalizeLineEndings(readProjectFile(path)))
    .digest("hex");
}

function sourceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return source.slice(start, end);
}

test("Lovable sync guard preserves canonical file hashes", () => {
  // Expected hashes should only change with an intentional, reviewed update to the guarded file.
  for (const [path, expectedHash] of Object.entries(GUARDED_FILES)) {
    assert.equal(
      normalizedSha256(path),
      expectedHash,
      `${path} drifted from ${CANONICAL_REVISION}`,
    );
  }
});

test("Lovable sync guard preserves canonical dependency and route-tree contracts", () => {
  const packageJson = JSON.parse(readProjectFile("package.json")) as {
    devDependencies?: Record<string, string>;
  };
  const routeTreeSource = readProjectFile("src/routeTree.gen.ts");

  assert.equal(packageJson.devDependencies?.["@lovable.dev/vite-tanstack-config"], "2.7.1");
  assert.match(routeTreeSource, /import type \{ getRouter \} from '\.\/router\.tsx'/);
  assert.match(routeTreeSource, /import type \{ startInstance \} from '\.\/start\.ts'/);
  assert.match(routeTreeSource, /declare module '@tanstack\/react-start' \{/);
  assert.match(routeTreeSource, /ssr: true/);
  assert.match(routeTreeSource, /router: Awaited<ReturnType<typeof getRouter>>/);
  assert.match(routeTreeSource, /config: Awaited<ReturnType<typeof startInstance\.getOptions>>/);
});

test("Lovable sync guard preserves stock onboarding schema and route additions", () => {
  const typesSource = readProjectFile("src/integrations/supabase/types.ts");
  const routeTreeSource = readProjectFile("src/routeTree.gen.ts");

  assert.match(typesSource, /user_onboarding_progress:\s*\{/);
  assert.match(typesSource, /stock_tutorial_status: string/);
  assert.match(typesSource, /stock_tutorial_offer: string/);
  assert.match(typesSource, /page_tip_versions: Json/);
  assert.match(typesSource, /user_onboarding_events:\s*\{/);
  assert.match(typesSource, /event_name: string/);
  assert.match(typesSource, /dedupe_key: string \| null/);
  assert.match(typesSource, /metadata: Json/);
  assert.match(routeTreeSource, /AuthenticatedOnboardingRouteImport/);
  assert.match(routeTreeSource, /'\/onboarding': typeof AuthenticatedOnboardingRoute/);
  assert.match(
    routeTreeSource,
    /'\/_authenticated\/onboarding': typeof AuthenticatedOnboardingRoute/,
  );
});

test("Lovable sync guard preserves canonical Supabase function signatures", () => {
  const typesSource = readProjectFile("src/integrations/supabase/types.ts");
  const functionsSource = sourceBetween(typesSource, "    Functions: {", "    Enums: {");

  assert.match(
    functionsSource,
    /admin_reset_profile_identity:\s*\{[\s\S]*?_reason\?: string \| null/,
  );
  assert.match(
    functionsSource,
    /restore_public_identity_remediation_incident:\s*\{\s*Args: never\s*Returns: Json\s*\}/,
  );
  assert.match(
    functionsSource,
    /admin_save_daily_crew_rotation_plan:\s*\{[\s\S]*?_plan_id: string \| null/,
  );
  assert.match(
    functionsSource,
    /admin_save_daily_crew_builder_mission:\s*\{[\s\S]*?_mission_id: string \| null/,
  );
  assert.match(
    functionsSource,
    /admin_save_daily_crew_builder_mission:\s*\{[\s\S]*?_reveal_at: string \| null/,
  );
  assert.match(
    functionsSource,
    /admin_save_daily_crew_builder_template:\s*\{[\s\S]*?_template_id: string \| null/,
  );
});
