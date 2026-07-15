import {
  parseDailyCrewMissionJsonToEditor,
  type DailyCrewMissionImportErrorGroup,
  type DailyCrewMissionImportErrors,
  type DailyCrewMissionImportSummary,
} from "./admin-import.ts";
import {
  validateDailyCrewMissionEditor,
  type DailyCrewEditorJob,
  type DailyCrewEditorPerfectSolution,
  type DailyCrewEditorPoolEntry,
  type DailyCrewEditorScore,
  type DailyCrewMissionStudioCharacter,
  type DailyCrewRevealPolicy,
} from "./admin-editor.ts";

export const DAILY_CREW_TEMPLATE_IMPORT_EXAMPLE = JSON.stringify(
  {
    schemaVersion: 1,
    missionDate: "2099-01-01",
    slug: "example-template-slug",
    title: "Example Template Title",
    brief: "This structural example is intentionally incomplete.",
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

export type DailyCrewTemplateDraft = {
  templateId: string | null;
  slug: string;
  title: string;
  brief: string;
  missionTags: string[];
  revealPolicy: DailyCrewRevealPolicy;
  isActive: boolean;
  pool: DailyCrewEditorPoolEntry[];
  jobs: DailyCrewEditorJob[];
  scores: DailyCrewEditorScore[];
  perfectSolution: DailyCrewEditorPerfectSolution[];
};

export type DailyCrewTemplateImportSummary = Omit<DailyCrewMissionImportSummary, "missionDate"> & {
  sourceMissionDate: string;
};

export type DailyCrewTemplateImportResult =
  | {
      ok: true;
      draft: DailyCrewTemplateDraft;
      summary: DailyCrewTemplateImportSummary;
    }
  | {
      ok: false;
      errors: DailyCrewMissionImportErrors;
    };

type TemplateImportOptions = {
  templateId?: string | null;
  isActive?: boolean;
};

const errorGroups: DailyCrewMissionImportErrorGroup[] = [
  "json",
  "schema",
  "characters",
  "format",
  "missionDetails",
  "characterPool",
  "jobs",
  "scoreMatrix",
  "perfectCrew",
];

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
  return errorGroups.some((group) => errors[group].length > 0);
}

function cloneErrors(errors: DailyCrewMissionImportErrors): DailyCrewMissionImportErrors {
  return {
    json: [...errors.json],
    schema: [...errors.schema],
    characters: [...errors.characters],
    format: [...errors.format],
    missionDetails: [...errors.missionDetails],
    characterPool: [...errors.characterPool],
    jobs: [...errors.jobs],
    scoreMatrix: [...errors.scoreMatrix],
    perfectCrew: [...errors.perfectCrew],
  };
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

function toTemplateDraft(
  parsed: Extract<ReturnType<typeof parseDailyCrewMissionJsonToEditor>, { ok: true }>,
  options: TemplateImportOptions,
): DailyCrewTemplateDraft {
  const editor = parsed.editor;
  return {
    templateId: options.templateId ?? null,
    slug: editor.slug,
    title: editor.title,
    brief: editor.brief,
    missionTags: editor.missionTags,
    revealPolicy: editor.revealPolicy,
    isActive: options.isActive ?? true,
    pool: editor.pool,
    jobs: editor.jobs,
    scores: editor.scores,
    perfectSolution: editor.perfectSolution,
  };
}

export function importTemplateJsonToDraft(
  jsonText: string,
  characters: DailyCrewMissionStudioCharacter[],
  options: TemplateImportOptions = {},
): DailyCrewTemplateImportResult {
  const parsed = parseDailyCrewMissionJsonToEditor(jsonText, characters);
  if (!parsed.ok) {
    return { ok: false, errors: cloneErrors(parsed.errors) };
  }

  const errors = emptyErrors();
  const editor = parsed.editor;

  if (editor.slug.length > 69) {
    errors.missionDetails.push(
      "Template slug must be 69 characters or fewer so dated mission slugs can be generated.",
    );
  }

  if (editor.revealAt !== null) {
    errors.missionDetails.push(
      "Template imports must use revealAt: null because reusable templates cannot store an absolute reveal timestamp.",
    );
  }

  const validation = validateDailyCrewMissionEditor(editor, { todayUtc: editor.missionDate });
  if (!validation.ok) {
    mergeEditorValidationErrors(errors, validation);
  }

  if (hasErrors(errors)) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    draft: toTemplateDraft(parsed, options),
    summary: {
      title: parsed.summary.title,
      sourceMissionDate: parsed.summary.missionDate,
      format: parsed.summary.format,
      poolCount: parsed.summary.poolCount,
      jobCount: parsed.summary.jobCount,
      scoreCount: parsed.summary.scoreCount,
      perfectCrewCount: parsed.summary.perfectCrewCount,
      resolvedCharacterCount: parsed.summary.resolvedCharacterCount,
    },
  };
}
