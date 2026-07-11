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
  primaryRole: DailyCrewRole,
  displayOrder: number,
  isStrawHat: boolean,
  visibleTags: string[],
): DailyCrewPoolCharacter {
  return {
    id,
    name,
    slug: id.replace(/^char-/, ""),
    primaryRole,
    displayOrder,
    isStrawHat,
    visibleTags,
  };
}

function roleRequirements(prefix: string): DailyCrewRoleRequirement[] {
  return [
    { role: "captain", subtypeKey: `${prefix}_command`, subtypeLabel: "Hidden command profile", displayLabel: "Captain", displayOrder: 1, maxPoints: 18 },
    { role: "fighter", subtypeKey: `${prefix}_duelist`, subtypeLabel: "Hidden combat profile", displayLabel: "Fighter", displayOrder: 2, maxPoints: 18 },
    { role: "navigator", subtypeKey: `${prefix}_route`, subtypeLabel: "Hidden route profile", displayLabel: "Navigator", displayOrder: 3, maxPoints: 18 },
    { role: "strategist", subtypeKey: `${prefix}_scheme`, subtypeLabel: "Hidden strategy profile", displayLabel: "Strategist", displayOrder: 4, maxPoints: 18 },
    { role: "support", subtypeKey: `${prefix}_stabilizer`, subtypeLabel: "Hidden support profile", displayLabel: "Support", displayOrder: 5, maxPoints: 18 },
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

function roleScoresFromRequirements(
  pool: DailyCrewPoolCharacter[],
  matrix: Partial<Record<string, Partial<Record<DailyCrewRole, number>>>>,
  requirements: DailyCrewRoleRequirement[],
  missionLabel: string,
): DailyCrewRoleScore[] {
  return pool.flatMap((character) =>
    requirements.map((requirement) => {
      const score = matrix[character.id]?.[requirement.role];
      if (score == null) {
        throw new Error(`Fixture score missing for ${character.id} ${requirement.role}`);
      }

      return {
        characterId: character.id,
        role: requirement.role,
        score,
        explanation: `${character.name} brings a ${score}/${requirement.maxPoints} ${requirement.displayLabel ?? requirement.role} fit to ${missionLabel}.`,
      };
    }),
  );
}

const stormGatePool = [
  poolCharacter("char-luffy", "Monkey D. Luffy", "captain", 1, true, ["Straw Hat", "captain", "high-risk"]),
  poolCharacter("char-zoro", "Roronoa Zoro", "fighter", 2, true, ["Straw Hat", "fighter"]),
  poolCharacter("char-nami", "Nami", "navigator", 3, true, ["Straw Hat", "navigator"]),
  poolCharacter("char-sanji", "Sanji", "support", 4, true, ["Straw Hat", "support", "fighter"]),
  poolCharacter("char-robin", "Nico Robin", "strategist", 5, true, ["Straw Hat", "scholar", "strategist"]),
  poolCharacter("char-law", "Trafalgar Law", "strategist", 6, false, ["captain", "strategist"]),
  poolCharacter("char-kid", "Eustass Kid", "captain", 7, false, ["captain", "fighter"]),
  poolCharacter("char-boa", "Boa Hancock", "captain", 8, false, ["captain", "fighter"]),
  poolCharacter("char-marco", "Marco", "support", 9, false, ["support", "fighter"]),
  poolCharacter("char-vivi", "Nefertari Vivi", "navigator", 10, false, ["diplomat", "navigator"]),
  poolCharacter("char-sabo", "Sabo", "fighter", 11, false, ["fighter", "strategist"]),
  poolCharacter("char-kuma", "Bartholomew Kuma", "navigator", 12, false, ["transport", "route", "support"]),
  poolCharacter("char-mihawk", "Dracule Mihawk", "fighter", 13, false, ["fighter"]),
  poolCharacter("char-crocodile", "Crocodile", "strategist", 14, false, ["strategist", "captain"]),
  poolCharacter("char-yamato", "Yamato", "support", 15, false, ["support", "fighter"]),
];

const stormGateScores: RoleScoreMatrix = {
  "char-luffy": { captain: 18, fighter: 16, navigator: 5, strategist: 10, support: 8 },
  "char-zoro": { captain: 7, fighter: 18, navigator: 3, strategist: 5, support: 6 },
  "char-nami": { captain: 5, fighter: 3, navigator: 18, strategist: 14, support: 11 },
  "char-sanji": { captain: 7, fighter: 14, navigator: 6, strategist: 7, support: 16 },
  "char-robin": { captain: 9, fighter: 7, navigator: 10, strategist: 17, support: 12 },
  "char-law": { captain: 14, fighter: 12, navigator: 11, strategist: 18, support: 13 },
  "char-kid": { captain: 16, fighter: 14, navigator: 3, strategist: 6, support: 4 },
  "char-boa": { captain: 15, fighter: 13, navigator: 5, strategist: 10, support: 9 },
  "char-marco": { captain: 12, fighter: 13, navigator: 8, strategist: 12, support: 18 },
  "char-vivi": { captain: 11, fighter: 2, navigator: 16, strategist: 13, support: 14 },
  "char-sabo": { captain: 13, fighter: 16, navigator: 5, strategist: 14, support: 10 },
  "char-kuma": { captain: 6, fighter: 12, navigator: 15, strategist: 8, support: 14 },
  "char-mihawk": { captain: 10, fighter: 17, navigator: 2, strategist: 9, support: 5 },
  "char-crocodile": { captain: 14, fighter: 12, navigator: 5, strategist: 16, support: 6 },
  "char-yamato": { captain: 12, fighter: 14, navigator: 4, strategist: 7, support: 15 },
};

const covertHarborPool = [
  poolCharacter("char-chopper", "Tony Tony Chopper", "support", 1, true, ["Straw Hat", "support"]),
  poolCharacter("char-franky", "Franky", "navigator", 2, true, ["Straw Hat", "shipwright", "route"]),
  poolCharacter("char-brook", "Brook", "support", 3, true, ["Straw Hat", "support"]),
  poolCharacter("char-usopp", "Usopp", "navigator", 4, true, ["Straw Hat", "scout", "tactician"]),
  poolCharacter("char-jinbe", "Jinbe", "fighter", 5, true, ["Straw Hat", "fighter"]),
  poolCharacter("char-shanks", "Shanks", "captain", 6, false, ["captain", "emperor"]),
  poolCharacter("char-buggy", "Buggy", "captain", 7, false, ["captain", "wildcard"]),
  poolCharacter("char-dragon", "Monkey D. Dragon", "strategist", 8, false, ["strategist", "revolutionary"]),
  poolCharacter("char-sabo", "Sabo", "strategist", 9, false, ["strategist", "fighter", "revolutionary"]),
  poolCharacter("char-garp", "Monkey D. Garp", "fighter", 10, false, ["fighter", "marine"]),
  poolCharacter("char-koby", "Koby", "navigator", 11, false, ["scout", "navigator", "marine"]),
  poolCharacter("char-smoker", "Smoker", "strategist", 12, false, ["strategist", "marine", "fighter"]),
  poolCharacter("char-katakuri", "Charlotte Katakuri", "fighter", 13, false, ["fighter", "strategist"]),
  poolCharacter("char-boa", "Boa Hancock", "support", 14, false, ["support", "captain", "disruption"]),
  poolCharacter("char-bonney", "Jewelry Bonney", "captain", 15, false, ["captain", "wildcard"]),
];

const covertHarborScores: RoleScoreMatrix = {
  "char-chopper": { captain: 5, fighter: 7, navigator: 5, strategist: 6, support: 18 },
  "char-franky": { captain: 8, fighter: 13, navigator: 16, strategist: 12, support: 14 },
  "char-brook": { captain: 7, fighter: 11, navigator: 9, strategist: 8, support: 16 },
  "char-usopp": { captain: 9, fighter: 6, navigator: 18, strategist: 14, support: 13 },
  "char-jinbe": { captain: 12, fighter: 18, navigator: 13, strategist: 12, support: 14 },
  "char-shanks": { captain: 18, fighter: 14, navigator: 9, strategist: 14, support: 12 },
  "char-buggy": { captain: 15, fighter: 3, navigator: 7, strategist: 8, support: 6 },
  "char-dragon": { captain: 14, fighter: 12, navigator: 10, strategist: 18, support: 11 },
  "char-sabo": { captain: 13, fighter: 14, navigator: 5, strategist: 16, support: 10 },
  "char-garp": { captain: 12, fighter: 17, navigator: 5, strategist: 8, support: 7 },
  "char-koby": { captain: 10, fighter: 11, navigator: 15, strategist: 12, support: 11 },
  "char-smoker": { captain: 10, fighter: 14, navigator: 7, strategist: 15, support: 8 },
  "char-katakuri": { captain: 13, fighter: 16, navigator: 7, strategist: 13, support: 9 },
  "char-boa": { captain: 13, fighter: 14, navigator: 5, strategist: 11, support: 15 },
  "char-bonney": { captain: 16, fighter: 12, navigator: 9, strategist: 10, support: 13 },
};

const covertHarborExtractionPool = [
  poolCharacter("char-shanks", "Shanks", "captain", 1, false, ["emperor", "leader"]),
  poolCharacter("char-dragon", "Monkey D. Dragon", "strategist", 2, false, ["revolutionary", "leader"]),
  poolCharacter("char-law", "Trafalgar Law", "captain", 3, false, ["captain", "surgeon", "tactical"]),
  poolCharacter("char-usopp", "Usopp", "navigator", 4, true, ["Straw Hat", "scout", "lookout"]),
  poolCharacter("char-franky", "Franky", "navigator", 5, true, ["Straw Hat", "shipwright", "backup lookout"]),
  poolCharacter("char-koby", "Koby", "navigator", 6, false, ["marine", "scout"]),
  poolCharacter("char-robin", "Nico Robin", "strategist", 7, true, ["Straw Hat", "intel"]),
  poolCharacter("char-brook", "Brook", "support", 8, true, ["Straw Hat", "morale"]),
  poolCharacter("char-chopper", "Tony Tony Chopper", "support", 9, true, ["Straw Hat", "medic"]),
];

const covertHarborExtractionRequirements: DailyCrewRoleRequirement[] = [
  {
    role: "captain",
    subtypeKey: "covert_extraction_lead",
    subtypeLabel: "Hidden operation lead profile",
    displayLabel: "Operation Lead",
    displayOrder: 1,
    maxPoints: 30,
  },
  {
    role: "navigator",
    subtypeKey: "covert_extraction_scout",
    subtypeLabel: "Hidden scout profile",
    displayLabel: "Scout / Lookout",
    displayOrder: 2,
    maxPoints: 30,
  },
  {
    role: "support",
    subtypeKey: "covert_extraction_support",
    subtypeLabel: "Hidden emergency support profile",
    displayLabel: "Emergency Support",
    displayOrder: 3,
    maxPoints: 30,
  },
];

const covertHarborExtractionScores: Partial<Record<string, Partial<Record<DailyCrewRole, number>>>> = {
  "char-shanks": { captain: 30, navigator: 11, support: 10 },
  "char-dragon": { captain: 25, navigator: 14, support: 12 },
  "char-law": { captain: 22, navigator: 12, support: 18 },
  "char-usopp": { captain: 10, navigator: 30, support: 14 },
  "char-franky": { captain: 12, navigator: 24, support: 17 },
  "char-koby": { captain: 14, navigator: 22, support: 15 },
  "char-robin": { captain: 18, navigator: 18, support: 24 },
  "char-brook": { captain: 9, navigator: 16, support: 22 },
  "char-chopper": { captain: 8, navigator: 10, support: 30 },
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
      { role: "navigator", characterId: "char-usopp" },
      { role: "strategist", characterId: "char-dragon" },
      { role: "support", characterId: "char-chopper" },
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
          navigator: "char-usopp",
          strategist: "char-dragon",
          support: "char-chopper",
        },
      },
      {
        id: "silent-handoff",
        label: "Silent handoff",
        points: 3,
        explanation: "Usopp scouts the harbor lanes while Dragon masks the extraction.",
        characterIds: ["char-usopp", "char-dragon"],
      },
    ],
  },
  {
    missionDate: "2026-07-12",
    slug: "covert-harbor-extraction",
    title: "Covert Harbor Extraction",
    brief: "Pick three specialists who can lead the exit, watch the harbor lanes, and keep the crew standing when the escape turns loud.",
    missionTags: ["stealth", "extraction", "support"],
    maxScore: 100,
    pool: covertHarborExtractionPool,
    roleRequirements: covertHarborExtractionRequirements,
    roleScores: roleScoresFromRequirements(
      covertHarborExtractionPool,
      covertHarborExtractionScores,
      covertHarborExtractionRequirements,
      "the covert harbor extraction",
    ),
    perfectSolution: [
      { role: "captain", characterId: "char-shanks" },
      { role: "navigator", characterId: "char-usopp" },
      { role: "support", characterId: "char-chopper" },
    ],
    synergyRules: [
      {
        id: "covert-harbor-extraction-perfect-trio",
        label: "Covert Harbor perfect trio",
        points: 10,
        explanation: "The exact extraction trio covers every mission-defined job and earns the mission synergy bonus.",
        roles: {
          captain: "char-shanks",
          navigator: "char-usopp",
          support: "char-chopper",
        },
      },
      {
        id: "lookout-and-medic",
        label: "Lookout and medic",
        points: 4,
        explanation: "Usopp spots the safe lane while Chopper keeps the extraction team moving.",
        characterIds: ["char-usopp", "char-chopper"],
      },
    ],
  },
];
