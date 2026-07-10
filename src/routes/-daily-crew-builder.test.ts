/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

const routeSource = read("src/routes/games.daily-crew-builder.tsx");
const gamesIndexSource = read("src/routes/games.index.tsx");
const apiSource = read("src/lib/api/daily-crew-builder.functions.ts");

test("Daily Crew Builder preview route renders the mission, roles, pool, and preview result sections", () => {
  assert.match(routeSource, /createFileRoute\("\/games\/daily-crew-builder"\)/);
  assert.match(routeSource, /Daily Crew Builder/);
  assert.match(routeSource, /mission\.title/);
  assert.match(routeSource, /mission\.brief/);
  assert.match(routeSource, /15-character pool/);
  assert.match(routeSource, /Role Assignment/);
  assert.match(routeSource, /Character Pool/);
  assert.match(routeSource, /Preview Result/);
  assert.match(routeSource, /role\.name/);
  assert.match(routeSource, /pool\.map/);
});

test("Daily Crew Builder route keeps hidden fixture data out of the browser-visible route module", () => {
  assert.match(routeSource, /getTodayDailyCrewBuilderMission/);
  assert.match(routeSource, /submitDailyCrewBuilderPreview/);
  assert.doesNotMatch(routeSource, /DAILY_CREW_SAMPLE_FIXTURES/);
  assert.doesNotMatch(routeSource, /roleScores|roleRequirements|subtypeKey|subtypeLabel|synergyRules|perfectSolution/);
  assert.doesNotMatch(routeSource, /Hidden command profile|Hidden combat profile|Hidden route profile/i);
});

test("Daily Crew Builder route requires all roles, prevents duplicates, and prompts signed-out users", () => {
  assert.match(routeSource, /useMe\(\)/);
  assert.match(routeSource, /Sign in to submit your crew preview/);
  assert.match(routeSource, /const allRolesAssigned = roles\.length > 0 && roles\.every/);
  assert.match(routeSource, /const canSubmit = Boolean\(user\) && allRolesAssigned/);
  assert.match(routeSource, /disabled=\{!canSubmit \|\| submitPreviewM\.isPending\}/);
  assert.match(routeSource, /assignedToAnotherRole/);
  assert.match(routeSource, /disabled=\{assignedToAnotherRole\}/);
  assert.match(routeSource, /Each character can only fill one role/);
  assert.match(routeSource, /Clear/);
});

test("Daily Crew Builder result panel uses preview-only reward language and no paid-wallet language", () => {
  assert.match(routeSource, /Preview reward only/);
  assert.match(routeSource, /Reward payout coming later/);
  assert.match(routeSource, /No Berries are paid in this preview phase/);
  assert.match(routeSource, /No Berries were paid/);
  assert.match(routeSource, /Preview Reward/);
  assert.match(routeSource, /Perfect crew/);
  assert.match(routeSource, /Role breakdown/);
  assert.match(routeSource, /No synergy bonus earned/);
  assert.doesNotMatch(routeSource, /wallet|credited|earned Berries|paid to your account/i);
});

test("Games hub links to Daily Crew Builder without removing Grand Line Guess", () => {
  assert.match(gamesIndexSource, /to="\/games\/grand-line-guess"/);
  assert.match(gamesIndexSource, /to="\/games\/daily-crew-builder"/);
  assert.match(gamesIndexSource, /Daily Crew Builder/);
  assert.match(gamesIndexSource, /Preview daily/);
});

test("Daily Crew Builder UI and API introduce no persistence, wallet mutation, or payout call", () => {
  const combined = `${routeSource}\n${apiSource}`;

  assert.doesNotMatch(combined, /user_wallets/i);
  assert.doesNotMatch(combined, /transactions/i);
  assert.doesNotMatch(combined, /daily_crew_submissions|daily_crew_submission_roles/i);
  assert.doesNotMatch(combined, /award_daily_crew/i);
  assert.doesNotMatch(combined, /\.rpc\s*\(/);
  assert.doesNotMatch(combined, /\.from\s*\(/);
  assert.doesNotMatch(combined, /\.(insert|update|upsert|delete)\s*\(/);
});
