/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_CREW_MISSION_IMPORT_EXAMPLE,
  importMissionJsonToEditor,
  type DailyCrewMissionImportResult,
} from "./admin-import.ts";
import type { DailyCrewMissionStudioCharacter } from "./admin-editor.ts";
import type { DailyCrewRole } from "./scoring.ts";

const characterIds = Array.from(
  { length: 15 },
  (_, index) => `00000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`,
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
    slug: `${format === "9/3" ? "compact" : "legacy"}-mission-import`,
    title: `${format} Mission Import`,
    brief: "A complete Daily Crew Mission Studio import fixture.",
    missionTags: ["import", "test"],
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
  return importMissionJsonToEditor(
    typeof mission === "string" ? mission : JSON.stringify(mission),
    characters,
  );
}

function assertSuccess(result: DailyCrewMissionImportResult) {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected import to succeed");
  return result;
}

function assertFailure(result: DailyCrewMissionImportResult, pattern: RegExp) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected import to fail");
  assert.match(Object.values(result.errors).flat().join("\n"), pattern);
  return result;
}

test("valid complete 9/3 JSON imports as a ready unsaved draft editor", () => {
  const result = assertSuccess(importJson(makeMission("9/3")));

  assert.equal(result.editor.missionId, null);
  assert.equal(result.editor.status, "draft");
  assert.equal(result.editor.submissionCount, 0);
  assert.equal(result.editor.ready, true);
  assert.equal(result.editor.pool.length, 9);
  assert.equal(result.editor.jobs.length, 3);
  assert.equal(result.editor.scores.length, 27);
  assert.equal(result.editor.perfectSolution.length, 3);
  assert.equal(result.summary.format, "9 characters / 3 jobs");
});

test("valid complete 15/5 JSON imports successfully", () => {
  const result = assertSuccess(importJson(makeMission("15/5")));

  assert.equal(result.editor.pool.length, 15);
  assert.equal(result.editor.jobs.length, 5);
  assert.equal(result.editor.scores.length, 75);
  assert.equal(result.editor.perfectSolution.length, 5);
  assert.equal(result.summary.format, "15 characters / 5 jobs");
});

test("character slugs resolve exactly after trimming and lowercasing", () => {
  const mission = makeMission("9/3");
  mission.pool[0].characterSlug = " CHARACTER-1 ";
  for (const score of mission.scores) {
    if (score.characterSlug === "character-1") score.characterSlug = " CHARACTER-1 ";
  }
  mission.perfectSolution[0].characterSlug = " CHARACTER-1 ";

  const result = assertSuccess(importJson(mission));

  assert.equal(result.editor.pool[0].characterId, characterIds[0]);
  assert.equal(
    result.editor.scores.find(
      (score) => score.characterId === characterIds[0] && score.role === "captain",
    )?.score,
    30,
  );
});

test("imported pool and job display order is preserved by displayOrder", () => {
  const mission = makeMission("9/3");
  mission.pool = [...mission.pool].reverse();
  mission.jobs = [...mission.jobs].reverse();

  const result = assertSuccess(importJson(mission));

  assert.deepEqual(
    result.editor.pool.map((entry) => entry.characterId),
    characterIds.slice(0, 9),
  );
  assert.deepEqual(
    result.editor.jobs.map((job) => job.role),
    ["captain", "navigator", "support"],
  );
});

test("imported scores and perfect crew preserve character and role identity", () => {
  const result = assertSuccess(importJson(makeMission("9/3")));

  assert.equal(
    result.editor.scores.find(
      (score) => score.characterId === characterIds[8] && score.role === "support",
    )?.explanation,
    "character-9 can cover support.",
  );
  assert.deepEqual(
    result.editor.perfectSolution.map((solution) => [solution.role, solution.characterId]),
    [
      ["captain", characterIds[0]],
      ["navigator", characterIds[1]],
      ["support", characterIds[2]],
    ],
  );
});

test("invalid JSON fails with a safe message", () => {
  assertFailure(importJson("{ bad json"), /Invalid JSON: check commas, quotes, and brackets/);
});

test("arrays and non-object JSON are rejected", () => {
  assertFailure(importJson(JSON.stringify([makeMission("9/3")])), /not an array/);
  assertFailure(importJson(JSON.stringify("not a mission object")), /exactly one mission object/);
});

test("unsupported schemaVersion fails", () => {
  const mission = { ...makeMission("9/3"), schemaVersion: 2 };
  assertFailure(importJson(mission), /schemaVersion/);
});

test("forbidden mission metadata fields are rejected", () => {
  for (const field of [
    "missionId",
    "status",
    "ready",
    "submissionCount",
    "createdAt",
    "updatedAt",
  ]) {
    const mission = makeMission("9/3") as unknown as Record<string, unknown>;
    mission[field] = field === "ready" ? true : "not-allowed";

    assertFailure(importJson(mission), new RegExp(field));
  }
});

test("database character IDs from JSON are rejected at every character reference level", () => {
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

test("unknown and ambiguous character slugs fail", () => {
  const unknown = makeMission("9/3");
  unknown.pool[0].characterSlug = "not-a-character";

  assertFailure(importJson(unknown), /Unknown roster character slug: not-a-character/);

  const ambiguousCharacters = [...characters, { ...characters[0], id: characterIds[14] }];
  const ambiguous = importMissionJsonToEditor(
    JSON.stringify(makeMission("9/3")),
    ambiguousCharacters,
  );

  assertFailure(ambiguous, /Ambiguous roster character slug: character-1/);
});

test("slug resolution is exact and does not rewrite punctuation or fuzzy match", () => {
  const mission = makeMission("9/3");
  mission.pool[0].characterSlug = "character 1";
  for (const score of mission.scores) {
    if (score.characterSlug === "character-1") score.characterSlug = "character 1";
  }
  mission.perfectSolution[0].characterSlug = "character 1";

  assertFailure(importJson(mission), /Unknown roster character slug: character 1/);
});

test("duplicate pool slug fails", () => {
  const mission = makeMission("9/3");
  mission.pool[1].characterSlug = mission.pool[0].characterSlug;

  assertFailure(importJson(mission), /Pool character slug is duplicated: character-1/);
});

test("mismatched 9/5 and 15/3 formats fail", () => {
  const nineFive = makeMission("15/5");
  nineFive.pool = nineFive.pool.slice(0, 9);
  nineFive.scores = nineFive.scores.filter((score) =>
    nineFive.pool.some((entry) => entry.characterSlug === score.characterSlug),
  );

  assertFailure(importJson(nineFive), /Supported formats are exactly 9 pool characters \/ 3 jobs/);

  const fifteenThree = makeMission("9/3");
  const extraPool = makeMission("15/5").pool.slice(9, 15);
  fifteenThree.pool.push(...extraPool);
  for (const poolEntry of extraPool) {
    for (const job of fifteenThree.jobs) {
      fifteenThree.scores.push({
        characterSlug: poolEntry.characterSlug,
        role: job.role,
        score: 12,
        explanation: `${poolEntry.characterSlug} can cover ${job.role}.`,
      });
    }
  }

  assertFailure(
    importJson(fifteenThree),
    /Supported formats are exactly 9 pool characters \/ 3 jobs/,
  );
});

test("successful imports contain every pool-character and job score pair exactly once", () => {
  const result = assertSuccess(importJson(makeMission("15/5")));
  const scoreKeys = result.editor.scores.map((score) => `${score.characterId}:${score.role}`);

  assert.equal(new Set(scoreKeys).size, 75);
  for (const poolEntry of result.editor.pool) {
    for (const job of result.editor.jobs) {
      assert.ok(
        scoreKeys.includes(`${poolEntry.characterId}:${job.role}`),
        `missing score for ${poolEntry.characterId} ${job.role}`,
      );
    }
  }
});

test("incomplete score matrix and duplicate score pairs fail", () => {
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

test("score above job max and missing explanation fail", () => {
  const highScore = makeMission("9/3");
  highScore.scores[0].score = 31;

  assertFailure(importJson(highScore), /between 0 and 30/);

  const missingExplanation = makeMission("9/3");
  missingExplanation.scores[0].explanation = " ";

  assertFailure(importJson(missingExplanation), /Score explanation cannot be blank/);
});

test("unknown score character fails", () => {
  const mission = makeMission("9/3");
  mission.scores[0].characterSlug = "not-in-pool";

  assertFailure(importJson(mission), /Score references a character outside the imported pool/);
});

test("duplicate and non-max perfect selections fail", () => {
  const duplicatePerfect = makeMission("9/3");
  duplicatePerfect.perfectSolution[1].characterSlug =
    duplicatePerfect.perfectSolution[0].characterSlug;

  assertFailure(importJson(duplicatePerfect), /Perfect solution character is duplicated/);

  const nonMax = makeMission("9/3");
  nonMax.perfectSolution[0].characterSlug = "character-9";

  assertFailure(importJson(nonMax), /must have the job maximum score/);
});

test("too many Straw Hats fails for pool and perfect crew limits", () => {
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

test("unknown top-level and nested fields are rejected", () => {
  const topLevel = { ...makeMission("9/3"), missionId: "not-allowed" };
  assertFailure(importJson(topLevel), /Unrecognized key\(s\) in object: 'missionId'/);

  const nested = cloneMission(makeMission("9/3"));
  Object.assign(nested.pool[0], { characterId: characterIds[0] });

  assertFailure(importJson(nested), /Unrecognized key\(s\) in object: 'characterId'/);
});

test("insert example is structural only and cannot import as a ready mission", () => {
  assertFailure(
    importMissionJsonToEditor(DAILY_CREW_MISSION_IMPORT_EXAMPLE, characters),
    /Supported formats are exactly 9 pool characters \/ 3 jobs|Score matrix/,
  );
});
