import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const panelSource = readSource("src/components/admin/PricingPreviewPanel.tsx");
const routeSource = readSource("src/routes/_authenticated/pricing-admin.tsx");
const adminSource = readSource("src/routes/_authenticated/admin.tsx");
const helperSource = readSource("src/lib/market-pricing/admin-preview.ts");

function readSource(workspacePath: string): string {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

test("pricing admin route stays under the authenticated admin authorization pattern", () => {
  assert.match(routeSource, /createFileRoute\("\/_authenticated\/pricing-admin"\)/);
  assert.match(routeSource, /amIAdmin\(\)/);
  assert.match(routeSource, /redirect\(\{ to: "\/" \}\)/);
  assert.match(routeSource, /listCharacters/);
  assert.match(adminSource, /to="\/pricing-admin"/);
});

test("preview source has no persistence, write endpoint, hidden attribute, or URL state path", () => {
  const combinedSource = `${panelSource}\n${routeSource}\n${helperSource}`;

  assert.doesNotMatch(combinedSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(combinedSource, /createServerFn/);
  assert.doesNotMatch(combinedSource, /adminCreate|adminUpdate|adminPost/);
  assert.doesNotMatch(combinedSource, /character_attributes/);
  assert.doesNotMatch(combinedSource, /useSearch|searchParams|navigate\(/);
});

test("preview source exposes no official write-style controls", () => {
  assert.doesNotMatch(panelSource, />\s*(Save|Apply|Publish|Approve|Update)\s*</);
});

test("preview wording distinguishes base fair value and signed fair-value difference", () => {
  assert.match(panelSource, /Base fair value drives movement and simulation previews/);
  assert.match(panelSource, /separate hypothetical launch values/);
  assert.match(panelSource, /Final price difference from fair value/);
  assert.match(panelSource, /negative means below fair value, positive means above fair value/);
});
