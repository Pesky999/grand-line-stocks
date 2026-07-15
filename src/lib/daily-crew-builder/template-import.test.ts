/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  DAILY_CREW_TEMPLATE_IMPORT_EXAMPLE,
  importTemplateJsonToDraft,
  type DailyCrewTemplateImportResult,
} from "./template-import.ts";
import type { DailyCrewMissionStudioCharacter } from "./admin-editor.ts";
import type { DailyCrewRole } from "./scoring.ts";

const characterIds = Array.from(
  { length: 15 },
  (_, index) => `00000000-0000-4000-8000-0000000001${String(index + 1).padStart(2, "0")}`,
);

const characters: DailyCrewMissionStudioCharacter[] = characterIds.map((id, index) => ({
  id,
  slug: `character-${index + 1}`,
  name: `Character ${index + 1}`,
  crew: index < 3 ? "Straw Hat Pirates" : "Allied Fleet",
}));

type ImportMission = {
  schemaVersion: 1;
  missionDate: string;
  slug: string;
  title: string;
  brief: string;
  missionTags: string[];
  revealPolicy: "immediate" | "next_day" | "manual";
  revealAt: string | null;
  pool: Array<{
    characterSlug: string;
    displayOrder: number;
    isStrawHat: boolean;
    visibleTags: string[];
  }>;
  jobs: Array<{
    role: DailyCrewRole;
    subtypeKey: string;
    subtypeLabel: string | null;
    displayLabel: string;
    displayOrder: number;
    maxPoints: number;
  }>;
  scores: Array<{
    characterSlug: string;
    role: DailyCrewRole;
    score: number;
    explanation: string;
  }>;
  perfectSolution: Array<{
    role: DailyCrewRole;
    characterSlug: string;
  }>;
};

function cloneMission(mission: ImportMission): ImportMission {
  return JSON.parse(JSON.stringify(mission)) as ImportMission;
}

function makeMission(format: "9/3" | "15/5" = "9/3"): ImportMission {
  const poolCount = format === "9/3" ? 9 : 15;
  const roles: DailyCrewRole[] =
    format === "9/3"
      ? ["captain", "navigator", "support"]
      : ["captain", "fighter", "navigator", "strategist", "support"];
  const maxPoints = format === "9/3" ? 30 : 18;
  const pool = characters.slice(0, poolCount).map((character, index) => ({
    characterSlug: character.slug,
    displayOrder: index + 1,
    isStrawHat: index < 3,
    visibleTags: [`slot-${index + 1}`],
  }));
  const jobs = roles.map((role, index) => ({
    role,
    subtypeKey: `${role}_lane`,
    subtypeLabel: `${role} lane`,
    displayLabel: `${role} job`,
    displayOrder: index + 1,
    maxPoints,
  }));
  const scores = pool.flatMap((poolEntry, characterIndex) =>
    jobs.map((job, jobIndex) => ({
      characterSlug: poolEntry.characterSlug,
      role: job.role,
      score: characterIndex === jobIndex ? job.maxPoints : Math.max(job.maxPoints - 8, 0),
      explanation:
        characterIndex === jobIndex
          ? `${poolEntry.characterSlug} is the max fit for ${job.role}.`
          : `${poolEntry.characterSlug} can cover ${job.role}.`,
    })),
  );

  return {
    schemaVersion: 1,
    missionDate: "2099-01-01",
    slug: `${format === "9/3" ? "compact" : "legacy"}-template-import`,
    title: `${format} Template Import`,
    brief: "A complete Daily Crew template import fixture.",
    missionTags: ["template", "test"],
    revealPolicy: "next_day",
    revealAt: null,
    pool,
    jobs,
    scores,
    perfectSolution: jobs.map((job, index) => ({
      role: job.role,
      characterSlug: pool[index].characterSlug,
    })),
  };
}

function importJson(mission: ImportMission | object | string) {
  return importTemplateJsonToDraft(
    typeof mission === "string" ? mission : JSON.stringify(mission),
    characters,
  );
}

function assertSuccess(result: DailyCrewTemplateImportResult) {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected template import to succeed");
  return result;
}

function assertFailure(result: DailyCrewTemplateImportResult, pattern: RegExp) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected template import to fail");
  assert.match(Object.values(result.errors).flat().join("\n"), pattern);
  return result;
}

test("valid complete 9/3 Mission JSON imports as an active date-neutral template draft", () => {
  const result = assertSuccess(importJson(makeMission("9/3")));

  assert.equal(result.draft.templateId, null);
  assert.equal(result.draft.isActive, true);
  assert.equal(result.draft.pool.length, 9);
  assert.equal(result.draft.jobs.length, 3);
  assert.equal(result.draft.scores.length, 27);
  assert.equal(result.draft.perfectSolution.length, 3);
  assert.equal(result.summary.format, "9 characters / 3 jobs");
});

test("valid complete 15/5 Mission JSON imports as a template draft", () => {
  const result = assertSuccess(importJson(makeMission("15/5")));

  assert.equal(result.draft.pool.length, 15);
  assert.equal(result.draft.jobs.length, 5);
  assert.equal(result.draft.scores.length, 75);
  assert.equal(result.draft.perfectSolution.length, 5);
  assert.equal(result.summary.format, "15 characters / 5 jobs");
});

test("past mission dates are accepted but omitted from template payload", () => {
  const mission = makeMission("9/3");
  mission.missionDate = "2020-01-01";

  const result = assertSuccess(importJson(mission));

  assert.equal(result.summary.sourceMissionDate, "2020-01-01");
  assert.equal("missionDate" in result.draft, false);
  assert.equal("missionId" in result.draft, false);
  assert.equal("missionStatus" in result.draft, false);
  assert.equal("revealAt" in result.draft, false);
});

test("non-null revealAt is rejected for reusable templates", () => {
  const mission = makeMission("9/3");
  mission.revealAt = "2099-01-02T00:00:00Z";

  assertFailure(importJson(mission), /revealAt: null/);
});

test("template slug over 69 characters is rejected", () => {
  const mission = makeMission("9/3");
  mission.slug = "a".repeat(70);

  assertFailure(importJson(mission), /Template slug must be 69 characters or fewer/);
});

test("arrays, malformed JSON, and unknown fields are rejected", () => {
  assertFailure(importJson(JSON.stringify([makeMission("9/3")])), /not an array/);
  assertFailure(importJson("{ bad json"), /Invalid JSON/);

  const topLevel = { ...makeMission("9/3"), unexpected: true };
  assertFailure(importJson(topLevel), /Unrecognized key\(s\) in object: 'unexpected'/);

  const nested = cloneMission(makeMission("9/3"));
  Object.assign(nested.jobs[0], { unexpected: true });
  assertFailure(importJson(nested), /Unrecognized key\(s\) in object: 'unexpected'/);
});

test("database IDs from JSON are rejected", () => {
  const pool = cloneMission(makeMission("9/3"));
  Object.assign(pool.pool[0], { characterId: characterIds[0] });
  assertFailure(importJson(pool), /Unrecognized key\(s\) in object: 'characterId'/);

  const score = cloneMission(makeMission("9/3"));
  Object.assign(score.scores[0], { characterId: characterIds[0] });
  assertFailure(importJson(score), /Unrecognized key\(s\) in object: 'characterId'/);

  const perfect = cloneMission(makeMission("9/3"));
  Object.assign(perfect.perfectSolution[0], { characterId: characterIds[0] });
  assertFailure(importJson(perfect), /Unrecognized key\(s\) in object: 'characterId'/);
});

test("character slug resolution is exact, lowercased, and rejects ambiguous slugs", () => {
  const trimmed = makeMission("9/3");
  trimmed.pool[0].characterSlug = " CHARACTER-1 ";
  for (const score of trimmed.scores) {
    if (score.characterSlug === "character-1") score.characterSlug = " CHARACTER-1 ";
  }
  trimmed.perfectSolution[0].characterSlug = " CHARACTER-1 ";

  assert.equal(assertSuccess(importJson(trimmed)).draft.pool[0].characterId, characterIds[0]);

  const fuzzy = makeMission("9/3");
  fuzzy.pool[0].characterSlug = "character 1";
  for (const score of fuzzy.scores) {
    if (score.characterSlug === "character-1") score.characterSlug = "character 1";
  }
  fuzzy.perfectSolution[0].characterSlug = "character 1";
  assertFailure(importJson(fuzzy), /Unknown roster character slug: character 1/);

  const ambiguousCharacters = [...characters, { ...characters[0], id: characterIds[14] }];
  const ambiguous = importTemplateJsonToDraft(
    JSON.stringify(makeMission("9/3")),
    ambiguousCharacters,
  );
  assertFailure(ambiguous, /Ambiguous roster character slug: character-1/);
});

test("incomplete matrix and duplicate matrix pair are rejected", () => {
  const incomplete = makeMission("9/3");
  incomplete.scores.pop();
  assertFailure(
    importJson(incomplete),
    /Score matrix must contain exactly 27 rows|Missing score row/,
  );

  const duplicate = makeMission("9/3");
  duplicate.scores[1] = { ...duplicate.scores[0] };
  assertFailure(importJson(duplicate), /Duplicate score row for character-1 captain/);
});

test("non-max perfect assignments are rejected even when total job points are 90", () => {
  const mission = makeMission("15/5");
  mission.perfectSolution[0].characterSlug = "character-9";

  assertFailure(importJson(mission), /must have the job maximum score/);
});

test("Straw Hat pool and perfect crew limits are enforced", () => {
  const tooManyPoolHats = makeMission("9/3");
  tooManyPoolHats.pool = tooManyPoolHats.pool.map((entry, index) => ({
    ...entry,
    isStrawHat: index < 6,
  }));
  assertFailure(importJson(tooManyPoolHats), /no more than 5 Straw Hats/);

  const tooManyPerfectHats = makeMission("15/5");
  tooManyPerfectHats.pool = tooManyPerfectHats.pool.map((entry, index) => ({
    ...entry,
    isStrawHat: index < 4,
  }));
  assertFailure(importJson(tooManyPerfectHats), /no more than 3 Straw Hats/);
});

test("template import preserves selected template ID and active state for replacement", () => {
  const result = assertSuccess(
    importTemplateJsonToDraft(JSON.stringify(makeMission("9/3")), characters, {
      templateId: "00000000-0000-4000-8000-00000000abcd",
      isActive: false,
    }),
  );

  assert.equal(result.draft.templateId, "00000000-0000-4000-8000-00000000abcd");
  assert.equal(result.draft.isActive, false);
});

test("structural example is intentionally incomplete and not production data", () => {
  assertFailure(
    importTemplateJsonToDraft(DAILY_CREW_TEMPLATE_IMPORT_EXAMPLE, characters),
    /Supported formats are exactly 9 pool characters \/ 3 jobs|Score matrix/,
  );
});

test("template import source does not persist or log pasted JSON", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/daily-crew-builder/template-import.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /console\.(log|info|warn|error)|localStorage|sessionStorage|URLSearchParams|navigator\.sendBeacon|analytics|captureException|captureMessage|Sentry/,
  );
});
