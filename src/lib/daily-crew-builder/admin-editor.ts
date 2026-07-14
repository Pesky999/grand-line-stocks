import { DAILY_CREW_ROLES, type DailyCrewRole } from "./scoring.ts";
import type {
  AdminDailyCrewMissionDetail,
  AdminDailyCrewMissionSummary,
} from "../api/daily-crew-builder-admin.functions.ts";

export type DailyCrewMissionStatus = "draft" | "scheduled" | "published" | "archived";
export type DailyCrewRevealPolicy = "immediate" | "next_day" | "manual";

export type DailyCrewMissionStudioCharacter = {
  id: string;
  slug: string;
  name: string;
  crew: string | null;
};

export type DailyCrewEditorPoolEntry = {
  characterId: string;
  displayOrder: number;
  isStrawHat: boolean;
  visibleTags: string[];
};

export type DailyCrewEditorJob = {
  role: DailyCrewRole;
  subtypeKey: string;
  subtypeLabel: string | null;
  displayLabel: string;
  displayOrder: number;
  maxPoints: number;
};

export type DailyCrewEditorScore = {
  characterId: string;
  role: DailyCrewRole;
  score: number;
  explanation: string;
};

export type DailyCrewEditorPerfectSolution = {
  role: DailyCrewRole;
  characterId: string;
};

export type DailyCrewMissionEditor = {
  missionId: string | null;
  status: DailyCrewMissionStatus;
  missionDate: string;
  slug: string;
  title: string;
  brief: string;
  missionTags: string[];
  revealPolicy: DailyCrewRevealPolicy;
  revealAt: string | null;
  poolSize: number;
  jobCount: number;
  pool: DailyCrewEditorPoolEntry[];
  jobs: DailyCrewEditorJob[];
  scores: DailyCrewEditorScore[];
  perfectSolution: DailyCrewEditorPerfectSolution[];
  submissionCount: number;
  ready: boolean;
};

export type DailyCrewEditorValidationGroup =
  | "missionDetails"
  | "characterPool"
  | "jobs"
  | "scoreMatrix"
  | "perfectCrew";

export type DailyCrewEditorValidation = {
  ok: boolean;
  groups: Record<DailyCrewEditorValidationGroup, string[]>;
};

export type DailyCrewMissionSavePayload = {
  missionId: string | null;
  missionDate: string;
  slug: string;
  title: string;
  brief: string;
  missionTags: string[];
  revealPolicy: DailyCrewRevealPolicy;
  revealAt: string | null;
  pool: DailyCrewEditorPoolEntry[];
  jobs: DailyCrewEditorJob[];
  scores: DailyCrewEditorScore[];
  perfectSolution: DailyCrewEditorPerfectSolution[];
};

export type DailyCrewStatusActionKey =
  | "schedule"
  | "archive"
  | "return_to_draft"
  | "restore_to_draft";

export type DailyCrewStatusAction = {
  action: DailyCrewStatusActionKey;
  label: string;
  targetStatus: Exclude<DailyCrewMissionStatus, "published">;
  allowed: boolean;
  reason: string | null;
  confirmMessage: string;
};

export const DAILY_CREW_NEW_POOL_SIZE = 9;
export const DAILY_CREW_NEW_JOB_COUNT = 3;
export const DAILY_CREW_LEGACY_POOL_SIZE = 15;
export const DAILY_CREW_LEGACY_JOB_COUNT = 5;
export const DAILY_CREW_ROLE_OPTIONS = DAILY_CREW_ROLES;
export const DAILY_CREW_NEW_JOB_ROLES = ["captain", "navigator", "support"] as const;
export const DAILY_CREW_MAX_POOL_STRAW_HATS = 5;
export const DAILY_CREW_MAX_PERFECT_STRAW_HATS = 3;
export const DAILY_CREW_TOTAL_JOB_POINTS = 90;

const TITLE_MAX = 120;
const BRIEF_MAX = 2000;
const TAG_MAX = 40;
const MAX_TAGS = 8;
const VISIBLE_TAG_MAX = 40;
const MAX_VISIBLE_TAGS = 5;
const EXPLANATION_MAX = 500;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const SUBTYPE_KEY_RE = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const UTC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WITH_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function cloneEditor(editor: DailyCrewMissionEditor): DailyCrewMissionEditor {
  return JSON.parse(JSON.stringify(editor)) as DailyCrewMissionEditor;
}

function utcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateString(date);
}

export function todayUtcDate(date = new Date()): string {
  return utcDateString(date);
}

export function firstUnusedUtcMissionDate(
  missions: Pick<AdminDailyCrewMissionSummary, "missionDate">[],
  date = new Date(),
): string {
  const usedDates = new Set(missions.map((mission) => mission.missionDate));
  let candidate = utcDateString(date);
  while (usedDates.has(candidate)) {
    candidate = addUtcDays(candidate, 1);
  }
  return candidate;
}

export function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function tagsFromCommaInput(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function emptyPoolEntry(displayOrder: number): DailyCrewEditorPoolEntry {
  return {
    characterId: "",
    displayOrder,
    isStrawHat: false,
    visibleTags: [],
  };
}

function createDefaultJobs(): DailyCrewEditorJob[] {
  return [
    {
      role: "captain",
      subtypeKey: "",
      subtypeLabel: null,
      displayLabel: "Operation Lead",
      displayOrder: 1,
      maxPoints: 30,
    },
    {
      role: "navigator",
      subtypeKey: "",
      subtypeLabel: null,
      displayLabel: "Scout / Lookout",
      displayOrder: 2,
      maxPoints: 30,
    },
    {
      role: "support",
      subtypeKey: "",
      subtypeLabel: null,
      displayLabel: "Emergency Support",
      displayOrder: 3,
      maxPoints: 30,
    },
  ];
}

export function createNewDailyCrewMissionEditor(
  missions: Pick<AdminDailyCrewMissionSummary, "missionDate">[],
  date = new Date(),
): DailyCrewMissionEditor {
  return {
    missionId: null,
    status: "draft",
    missionDate: firstUnusedUtcMissionDate(missions, date),
    slug: "",
    title: "",
    brief: "",
    missionTags: [],
    revealPolicy: "next_day",
    revealAt: null,
    poolSize: DAILY_CREW_NEW_POOL_SIZE,
    jobCount: DAILY_CREW_NEW_JOB_COUNT,
    pool: Array.from({ length: DAILY_CREW_NEW_POOL_SIZE }, (_, index) => emptyPoolEntry(index + 1)),
    jobs: createDefaultJobs(),
    scores: [],
    perfectSolution: createDefaultJobs().map((job) => ({ role: job.role, characterId: "" })),
    submissionCount: 0,
    ready: false,
  };
}

export function editorFromMissionDetail(
  detail: AdminDailyCrewMissionDetail,
): DailyCrewMissionEditor {
  return ensureScoreMatrix({
    missionId: detail.id,
    status: detail.status,
    missionDate: detail.missionDate,
    slug: detail.slug,
    title: detail.title,
    brief: detail.brief,
    missionTags: [...detail.missionTags],
    revealPolicy: detail.revealPolicy,
    revealAt: detail.revealAt,
    poolSize: detail.pool.length,
    jobCount: detail.jobs.length,
    pool: normalizePoolOrder(detail.pool.map((entry) => ({ ...entry }))),
    jobs: normalizeJobOrder(detail.jobs.map((job) => ({ ...job }))),
    scores: detail.scores.map((score) => ({ ...score })),
    perfectSolution: detail.perfectSolution.map((solution) => ({ ...solution })),
    submissionCount: detail.submissionCount,
    ready: detail.ready,
  });
}

export function editorSnapshot(editor: DailyCrewMissionEditor): string {
  return JSON.stringify(editor);
}

function normalizePoolOrder(pool: DailyCrewEditorPoolEntry[]): DailyCrewEditorPoolEntry[] {
  return [...pool]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((entry, index) => ({ ...entry, displayOrder: index + 1 }));
}

function reindexPoolOrder(pool: DailyCrewEditorPoolEntry[]): DailyCrewEditorPoolEntry[] {
  return pool.map((entry, index) => ({ ...entry, displayOrder: index + 1 }));
}

function normalizeJobOrder(jobs: DailyCrewEditorJob[]): DailyCrewEditorJob[] {
  return [...jobs]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((job, index) => ({ ...job, displayOrder: index + 1 }));
}

function reindexJobOrder(jobs: DailyCrewEditorJob[]): DailyCrewEditorJob[] {
  return jobs.map((job, index) => ({ ...job, displayOrder: index + 1 }));
}

function selectedPool(editor: DailyCrewMissionEditor): DailyCrewEditorPoolEntry[] {
  return normalizePoolOrder(editor.pool).filter((entry) => entry.characterId);
}

function sortedJobs(editor: DailyCrewMissionEditor): DailyCrewEditorJob[] {
  return normalizeJobOrder(editor.jobs);
}

function scoreKey(characterId: string, role: DailyCrewRole) {
  return `${characterId}:${role}`;
}

export function ensureScoreMatrix(editor: DailyCrewMissionEditor): DailyCrewMissionEditor {
  const previousScores = new Map(
    editor.scores.map((score) => [scoreKey(score.characterId, score.role), score]),
  );
  const scores: DailyCrewEditorScore[] = [];
  for (const job of sortedJobs(editor)) {
    for (const poolEntry of selectedPool(editor)) {
      const previous = previousScores.get(scoreKey(poolEntry.characterId, job.role));
      scores.push(
        previous
          ? { ...previous }
          : {
              characterId: poolEntry.characterId,
              role: job.role,
              score: 0,
              explanation: "",
            },
      );
    }
  }

  const configuredRoles = new Set(editor.jobs.map((job) => job.role));
  const perfectSolution = sortedJobs(editor).map((job) => {
    const existing = editor.perfectSolution.find((solution) => solution.role === job.role);
    return {
      role: job.role,
      characterId:
        existing && selectedPool(editor).some((entry) => entry.characterId === existing.characterId)
          ? existing.characterId
          : "",
    };
  });

  return {
    ...editor,
    pool: normalizePoolOrder(editor.pool),
    jobs: normalizeJobOrder(editor.jobs),
    scores,
    perfectSolution: perfectSolution.filter((solution) => configuredRoles.has(solution.role)),
  };
}

export function addCharacterToPool(
  editor: DailyCrewMissionEditor,
  character: DailyCrewMissionStudioCharacter,
): DailyCrewMissionEditor {
  if (editor.pool.some((entry) => entry.characterId === character.id)) return editor;
  const emptyIndex = editor.pool.findIndex((entry) => !entry.characterId);
  if (emptyIndex < 0) return editor;
  const next = cloneEditor(editor);
  next.pool[emptyIndex] = {
    ...next.pool[emptyIndex],
    characterId: character.id,
    isStrawHat: /straw hat/i.test(character.crew ?? ""),
    visibleTags: [],
  };
  return ensureScoreMatrix(next);
}

export function removeCharacterFromPool(
  editor: DailyCrewMissionEditor,
  characterId: string,
): DailyCrewMissionEditor {
  const kept = editor.pool.filter(
    (entry) => entry.characterId && entry.characterId !== characterId,
  );
  const blanksNeeded = Math.max(editor.poolSize - kept.length, 0);
  const pool = [
    ...kept,
    ...Array.from({ length: blanksNeeded }, (_, index) => emptyPoolEntry(kept.length + index + 1)),
  ];
  return ensureScoreMatrix({
    ...editor,
    pool: normalizePoolOrder(pool),
    scores: editor.scores.filter((score) => score.characterId !== characterId),
    perfectSolution: editor.perfectSolution.map((solution) =>
      solution.characterId === characterId ? { ...solution, characterId: "" } : solution,
    ),
  });
}

export function movePoolEntry(
  editor: DailyCrewMissionEditor,
  displayOrder: number,
  direction: -1 | 1,
): DailyCrewMissionEditor {
  const pool = normalizePoolOrder(editor.pool);
  const from = pool.findIndex((entry) => entry.displayOrder === displayOrder);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= pool.length) return editor;
  [pool[from], pool[to]] = [pool[to], pool[from]];
  return { ...editor, pool: reindexPoolOrder(pool) };
}

export function setPoolDisplayOrder(
  editor: DailyCrewMissionEditor,
  currentDisplayOrder: number,
  nextDisplayOrder: number,
): DailyCrewMissionEditor {
  const pool = normalizePoolOrder(editor.pool);
  const from = pool.findIndex((entry) => entry.displayOrder === currentDisplayOrder);
  if (from < 0) return editor;
  const boundedTo = Math.min(Math.max(nextDisplayOrder, 1), pool.length) - 1;
  const [entry] = pool.splice(from, 1);
  pool.splice(boundedTo, 0, entry);
  return { ...editor, pool: reindexPoolOrder(pool) };
}

export function updatePoolEntry(
  editor: DailyCrewMissionEditor,
  displayOrder: number,
  patch: Partial<Omit<DailyCrewEditorPoolEntry, "displayOrder" | "characterId">>,
): DailyCrewMissionEditor {
  return {
    ...editor,
    pool: editor.pool.map((entry) =>
      entry.displayOrder === displayOrder ? { ...entry, ...patch } : entry,
    ),
  };
}

export function moveJob(
  editor: DailyCrewMissionEditor,
  displayOrder: number,
  direction: -1 | 1,
): DailyCrewMissionEditor {
  const jobs = normalizeJobOrder(editor.jobs);
  const from = jobs.findIndex((job) => job.displayOrder === displayOrder);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= jobs.length) return editor;
  [jobs[from], jobs[to]] = [jobs[to], jobs[from]];
  return { ...editor, jobs: reindexJobOrder(jobs) };
}

export function updateJob(
  editor: DailyCrewMissionEditor,
  displayOrder: number,
  patch: Partial<DailyCrewEditorJob>,
): DailyCrewMissionEditor {
  const currentJob = editor.jobs.find((job) => job.displayOrder === displayOrder);
  if (!currentJob) return editor;
  const roleChanged = patch.role != null && patch.role !== currentJob.role;
  if (
    roleChanged &&
    editor.jobs.some((job) => job.displayOrder !== displayOrder && job.role === patch.role)
  ) {
    return editor;
  }
  const nextJobs = editor.jobs.map((job) =>
    job.displayOrder === displayOrder ? { ...job, ...patch } : job,
  );
  const next = {
    ...editor,
    jobs: normalizeJobOrder(nextJobs),
    scores: roleChanged
      ? editor.scores.filter((score) => score.role !== currentJob.role)
      : editor.scores,
    perfectSolution: roleChanged
      ? editor.perfectSolution.filter((solution) => solution.role !== currentJob.role)
      : editor.perfectSolution,
  };
  return roleChanged ? ensureScoreMatrix(next) : next;
}

export function updateScore(
  editor: DailyCrewMissionEditor,
  characterId: string,
  role: DailyCrewRole,
  patch: Partial<Pick<DailyCrewEditorScore, "score" | "explanation">>,
): DailyCrewMissionEditor {
  return {
    ...editor,
    scores: editor.scores.map((score) =>
      score.characterId === characterId && score.role === role ? { ...score, ...patch } : score,
    ),
  };
}

export function setPerfectSolutionCharacter(
  editor: DailyCrewMissionEditor,
  role: DailyCrewRole,
  characterId: string,
): DailyCrewMissionEditor {
  const perfectSolution = sortedJobs(editor).map((job) => {
    if (job.role === role) return { role, characterId };
    const existing = editor.perfectSolution.find((solution) => solution.role === job.role);
    return { role: job.role, characterId: existing?.characterId ?? "" };
  });
  return { ...editor, perfectSolution };
}

function maxScoreCandidates(editor: DailyCrewMissionEditor, job: DailyCrewEditorJob): string[] {
  const poolOrder = new Map(
    selectedPool(editor).map((entry) => [entry.characterId, entry.displayOrder]),
  );
  return editor.scores
    .filter((score) => score.role === job.role && score.score === job.maxPoints)
    .filter((score) => poolOrder.has(score.characterId))
    .sort(
      (a, b) =>
        (poolOrder.get(a.characterId) ?? Number.MAX_SAFE_INTEGER) -
        (poolOrder.get(b.characterId) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((score) => score.characterId);
}

export function autoFillPerfectCrew(
  editor: DailyCrewMissionEditor,
):
  | { ok: true; editor: DailyCrewMissionEditor }
  | { ok: false; editor: DailyCrewMissionEditor; message: string } {
  const jobs = sortedJobs(editor);
  const jobsByRole = new Map(jobs.map((job) => [job.role, job]));
  const candidatesByRole = new Map(jobs.map((job) => [job.role, maxScoreCandidates(editor, job)]));
  const orderedRoles = jobs
    .map((job) => job.role)
    .sort((a, b) => {
      const candidateDelta =
        (candidatesByRole.get(a)?.length ?? 0) - (candidatesByRole.get(b)?.length ?? 0);
      if (candidateDelta !== 0) return candidateDelta;
      return (jobsByRole.get(a)?.displayOrder ?? 0) - (jobsByRole.get(b)?.displayOrder ?? 0);
    });

  const chosen = new Map<DailyCrewRole, string>();
  const usedCharacters = new Set<string>();

  function search(index: number): boolean {
    if (index >= orderedRoles.length) return true;
    const role = orderedRoles[index];
    const candidates = candidatesByRole.get(role) ?? [];
    for (const characterId of candidates) {
      if (usedCharacters.has(characterId)) continue;
      chosen.set(role, characterId);
      usedCharacters.add(characterId);
      if (search(index + 1)) return true;
      chosen.delete(role);
      usedCharacters.delete(characterId);
    }
    return false;
  }

  if (!search(0)) {
    return {
      ok: false,
      editor,
      message: "No complete unique max-score perfect crew is available.",
    };
  }

  return {
    ok: true,
    editor: {
      ...editor,
      perfectSolution: jobs.map((job) => ({
        role: job.role,
        characterId: chosen.get(job.role) ?? "",
      })),
    },
  };
}

function addIssue(
  groups: DailyCrewEditorValidation["groups"],
  group: DailyCrewEditorValidationGroup,
  message: string,
) {
  groups[group].push(message);
}

function isContiguousOrders(values: number[], expectedCount: number): boolean {
  if (values.length !== expectedCount) return false;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index + 1);
}

function isWholeNumber(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value);
}

function trimmedBounded(value: string, max: number): boolean {
  return value.trim() === value && value.length > 0 && value.length <= max;
}

export function validateDailyCrewMissionEditor(
  editor: DailyCrewMissionEditor,
  options: { todayUtc?: string } = {},
): DailyCrewEditorValidation {
  const groups: DailyCrewEditorValidation["groups"] = {
    missionDetails: [],
    characterPool: [],
    jobs: [],
    scoreMatrix: [],
    perfectCrew: [],
  };
  const today = options.todayUtc ?? utcDateString();

  if (!UTC_DATE_RE.test(editor.missionDate)) {
    addIssue(groups, "missionDetails", "Mission date must be a YYYY-MM-DD UTC date.");
  } else if (editor.missionDate < today) {
    addIssue(groups, "missionDetails", "Mission date must be today or a future UTC date.");
  }
  if (!SLUG_RE.test(editor.slug)) {
    addIssue(groups, "missionDetails", "Slug must use lowercase letters, numbers, and hyphens.");
  }
  if (!trimmedBounded(editor.title, TITLE_MAX)) {
    addIssue(groups, "missionDetails", "Title is required and must be 120 characters or fewer.");
  }
  if (!trimmedBounded(editor.brief, BRIEF_MAX)) {
    addIssue(groups, "missionDetails", "Brief is required and must be 2,000 characters or fewer.");
  }
  if (editor.missionTags.length > MAX_TAGS) {
    addIssue(groups, "missionDetails", "Mission tags are limited to 8 entries.");
  }
  for (const tag of editor.missionTags) {
    if (!trimmedBounded(tag, TAG_MAX)) {
      addIssue(
        groups,
        "missionDetails",
        "Mission tags must be trimmed and 40 characters or fewer.",
      );
      break;
    }
  }
  if (editor.revealAt && !ISO_WITH_OFFSET_RE.test(editor.revealAt)) {
    addIssue(groups, "missionDetails", "Reveal timestamp must be ISO-8601 with an offset.");
  }

  const pool = selectedPool(editor);
  const poolIds = pool.map((entry) => entry.characterId);
  if (pool.length !== editor.poolSize) {
    addIssue(groups, "characterPool", `Select exactly ${editor.poolSize} pool characters.`);
  }
  if (new Set(poolIds).size !== poolIds.length) {
    addIssue(groups, "characterPool", "Pool characters must be unique.");
  }
  if (
    !isContiguousOrders(
      editor.pool.map((entry) => entry.displayOrder),
      editor.pool.length,
    )
  ) {
    addIssue(groups, "characterPool", "Pool display order must be unique and contiguous.");
  }
  if (pool.filter((entry) => entry.isStrawHat).length > DAILY_CREW_MAX_POOL_STRAW_HATS) {
    addIssue(groups, "characterPool", "Pool can include no more than five Straw Hats.");
  }
  for (const entry of editor.pool) {
    if (entry.visibleTags.length > MAX_VISIBLE_TAGS) {
      addIssue(groups, "characterPool", "Visible tags are limited to 5 per character.");
      break;
    }
    if (entry.visibleTags.some((tag) => !trimmedBounded(tag, VISIBLE_TAG_MAX))) {
      addIssue(groups, "characterPool", "Visible tags must be trimmed and 40 characters or fewer.");
      break;
    }
  }

  const jobs = sortedJobs(editor);
  const jobRoles = jobs.map((job) => job.role);
  if (jobs.length !== editor.jobCount) {
    addIssue(groups, "jobs", `Configure exactly ${editor.jobCount} jobs.`);
  }
  if (new Set(jobRoles).size !== jobRoles.length) {
    addIssue(groups, "jobs", "Job roles must be unique.");
  }
  if (
    !isContiguousOrders(
      jobs.map((job) => job.displayOrder),
      jobs.length,
    )
  ) {
    addIssue(groups, "jobs", "Job display order must be unique and contiguous.");
  }
  if (jobs.reduce((sum, job) => sum + job.maxPoints, 0) !== DAILY_CREW_TOTAL_JOB_POINTS) {
    addIssue(groups, "jobs", "Job max points must total exactly 90.");
  }
  for (const job of jobs) {
    if (!DAILY_CREW_ROLES.includes(job.role)) {
      addIssue(groups, "jobs", "Job role must use an approved Daily Crew role lane.");
    }
    if (!SUBTYPE_KEY_RE.test(job.subtypeKey)) {
      addIssue(
        groups,
        "jobs",
        "Job subtype keys must use lowercase letters, numbers, underscores, or hyphens.",
      );
    }
    if (!trimmedBounded(job.displayLabel, 120)) {
      addIssue(
        groups,
        "jobs",
        "Job display labels are required and must be 120 characters or fewer.",
      );
    }
    if (
      job.subtypeLabel != null &&
      job.subtypeLabel !== "" &&
      !trimmedBounded(job.subtypeLabel, 120)
    ) {
      addIssue(groups, "jobs", "Job subtype labels must be trimmed and 120 characters or fewer.");
    }
    if (!isWholeNumber(job.maxPoints) || job.maxPoints < 1 || job.maxPoints > 30) {
      addIssue(
        groups,
        "jobs",
        "Each job maxPoints value must be a whole number from 1 through 30.",
      );
    }
  }

  const configuredPoolIds = new Set(poolIds);
  const configuredRoles = new Set(jobRoles);
  const scores = editor.scores;
  const scorePairs = new Set<string>();
  if (scores.length !== pool.length * jobs.length) {
    addIssue(groups, "scoreMatrix", "Score matrix must cover every pool character and job.");
  }
  for (const score of scores) {
    const pair = scoreKey(score.characterId, score.role);
    if (scorePairs.has(pair)) {
      addIssue(groups, "scoreMatrix", "Score matrix cannot repeat a character/job pair.");
      break;
    }
    scorePairs.add(pair);
    const job = jobs.find((entry) => entry.role === score.role);
    if (!configuredPoolIds.has(score.characterId) || !configuredRoles.has(score.role) || !job) {
      addIssue(
        groups,
        "scoreMatrix",
        "Scores must reference only configured pool characters and jobs.",
      );
      continue;
    }
    if (!isWholeNumber(score.score) || score.score < 0 || score.score > job.maxPoints) {
      addIssue(
        groups,
        "scoreMatrix",
        "Scores must be whole numbers from zero through the job max points.",
      );
    }
    if (!trimmedBounded(score.explanation, EXPLANATION_MAX)) {
      addIssue(
        groups,
        "scoreMatrix",
        "Every score needs a trimmed explanation of 500 characters or fewer.",
      );
    }
  }
  for (const job of jobs) {
    for (const entry of pool) {
      if (!scorePairs.has(scoreKey(entry.characterId, job.role))) {
        addIssue(groups, "scoreMatrix", "Score matrix is missing a configured character/job pair.");
        break;
      }
    }
  }

  const solutions = editor.perfectSolution.filter((solution) => solution.characterId);
  const solutionRoles = solutions.map((solution) => solution.role);
  const solutionCharacters = solutions.map((solution) => solution.characterId);
  if (solutions.length !== jobs.length) {
    addIssue(groups, "perfectCrew", "Perfect crew must select one character for every job.");
  }
  if (new Set(solutionRoles).size !== solutionRoles.length) {
    addIssue(groups, "perfectCrew", "Perfect crew cannot repeat a job role.");
  }
  if (new Set(solutionCharacters).size !== solutionCharacters.length) {
    addIssue(groups, "perfectCrew", "Perfect crew cannot repeat a character.");
  }
  for (const solution of solutions) {
    const job = jobs.find((entry) => entry.role === solution.role);
    const poolEntry = pool.find((entry) => entry.characterId === solution.characterId);
    const score = scores.find(
      (entry) => entry.characterId === solution.characterId && entry.role === solution.role,
    );
    if (!job || !configuredRoles.has(solution.role)) {
      addIssue(groups, "perfectCrew", "Perfect crew roles must match configured jobs.");
      continue;
    }
    if (!poolEntry) {
      addIssue(groups, "perfectCrew", "Perfect crew characters must belong to the mission pool.");
      continue;
    }
    if (!score || score.score !== job.maxPoints) {
      addIssue(groups, "perfectCrew", "Perfect crew selections must be max-score candidates.");
    }
  }
  const perfectStrawHatCount = solutions.filter((solution) =>
    pool.some((entry) => entry.characterId === solution.characterId && entry.isStrawHat),
  ).length;
  if (perfectStrawHatCount > DAILY_CREW_MAX_PERFECT_STRAW_HATS) {
    addIssue(groups, "perfectCrew", "Perfect crew can include no more than three Straw Hats.");
  }

  return {
    groups,
    ok: Object.values(groups).every((issues) => issues.length === 0),
  };
}

export function validationIssueCount(validation: DailyCrewEditorValidation): number {
  return Object.values(validation.groups).reduce((sum, issues) => sum + issues.length, 0);
}

export function isEditorReadOnly(editor: DailyCrewMissionEditor): boolean {
  return Boolean(editor.missionId && (editor.status !== "draft" || editor.submissionCount > 0));
}

export function readOnlyReason(editor: DailyCrewMissionEditor): string | null {
  if (!editor.missionId) return null;
  if (editor.status !== "draft") return `This ${editor.status} mission is read-only.`;
  if (editor.submissionCount > 0) {
    return "This draft has saved submissions and can no longer be edited.";
  }
  return null;
}

function disabledAction(
  action: DailyCrewStatusActionKey,
  label: string,
  targetStatus: Exclude<DailyCrewMissionStatus, "published">,
  reason: string,
): DailyCrewStatusAction {
  return {
    action,
    label,
    targetStatus,
    allowed: false,
    reason,
    confirmMessage: "",
  };
}

function enabledAction(
  action: DailyCrewStatusActionKey,
  label: string,
  targetStatus: Exclude<DailyCrewMissionStatus, "published">,
  confirmMessage: string,
): DailyCrewStatusAction {
  return {
    action,
    label,
    targetStatus,
    allowed: true,
    reason: null,
    confirmMessage,
  };
}

export function getDailyCrewStatusActions(
  editor: DailyCrewMissionEditor,
  options: { todayUtc?: string; dirty?: boolean } = {},
): DailyCrewStatusAction[] {
  const today = options.todayUtc ?? utcDateString();
  const dirty = options.dirty ?? false;
  const unsavedReason = dirty ? "Save or reset unsaved changes before changing status." : null;
  const savedReason = !editor.missionId ? "Save the mission before changing status." : null;

  if (editor.status === "draft") {
    return [
      editor.missionId && editor.ready && !dirty
        ? enabledAction(
            "schedule",
            "Schedule",
            "scheduled",
            `Schedule ${editor.title || "this mission"}?`,
          )
        : disabledAction(
            "schedule",
            "Schedule",
            "scheduled",
            savedReason ?? unsavedReason ?? "Mission must be ready before scheduling.",
          ),
      editor.missionId && !dirty
        ? enabledAction(
            "archive",
            "Archive",
            "archived",
            `Archive ${editor.title || "this draft mission"}?`,
          )
        : disabledAction(
            "archive",
            "Archive",
            "archived",
            savedReason ?? unsavedReason ?? "Mission must be saved before archiving.",
          ),
    ];
  }

  if (editor.status === "scheduled") {
    return [
      editor.missionDate > today && editor.submissionCount === 0 && !dirty
        ? enabledAction(
            "return_to_draft",
            "Return to Draft",
            "draft",
            `Return ${editor.title || "this scheduled mission"} to draft?`,
          )
        : disabledAction(
            "return_to_draft",
            "Return to Draft",
            "draft",
            unsavedReason ??
              "Only future scheduled missions with zero submissions can return to draft.",
          ),
      editor.missionDate !== today && !dirty
        ? enabledAction(
            "archive",
            "Archive",
            "archived",
            `Archive ${editor.title || "this scheduled mission"}?`,
          )
        : disabledAction(
            "archive",
            "Archive",
            "archived",
            unsavedReason ?? "The active UTC mission cannot be archived.",
          ),
    ];
  }

  if (editor.status === "archived") {
    return [
      editor.missionDate >= today && editor.submissionCount === 0 && !dirty
        ? enabledAction(
            "restore_to_draft",
            "Restore to Draft",
            "draft",
            `Restore ${editor.title || "this archived mission"} to draft?`,
          )
        : disabledAction(
            "restore_to_draft",
            "Restore to Draft",
            "draft",
            unsavedReason ??
              "Only today or future archived missions with zero submissions can be restored.",
          ),
    ];
  }

  if (editor.status === "published") {
    return [
      editor.missionDate < today && !dirty
        ? enabledAction(
            "archive",
            "Archive",
            "archived",
            `Archive ${editor.title || "this published mission"}?`,
          )
        : disabledAction(
            "archive",
            "Archive",
            "archived",
            unsavedReason ??
              "Published missions can be archived only after their UTC mission date.",
          ),
    ];
  }

  return [];
}

export function toMissionSavePayload(editor: DailyCrewMissionEditor): DailyCrewMissionSavePayload {
  const validation = validateDailyCrewMissionEditor(editor);
  if (!validation.ok) {
    throw new Error("Daily Crew mission must be complete and valid before saving.");
  }

  const pool = selectedPool(editor).map((entry) => ({
    characterId: entry.characterId,
    displayOrder: entry.displayOrder,
    isStrawHat: entry.isStrawHat,
    visibleTags: entry.visibleTags.map((tag) => tag.trim()).filter(Boolean),
  }));
  const jobs = sortedJobs(editor).map((job) => ({
    role: job.role,
    subtypeKey: job.subtypeKey.trim(),
    subtypeLabel: job.subtypeLabel?.trim() || null,
    displayLabel: job.displayLabel.trim(),
    displayOrder: job.displayOrder,
    maxPoints: job.maxPoints,
  }));
  return {
    missionId: editor.missionId,
    missionDate: editor.missionDate,
    slug: editor.slug.trim(),
    title: editor.title.trim(),
    brief: editor.brief.trim(),
    missionTags: editor.missionTags.map((tag) => tag.trim()).filter(Boolean),
    revealPolicy: editor.revealPolicy,
    revealAt: editor.revealAt,
    pool,
    jobs,
    scores: ensureScoreMatrix(editor).scores.map((score) => ({
      characterId: score.characterId,
      role: score.role,
      score: score.score,
      explanation: score.explanation.trim(),
    })),
    perfectSolution: editor.perfectSolution
      .filter((solution) => solution.characterId)
      .map((solution) => ({ role: solution.role, characterId: solution.characterId })),
  };
}
