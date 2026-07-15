import { z } from "zod";
import {
  DAILY_CREW_MAX_PERFECT_STRAW_HATS,
  DAILY_CREW_MAX_POOL_STRAW_HATS,
  DAILY_CREW_TOTAL_JOB_POINTS,
  validateDailyCrewMissionEditor,
  type DailyCrewEditorJob,
  type DailyCrewEditorPerfectSolution,
  type DailyCrewEditorPoolEntry,
  type DailyCrewEditorScore,
  type DailyCrewMissionEditor,
  type DailyCrewMissionStudioCharacter,
  type DailyCrewRevealPolicy,
} from "./admin-editor.ts";
import { DAILY_CREW_ROLES, type DailyCrewRole } from "./scoring.ts";

export const DAILY_CREW_MISSION_IMPORT_EXAMPLE = JSON.stringify(
  {
    schemaVersion: 1,
    missionDate: "2099-01-01",
    slug: "example-mission-slug",
    title: "Example Mission Title",
    brief: "Replace this placeholder with the mission brief before importing.",
    missionTags: ["example"],
    revealPolicy: "next_day",
    revealAt: null,
    pool: [],
    jobs: [],
    scores: [],
    perfectSolution: [],
  },
  null,
  2,
);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const SUBTYPE_KEY_RE = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const UTC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WITH_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const TITLE_MAX = 120;
const BRIEF_MAX = 2000;
const TAG_MAX = 40;
const MAX_TAGS = 8;
const VISIBLE_TAG_MAX = 40;
const MAX_VISIBLE_TAGS = 5;
const EXPLANATION_MAX = 500;

const importErrorGroups = [
  "json",
  "schema",
  "characters",
  "format",
  "missionDetails",
  "characterPool",
  "jobs",
  "scoreMatrix",
  "perfectCrew",
] as const;

export type DailyCrewMissionImportErrorGroup = (typeof importErrorGroups)[number];

export type DailyCrewMissionImportErrors = Record<DailyCrewMissionImportErrorGroup, string[]>;

export type DailyCrewMissionImportSummary = {
  title: string;
  missionDate: string;
  format: string;
  poolCount: number;
  jobCount: number;
  scoreCount: number;
  perfectCrewCount: number;
  resolvedCharacterCount: number;
};

export type DailyCrewMissionImportResult =
  | {
      ok: true;
      editor: DailyCrewMissionEditor;
      summary: DailyCrewMissionImportSummary;
    }
  | {
      ok: false;
      errors: DailyCrewMissionImportErrors;
    };

export type DailyCrewMissionJsonParseResult =
  | {
      ok: true;
      editor: DailyCrewMissionEditor;
      summary: DailyCrewMissionImportSummary;
    }
  | {
      ok: false;
      errors: DailyCrewMissionImportErrors;
    };

const trimmedString = (max: number, label: string) =>
  z
    .string({ required_error: `${label} is required.` })
    .transform((value) => value.trim())
    .pipe(z.string().min(1, `${label} cannot be blank.`).max(max));

const trimmedOptionalLabel = z.preprocess((value) => {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}, z.string().max(120).nullable());

const importedRoleSchema = z.enum(DAILY_CREW_ROLES);

const importedPoolEntrySchema = z
  .object({
    characterSlug: trimmedString(80, "Pool character slug").transform((value) =>
      value.toLowerCase(),
    ),
    displayOrder: z.number().int().positive(),
    isStrawHat: z.boolean(),
    visibleTags: z.array(trimmedString(VISIBLE_TAG_MAX, "Visible tag")).max(MAX_VISIBLE_TAGS),
  })
  .strict();

const importedJobSchema = z
  .object({
    role: importedRoleSchema,
    subtypeKey: trimmedString(64, "Job subtype key")
      .transform((value) => value.toLowerCase())
      .refine((value) => SUBTYPE_KEY_RE.test(value), {
        message: "Job subtype keys must use lowercase letters, numbers, underscores, or hyphens.",
      }),
    subtypeLabel: trimmedOptionalLabel,
    displayLabel: trimmedString(120, "Job display label"),
    displayOrder: z.number().int().positive(),
    maxPoints: z.number().int().min(1).max(30),
  })
  .strict();

const importedScoreSchema = z
  .object({
    characterSlug: trimmedString(80, "Score character slug").transform((value) =>
      value.toLowerCase(),
    ),
    role: importedRoleSchema,
    score: z.number().int().min(0),
    explanation: trimmedString(EXPLANATION_MAX, "Score explanation"),
  })
  .strict();

const importedPerfectSolutionSchema = z
  .object({
    role: importedRoleSchema,
    characterSlug: trimmedString(80, "Perfect solution character slug").transform((value) =>
      value.toLowerCase(),
    ),
  })
  .strict();

const importedMissionSchema = z
  .object({
    schemaVersion: z.literal(1),
    missionDate: z.string().regex(UTC_DATE_RE, "Mission date must be YYYY-MM-DD."),
    slug: trimmedString(80, "Mission slug")
      .transform((value) => value.toLowerCase())
      .refine((value) => SLUG_RE.test(value), {
        message: "Slug must use lowercase letters, numbers, and hyphens.",
      }),
    title: trimmedString(TITLE_MAX, "Title"),
    brief: trimmedString(BRIEF_MAX, "Brief"),
    missionTags: z.array(trimmedString(TAG_MAX, "Mission tag")).max(MAX_TAGS),
    revealPolicy: z.enum(["immediate", "next_day", "manual"]),
    revealAt: z.preprocess((value) => {
      if (value == null) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }, z.string().regex(ISO_WITH_OFFSET_RE, "Reveal timestamp must be ISO-8601 with an offset.").nullable()),
    pool: z.array(importedPoolEntrySchema),
    jobs: z.array(importedJobSchema),
    scores: z.array(importedScoreSchema),
    perfectSolution: z.array(importedPerfectSolutionSchema),
  })
  .strict();

type ImportedMission = z.infer<typeof importedMissionSchema>;

function emptyErrors(): DailyCrewMissionImportErrors {
  return {
    json: [],
    schema: [],
    characters: [],
    format: [],
    missionDetails: [],
    characterPool: [],
    jobs: [],
    scoreMatrix: [],
    perfectCrew: [],
  };
}

function hasErrors(errors: DailyCrewMissionImportErrors): boolean {
  return importErrorGroups.some((group) => errors[group].length > 0);
}

function failWith(
  group: DailyCrewMissionImportErrorGroup,
  message: string,
): DailyCrewMissionImportResult {
  const errors = emptyErrors();
  errors[group].push(message);
  return { ok: false, errors };
}

function groupForPath(path: (string | number)[]): DailyCrewMissionImportErrorGroup {
  const head = path[0];
  if (head === "pool") return "characterPool";
  if (head === "jobs") return "jobs";
  if (head === "scores") return "scoreMatrix";
  if (head === "perfectSolution") return "perfectCrew";
  if (
    head === "missionDate" ||
    head === "slug" ||
    head === "title" ||
    head === "brief" ||
    head === "missionTags" ||
    head === "revealPolicy" ||
    head === "revealAt"
  ) {
    return "missionDetails";
  }
  return "schema";
}

function formatPath(path: (string | number)[]): string {
  if (path.length === 0) return "mission";
  return path.map((part) => (typeof part === "number" ? `[${part}]` : part)).join(".");
}

function errorsFromZod(error: z.ZodError): DailyCrewMissionImportErrors {
  const errors = emptyErrors();
  for (const issue of error.issues) {
    const group = groupForPath(issue.path);
    errors[group].push(`${formatPath(issue.path)}: ${issue.message}`);
  }
  return errors;
}

function sortedContiguous(values: number[], expectedCount: number): boolean {
  if (values.length !== expectedCount) return false;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.every((value, index) => value === index + 1);
}

function keyFor(characterSlug: string, role: DailyCrewRole): string {
  return `${characterSlug}::${role}`;
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function characterSlugMap(characters: DailyCrewMissionStudioCharacter[]) {
  const map = new Map<string, DailyCrewMissionStudioCharacter[]>();
  for (const character of characters) {
    const slug = character.slug.trim().toLowerCase();
    if (!slug) continue;
    const rows = map.get(slug) ?? [];
    rows.push(character);
    map.set(slug, rows);
  }
  return map;
}

function validateImportedMission(
  mission: ImportedMission,
  characters: DailyCrewMissionStudioCharacter[],
): {
  errors: DailyCrewMissionImportErrors;
  resolvedCharacters: Map<string, DailyCrewMissionStudioCharacter>;
} {
  const errors = emptyErrors();
  const resolvedCharacters = new Map<string, DailyCrewMissionStudioCharacter>();
  const rosterBySlug = characterSlugMap(characters);
  const poolSlugs = mission.pool.map((entry) => entry.characterSlug);
  const poolSlugSet = new Set(poolSlugs);
  const jobsByRole = new Map(mission.jobs.map((job) => [job.role, job]));
  const activeRoles = mission.jobs.map((job) => job.role);

  if (
    !(
      (mission.pool.length === 9 && mission.jobs.length === 3) ||
      (mission.pool.length === 15 && mission.jobs.length === 5)
    )
  ) {
    errors.format.push(
      "Supported formats are exactly 9 pool characters / 3 jobs or 15 pool characters / 5 jobs.",
    );
  }

  if (
    !sortedContiguous(
      mission.pool.map((entry) => entry.displayOrder),
      mission.pool.length,
    )
  ) {
    errors.characterPool.push(
      `Pool display order must be unique and contiguous from 1 through ${mission.pool.length}.`,
    );
  }

  for (const slug of findDuplicates(poolSlugs)) {
    errors.characterPool.push(`Pool character slug is duplicated: ${slug}.`);
  }

  if (mission.pool.filter((entry) => entry.isStrawHat).length > DAILY_CREW_MAX_POOL_STRAW_HATS) {
    errors.characterPool.push(
      `Pool can include no more than ${DAILY_CREW_MAX_POOL_STRAW_HATS} Straw Hats.`,
    );
  }

  for (const poolEntry of mission.pool) {
    const matches = rosterBySlug.get(poolEntry.characterSlug) ?? [];
    if (matches.length === 0) {
      errors.characters.push(`Unknown roster character slug: ${poolEntry.characterSlug}.`);
    } else if (matches.length > 1) {
      errors.characters.push(`Ambiguous roster character slug: ${poolEntry.characterSlug}.`);
    } else {
      resolvedCharacters.set(poolEntry.characterSlug, matches[0]);
    }
  }

  if (
    !sortedContiguous(
      mission.jobs.map((job) => job.displayOrder),
      mission.jobs.length,
    )
  ) {
    errors.jobs.push(
      `Job display order must be unique and contiguous from 1 through ${mission.jobs.length}.`,
    );
  }

  for (const role of findDuplicates(activeRoles)) {
    errors.jobs.push(`Job role is duplicated: ${role}.`);
  }

  if (mission.jobs.reduce((sum, job) => sum + job.maxPoints, 0) !== DAILY_CREW_TOTAL_JOB_POINTS) {
    errors.jobs.push(`Job max points must total exactly ${DAILY_CREW_TOTAL_JOB_POINTS}.`);
  }

  const scoreKeys = new Set<string>();
  for (const score of mission.scores) {
    if (!poolSlugSet.has(score.characterSlug)) {
      errors.scoreMatrix.push(
        `Score references a character outside the imported pool: ${score.characterSlug}.`,
      );
    }
    const job = jobsByRole.get(score.role);
    if (!job) {
      errors.scoreMatrix.push(`Score references a role outside the imported jobs: ${score.role}.`);
    } else if (score.score > job.maxPoints) {
      errors.scoreMatrix.push(
        `Score for ${score.characterSlug} ${score.role} must be between 0 and ${job.maxPoints}.`,
      );
    }
    const key = keyFor(score.characterSlug, score.role);
    if (scoreKeys.has(key)) {
      errors.scoreMatrix.push(`Duplicate score row for ${score.characterSlug} ${score.role}.`);
    }
    scoreKeys.add(key);
  }

  const expectedScoreCount = mission.pool.length * mission.jobs.length;
  if (mission.scores.length !== expectedScoreCount) {
    errors.scoreMatrix.push(`Score matrix must contain exactly ${expectedScoreCount} rows.`);
  }

  for (const poolSlug of poolSlugs) {
    for (const role of activeRoles) {
      if (!scoreKeys.has(keyFor(poolSlug, role))) {
        errors.scoreMatrix.push(`Missing score row for ${poolSlug} ${role}.`);
      }
    }
  }

  const perfectRoles = mission.perfectSolution.map((solution) => solution.role);
  const perfectSlugs = mission.perfectSolution.map((solution) => solution.characterSlug);

  if (mission.perfectSolution.length !== mission.jobs.length) {
    errors.perfectCrew.push(`Perfect solution must contain exactly ${mission.jobs.length} rows.`);
  }

  for (const role of findDuplicates(perfectRoles)) {
    errors.perfectCrew.push(`Perfect solution role is duplicated: ${role}.`);
  }

  for (const role of activeRoles) {
    if (!perfectRoles.includes(role)) {
      errors.perfectCrew.push(`Perfect solution is missing role: ${role}.`);
    }
  }

  for (const slug of findDuplicates(perfectSlugs)) {
    errors.perfectCrew.push(`Perfect solution character is duplicated: ${slug}.`);
  }

  for (const solution of mission.perfectSolution) {
    if (!poolSlugSet.has(solution.characterSlug)) {
      errors.perfectCrew.push(
        `Perfect solution references a character outside the imported pool: ${solution.characterSlug}.`,
      );
    }
    const job = jobsByRole.get(solution.role);
    if (!job) {
      errors.perfectCrew.push(
        `Perfect solution references a role outside the imported jobs: ${solution.role}.`,
      );
      continue;
    }
    const score = mission.scores.find(
      (row) => row.characterSlug === solution.characterSlug && row.role === solution.role,
    );
    if (!score || score.score !== job.maxPoints) {
      errors.perfectCrew.push(
        `Perfect solution ${solution.characterSlug} ${solution.role} must have the job maximum score.`,
      );
    }
  }

  const strawHatBySlug = new Map(
    mission.pool.map((entry) => [entry.characterSlug, entry.isStrawHat] as const),
  );
  const perfectStrawHats = mission.perfectSolution.filter((solution) =>
    strawHatBySlug.get(solution.characterSlug),
  ).length;
  if (perfectStrawHats > DAILY_CREW_MAX_PERFECT_STRAW_HATS) {
    errors.perfectCrew.push(
      `Perfect crew can include no more than ${DAILY_CREW_MAX_PERFECT_STRAW_HATS} Straw Hats.`,
    );
  }

  return { errors, resolvedCharacters };
}

function mergeEditorValidationErrors(
  errors: DailyCrewMissionImportErrors,
  validation: ReturnType<typeof validateDailyCrewMissionEditor>,
) {
  errors.missionDetails.push(...validation.groups.missionDetails);
  errors.characterPool.push(...validation.groups.characterPool);
  errors.jobs.push(...validation.groups.jobs);
  errors.scoreMatrix.push(...validation.groups.scoreMatrix);
  errors.perfectCrew.push(...validation.groups.perfectCrew);
}

function editorFromImportedMission(
  mission: ImportedMission,
  resolvedCharacters: Map<string, DailyCrewMissionStudioCharacter>,
): DailyCrewMissionEditor {
  const sortedPool = [...mission.pool].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
  const sortedJobs = [...mission.jobs].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
  const pool: DailyCrewEditorPoolEntry[] = sortedPool.map((entry) => ({
    characterId: resolvedCharacters.get(entry.characterSlug)?.id ?? "",
    displayOrder: entry.displayOrder,
    isStrawHat: entry.isStrawHat,
    visibleTags: entry.visibleTags,
  }));
  const jobs: DailyCrewEditorJob[] = sortedJobs.map((job) => ({
    role: job.role,
    subtypeKey: job.subtypeKey,
    subtypeLabel: job.subtypeLabel,
    displayLabel: job.displayLabel,
    displayOrder: job.displayOrder,
    maxPoints: job.maxPoints,
  }));
  const scores: DailyCrewEditorScore[] = mission.scores.map((score) => ({
    characterId: resolvedCharacters.get(score.characterSlug)?.id ?? "",
    role: score.role,
    score: score.score,
    explanation: score.explanation,
  }));
  const perfectSolution: DailyCrewEditorPerfectSolution[] = sortedJobs.map((job) => {
    const imported = mission.perfectSolution.find((solution) => solution.role === job.role);
    return {
      role: job.role,
      characterId: imported ? (resolvedCharacters.get(imported.characterSlug)?.id ?? "") : "",
    };
  });

  return {
    missionId: null,
    status: "draft",
    missionDate: mission.missionDate,
    slug: mission.slug,
    title: mission.title,
    brief: mission.brief,
    missionTags: mission.missionTags,
    revealPolicy: mission.revealPolicy as DailyCrewRevealPolicy,
    revealAt: mission.revealAt,
    poolSize: pool.length,
    jobCount: jobs.length,
    pool,
    jobs,
    scores,
    perfectSolution,
    submissionCount: 0,
    ready: false,
  };
}

export function parseDailyCrewMissionJsonToEditor(
  jsonText: string,
  characters: DailyCrewMissionStudioCharacter[],
): DailyCrewMissionJsonParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    return failWith("json", "Invalid JSON: check commas, quotes, and brackets.");
  }

  if (Array.isArray(parsedJson)) {
    return failWith("schema", "Import must contain exactly one mission object, not an array.");
  }
  if (parsedJson == null || typeof parsedJson !== "object") {
    return failWith("schema", "Import must contain exactly one mission object.");
  }

  const parsedMission = importedMissionSchema.safeParse(parsedJson);
  if (!parsedMission.success) {
    return { ok: false, errors: errorsFromZod(parsedMission.error) };
  }

  const { errors, resolvedCharacters } = validateImportedMission(parsedMission.data, characters);
  if (hasErrors(errors)) {
    return { ok: false, errors };
  }

  const editor = editorFromImportedMission(parsedMission.data, resolvedCharacters);

  return {
    ok: true,
    editor,
    summary: {
      title: editor.title,
      missionDate: editor.missionDate,
      format: `${editor.pool.length} characters / ${editor.jobs.length} jobs`,
      poolCount: editor.pool.length,
      jobCount: editor.jobs.length,
      scoreCount: editor.scores.length,
      perfectCrewCount: editor.perfectSolution.length,
      resolvedCharacterCount: resolvedCharacters.size,
    },
  };
}

export function importMissionJsonToEditor(
  jsonText: string,
  characters: DailyCrewMissionStudioCharacter[],
): DailyCrewMissionImportResult {
  const parsed = parseDailyCrewMissionJsonToEditor(jsonText, characters);
  if (!parsed.ok) return parsed;

  let editor = parsed.editor;
  const validation = validateDailyCrewMissionEditor(editor);
  editor = { ...editor, ready: validation.ok };
  if (!validation.ok) {
    const nextErrors = emptyErrors();
    mergeEditorValidationErrors(nextErrors, validation);
    return { ok: false, errors: nextErrors };
  }

  return {
    ok: true,
    editor,
    summary: parsed.summary,
  };
}
