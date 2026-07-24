/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DAILY_CREW_SAMPLE_FIXTURES } from "./fixtures.ts";
import {
  DAILY_CREW_LEGACY_POOL_SIZE,
  DAILY_CREW_SIMPLIFIED_POOL_SIZE,
  DAILY_CREW_ROLES,
  type DailyCrewMissionFixture,
  type DailyCrewRole,
  type DailyCrewSubmissionAssignment,
  rankForDailyCrewScore,
  rewardForDailyCrewRank,
  rewardForDailyCrewScore,
  scoreDailyCrewSubmission,
  toPublicDailyCrewMission,
  validateDailyCrewMissionFixture,
} from "./scoring.ts";

function cloneFixture(fixture: DailyCrewMissionFixture): DailyCrewMissionFixture {
  return JSON.parse(JSON.stringify(fixture)) as DailyCrewMissionFixture;
}

function perfectAssignments(fixture: DailyCrewMissionFixture): DailyCrewSubmissionAssignment[] {
  return fixture.perfectSolution.map((solution) => ({
    role: solution.role,
    characterId: solution.characterId,
  }));
}

function roleScoreFor(
  fixture: DailyCrewMissionFixture,
  characterId: string,
  role: DailyCrewRole,
): number {
  const score = fixture.roleScores.find(
    (entry) => entry.characterId === characterId && entry.role === role,
  );
  assert.ok(score, `expected score for ${characterId} ${role}`);
  return score.score;
}

function roleMaxFor(fixture: DailyCrewMissionFixture, role: DailyCrewRole): number {
  const requirement = fixture.roleRequirements.find((entry) => entry.role === role);
  assert.ok(requirement, `expected requirement for ${role}`);
  return requirement.maxPoints;
}

function assertInvalidFixture(fixture: DailyCrewMissionFixture, pattern: RegExp): void {
  const validation = validateDailyCrewMissionFixture(fixture);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), pattern);
}

test("sample fixtures validate with complete hidden score coverage", () => {
  for (const fixture of DAILY_CREW_SAMPLE_FIXTURES) {
    const validation = validateDailyCrewMissionFixture(fixture);
    assert.deepEqual(validation, { ok: true, errors: [] });
    assert.ok(
      [DAILY_CREW_SIMPLIFIED_POOL_SIZE, DAILY_CREW_LEGACY_POOL_SIZE].includes(fixture.pool.length),
    );
    assert.equal(fixture.roleScores.length, fixture.pool.length * fixture.roleRequirements.length);
    assert.equal(fixture.pool.filter((character) => character.isStrawHat).length <= 5, true);
    assert.equal(
      fixture.perfectSolution.filter(
        (solution) =>
          fixture.pool.find((character) => character.id === solution.characterId)?.isStrawHat,
      ).length <= 3,
      true,
    );
  }
});

test("sample fixtures use mission-defined role candidates with one max-score perfect fit", () => {
  for (const fixture of DAILY_CREW_SAMPLE_FIXTURES) {
    assert.equal(
      fixture.pool.every((character) => character.primaryRole != null),
      true,
    );

    for (const requirement of fixture.roleRequirements) {
      const role = requirement.role;
      const primaryCandidates = fixture.pool.filter((character) => character.primaryRole === role);
      assert.equal(
        primaryCandidates.length >= 1,
        true,
        `${fixture.slug} should have at least one ${role} primary candidate`,
      );

      const topScores = fixture.roleScores
        .filter((score) => score.role === role && score.score === requirement.maxPoints)
        .map((score) => score.characterId);
      assert.deepEqual(
        topScores,
        [fixture.perfectSolution.find((solution) => solution.role === role)?.characterId],
        `${fixture.slug} should have exactly one max-point ${role} fit`,
      );

      const strongPrimaryAlternatives = primaryCandidates.filter(
        (character) =>
          character.id !==
            fixture.perfectSolution.find((solution) => solution.role === role)?.characterId &&
          roleScoreFor(fixture, character.id, role) >= Math.floor(requirement.maxPoints * 0.8),
      );
      assert.equal(
        fixture.pool.length === DAILY_CREW_SIMPLIFIED_POOL_SIZE ||
          strongPrimaryAlternatives.length >= 1,
        true,
        `${fixture.slug} should have at least one strong ${role} primary alternative`,
      );
    }
  }
});

test("perfect solution scores exactly 100 with 90 role-fit points and a 10-point synergy bonus", () => {
  for (const fixture of DAILY_CREW_SAMPLE_FIXTURES) {
    const result = scoreDailyCrewSubmission(fixture, perfectAssignments(fixture));
    assert.equal(result.score, 100);
    assert.equal(result.baseScore, 90);
    assert.equal(result.synergyScore, 10);
    assert.equal(result.rank, "s");
    assert.equal(result.rewardAmount, 1000);
    assert.equal(result.isPerfectSolution, true);
  }
});

test("Covert Harbor fixture uses only current market characters after substitution", () => {
  const fixture = DAILY_CREW_SAMPLE_FIXTURES.find(
    (mission) => mission.slug === "covert-harbor-infiltration",
  );
  assert.ok(fixture);

  const characterIds = fixture.pool.map((character) => character.id);
  assert.equal(characterIds.includes("char-koala"), false);
  assert.equal(characterIds.includes("char-perona"), false);
  assert.equal(characterIds.includes("char-sabo"), true);
  assert.equal(characterIds.includes("char-boa"), true);
  assert.equal(new Set(characterIds).size, DAILY_CREW_LEGACY_POOL_SIZE);
  assert.equal(fixture.pool.length, DAILY_CREW_LEGACY_POOL_SIZE);
  assert.equal(characterIds.includes("char-jinbe"), true);
  assert.equal(
    fixture.perfectSolution.find((solution) => solution.role === "navigator")?.characterId,
    "char-usopp",
  );
  assert.equal(
    fixture.perfectSolution.find((solution) => solution.role === "support")?.characterId,
    "char-chopper",
  );
  assert.equal(roleScoreFor(fixture, "char-usopp", "navigator"), roleMaxFor(fixture, "navigator"));
  assert.equal(
    roleScoreFor(fixture, "char-koby", "navigator") < roleMaxFor(fixture, "navigator"),
    true,
  );

  const result = scoreDailyCrewSubmission(fixture, perfectAssignments(fixture));
  assert.equal(result.score, 100);
  assert.equal(result.baseScore, 90);
  assert.equal(result.synergyScore, 10);
});

test("simplified Covert Harbor mission uses three public jobs and a nine-character pool", () => {
  const fixture = DAILY_CREW_SAMPLE_FIXTURES.find(
    (mission) => mission.slug === "covert-harbor-extraction",
  );
  assert.ok(fixture);

  const publicMission = toPublicDailyCrewMission(fixture);
  assert.equal(fixture.pool.length, DAILY_CREW_SIMPLIFIED_POOL_SIZE);
  assert.equal(fixture.roleRequirements.length, 3);
  assert.equal(fixture.pool.filter((character) => character.isStrawHat).length, 5);
  assert.equal(
    fixture.pool.some((character) => character.id === "char-law"),
    true,
  );
  assert.equal(
    fixture.pool.some((character) => character.id === "char-jinbe"),
    false,
  );
  assert.deepEqual(
    publicMission.roles.map((role) => role.name),
    ["Captain", "Navigator", "Support"],
  );
  assert.deepEqual(
    publicMission.roles.map((role) => role.role),
    ["captain", "navigator", "support"],
  );
  assert.equal(
    fixture.perfectSolution.find((solution) => solution.role === "captain")?.characterId,
    "char-shanks",
  );
  assert.equal(
    fixture.perfectSolution.find((solution) => solution.role === "navigator")?.characterId,
    "char-usopp",
  );
  assert.equal(
    fixture.perfectSolution.find((solution) => solution.role === "support")?.characterId,
    "char-chopper",
  );
  assert.equal(roleScoreFor(fixture, "char-law", "captain"), 22);
  assert.equal(roleScoreFor(fixture, "char-law", "support"), 18);
  assert.equal(roleScoreFor(fixture, "char-usopp", "navigator"), 30);
  assert.equal(roleScoreFor(fixture, "char-koby", "navigator"), 22);

  const result = scoreDailyCrewSubmission(fixture, perfectAssignments(fixture));
  assert.equal(result.score, 100);
  assert.equal(result.baseScore, 90);
  assert.equal(result.synergyScore, 10);
  assert.deepEqual(
    result.roles.map((role) => role.roleName),
    ["Operation Lead", "Scout / Lookout", "Emergency Support"],
  );
});

test("public mission projection deterministically shuffles the pool without changing membership", () => {
  for (const fixture of DAILY_CREW_SAMPLE_FIXTURES) {
    const firstProjection = toPublicDailyCrewMission(fixture);
    const secondProjection = toPublicDailyCrewMission(fixture);
    const publicIds = firstProjection.pool.map((character) => character.id);
    const repeatedPublicIds = secondProjection.pool.map((character) => character.id);
    const authoredIds = [...fixture.pool]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((character) => character.id);
    const perfectIds = new Set(fixture.perfectSolution.map((solution) => solution.characterId));
    const activeRoleCount = fixture.roleRequirements.length;

    assert.deepEqual(repeatedPublicIds, publicIds, `${fixture.slug} public order should be stable`);
    assert.equal(publicIds.length, fixture.pool.length);
    assert.equal(new Set(publicIds).size, fixture.pool.length);
    assert.deepEqual([...publicIds].sort(), [...authoredIds].sort());
    assert.ok(
      [DAILY_CREW_SIMPLIFIED_POOL_SIZE, DAILY_CREW_LEGACY_POOL_SIZE].includes(publicIds.length),
    );
    assert.notDeepEqual(
      publicIds,
      authoredIds,
      `${fixture.slug} public order should hide authored order`,
    );
    assert.equal(
      publicIds.slice(0, activeRoleCount).every((characterId) => perfectIds.has(characterId)),
      false,
      `${fixture.slug} first ${activeRoleCount} public characters should not all be perfect picks`,
    );
  }
});

test("sample fixtures include clear weak and bad role fits", () => {
  for (const fixture of DAILY_CREW_SAMPLE_FIXTURES) {
    for (const { role } of fixture.roleRequirements) {
      const roleScores = fixture.roleScores.filter((score) => score.role === role);
      assert.equal(
        roleScores.some((score) => score.score <= 10),
        true,
        `${fixture.slug} ${role} should include weak or bad choices`,
      );
    }
  }
});

test("near-perfect submission can score below 100 without leaking the perfect solution", () => {
  const fixture = DAILY_CREW_SAMPLE_FIXTURES[0];
  const assignments = perfectAssignments(fixture).map((assignment) =>
    assignment.role === "strategist"
      ? { role: "strategist" as const, characterId: "char-robin" }
      : assignment,
  );

  const result = scoreDailyCrewSubmission(fixture, assignments);

  assert.equal(result.score, 89);
  assert.equal(result.baseScore, 89);
  assert.equal(result.synergyScore, 0);
  assert.equal(result.rank, "a");
  assert.equal(result.rewardAmount, 700);
  assert.equal(result.isPerfectSolution, false);
});

test("submission validation rejects duplicate characters, missing roles, duplicate roles, unknown characters, and unknown roles", () => {
  const fixture = DAILY_CREW_SAMPLE_FIXTURES[0];
  const valid = perfectAssignments(fixture);

  assert.throws(
    () =>
      scoreDailyCrewSubmission(fixture, [
        { role: "captain", characterId: "char-luffy" },
        { role: "fighter", characterId: "char-luffy" },
        { role: "navigator", characterId: "char-nami" },
        { role: "strategist", characterId: "char-law" },
        { role: "support", characterId: "char-marco" },
      ]),
    /same character/,
  );

  assert.throws(() => scoreDailyCrewSubmission(fixture, valid.slice(0, 4)), /exactly 5 roles/);

  assert.throws(
    () =>
      scoreDailyCrewSubmission(fixture, [
        { role: "captain", characterId: "char-luffy" },
        { role: "captain", characterId: "char-zoro" },
        { role: "navigator", characterId: "char-nami" },
        { role: "strategist", characterId: "char-law" },
        { role: "support", characterId: "char-marco" },
      ]),
    /every required role/,
  );

  assert.throws(
    () =>
      scoreDailyCrewSubmission(
        fixture,
        valid.map((assignment) =>
          assignment.role === "support"
            ? { ...assignment, characterId: "char-unknown" }
            : assignment,
        ),
      ),
    /outside the mission pool/,
  );

  assert.throws(
    () =>
      scoreDailyCrewSubmission(
        fixture,
        valid.map((assignment) =>
          assignment.role === "support"
            ? { ...assignment, role: "cook" as DailyCrewRole }
            : assignment,
        ),
      ),
    /every required role/,
  );
});

test("rank and reward ladder uses exact approved score boundaries", () => {
  const cases = [
    [100, "s", 1000],
    [90, "s", 1000],
    [89, "a", 700],
    [80, "a", 700],
    [79, "b", 400],
    [70, "b", 400],
    [69, "c", 200],
    [60, "c", 200],
    [59, "fail", 0],
    [0, "fail", 0],
  ] as const;

  for (const [score, rank, reward] of cases) {
    assert.equal(rankForDailyCrewScore(score), rank);
    assert.equal(rewardForDailyCrewRank(rank), reward);
    assert.equal(rewardForDailyCrewScore(score), reward);
  }
});

test("rank and reward helpers consistently reject invalid scores", () => {
  for (const score of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => rankForDailyCrewScore(score), /finite number from 0 through 100/);
    assert.throws(() => rewardForDailyCrewScore(score), /finite number from 0 through 100/);
  }
});

test("fixture validation rejects invalid pool sizes and display order", () => {
  const fourteenCharacters = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  fourteenCharacters.pool.pop();
  assertInvalidFixture(fourteenCharacters, /exactly 9 or 15 characters/);

  const sixteenCharacters = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  sixteenCharacters.pool.push({
    id: "char-extra",
    name: "Extra Character",
    slug: "extra-character",
    primaryRole: "support",
    displayOrder: 16,
    isStrawHat: false,
    visibleTags: [],
  });
  assertInvalidFixture(sixteenCharacters, /exactly 9 or 15 characters/);

  const invalidDisplayOrder = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  invalidDisplayOrder.pool[0].displayOrder = 15;
  assertInvalidFixture(invalidDisplayOrder, /display order must be exactly 1 through 15/);
});

test("fixture validation rejects excessive Straw Hat counts", () => {
  const tooManyPoolStrawHats = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  tooManyPoolStrawHats.pool.find((character) => character.id === "char-law")!.isStrawHat = true;
  assertInvalidFixture(tooManyPoolStrawHats, /pool cannot include more than 5 Straw Hats/);

  const simplifiedTooManyPoolStrawHats = cloneFixture(
    DAILY_CREW_SAMPLE_FIXTURES.find((mission) => mission.slug === "covert-harbor-extraction")!,
  );
  simplifiedTooManyPoolStrawHats.pool.find((character) => character.id === "char-law")!.isStrawHat =
    true;
  assertInvalidFixture(
    simplifiedTooManyPoolStrawHats,
    /pool cannot include more than 5 Straw Hats/,
  );

  const tooManyPerfectStrawHats = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  tooManyPerfectStrawHats.perfectSolution = tooManyPerfectStrawHats.perfectSolution.map(
    (solution) =>
      solution.role === "support" ? { role: "support", characterId: "char-sanji" } : solution,
  );
  assertInvalidFixture(
    tooManyPerfectStrawHats,
    /perfect solution cannot include more than 3 Straw Hats/,
  );
});

test("fixture validation rejects missing role scores, duplicate role scores, and imperfect max-score setup", () => {
  const missingRoleScore = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  missingRoleScore.roleScores = missingRoleScore.roleScores.filter(
    (score) => !(score.characterId === "char-luffy" && score.role === "captain"),
  );
  assertInvalidFixture(missingRoleScore, /missing role score for char-luffy captain/);

  const duplicateRoleScore = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  duplicateRoleScore.roleScores.push({ ...duplicateRoleScore.roleScores[0] });
  assertInvalidFixture(duplicateRoleScore, /duplicate role score row for char-luffy captain/);

  const lowPerfectBase = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  lowPerfectBase.roleScores = lowPerfectBase.roleScores.map((score) =>
    score.characterId === "char-luffy" && score.role === "captain"
      ? { ...score, score: 17 }
      : score,
  );
  assertInvalidFixture(lowPerfectBase, /perfect solution base role score must be exactly 90/);

  const noPerfectSynergy = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  noPerfectSynergy.synergyRules = [];
  assertInvalidFixture(noPerfectSynergy, /perfect solution must reach exactly 100/);
});

test("public mission projection exposes only public-safe mission, role, and pool data", () => {
  const publicMission = toPublicDailyCrewMission(DAILY_CREW_SAMPLE_FIXTURES[0]);
  const publicJson = JSON.stringify(publicMission);

  assert.equal(publicMission.pool.length, 15);
  assert.deepEqual(
    publicMission.roles.map((role) => role.role),
    DAILY_CREW_ROLES,
  );
  assert.equal(Object.hasOwn(publicMission, "roleScores"), false);
  assert.equal(Object.hasOwn(publicMission, "perfectSolution"), false);
  assert.equal(Object.hasOwn(publicMission, "roleRequirements"), false);
  assert.equal(Object.hasOwn(publicMission, "synergyRules"), false);
  for (const character of publicMission.pool) {
    assert.equal(Object.hasOwn(character, "displayOrder"), false);
    assert.equal(Object.hasOwn(character, "visibleTags"), false);
    assert.equal(Object.hasOwn(character, "primaryRole"), false);
    assert.equal(Object.hasOwn(character, "isStrawHat"), false);
    assert.equal(Object.hasOwn(character, "score"), false);
  }
  assert.doesNotMatch(
    publicJson,
    /subtypeKey|subtypeLabel|Hidden command profile|Hidden combat profile/i,
  );
  assert.doesNotMatch(
    publicJson,
    /displayOrder|visibleTags|primaryRole|isStrawHat|roleScores|perfectSolution|synergyRules/i,
  );
});

test("scoring does not mutate fixtures or assignments", () => {
  const fixture = cloneFixture(DAILY_CREW_SAMPLE_FIXTURES[0]);
  const assignments = perfectAssignments(fixture);
  const fixtureBefore = JSON.stringify(fixture);
  const assignmentsBefore = JSON.stringify(assignments);

  scoreDailyCrewSubmission(fixture, assignments);

  assert.equal(JSON.stringify(fixture), fixtureBefore);
  assert.equal(JSON.stringify(assignments), assignmentsBefore);
});

test("Daily Crew Builder Phase 2 code does not introduce wallet mutation or payout behavior", () => {
  const implementationFiles = ["scoring.ts", "fixtures.ts"];
  const implementationSource = implementationFiles
    .map((file) =>
      readFileSync(join(process.cwd(), "src", "lib", "daily-crew-builder", file), "utf8"),
    )
    .join("\n");

  assert.doesNotMatch(implementationSource, /\buser_wallets\b/i);
  assert.doesNotMatch(implementationSource, /\bwallet\s+balance\b/i);
  assert.doesNotMatch(implementationSource, /\btransactions\b/i);
  assert.doesNotMatch(implementationSource, /\baward_daily_crew\b/i);
  assert.doesNotMatch(
    implementationSource,
    /\b(?:supabase|db|client|context\.supabase)\.rpc\s*\(/i,
  );
  assert.doesNotMatch(
    implementationSource,
    /\b(?:supabase|db|client|context\.supabase)\.from\s*\(/i,
  );
  assert.doesNotMatch(implementationSource, /supabase/i);
});
