import assert from "node:assert/strict";
import test from "node:test";
import {
  createMarketBulletinWireItems,
  filterWireItems,
  normalizeSpeculationWireItem,
  normalizeWireFeed,
  reportDateToWireTimestamp,
  type WireItem,
} from "./wire.ts";

const news = [
  {
    id: "news-1",
    title: "Editorial dispatch",
    body: "Official desk note.",
    impact: "neutral",
    created_at: "2026-07-12T10:00:00.000Z",
    characters: { slug: "luffy", name: "Monkey D. Luffy" },
  },
];

const catalysts = [
  {
    id: "event-1",
    title: "Battle result confirmed",
    description: "Verified outcome.",
    event_type: "battle_result",
    published_at: "2026-07-12T11:00:00.000Z",
    created_at: "2026-07-12T09:00:00.000Z",
    market_event_impacts: [
      {
        pct_change: "5.25",
        price_before: "100",
        price_after: "105.25",
        characters: { slug: "zoro", name: "Roronoa Zoro" },
      },
    ],
  },
];

const speculation = [
  {
    id: "spec-1",
    title: "Unresolved cover-story theory",
    description: "Community discussion only.",
    status: "active",
    createdAt: "2026-07-12T13:00:00.000Z",
    expiresAt: "2026-07-14T12:00:00.000Z",
    characters: [
      { slug: "robin", name: "Nico Robin" },
      { slug: "robin", name: "Nico Robin" },
      { slug: "chopper", name: "Tony Tony Chopper" },
    ],
  },
];

const latestReport = {
  id: "report-1",
  report_date: "2026-07-12",
  sentiment: "bullish",
  avg_change_pct: "1.5",
  headline: "Daily brief",
  summary: "Market wrap.",
  gainer: { slug: "zoro", name: "Roronoa Zoro" },
  loser: { slug: "buggy", name: "Buggy" },
  trending: { slug: "robin", name: "Nico Robin" },
  discussed: { slug: "robin", name: "Nico Robin" },
};

function kinds(items: WireItem[]) {
  return items.map((item) => item.kind);
}

test("all four Wire item kinds normalize correctly", () => {
  const items = createMarketBulletinWireItems({ news, catalysts, speculation, latestReport });

  assert.deepEqual(new Set(kinds(items)), new Set(["news", "catalyst", "speculation", "report"]));
  assert.equal(items.find((item) => item.kind === "news")?.label, "NEWS");
  assert.equal(items.find((item) => item.kind === "catalyst")?.label, "CATALYST");
  assert.equal(items.find((item) => item.kind === "speculation")?.label, "SPECULATION");
  assert.equal(items.find((item) => item.kind === "report")?.label, "REPORT");
});

test("mixed Wire items sort newest first", () => {
  const items = createMarketBulletinWireItems({ news, catalysts, speculation, latestReport });

  assert.deepEqual(kinds(items), ["speculation", "report", "catalyst", "news"]);
});

test("equal timestamps use deterministic tie-breakers", () => {
  const tiedNews = [
    { ...news[0], id: "news-b", title: "Bravo", created_at: "2026-07-12T10:00:00.000Z" },
    { ...news[0], id: "news-a", title: "Alpha", created_at: "2026-07-12T10:00:00.000Z" },
  ];

  const items = createMarketBulletinWireItems({
    news: tiedNews,
    catalysts: [{ ...catalysts[0], published_at: "2026-07-12T10:00:00.000Z" }],
    speculation: [],
    latestReport: null,
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ["event-1", "news-a", "news-b"],
  );
});

test("Wire filters return only the requested kind", () => {
  const items = createMarketBulletinWireItems({ news, catalysts, speculation, latestReport });

  assert.deepEqual(kinds(filterWireItems(items, "news")), ["news"]);
  assert.deepEqual(kinds(filterWireItems(items, "catalysts")), ["catalyst"]);
  assert.deepEqual(kinds(filterWireItems(items, "speculation")), ["speculation"]);
  assert.deepEqual(kinds(filterWireItems(items, "reports")), ["report"]);
});

test("all filter returns every item and invalid filters normalize to all", () => {
  const items = createMarketBulletinWireItems({ news, catalysts, speculation, latestReport });

  assert.equal(normalizeWireFeed("nonsense"), "all");
  assert.equal(normalizeWireFeed(undefined), "all");
  assert.deepEqual(filterWireItems(items, "all"), items);
});

test("speculation normalization omits legacy movement and price fields", () => {
  const item = normalizeSpeculationWireItem({
    ...speculation[0],
    pct_change: 12,
    price_before: 100,
    price_after: 112,
  } as never);

  assert.equal("pctChange" in item, false);
  assert.equal("priceBefore" in item, false);
  assert.equal("priceAfter" in item, false);
});

test("speculation character associations are deduplicated deterministically", () => {
  const item = normalizeSpeculationWireItem(speculation[0]);

  assert.deepEqual(item.characters, [
    { slug: "robin", name: "Nico Robin" },
    { slug: "chopper", name: "Tony Tony Chopper" },
  ]);
});

test("date-only reports keep the displayed calendar date stable", () => {
  assert.equal(reportDateToWireTimestamp("2026-07-12"), "2026-07-12T12:00:00.000Z");

  const [item] = filterWireItems(
    createMarketBulletinWireItems({ news: [], catalysts: [], speculation: [], latestReport }),
    "reports",
  );

  assert.equal(item?.kind, "report");
  assert.equal(item?.timestamp, "2026-07-12");
  assert.equal(item?.sortTimestamp, "2026-07-12T12:00:00.000Z");
});

test("missing optional values produce safe normalized output", () => {
  const items = createMarketBulletinWireItems({
    news: [{ id: "news-empty", title: "Minimal", created_at: null }],
    catalysts: [{ id: "event-empty", title: "Minimal catalyst", market_event_impacts: null }],
    speculation: [{ id: "spec-empty", title: "Minimal speculation", characters: null }],
    latestReport: null,
  });

  assert.equal(items.find((item) => item.id === "news-empty")?.timestamp, "");
  assert.equal(items.find((item) => item.id === "event-empty")?.characters.length, 0);
  assert.equal(items.find((item) => item.id === "spec-empty")?.characters.length, 0);
});
