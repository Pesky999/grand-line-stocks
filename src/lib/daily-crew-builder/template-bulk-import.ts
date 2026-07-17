import type { DailyCrewMissionImportErrors } from "./admin-import.ts";
import type { DailyCrewMissionStudioCharacter } from "./admin-editor.ts";
import {
  importTemplateJsonToDraft,
  type DailyCrewTemplateDraft,
  type DailyCrewTemplateImportSummary,
} from "./template-import.ts";

export const DAILY_CREW_TEMPLATE_BATCH_IMPORT_LIMIT = 50;

export const DAILY_CREW_TEMPLATE_BATCH_IMPORT_EXAMPLE = JSON.stringify(
  [
    {
      schemaVersion: 1,
      missionDate: "2099-01-01",
      slug: "example-batch-template",
      title: "Example Batch Template",
      brief: "Replace the example character slugs with current market roster slugs.",
      missionTags: ["example", "batch"],
      revealPolicy: "next_day",
      revealAt: null,
      pool: Array.from({ length: 9 }, (_, index) => ({
        characterSlug: `example-character-${index + 1}`,
        displayOrder: index + 1,
        isStrawHat: index < 3,
        visibleTags: [`slot-${index + 1}`],
      })),
      jobs: [
        {
          role: "captain",
          subtypeKey: "operation_lead",
          subtypeLabel: "Operation Lead",
          displayLabel: "Operation Lead",
          displayOrder: 1,
          maxPoints: 30,
        },
        {
          role: "navigator",
          subtypeKey: "scout_lookout",
          subtypeLabel: "Scout / Lookout",
          displayLabel: "Scout / Lookout",
          displayOrder: 2,
          maxPoints: 30,
        },
        {
          role: "support",
          subtypeKey: "emergency_support",
          subtypeLabel: "Emergency Support",
          displayLabel: "Emergency Support",
          displayOrder: 3,
          maxPoints: 30,
        },
      ],
      scores: Array.from({ length: 9 }, (_, characterIndex) =>
        ["captain", "navigator", "support"].map((role, roleIndex) => ({
          characterSlug: `example-character-${characterIndex + 1}`,
          role,
          score: characterIndex === roleIndex ? 30 : 12,
          explanation:
            characterIndex === roleIndex
              ? `example-character-${characterIndex + 1} is the max fit for ${role}.`
              : `example-character-${characterIndex + 1} can contribute to ${role}.`,
        })),
      ).flat(),
      perfectSolution: [
        { role: "captain", characterSlug: "example-character-1" },
        { role: "navigator", characterSlug: "example-character-2" },
        { role: "support", characterSlug: "example-character-3" },
      ],
    },
  ],
  null,
  2,
);

type ExistingTemplateSlugSource = string | { slug: string };

export type DailyCrewTemplateBatchItemError = {
  index: number;
  position: number;
  title: string | null;
  slug: string | null;
  errors: DailyCrewMissionImportErrors;
};

export type DailyCrewTemplateBatchAggregate = {
  templateCount: number;
  totalPoolRows: number;
  totalJobs: number;
  totalScoreRows: number;
  totalPerfectCrewRows: number;
};

export type DailyCrewTemplateBatchSummary = DailyCrewTemplateImportSummary & {
  position: number;
  slug: string;
  storedMissionDate: null;
  isActive: true;
  validationStatus: "valid";
};

export type DailyCrewTemplateBatchImportResult =
  | {
      ok: true;
      drafts: DailyCrewTemplateDraft[];
      summaries: DailyCrewTemplateBatchSummary[];
      aggregate: DailyCrewTemplateBatchAggregate;
      normalizedSlugs: string[];
    }
  | {
      ok: false;
      errors: {
        batch: string[];
        items: DailyCrewTemplateBatchItemError[];
      };
    };

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

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function recoverString(value: unknown, key: "title" | "slug"): string | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function getExistingSlugSet(existingTemplates: ExistingTemplateSlugSource[]): Set<string> {
  return new Set(
    existingTemplates
      .map((entry) => (typeof entry === "string" ? entry : entry.slug))
      .map(normalizeSlug)
      .filter(Boolean),
  );
}

function itemValidationError(
  index: number,
  value: unknown,
  errors: DailyCrewMissionImportErrors,
): DailyCrewTemplateBatchItemError {
  const recoveredSlug = recoverString(value, "slug");
  return {
    index,
    position: index + 1,
    title: recoverString(value, "title"),
    slug: recoveredSlug ? normalizeSlug(recoveredSlug) : null,
    errors,
  };
}

export function importTemplateBatchJsonToDrafts(
  jsonText: string,
  characters: DailyCrewMissionStudioCharacter[],
  existingTemplates: ExistingTemplateSlugSource[],
): DailyCrewTemplateBatchImportResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      errors: {
        batch: ["Invalid JSON: check commas, quotes, and brackets."],
        items: [],
      },
    };
  }

  if (!Array.isArray(parsedJson)) {
    return {
      ok: false,
      errors: {
        batch: ["Template batch import root must be a JSON array."],
        items: [],
      },
    };
  }

  if (parsedJson.length === 0) {
    return {
      ok: false,
      errors: {
        batch: ["Template batch import requires at least one template."],
        items: [],
      },
    };
  }

  if (parsedJson.length > DAILY_CREW_TEMPLATE_BATCH_IMPORT_LIMIT) {
    return {
      ok: false,
      errors: {
        batch: [
          `Template batch import is limited to ${DAILY_CREW_TEMPLATE_BATCH_IMPORT_LIMIT} templates.`,
        ],
        items: [],
      },
    };
  }

  const existingSlugs = getExistingSlugSet(existingTemplates);
  const batchErrors: string[] = [];
  const itemErrors: DailyCrewTemplateBatchItemError[] = [];
  const drafts: DailyCrewTemplateDraft[] = [];
  const summaries: DailyCrewTemplateBatchSummary[] = [];
  const slugPositions = new Map<string, number[]>();

  parsedJson.forEach((item, index) => {
    const result = importTemplateJsonToDraft(JSON.stringify(item), characters, {
      templateId: null,
      isActive: true,
    });
    const recoveredTitle = recoverString(item, "title");
    const recoveredSlug = recoverString(item, "slug");
    const normalizedRecoveredSlug = recoveredSlug ? normalizeSlug(recoveredSlug) : null;

    if (!result.ok) {
      itemErrors.push(itemValidationError(index, item, result.errors));
      return;
    }

    const draft: DailyCrewTemplateDraft = {
      ...result.draft,
      templateId: null,
      isActive: true,
    };
    const normalizedSlug = normalizeSlug(draft.slug);
    const positions = slugPositions.get(normalizedSlug) ?? [];
    positions.push(index + 1);
    slugPositions.set(normalizedSlug, positions);

    if (existingSlugs.has(normalizedSlug)) {
      const errors = emptyErrors();
      errors.missionDetails.push(
        `Template slug already exists in the current library: ${normalizedSlug}.`,
      );
      itemErrors.push({
        index,
        position: index + 1,
        title: recoveredTitle ?? draft.title,
        slug: normalizedRecoveredSlug ?? normalizedSlug,
        errors,
      });
    }

    drafts.push(draft);
    summaries.push({
      ...result.summary,
      position: index + 1,
      slug: normalizedSlug,
      storedMissionDate: null,
      isActive: true,
      validationStatus: "valid",
    });
  });

  for (const [slug, positions] of slugPositions) {
    if (positions.length > 1) {
      batchErrors.push(
        `Template slug is duplicated inside the batch: ${slug} at items ${positions.join(", ")}.`,
      );
    }
  }

  if (batchErrors.length || itemErrors.length) {
    return {
      ok: false,
      errors: {
        batch: batchErrors,
        items: itemErrors,
      },
    };
  }

  return {
    ok: true,
    drafts,
    summaries,
    aggregate: {
      templateCount: drafts.length,
      totalPoolRows: drafts.reduce((total, draft) => total + draft.pool.length, 0),
      totalJobs: drafts.reduce((total, draft) => total + draft.jobs.length, 0),
      totalScoreRows: drafts.reduce((total, draft) => total + draft.scores.length, 0),
      totalPerfectCrewRows: drafts.reduce(
        (total, draft) => total + draft.perfectSolution.length,
        0,
      ),
    },
    normalizedSlugs: drafts.map((draft) => normalizeSlug(draft.slug)),
  };
}
