/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  addCharacterToPool,
  autoFillPerfectCrew,
  createNewDailyCrewMissionEditor,
  editorFromMissionDetail,
  editorSnapshot,
  ensureScoreMatrix,
  firstUnusedUtcMissionDate,
  getDailyCrewStatusActions,
  isEditorReadOnly,
  moveJob,
  movePoolEntry,
  removeCharacterFromPool,
  setPerfectSolutionCharacter,
  slugFromTitle,
  toMissionSavePayload,
  updateJob,
  updateScore,
  validateDailyCrewMissionEditor,
  type DailyCrewMissionEditor,
  type DailyCrewMissionStudioCharacter,
} from "./admin-editor.ts";
import type { AdminDailyCrewMissionDetail } from "../api/daily-crew-builder-admin.functions.ts";
import type { DailyCrewRole } from "./scoring.ts";

const characterIds = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
  "00000000-0000-4000-8000-000000000007",
  "00000000-0000-4000-8000-000000000008",
  "00000000-0000-4000-8000-000000000009",
  "00000000-0000-4000-8000-000000000010",
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
  "00000000-0000-4000-8000-000000000014",
  "00000000-0000-4000-8000-000000000015",
];

const characters: DailyCrewMissionStudioCharacter[] = characterIds.map((id, index) => ({
  id,
  slug: `character-${index + 1}`,
  name: `Character ${index + 1}`,
  crew: index < 3 ? "Straw Hat Pirates" : "Allied Fleet",
}));

function withNineCharacters(
  editor = createNewDailyCrewMissionEditor([], new Date("2026-07-14T12:00:00.000Z")),
) {
  return characters.reduce((next, character) => addCharacterToPool(next, character), editor);
}

function completeValidEditor(): DailyCrewMissionEditor {
  let editor = withNineCharacters();
  editor = {
    ...editor,
    missionDate: "2026-07-14",
    slug: "covert-cargo-test",
    title: "Covert Cargo Test",
    brief: "Assemble a compact crew for a protected supply run.",
    missionTags: ["stealth", "supply"],
    jobs: editor.jobs.map((job, index) => ({
      ...job,
      subtypeKey: ["operation_lead", "route_scout", "field_support"][index],
      subtypeLabel: ["Lead", "Scout", "Support"][index],
      displayLabel: ["Operation Lead", "Scout / Lookout", "Emergency Support"][index],
      maxPoints: 30,
    })),
  };
  editor = ensureScoreMatrix(editor);
  for (const job of editor.jobs) {
    for (const entry of editor.pool.filter((poolEntry) => poolEntry.characterId)) {
      editor = updateScore(editor, entry.characterId, job.role, {
        score: 10,
        explanation: `${entry.characterId} can contribute to ${job.role}.`,
      });
    }
  }
  const perfectCharacters = characterIds.slice(0, 3);
  for (const [index, job] of editor.jobs.entries()) {
    editor = updateScore(editor, perfectCharacters[index], job.role, {
      score: job.maxPoints,
      explanation: `Perfect fit for ${job.role}.`,
    });
    editor = setPerfectSolutionCharacter(editor, job.role, perfectCharacters[index]);
  }
  return editor;
}

function completeFifteenCharacterMissionDetail(
  status: AdminDailyCrewMissionDetail["status"] = "draft",
  submissionCount = 0,
): AdminDailyCrewMissionDetail {
  const roles: DailyCrewRole[] = ["captain", "fighter", "navigator", "strategist", "support"];
  const jobs = roles.map((role, index) => ({
    role,
    subtypeKey: `${role}_lane`,
    subtypeLabel: `${role} lane`,
    displayLabel: `${role} assignment`,
    displayOrder: index + 1,
    maxPoints: 18,
  }));
  return {
    id: "00000000-0000-4000-8000-000000000099",
    missionDate: "2026-07-15",
    slug: "legacy-five-job-mission",
    title: "Legacy Five Job Mission",
    status,
    revealPolicy: "next_day",
    revealAt: null,
    poolCount: 15,
    jobCount: 5,
    scoreCount: 75,
    submissionCount,
    ready: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    brief: "Preserve a full five-job Daily Crew mission.",
    missionTags: ["legacy", "five-job"],
    pool: characterIds.map((characterId, index) => ({
      characterId,
      displayOrder: index + 1,
      isStrawHat: index < 3,
      visibleTags: [`slot-${index + 1}`],
    })),
    jobs,
    scores: jobs.flatMap((job, jobIndex) =>
      characterIds.map((characterId, characterIndex) => ({
        characterId,
        role: job.role,
        score: characterIndex === jobIndex ? job.maxPoints : 8,
        explanation:
          characterIndex === jobIndex
            ? `${characterId} is the max-score fit for ${job.role}.`
            : `${characterId} has backup coverage for ${job.role}.`,
      })),
    ),
    perfectSolution: jobs.map((job, index) => ({
      role: job.role,
      characterId: characterIds[index],
    })),
  };
}

function assertInvalid(
  editor: DailyCrewMissionEditor,
  group: keyof ReturnType<typeof validateDailyCrewMissionEditor>["groups"],
  pattern: RegExp,
) {
  const validation = validateDailyCrewMissionEditor(editor, { todayUtc: "2026-07-14" });
  assert.equal(validation.ok, false);
  assert.match(validation.groups[group].join("\n"), pattern);
}

test("new mission creates a 9/3 editor structure with draft defaults", () => {
  const editor = createNewDailyCrewMissionEditor([], new Date("2026-07-14T12:00:00.000Z"));

  assert.equal(editor.missionId, null);
  assert.equal(editor.status, "draft");
  assert.equal(editor.missionDate, "2026-07-14");
  assert.equal(editor.revealPolicy, "next_day");
  assert.equal(editor.revealAt, null);
  assert.equal(editor.pool.length, 9);
  assert.equal(editor.jobs.length, 3);
  assert.deepEqual(
    editor.jobs.map((job) => [job.role, job.maxPoints]),
    [
      ["captain", 30],
      ["navigator", 30],
      ["support", 30],
    ],
  );
});

test("existing complete 15/5 mission detail preserves its loaded format", () => {
  const detail = completeFifteenCharacterMissionDetail();
  const editor = editorFromMissionDetail(detail);
  const validation = validateDailyCrewMissionEditor(editor, { todayUtc: "2026-07-14" });
  const payload = toMissionSavePayload(editor);

  assert.equal(editor.poolSize, 15);
  assert.equal(editor.jobCount, 5);
  assert.equal(editor.pool.length, 15);
  assert.equal(editor.jobs.length, 5);
  assert.equal(editor.scores.length, 75);
  assert.equal(editor.perfectSolution.length, 5);
  assert.deepEqual(
    editor.pool.map((entry) => [entry.characterId, entry.displayOrder]),
    detail.pool.map((entry) => [entry.characterId, entry.displayOrder]),
  );
  assert.deepEqual(
    editor.jobs.map((job) => [job.role, job.displayOrder, job.displayLabel]),
    detail.jobs.map((job) => [job.role, job.displayOrder, job.displayLabel]),
  );
  assert.deepEqual(
    editor.perfectSolution.map((solution) => [solution.role, solution.characterId]),
    detail.perfectSolution.map((solution) => [solution.role, solution.characterId]),
  );
  assert.equal(validation.ok, true);
  assert.equal(isEditorReadOnly(editor), false);
  assert.equal(payload.pool.length, 15);
  assert.equal(payload.jobs.length, 5);
  assert.equal(payload.scores.length, 75);
  assert.equal(payload.perfectSolution.length, 5);
  assert.deepEqual(
    payload.jobs.map((job) => job.role),
    ["captain", "fighter", "navigator", "strategist", "support"],
  );
});

test("existing 15/5 missions render complete authoring data when read-only", () => {
  for (const status of ["scheduled", "published", "archived"] as const) {
    const editor = editorFromMissionDetail(completeFifteenCharacterMissionDetail(status));
    assert.equal(isEditorReadOnly(editor), true);
    assert.equal(editor.pool.length, 15);
    assert.equal(editor.jobs.length, 5);
    assert.equal(editor.scores.length, 75);
    assert.equal(editor.perfectSolution.length, 5);
  }

  const lockedDraft = editorFromMissionDetail(completeFifteenCharacterMissionDetail("draft", 1));
  assert.equal(isEditorReadOnly(lockedDraft), true);
  assert.equal(lockedDraft.pool.length, 15);
  assert.equal(lockedDraft.jobs.length, 5);
  assert.equal(lockedDraft.scores.length, 75);
  assert.equal(lockedDraft.perfectSolution.length, 5);
});

test("first unused UTC mission date begins with today and skips occupied dates", () => {
  assert.equal(
    firstUnusedUtcMissionDate(
      [{ missionDate: "2026-07-14" }, { missionDate: "2026-07-15" }],
      new Date("2026-07-14T23:59:59.000Z"),
    ),
    "2026-07-16",
  );
});

test("title-to-slug suggestion normalizes punctuation and casing", () => {
  assert.equal(slugFromTitle("  Rescue at Storm Gate!!!  "), "rescue-at-storm-gate");
});

test("pool reorder keeps contiguous display order and score identity", () => {
  let base = withNineCharacters();
  base = updateScore(base, characterIds[1], "captain", {
    score: 24,
    explanation: "Score follows character and role.",
  });
  const editor = movePoolEntry(base, 2, -1);
  assert.deepEqual(
    editor.pool.map((entry) => entry.displayOrder),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(editor.pool[0].characterId, characterIds[1]);
  assert.equal(
    editor.scores.find((score) => score.characterId === characterIds[1] && score.role === "captain")
      ?.score,
    24,
  );
  assert.equal(
    editor.scores.find((score) => score.characterId === characterIds[0] && score.role === "captain")
      ?.score,
    0,
  );
});

test("character removal removes score and perfect-solution references", () => {
  const editor = completeValidEditor();
  const removed = removeCharacterFromPool(editor, characterIds[0]);

  assert.equal(
    removed.pool.some((entry) => entry.characterId === characterIds[0]),
    false,
  );
  assert.equal(
    removed.scores.some((score) => score.characterId === characterIds[0]),
    false,
  );
  assert.equal(
    removed.perfectSolution.some((solution) => solution.characterId === characterIds[0]),
    false,
  );
  assert.deepEqual(
    removed.pool.map((entry) => entry.displayOrder),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("score matrix expands and preserves existing scores", () => {
  let editor = withNineCharacters();
  editor = ensureScoreMatrix(editor);
  editor = updateScore(editor, characterIds[0], "captain", {
    score: 22,
    explanation: "Existing score survives.",
  });

  const expanded = ensureScoreMatrix(editor);
  assert.equal(expanded.scores.length, 27);
  assert.equal(
    expanded.scores.find(
      (score) => score.characterId === characterIds[0] && score.role === "captain",
    )?.score,
    22,
  );
});

test("job reorder preserves scores by character and role", () => {
  let editor = completeValidEditor();
  editor = updateScore(editor, characterIds[0], "support", {
    score: 29,
    explanation: "Support score follows the role lane.",
  });

  const moved = moveJob(editor, 3, -1);
  assert.deepEqual(
    moved.jobs.map((job) => [job.role, job.displayOrder]),
    [
      ["captain", 1],
      ["support", 2],
      ["navigator", 3],
    ],
  );
  assert.equal(
    moved.scores.find((score) => score.characterId === characterIds[0] && score.role === "support")
      ?.score,
    29,
  );
  assert.notEqual(
    moved.scores.find(
      (score) => score.characterId === characterIds[0] && score.role === "navigator",
    )?.score,
    29,
  );
});

test("job role changes do not retain stale role-key entries", () => {
  const editor = completeValidEditor();
  const changed = updateJob(editor, 2, { role: "fighter", subtypeKey: "fighter_lane" });

  assert.equal(
    changed.jobs.some((job) => job.role === "navigator"),
    false,
  );
  assert.equal(
    changed.scores.some((score) => score.role === "navigator"),
    false,
  );
  assert.equal(
    changed.perfectSolution.some((solution) => solution.role === "navigator"),
    false,
  );
  assert.equal(
    changed.scores.some((score) => score.role === "fighter"),
    true,
  );
});

test("validation accepts a complete valid 9/3 mission", () => {
  const editor = completeValidEditor();
  const validation = validateDailyCrewMissionEditor(editor, { todayUtc: "2026-07-14" });

  assert.deepEqual(validation.groups, {
    missionDetails: [],
    characterPool: [],
    jobs: [],
    scoreMatrix: [],
    perfectCrew: [],
  });
  assert.equal(validation.ok, true);
});

test("validation rejects incomplete metadata", () => {
  assertInvalid(
    { ...completeValidEditor(), slug: "Bad Slug", title: "", brief: "" },
    "missionDetails",
    /Slug|Title|Brief/,
  );
});

test("validation rejects incorrect pool count and duplicate characters", () => {
  const editor = completeValidEditor();
  const shortPool = { ...editor, pool: editor.pool.slice(0, 8), poolSize: 9 };
  assertInvalid(shortPool, "characterPool", /exactly 9/);

  const duplicatePool = {
    ...editor,
    pool: editor.pool.map((entry, index) =>
      index === 1 ? { ...entry, characterId: editor.pool[0].characterId } : entry,
    ),
  };
  assertInvalid(duplicatePool, "characterPool", /unique/);
});

test("validation rejects non-contiguous orders and too many Straw Hats", () => {
  const editor = completeValidEditor();
  assertInvalid(
    {
      ...editor,
      pool: editor.pool.map((entry, index) =>
        index === 8 ? { ...entry, displayOrder: 20 } : entry,
      ),
    },
    "characterPool",
    /display order/,
  );
  assertInvalid(
    {
      ...editor,
      pool: editor.pool.map((entry, index) => ({ ...entry, isStrawHat: index < 6 })),
    },
    "characterPool",
    /five Straw Hats/,
  );
});

test("validation rejects duplicate job roles and maxPoints total other than 90", () => {
  const editor = completeValidEditor();
  assertInvalid(
    {
      ...editor,
      jobs: editor.jobs.map((job, index) =>
        index === 1 ? { ...job, role: "captain" as DailyCrewRole } : job,
      ),
    },
    "jobs",
    /unique/,
  );
  assertInvalid(
    {
      ...editor,
      jobs: editor.jobs.map((job, index) => (index === 0 ? { ...job, maxPoints: 20 } : job)),
    },
    "jobs",
    /total exactly 90/,
  );
});

test("validation rejects incomplete score matrix, high scores, and blank explanations", () => {
  const editor = completeValidEditor();
  assertInvalid({ ...editor, scores: editor.scores.slice(1) }, "scoreMatrix", /cover every/);
  assertInvalid(
    {
      ...editor,
      scores: editor.scores.map((score, index) => (index === 0 ? { ...score, score: 31 } : score)),
    },
    "scoreMatrix",
    /job max/,
  );
  assertInvalid(
    {
      ...editor,
      scores: editor.scores.map((score, index) =>
        index === 0 ? { ...score, explanation: "" } : score,
      ),
    },
    "scoreMatrix",
    /explanation/,
  );
});

test("validation rejects duplicate perfect characters, non-max selections, and too many Straw Hats", () => {
  const editor = completeValidEditor();
  assertInvalid(
    {
      ...editor,
      perfectSolution: editor.perfectSolution.map((solution, index) =>
        index === 1
          ? { ...solution, characterId: editor.perfectSolution[0].characterId }
          : solution,
      ),
    },
    "perfectCrew",
    /repeat a character/,
  );
  assertInvalid(
    setPerfectSolutionCharacter(editor, "captain", characterIds[8]),
    "perfectCrew",
    /max-score/,
  );
  assertInvalid(
    {
      ...editor,
      pool: editor.pool.map((entry, index) => ({ ...entry, isStrawHat: index < 4 })),
      perfectSolution: [
        { role: "captain", characterId: characterIds[0] },
        { role: "navigator", characterId: characterIds[1] },
        { role: "support", characterId: characterIds[2] },
        { role: "fighter", characterId: characterIds[3] },
      ],
    },
    "perfectCrew",
    /three Straw Hats/,
  );
});

test("perfect-crew auto-fill finds a valid non-greedy unique matching", () => {
  let editor = completeValidEditor();
  editor = {
    ...editor,
    perfectSolution: editor.perfectSolution.map((solution) => ({ ...solution, characterId: "" })),
  };
  for (const job of editor.jobs) {
    for (const characterId of characterIds.slice(0, 4)) {
      editor = updateScore(editor, characterId, job.role, { score: 10, explanation: "Candidate." });
    }
  }
  editor = updateScore(editor, characterIds[0], "captain", { score: 30, explanation: "A or B." });
  editor = updateScore(editor, characterIds[1], "captain", {
    score: 30,
    explanation: "B only elsewhere.",
  });
  editor = updateScore(editor, characterIds[1], "navigator", { score: 30, explanation: "B." });
  editor = updateScore(editor, characterIds[2], "support", { score: 30, explanation: "C." });

  const result = autoFillPerfectCrew(editor);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.editor.perfectSolution.map((solution) => solution.characterId),
    [characterIds[0], characterIds[1], characterIds[2]],
  );
});

test("perfect-crew auto-fill fails without partially mutating state", () => {
  let editor = completeValidEditor();
  editor = {
    ...editor,
    perfectSolution: editor.perfectSolution.map((solution) => ({ ...solution, characterId: "" })),
  };
  for (const job of editor.jobs) {
    for (const score of editor.scores) {
      if (score.role === job.role) {
        editor = updateScore(editor, score.characterId, score.role, {
          score: 1,
          explanation: "Not max.",
        });
      }
    }
  }
  const before = editorSnapshot(editor);
  const result = autoFillPerfectCrew(editor);

  assert.equal(result.ok, false);
  assert.equal(editorSnapshot(result.editor), before);
});

test("status actions follow UTC date, status, readiness, submissions, and dirty state", () => {
  const base = completeValidEditor();
  const draft = { ...base, missionId: "00000000-0000-4000-8000-000000000099", ready: true };
  const summarize = (editor: DailyCrewMissionEditor, todayUtc = "2026-07-14") =>
    getDailyCrewStatusActions(editor, { todayUtc }).map((action) => [
      action.action,
      action.allowed,
      action.targetStatus,
    ]);
  assert.deepEqual(summarize(draft), [
    ["schedule", true, "scheduled"],
    ["archive", true, "archived"],
  ]);
  assert.equal(
    getDailyCrewStatusActions({ ...draft, ready: false }, { todayUtc: "2026-07-14" })[0].allowed,
    false,
  );
  assert.equal(
    getDailyCrewStatusActions(
      { ...draft, status: "scheduled", missionDate: "2026-07-15", submissionCount: 0 },
      { todayUtc: "2026-07-14" },
    )[0].allowed,
    true,
  );
  assert.deepEqual(summarize({ ...draft, status: "scheduled", missionDate: "2026-07-15" }), [
    ["return_to_draft", true, "draft"],
    ["archive", true, "archived"],
  ]);
  assert.deepEqual(
    summarize({ ...draft, status: "scheduled", missionDate: "2026-07-15", submissionCount: 1 }),
    [
      ["return_to_draft", false, "draft"],
      ["archive", true, "archived"],
    ],
  );
  assert.equal(
    getDailyCrewStatusActions(
      { ...draft, status: "scheduled", missionDate: "2026-07-14", submissionCount: 0 },
      { todayUtc: "2026-07-14" },
    )[1].allowed,
    false,
  );
  assert.deepEqual(summarize({ ...draft, status: "scheduled", missionDate: "2026-07-14" }), [
    ["return_to_draft", false, "draft"],
    ["archive", false, "archived"],
  ]);
  assert.equal(
    getDailyCrewStatusActions(
      { ...draft, status: "archived", missionDate: "2026-07-14", submissionCount: 0 },
      { todayUtc: "2026-07-14" },
    )[0].allowed,
    true,
  );
  assert.deepEqual(summarize({ ...draft, status: "archived", missionDate: "2026-07-14" }), [
    ["restore_to_draft", true, "draft"],
  ]);
  assert.deepEqual(
    summarize({ ...draft, status: "archived", missionDate: "2026-07-14", submissionCount: 1 }),
    [["restore_to_draft", false, "draft"]],
  );
  assert.equal(
    getDailyCrewStatusActions(
      { ...draft, status: "published", missionDate: "2026-07-13" },
      { todayUtc: "2026-07-14" },
    )[0].allowed,
    true,
  );
  assert.deepEqual(summarize({ ...draft, status: "published", missionDate: "2026-07-13" }), [
    ["archive", true, "archived"],
  ]);
  assert.deepEqual(summarize({ ...draft, status: "published", missionDate: "2026-07-14" }), [
    ["archive", false, "archived"],
  ]);
  assert.equal(
    getDailyCrewStatusActions(draft, { todayUtc: "2026-07-14", dirty: true })[0].allowed,
    false,
  );
  const targetStatuses = getDailyCrewStatusActions(draft, { todayUtc: "2026-07-14" }).map(
    (action) => String(action.targetStatus),
  );
  assert.equal(targetStatuses.includes("published"), false);
});

test("save payload excludes empty perfect crew slots", () => {
  const editor = completeValidEditor();
  const payload = toMissionSavePayload({
    ...editor,
    perfectSolution: [...editor.perfectSolution, { role: "fighter", characterId: "" }],
  });

  assert.equal(payload.pool.length, 9);
  assert.equal(payload.perfectSolution.length, 3);
});

test("save payload rejects incomplete pool slot state", () => {
  const editor = completeValidEditor();
  assert.throws(
    () =>
      toMissionSavePayload({
        ...editor,
        pool: editor.pool.map((entry, index) =>
          index === 8 ? { ...entry, characterId: "" } : entry,
        ),
      }),
    /complete and valid/,
  );
});
