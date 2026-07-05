import {
  simulateMarketMovement,
  type SimulationInput,
  type SimulationResult,
} from "./simulator-v1.js";
import type { SimulationSummary } from "./movement-v1.js";

export type SimulationScenarioDefinition = {
  name: string;
  horizon: "30-day" | "90-day";
  input: SimulationInput;
};

export type SimulationSummaryRow = {
  scenario: string;
  startPrice: number;
  endPrice: number;
  percentageReturnPct: number;
  minPrice: number;
  maxPrice: number;
  cappedDays: number;
  finalPriceDifferenceFromFairValuePct: number;
};

export type SimulationScenarioOutput = {
  scenario: string;
  horizon: SimulationScenarioDefinition["horizon"];
  result: SimulationResult;
};

export type SimulationSuiteOutput = {
  scenarios: SimulationScenarioOutput[];
  summaryRows: SimulationSummaryRow[];
};

export const SIMULATION_SCENARIOS: readonly SimulationScenarioDefinition[] = [
  {
    name: "Scenario A - no events for 30 days",
    horizon: "30-day",
    input: {
      initialPrice: 100,
      fairValue: 100,
      category: "growth",
      initialMomentumPct: 0,
      days: 30,
    },
  },
  {
    name: "Scenario B - underpriced character for 30 days",
    horizon: "30-day",
    input: {
      initialPrice: 60,
      fairValue: 100,
      category: "growth",
      initialMomentumPct: 0,
      days: 30,
    },
  },
  {
    name: "Scenario C - overpriced character for 30 days",
    horizon: "30-day",
    input: {
      initialPrice: 160,
      fairValue: 100,
      category: "growth",
      initialMomentumPct: 0,
      days: 30,
    },
  },
  {
    name: "Scenario D - one major positive event",
    horizon: "30-day",
    input: {
      initialPrice: 100,
      fairValue: 120,
      category: "growth",
      initialMomentumPct: 0,
      days: 30,
      approvedEvents: [{ day: 5, impactPct: 20, isMajorEvent: true, label: "Approved reveal" }],
    },
  },
  {
    name: "Scenario E - one major negative event",
    horizon: "30-day",
    input: {
      initialPrice: 100,
      fairValue: 90,
      category: "speculative",
      initialMomentumPct: 0,
      days: 30,
      approvedEvents: [{ day: 5, impactPct: -25, isMajorEvent: true, label: "Approved setback" }],
    },
  },
  {
    name: "Scenario F - repeated positive events",
    horizon: "30-day",
    input: {
      initialPrice: 80,
      fairValue: 120,
      category: "meme",
      initialMomentumPct: 0,
      days: 30,
      approvedEvents: [
        { day: 2, impactPct: 18, label: "Approved burst 1" },
        { day: 5, impactPct: 18, label: "Approved burst 2" },
        { day: 8, impactPct: 18, label: "Approved burst 3" },
        { day: 11, impactPct: 18, label: "Approved burst 4" },
        { day: 14, impactPct: 18, label: "Approved burst 5" },
      ],
    },
  },
  {
    name: "Scenario G - inactive character",
    horizon: "30-day",
    input: {
      initialPrice: 101,
      fairValue: 100,
      category: "blue_chip",
      initialMomentumPct: 0,
      days: 30,
    },
  },
  {
    name: "Scenario H - category comparison blue_chip",
    horizon: "30-day",
    input: {
      initialPrice: 100,
      fairValue: 100,
      category: "blue_chip",
      initialMomentumPct: 0,
      days: 30,
      approvedEvents: [{ day: 1, impactPct: 20, label: "Same approved catalyst" }],
    },
  },
  {
    name: "Scenario H - category comparison growth",
    horizon: "30-day",
    input: {
      initialPrice: 100,
      fairValue: 100,
      category: "growth",
      initialMomentumPct: 0,
      days: 30,
      approvedEvents: [{ day: 1, impactPct: 20, label: "Same approved catalyst" }],
    },
  },
  {
    name: "Scenario H - category comparison speculative",
    horizon: "30-day",
    input: {
      initialPrice: 100,
      fairValue: 100,
      category: "speculative",
      initialMomentumPct: 0,
      days: 30,
      approvedEvents: [{ day: 1, impactPct: 20, label: "Same approved catalyst" }],
    },
  },
  {
    name: "Scenario H - category comparison meme",
    horizon: "30-day",
    input: {
      initialPrice: 100,
      fairValue: 100,
      category: "meme",
      initialMomentumPct: 0,
      days: 30,
      approvedEvents: [{ day: 1, impactPct: 20, label: "Same approved catalyst" }],
    },
  },
  {
    name: "90-day stability - overpriced drift",
    horizon: "90-day",
    input: {
      initialPrice: 120,
      fairValue: 100,
      category: "growth",
      initialMomentumPct: 0,
      days: 90,
    },
  },
];

function toSummaryRow(scenario: string, summary: SimulationSummary): SimulationSummaryRow {
  return {
    scenario,
    startPrice: summary.startingPrice,
    endPrice: summary.endingPrice,
    percentageReturnPct: summary.percentageReturnPct,
    minPrice: summary.minimumPrice,
    maxPrice: summary.maximumPrice,
    cappedDays: summary.numberOfCappedDays,
    finalPriceDifferenceFromFairValuePct: summary.finalPriceDifferenceFromFairValuePct,
  };
}

export function runMarketPricingSimulationSuite(
  scenarios: readonly SimulationScenarioDefinition[] = SIMULATION_SCENARIOS,
): SimulationSuiteOutput {
  const scenarioOutputs = scenarios.map((scenario) => ({
    scenario: scenario.name,
    horizon: scenario.horizon,
    result: simulateMarketMovement(scenario.input),
  }));

  return {
    scenarios: scenarioOutputs,
    summaryRows: scenarioOutputs.map((output) =>
      toSummaryRow(output.scenario, output.result.summary),
    ),
  };
}

export function formatSimulationSummaryTable(rows: readonly SimulationSummaryRow[]): string {
  const headers = [
    "scenario",
    "start",
    "end",
    "returnPct",
    "min",
    "max",
    "cappedDays",
    "priceDifferencePct",
  ];
  const tableRows = rows.map((row) => [
    row.scenario,
    row.startPrice.toFixed(2),
    row.endPrice.toFixed(2),
    row.percentageReturnPct.toFixed(4),
    row.minPrice.toFixed(2),
    row.maxPrice.toFixed(2),
    String(row.cappedDays),
    row.finalPriceDifferenceFromFairValuePct.toFixed(4),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...tableRows.map((row) => row[index].length)),
  );
  const formatRow = (row: readonly string[]): string =>
    row.map((cell, index) => cell.padEnd(widths[index], " ")).join(" | ");

  return [
    formatRow(headers),
    formatRow(widths.map((width) => "-".repeat(width))),
    ...tableRows.map(formatRow),
  ].join("\n");
}
