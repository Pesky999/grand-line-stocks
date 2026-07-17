/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { DailyCrewMissionStudioCharacter } from "./admin-editor.ts";
import {
  DAILY_CREW_TEMPLATE_BATCH_IMPORT_LIMIT,
  importTemplateBatchJsonToDrafts,
  type DailyCrewTemplateBatchImportResult,
} from "./template-bulk-import.ts";
import type { DailyCrewRole } from "./scoring.ts";

const characterIds = Array.from(
  { length: 15 },
  (_, index) => `00000000-0000-4000-8000-0000000002${String(index + 1).padStart(2, "0")}`,
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

function makeMission(index: number, format: "9/3" | "15/5" = "9/3"): ImportMission {
  const poolCount = format === "9/3" ? 9 : 15;
  const roles: DailyCrewRole[] =
    format === "9/3"
      ? ["captain", "navigator", "support"]
      : ["captain", "fighter", "navigator", "strategist", "support"];
  const maxPoints = format === "9/3" ? 30 : 18;
  const pool = characters.slice(0, poolCount).map((character, poolIndex) => ({
    characterSlug: character.slug,
    displayOrder: poolIndex + 1,
    isStrawHat: poolIndex < 3,
    visibleTags: [`slot-${poolIndex + 1}`],
  }));
  const jobs = roles.map((role, roleIndex) => ({
    role,
    subtypeKey: `${role}_lane`,
    subtypeLabel: `${role} lane`,
    displayLabel: `${role} job`,
    displayOrder: roleIndex + 1,
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
    missionDate: `2099-01-${String((index % 28) + 1).padStart(2, "0")}`,
    slug: `bulk-template-${String(index).padStart(2, "0")}`,
    title: `Bulk Template ${index}`,
    brief: "A complete Daily Crew template batch import fixture.",
    missionTags: ["template", "batch"],
    revealPolicy: "next_day",
    revealAt: null,
    pool,
    jobs,
    scores,
    perfectSolution: jobs.map((job, jobIndex) => ({
      role: job.role,
      characterSlug: pool[jobIndex].characterSlug,
    })),
  };
}

function importBatch(
  missions: unknown,
  existingTemplates: Array<string | { slug: string }> = [],
): DailyCrewTemplateBatchImportResult {
  return importTemplateBatchJsonToDrafts(JSON.stringify(missions), characters, existingTemplates);
}

function assertSuccess(result: DailyCrewTemplateBatchImportResult) {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected batch import to succeed");
  return result;
}

function assertFailure(result: DailyCrewTemplateBatchImportResult, pattern: RegExp) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected batch import to fail");
  const text = [
    ...result.errors.batch,
    ...result.errors.items.flatMap((item) => Object.values(item.errors).flat()),
  ].join("\n");
  assert.match(text, pattern);
  return result;
}

test("valid two-item batch preserves order and aggregate totals", () => {
  const result = assertSuccess(importBatch([makeMission(1, "9/3"), makeMission(2, "15/5")]));

  assert.deepEqual(result.normalizedSlugs, ["bulk-template-01", "bulk-template-02"]);
  assert.equal(result.drafts[0].templateId, null);
  assert.equal(result.drafts[1].templateId, null);
  assert.equal(result.drafts[0].isActive, true);
  assert.equal(result.drafts[1].isActive, true);
  assert.deepEqual(
    result.summaries.map((summary) => summary.position),
    [1, 2],
  );
  assert.equal(result.summaries[0].storedMissionDate, null);
  assert.equal(result.summaries[0].sourceMissionDate, "2099-01-02");
  assert.equal(result.aggregate.templateCount, 2);
  assert.equal(result.aggregate.totalPoolRows, 24);
  assert.equal(result.aggregate.totalJobs, 8);
  assert.equal(result.aggregate.totalScoreRows, 102);
  assert.equal(result.aggregate.totalPerfectCrewRows, 8);
});

test("valid thirty-item batch is accepted", () => {
  const missions = Array.from({ length: 30 }, (_, index) => makeMission(index + 1));
  const result = assertSuccess(importBatch(missions));

  assert.equal(result.aggregate.templateCount, 30);
  assert.equal(result.aggregate.totalPoolRows, 270);
  assert.equal(result.aggregate.totalJobs, 90);
  assert.equal(result.aggregate.totalScoreRows, 810);
  assert.equal(result.aggregate.totalPerfectCrewRows, 90);
  assert.equal(result.normalizedSlugs[29], "bulk-template-30");
});

test("root must be a non-empty array of at most fifty entries", () => {
  assertFailure(importBatch(makeMission(1)), /root must be a JSON array/);
  assertFailure(importBatch([]), /at least one template/);
  assertFailure(
    importBatch(
      Array.from({ length: DAILY_CREW_TEMPLATE_BATCH_IMPORT_LIMIT + 1 }, (_, index) =>
        makeMission(index + 1),
      ),
    ),
    /limited to 50 templates/,
  );
});

test("invalid individual items report their item index and validation groups", () => {
  const invalid = cloneMission(makeMission(2));
  invalid.revealAt = "2099-01-02T00:00:00Z";

  const result = assertFailure(importBatch([makeMission(1), invalid]), /revealAt: null/);
  assert.equal(result.errors.items.length, 1);
  assert.equal(result.errors.items[0].index, 1);
  assert.equal(result.errors.items[0].position, 2);
  assert.equal(result.errors.items[0].title, "Bulk Template 2");
  assert.equal(result.errors.items[0].slug, "bulk-template-02");
  assert.match(result.errors.items[0].errors.missionDetails.join("\n"), /revealAt: null/);
});

test("duplicate and existing template slugs reject the complete batch", () => {
  const duplicate = cloneMission(makeMission(2));
  duplicate.slug = " BULK-TEMPLATE-01 ";

  assertFailure(importBatch([makeMission(1), duplicate]), /duplicated inside the batch/);
  const conflict = assertFailure(
    importBatch([makeMission(1)], [{ slug: " bulk-template-01 " }]),
    /already exists in the current library/,
  );
  assert.equal(conflict.errors.items[0].position, 1);
});

test("batch import source does not persist or log pasted JSON", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/daily-crew-builder/template-bulk-import.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /console\.(log|info|warn|error)|localStorage|sessionStorage|URLSearchParams|navigator\.sendBeacon|analytics|captureException|captureMessage|Sentry/,
  );
});
