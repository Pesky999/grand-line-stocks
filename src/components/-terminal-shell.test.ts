/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const terminalShellSource = readFileSync(
  join(process.cwd(), "src/components/TerminalShell.tsx"),
  "utf8",
);
const characterSource = readFileSync(join(process.cwd(), "src/routes/character.$slug.tsx"), "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return source.slice(start, end);
}

const headerSource = sourceBetween(terminalShellSource, "<header", "</header>");

test("TerminalShell shared header is sticky but not fixed", () => {
  const headerClass = terminalShellSource.match(/<header className="([^"]+)"/)?.[1] ?? "";

  assert.match(headerClass, /\bsticky\b/);
  assert.match(headerClass, /\btop-0\b/);
  assert.match(headerClass, /\bz-40\b/);
  assert.match(headerClass, /\bbg-card\/95\b/);
  assert.doesNotMatch(headerClass, /\bfixed\b/);
});

test("TerminalShell header preserves brand, desktop nav, and mobile menu", () => {
  assert.match(headerSource, /<Link\s+to="\/"\s+className="flex items-center gap-2/);
  assert.match(headerSource, /BERRY&nbsp;STREET/);
  assert.match(headerSource, /<nav className="hidden gap-4 md:flex">/);
  assert.match(headerSource, /nav\.map\(\(item\) =>/);
  assert.match(headerSource, /<SheetTrigger asChild>/);
  assert.match(headerSource, /aria-label="Open navigation"/);
});

test("TerminalShell keeps the shared header before the page main", () => {
  const headerIndex = terminalShellSource.indexOf("<header");
  const mainIndex = terminalShellSource.indexOf("<main>");

  assert.ok(headerIndex >= 0);
  assert.ok(mainIndex >= 0);
  assert.ok(headerIndex < mainIndex);
});

test("character page does not introduce route-specific sticky navigation", () => {
  assert.doesNotMatch(
    characterSource,
    /sticky top-0|position:\s*["']?sticky|className="[^"]*fixed/,
  );
});
