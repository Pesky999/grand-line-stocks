export const DAILY_CREW_ROLES = [
  "captain",
  "fighter",
  "navigator",
  "strategist",
  "support",
] as const;

export type DailyCrewRole = (typeof DAILY_CREW_ROLES)[number];
export type DailyCrewRank = "s" | "a" | "b" | "c" | "fail";

export const DAILY_CREW_POOL_SIZE = 15;
export const DAILY_CREW_REQUIRED_ROLE_COUNT = 5;
export const DAILY_CREW_ROLE_SCORE_MAX = 18;
export const DAILY_CREW_PERFECT_BASE_SCORE = 90;
export const DAILY_CREW_SYNERGY_MAX = 10;
export const DAILY_CREW_MAX_SCORE = 100;

export const DAILY_CREW_ROLE_LABELS: Record<DailyCrewRole, string> = {
  captain: "Captain",
  fighter: "Fighter",
  navigator: "Navigator",
  strategist: "Strategist",
  support: "Support",
};

export type DailyCrewPoolCharacter = {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  isStrawHat: boolean;
  visibleTags: string[];
};

export type DailyCrewRoleRequirement = {
  role: DailyCrewRole;
  subtypeKey: string;
  subtypeLabel?: string;
  maxPoints: number;
};

export type DailyCrewRoleScore = {
  characterId: string;
  role: DailyCrewRole;
  score: number;
  explanation: string;
};

export type DailyCrewPerfectSolutionRole = {
  role: DailyCrewRole;
  characterId: string;
};

export type DailyCrewSynergyRule = {
  id: string;
  label: string;
  points: number;
  explanation: string;
  characterIds?: string[];
  roles?: Partial<Record<DailyCrewRole, string>>;
};

export type DailyCrewMissionFixture = {
  missionDate: string;
  slug: string;
  title: string;
  brief: string;
  missionTags: string[];
  maxScore: 100;
  pool: DailyCrewPoolCharacter[];
  roleRequirements: DailyCrewRoleRequirement[];
  roleScores: DailyCrewRoleScore[];
  perfectSolution: DailyCrewPerfectSolutionRole[];
  synergyRules: DailyCrewSynergyRule[];
};

export type DailyCrewSubmissionAssignment = {
  role: DailyCrewRole;
  characterId: string;
};

export type DailyCrewRoleBreakdown = {
  role: DailyCrewRole;
  roleName: string;
  characterId: string;
  characterName: string;
  score: number;
  maxScore: number;
  explanation: string;
};

export type DailyCrewSynergyBreakdown = {
  id: string;
  label: string;
  points: number;
  explanation: string;
};

export type DailyCrewScoreResult = {
  score: number;
  rank: DailyCrewRank;
  rewardAmount: number;
  baseScore: number;
  synergyScore: number;
  maxScore: 100;
  isPerfectSolution: boolean;
  roles: DailyCrewRoleBreakdown[];
  synergy: DailyCrewSynergyBreakdown[];
};

export type PublicDailyCrewMission = {
  missionDate: string;
  slug: string;
  title: string;
  brief: string;
  missionTags: string[];
  maxScore: 100;
  roles: Array<{
    role: DailyCrewRole;
    name: string;
  }>;
  pool: Array<{
    id: string;
    name: string;
    slug: string;
    displayOrder: number;
    visibleTags: string[];
  }>;
};

export type DailyCrewMissionFixtureValidation = {
  ok: boolean;
  errors: string[];
};

export class DailyCrewScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyCrewScoringError";
  }
}

const roleSet = new Set<string>(DAILY_CREW_ROLES);

function isDailyCrewRole(value: string): value is DailyCrewRole {
  return roleSet.has(value);
}

function roleScoreKey(characterId: string, role: DailyCrewRole): string {
  return `${characterId}::${role}`;
}

function isWholeNumberInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function sortedUniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function hasExactRoleSet(roles: DailyCrewRole[]): boolean {
  const uniqueRoles = new Set(roles);
  return DAILY_CREW_ROLES.every((role) => uniqueRoles.has(role)) && uniqueRoles.size === DAILY_CREW_ROLES.length;
}

function getRoleScoreMap(fixture: DailyCrewMissionFixture): Map<string, DailyCrewRoleScore> {
  return new Map(fixture.roleScores.map((score) => [roleScoreKey(score.characterId, score.role), score]));
}

function getPoolMap(fixture: DailyCrewMissionFixture): Map<string, DailyCrewPoolCharacter> {
  return new Map(fixture.pool.map((character) => [character.id, character]));
}

function getPerfectSolutionMap(fixture: DailyCrewMissionFixture): Map<DailyCrewRole, string> {
  return new Map(fixture.perfectSolution.map((solution) => [solution.role, solution.characterId]));
}

function assignmentMap(assignments: DailyCrewSubmissionAssignment[]): Map<DailyCrewRole, string> {
  return new Map(assignments.map((assignment) => [assignment.role, assignment.characterId]));
}

function matchedSynergyRules(
  fixture: DailyCrewMissionFixture,
  assignmentsByRole: Map<DailyCrewRole, string>,
): DailyCrewSynergyRule[] {
  const assignedCharacters = new Set(assignmentsByRole.values());

  return fixture.synergyRules.filter((rule) => {
    const roleMatches = rule.roles == null || Object.entries(rule.roles).every(([role, characterId]) => {
      if (!isDailyCrewRole(role)) {
        return false;
      }

      return assignmentsByRole.get(role) === characterId;
    });

    const characterMatches =
      rule.characterIds == null || rule.characterIds.every((characterId) => assignedCharacters.has(characterId));

    return roleMatches && characterMatches;
  });
}

function calculateSynergyScore(matchedRules: DailyCrewSynergyRule[]): number {
  const rawScore = matchedRules.reduce((total, rule) => total + rule.points, 0);
  return Math.min(DAILY_CREW_SYNERGY_MAX, rawScore);
}

function calculatePerfectBaseScore(fixture: DailyCrewMissionFixture): number {
  const scoreMap = getRoleScoreMap(fixture);

  return fixture.perfectSolution.reduce((total, solution) => {
    const score = scoreMap.get(roleScoreKey(solution.characterId, solution.role));
    return total + (score?.score ?? 0);
  }, 0);
}

function calculatePerfectTotalScore(fixture: DailyCrewMissionFixture): number {
  const perfectAssignments = assignmentMap(fixture.perfectSolution);
  const baseScore = calculatePerfectBaseScore(fixture);
  const synergyScore = calculateSynergyScore(matchedSynergyRules(fixture, perfectAssignments));
  return Math.min(DAILY_CREW_MAX_SCORE, baseScore + synergyScore);
}

export function validateDailyCrewMissionFixture(fixture: DailyCrewMissionFixture): DailyCrewMissionFixtureValidation {
  const errors: string[] = [];

  if (fixture.maxScore !== DAILY_CREW_MAX_SCORE) {
    errors.push("mission maxScore must be exactly 100");
  }

  if (fixture.pool.length !== DAILY_CREW_POOL_SIZE) {
    errors.push(`mission pool must contain exactly ${DAILY_CREW_POOL_SIZE} characters`);
  }

  const poolIds = fixture.pool.map((character) => character.id);
  const uniquePoolIds = new Set(poolIds);
  if (uniquePoolIds.size !== fixture.pool.length) {
    errors.push("mission pool cannot repeat a character");
  }

  const displayOrders = fixture.pool.map((character) => character.displayOrder);
  const uniqueDisplayOrders = sortedUniqueNumbers(displayOrders);
  const expectedDisplayOrders = Array.from({ length: DAILY_CREW_POOL_SIZE }, (_, index) => index + 1);
  if (
    uniqueDisplayOrders.length !== DAILY_CREW_POOL_SIZE ||
    uniqueDisplayOrders.some((value, index) => value !== expectedDisplayOrders[index])
  ) {
    errors.push(`mission pool display order must be exactly 1 through ${DAILY_CREW_POOL_SIZE}`);
  }

  const poolStrawHats = fixture.pool.filter((character) => character.isStrawHat).length;
  if (poolStrawHats > 5) {
    errors.push("mission pool cannot include more than 5 Straw Hats");
  }

  if (fixture.roleRequirements.length !== DAILY_CREW_REQUIRED_ROLE_COUNT) {
    errors.push("mission must define exactly 5 role requirements");
  }

  const requirementRoles = fixture.roleRequirements.map((requirement) => requirement.role);
  if (!hasExactRoleSet(requirementRoles)) {
    errors.push("mission role requirements must define each Daily Crew role exactly once");
  }

  for (const requirement of fixture.roleRequirements) {
    if (requirement.maxPoints !== DAILY_CREW_ROLE_SCORE_MAX) {
      errors.push(`role ${requirement.role} maxPoints must be exactly ${DAILY_CREW_ROLE_SCORE_MAX}`);
    }
  }

  if (fixture.roleScores.length !== DAILY_CREW_POOL_SIZE * DAILY_CREW_REQUIRED_ROLE_COUNT) {
    errors.push(`mission must define exactly ${DAILY_CREW_POOL_SIZE * DAILY_CREW_REQUIRED_ROLE_COUNT} role score rows`);
  }

  const roleScoreKeys = new Set<string>();
  for (const score of fixture.roleScores) {
    if (!uniquePoolIds.has(score.characterId)) {
      errors.push(`role score references character outside the mission pool: ${score.characterId}`);
    }

    if (!roleSet.has(score.role)) {
      errors.push(`role score references an unknown role: ${score.role}`);
    }

    if (!isWholeNumberInRange(score.score, 0, DAILY_CREW_ROLE_SCORE_MAX)) {
      errors.push(`role score for ${score.characterId} ${score.role} must be an integer from 0 through 18`);
    }

    const key = roleScoreKey(score.characterId, score.role);
    if (roleScoreKeys.has(key)) {
      errors.push(`duplicate role score row for ${score.characterId} ${score.role}`);
    }
    roleScoreKeys.add(key);
  }

  for (const character of fixture.pool) {
    for (const role of DAILY_CREW_ROLES) {
      if (!roleScoreKeys.has(roleScoreKey(character.id, role))) {
        errors.push(`missing role score for ${character.id} ${role}`);
      }
    }
  }

  if (fixture.perfectSolution.length !== DAILY_CREW_REQUIRED_ROLE_COUNT) {
    errors.push("perfect solution must define exactly 5 rows");
  }

  const perfectRoles = fixture.perfectSolution.map((solution) => solution.role);
  if (!hasExactRoleSet(perfectRoles)) {
    errors.push("perfect solution must assign each Daily Crew role exactly once");
  }

  const perfectCharacters = fixture.perfectSolution.map((solution) => solution.characterId);
  if (new Set(perfectCharacters).size !== perfectCharacters.length) {
    errors.push("perfect solution cannot assign the same character to multiple roles");
  }

  const poolMap = getPoolMap(fixture);
  for (const solution of fixture.perfectSolution) {
    if (!poolMap.has(solution.characterId)) {
      errors.push(`perfect solution references character outside the mission pool: ${solution.characterId}`);
    }
  }

  const perfectStrawHats = fixture.perfectSolution.filter((solution) => poolMap.get(solution.characterId)?.isStrawHat).length;
  if (perfectStrawHats > 3) {
    errors.push("perfect solution cannot include more than 3 Straw Hats");
  }

  const perfectBaseScore = calculatePerfectBaseScore(fixture);
  if (perfectBaseScore !== DAILY_CREW_PERFECT_BASE_SCORE) {
    errors.push(`perfect solution base role score must be exactly ${DAILY_CREW_PERFECT_BASE_SCORE}`);
  }

  const perfectTotalScore = calculatePerfectTotalScore(fixture);
  if (perfectTotalScore !== DAILY_CREW_MAX_SCORE) {
    errors.push("perfect solution must reach exactly 100 after mission synergy");
  }

  for (const rule of fixture.synergyRules) {
    if (!isWholeNumberInRange(rule.points, 0, DAILY_CREW_SYNERGY_MAX)) {
      errors.push(`synergy rule ${rule.id} points must be an integer from 0 through 10`);
    }

    for (const characterId of rule.characterIds ?? []) {
      if (!uniquePoolIds.has(characterId)) {
        errors.push(`synergy rule ${rule.id} references character outside the mission pool: ${characterId}`);
      }
    }

    for (const role of Object.keys(rule.roles ?? {})) {
      if (!isDailyCrewRole(role)) {
        errors.push(`synergy rule ${rule.id} references an unknown role: ${role}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidDailyCrewMissionFixture(fixture: DailyCrewMissionFixture): void {
  const validation = validateDailyCrewMissionFixture(fixture);
  if (!validation.ok) {
    throw new DailyCrewScoringError(`Invalid Daily Crew Builder fixture: ${validation.errors.join("; ")}`);
  }
}

export function rankForDailyCrewScore(score: number): DailyCrewRank {
  if (!Number.isFinite(score) || score < 0 || score > DAILY_CREW_MAX_SCORE) {
    throw new DailyCrewScoringError("Daily Crew Builder score must be a finite number from 0 through 100");
  }

  if (score >= 90) return "s";
  if (score >= 80) return "a";
  if (score >= 70) return "b";
  if (score >= 60) return "c";
  return "fail";
}

export function rewardForDailyCrewRank(rank: DailyCrewRank): number {
  switch (rank) {
    case "s":
      return 1000;
    case "a":
      return 700;
    case "b":
      return 400;
    case "c":
      return 200;
    case "fail":
      return 0;
    default:
      throw new DailyCrewScoringError(`Unsupported Daily Crew Builder rank: ${rank satisfies never}`);
  }
}

export function rewardForDailyCrewScore(score: number): number {
  return rewardForDailyCrewRank(rankForDailyCrewScore(score));
}

export function scoreDailyCrewSubmission(
  fixture: DailyCrewMissionFixture,
  assignments: DailyCrewSubmissionAssignment[],
): DailyCrewScoreResult {
  assertValidDailyCrewMissionFixture(fixture);

  if (assignments.length !== DAILY_CREW_REQUIRED_ROLE_COUNT) {
    throw new DailyCrewScoringError("Daily Crew Builder submissions must assign exactly 5 roles");
  }

  const assignedRoles = assignments.map((assignment) => assignment.role);
  if (!hasExactRoleSet(assignedRoles)) {
    throw new DailyCrewScoringError("Daily Crew Builder submissions must assign every required role exactly once");
  }

  const assignedCharacters = assignments.map((assignment) => assignment.characterId);
  if (new Set(assignedCharacters).size !== assignedCharacters.length) {
    throw new DailyCrewScoringError("Daily Crew Builder submissions cannot assign the same character to multiple roles");
  }

  const poolMap = getPoolMap(fixture);
  const scoreMap = getRoleScoreMap(fixture);
  const breakdown: DailyCrewRoleBreakdown[] = [];

  for (const assignment of assignments) {
    if (!poolMap.has(assignment.characterId)) {
      throw new DailyCrewScoringError(`Daily Crew Builder submission character is outside the mission pool: ${assignment.characterId}`);
    }

    const roleScore = scoreMap.get(roleScoreKey(assignment.characterId, assignment.role));
    if (roleScore == null) {
      throw new DailyCrewScoringError(`Daily Crew Builder role score is missing for ${assignment.characterId} ${assignment.role}`);
    }

    const character = poolMap.get(assignment.characterId);
    if (character == null) {
      throw new DailyCrewScoringError(`Daily Crew Builder mission pool character is missing: ${assignment.characterId}`);
    }

    breakdown.push({
      role: assignment.role,
      roleName: DAILY_CREW_ROLE_LABELS[assignment.role],
      characterId: character.id,
      characterName: character.name,
      score: roleScore.score,
      maxScore: DAILY_CREW_ROLE_SCORE_MAX,
      explanation: roleScore.explanation,
    });
  }

  const assignmentsByRole = assignmentMap(assignments);
  const matchedRules = matchedSynergyRules(fixture, assignmentsByRole);
  const synergyScore = calculateSynergyScore(matchedRules);
  const baseScore = breakdown.reduce((total, role) => total + role.score, 0);
  const score = Math.min(DAILY_CREW_MAX_SCORE, Math.max(0, baseScore + synergyScore));
  const rank = rankForDailyCrewScore(score);

  const perfectSolution = getPerfectSolutionMap(fixture);
  const isPerfectSolution = DAILY_CREW_ROLES.every((role) => assignmentsByRole.get(role) === perfectSolution.get(role));

  return {
    score,
    rank,
    rewardAmount: rewardForDailyCrewRank(rank),
    baseScore,
    synergyScore,
    maxScore: DAILY_CREW_MAX_SCORE,
    isPerfectSolution,
    roles: breakdown.sort((left, right) => DAILY_CREW_ROLES.indexOf(left.role) - DAILY_CREW_ROLES.indexOf(right.role)),
    synergy: matchedRules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      points: rule.points,
      explanation: rule.explanation,
    })),
  };
}

export function toPublicDailyCrewMission(fixture: DailyCrewMissionFixture): PublicDailyCrewMission {
  assertValidDailyCrewMissionFixture(fixture);

  return {
    missionDate: fixture.missionDate,
    slug: fixture.slug,
    title: fixture.title,
    brief: fixture.brief,
    missionTags: [...fixture.missionTags],
    maxScore: fixture.maxScore,
    roles: DAILY_CREW_ROLES.map((role) => ({
      role,
      name: DAILY_CREW_ROLE_LABELS[role],
    })),
    pool: [...fixture.pool]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((character) => ({
        id: character.id,
        name: character.name,
        slug: character.slug,
        displayOrder: character.displayOrder,
        visibleTags: [...character.visibleTags],
      })),
  };
}
