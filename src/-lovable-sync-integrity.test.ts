/// <reference types="node" />

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const BASELINE_COMMIT = "b030af39fd1edcb30878cef37a672d2fcb6a2e95";

const GUARDED_FILES = {
  "package.json": "c7a324f719903681bc875637c24da478c578f4e80552ffee2acc897339c99280",
  "src/integrations/supabase/types.ts":
    "89a09393a834b4a8520ea5b4095607e70c3977c5ef1d29dbe92c945f87921fda",
  "src/routeTree.gen.ts": "86a1cb7987ee6b0563167bb2172e7483a3b4fc40dbd7d3edf84bd50be89f3285",
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
    assert.equal(normalizedSha256(path), expectedHash, `${path} drifted from ${BASELINE_COMMIT}`);
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
