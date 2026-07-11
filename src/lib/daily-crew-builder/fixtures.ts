import {
  DAILY_CREW_ROLES,
  type DailyCrewMissionFixture,
  type DailyCrewPoolCharacter,
  type DailyCrewRole,
  type DailyCrewRoleRequirement,
  type DailyCrewRoleScore,
} from "./scoring.ts";

type RoleScoreMatrix = Record<string, Record<DailyCrewRole, number>>;

function poolCharacter(
  id: string,
  name: string,
  displayOrder: number,
  isStrawHat: boolean,
  visibleTags: string[],
): DailyCrewPoolCharacter {
  return {
    id,
    name,
    slug: id.replace(/^char-/, ""),
    displayOrder,
    isStrawHat,
    visibleTags,
  };
}

function roleRequirements(prefix: string): DailyCrewRoleRequirement[] {
  return [
    { role: "captain", subtypeKey: `${prefix}_command`, subtypeLabel: "Hidden command profile", maxPoints: 18 },
    { role: "fighter", subtypeKey: `${prefix}_duelist`, subtypeLabel: "Hidden combat profile", maxPoints: 18 },
    { role: "navigator", subtypeKey: `${prefix}_route`, subtypeLabel: "Hidden route profile", maxPoints: 18 },
    { role: "strategist", subtypeKey: `${prefix}_scheme`, subtypeLabel: "Hidden strategy profile", maxPoints: 18 },
    { role: "support", subtypeKey: `${prefix}_stabilizer`, subtypeLabel: "Hidden support profile", maxPoints: 18 },
  ];
}

function roleScoresFromMatrix(
  pool: DailyCrewPoolCharacter[],
  matrix: RoleScoreMatrix,
  missionLabel: string,
): DailyCrewRoleScore[] {
  return pool.flatMap((character) =>
    DAILY_CREW_ROLES.map((role) => {
      const score = matrix[character.id]?.[role];
      if (score == null) {
        throw new Error(`Fixture score missing for ${character.id} ${role}`);
      }

      return {
        characterId: character.id,
        role,
        score,
        explanation: `${character.name} brings a ${score}/18 ${role} fit to ${missionLabel}.`,
      };
    }),
  );
}

const stormGatePool = [
  poolCharacter("char-luffy", "Monkey D. Luffy", 1, true, ["Straw Hat", "captain", "high-risk"]),
  poolCharacter("char-zoro", "Roronoa Zoro", 2, true, ["Straw Hat", "fighter"]),
  poolCharacter("char-nami", "Nami", 3, true, ["Straw Hat", "navigator"]),
  poolCharacter("char-sanji", "Sanji", 4, true, ["Straw Hat", "fighter", "support"]),
  poolCharacter("char-robin", "Nico Robin", 5, true, ["Straw Hat", "scholar"]),
  poolCharacter("char-law", "Trafalgar Law", 6, false, ["captain", "strategist"]),
  poolCharacter("char-kid", "Eustass Kid", 7, false, ["captain", "fighter"]),
  poolCharacter("char-boa", "Boa Hancock", 8, false, ["captain", "fighter"]),
  poolCharacter("char-marco", "Marco", 9, false, ["support", "fighter"]),
  poolCharacter("char-vivi", "Nefertari Vivi", 10, false, ["diplomat", "navigator"]),
  poolCharacter("char-sabo", "Sabo", 11, false, ["fighter", "strategist"]),
  poolCharacter("char-kuma", "Bartholomew Kuma", 12, false, ["support", "fighter"]),
  poolCharacter("char-mihawk", "Dracule Mihawk", 13, false, ["fighter"]),
  poolCharacter("char-crocodile", "Crocodile", 14, false, ["strategist", "captain"]),
  poolCharacter("char-yamato", "Yamato", 15, false, ["fighter", "support"]),
];

const stormGateScores: RoleScoreMatrix = {
  "char-luffy": { captain: 18, fighter: 16, navigator: 5, strategist: 10, support: 8 },
  "char-zoro": { captain: 12, fighter: 18, navigator: 4, strategist: 7, support: 7 },
  "char-nami": { captain: 9, fighter: 4, navigator: 18, strategist: 14, support: 12 },
  "char-sanji": { captain: 10, fighter: 17, navigator: 7, strategist: 9, support: 14 },
  "char-robin": { captain: 11, fighter: 8, navigator: 11, strategist: 17, support: 13 },
  "char-law": { captain: 15, fighter: 13, navigator: 12, strategist: 18, support: 15 },
  "char-kid": { captain: 16, fighter: 16, navigator: 4, strategist: 8, support: 5 },
  "char-boa": { captain: 14, fighter: 15, navigator: 7, strategist: 12, support: 10 },
  "char-marco": { captain: 13, fighter: 15, navigator: 9, strategist: 14, support: 18 },
  "char-vivi": { captain: 12, fighter: 3, navigator: 15, strategist: 15, support: 17 },
  "char-sabo": { captain: 14, fighter: 17, navigator: 6, strategist: 13, support: 11 },
  "char-kuma": { captain: 9, fighter: 16, navigator: 8, strategist: 10, support: 16 },
  "char-mihawk": { captain: 11, fighter: 18, navigator: 4, strategist: 11, support: 8 },
  "char-crocodile": { captain: 15, fighter: 13, navigator: 7, strategist: 16, support: 9 },
  "char-yamato": { captain: 13, fighter: 17, navigator: 5, strategist: 9, support: 12 },
};

const covertHarborPool = [
  poolCharacter("char-chopper", "Tony Tony Chopper", 1, true, ["Straw Hat", "support"]),
  poolCharacter("char-franky", "Franky", 2, true, ["Straw Hat", "engineer"]),
  poolCharacter("char-brook", "Brook", 3, true, ["Straw Hat", "support"]),
  poolCharacter("char-usopp", "Usopp", 4, true, ["Straw Hat", "tactician"]),
  poolCharacter("char-jinbe", "Jinbe", 5, true, ["Straw Hat", "fighter"]),
  poolCharacter("char-shanks", "Shanks", 6, false, ["captain", "emperor"]),
  poolCharacter("char-buggy", "Buggy", 7, false, ["captain", "wildcard"]),
  poolCharacter("char-dragon", "Monkey D. Dragon", 8, false, ["strategist", "revolutionary"]),
  poolCharacter("char-sabo", "Sabo", 9, false, ["fighter", "strategist", "revolutionary"]),
  poolCharacter("char-garp", "Monkey D. Garp", 10, false, ["fighter", "marine"]),
  poolCharacter("char-koby", "Koby", 11, false, ["navigator", "marine"]),
  poolCharacter("char-smoker", "Smoker", 12, false, ["fighter", "marine"]),
  poolCharacter("char-katakuri", "Charlotte Katakuri", 13, false, ["fighter", "strategist"]),
  poolCharacter("char-boa", "Boa Hancock", 14, false, ["captain", "fighter", "disruption"]),
  poolCharacter("char-bonney", "Jewelry Bonney", 15, false, ["captain", "wildcard"]),
];

const covertHarborScores: RoleScoreMatrix = {
  "char-chopper": { captain: 7, fighter: 9, navigator: 6, strategist: 8, support: 18 },
  "char-franky": { captain: 9, fighter: 14, navigator: 11, strategist: 13, support: 15 },
  "char-brook": { captain: 8, fighter: 12, navigator: 10, strategist: 10, support: 17 },
  "char-usopp": { captain: 10, fighter: 8, navigator: 16, strategist: 15, support: 14 },
  "char-jinbe": { captain: 14, fighter: 18, navigator: 14, strategist: 13, support: 15 },
  "char-shanks": { captain: 18, fighter: 17, navigator: 10, strategist: 15, support: 13 },
  "char-buggy": { captain: 13, fighter: 4, navigator: 8, strategist: 9, support: 8 },
  "char-dragon": { captain: 17, fighter: 13, navigator: 11, strategist: 18, support: 12 },
  "char-sabo": { captain: 14, fighter: 17, navigator: 6, strategist: 15, support: 18 },
  "char-garp": { captain: 13, fighter: 18, navigator: 7, strategist: 10, support: 9 },
  "char-koby": { captain: 12, fighter: 12, navigator: 18, strategist: 14, support: 13 },
  "char-smoker": { captain: 11, fighter: 15, navigator: 9, strategist: 13, support: 10 },
  "char-katakuri": { captain: 14, fighter: 17, navigator: 9, strategist: 16, support: 11 },
  "char-boa": { captain: 14, fighter: 15, navigator: 7, strategist: 13, support: 16 },
  "char-bonney": { captain: 15, fighter: 13, navigator: 10, strategist: 11, support: 14 },
};

export const DAILY_CREW_SAMPLE_FIXTURES: DailyCrewMissionFixture[] = [
  {
    missionDate: "2026-07-10",
    slug: "storm-gate-rescue",
    title: "Storm Gate Rescue",
    brief: "Assemble a crew that can cross a hostile weather gate, break the blockade, and extract stranded allies.",
    missionTags: ["rescue", "storm", "blockade"],
    maxScore: 100,
    pool: stormGatePool,
    roleRequirements: roleRequirements("storm_gate"),
    roleScores: roleScoresFromMatrix(stormGatePool, stormGateScores, "the Storm Gate rescue"),
    perfectSolution: [
      { role: "captain", characterId: "char-luffy" },
      { role: "fighter", characterId: "char-zoro" },
      { role: "navigator", characterId: "char-nami" },
      { role: "strategist", characterId: "char-law" },
      { role: "support", characterId: "char-marco" },
    ],
    synergyRules: [
      {
        id: "storm-gate-perfect-crew",
        label: "Storm Gate perfect crew",
        points: 10,
        explanation: "The exact rescue crew covers every hidden role profile and earns the mission synergy bonus.",
        roles: {
          captain: "char-luffy",
          fighter: "char-zoro",
          navigator: "char-nami",
          strategist: "char-law",
          support: "char-marco",
        },
      },
      {
        id: "surgical-evacuation",
        label: "Surgical evacuation",
        points: 4,
        explanation: "Law and Marco stabilize the extraction route together.",
        characterIds: ["char-law", "char-marco"],
      },
    ],
  },
  {
    missionDate: "2026-07-11",
    slug: "covert-harbor-infiltration",
    title: "Covert Harbor Infiltration",
    brief: "Choose a five-role crew that can enter a guarded harbor, read the shifting patrols, and leave no trace.",
    missionTags: ["stealth", "harbor", "intel"],
    maxScore: 100,
    pool: covertHarborPool,
    roleRequirements: roleRequirements("covert_harbor"),
    roleScores: roleScoresFromMatrix(covertHarborPool, covertHarborScores, "the covert harbor infiltration"),
    perfectSolution: [
      { role: "captain", characterId: "char-shanks" },
      { role: "fighter", characterId: "char-jinbe" },
      { role: "navigator", characterId: "char-koby" },
      { role: "strategist", characterId: "char-dragon" },
      { role: "support", characterId: "char-sabo" },
    ],
    synergyRules: [
      {
        id: "covert-harbor-perfect-crew",
        label: "Covert Harbor perfect crew",
        points: 10,
        explanation: "The exact infiltration crew covers every hidden role profile and earns the mission synergy bonus.",
        roles: {
          captain: "char-shanks",
          fighter: "char-jinbe",
          navigator: "char-koby",
          strategist: "char-dragon",
          support: "char-sabo",
        },
      },
      {
        id: "revolutionary-handshake",
        label: "Revolutionary handshake",
        points: 3,
        explanation: "Dragon and Sabo coordinate a clean information handoff.",
        characterIds: ["char-dragon", "char-sabo"],
      },
    ],
  },
];
