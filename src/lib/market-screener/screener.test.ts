/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePriceChangePercent,
  selectMarketScreenerPage,
  type MarketScreenerCharacter,
  type MarketScreenerSort,
} from "./screener.ts";

function character(
  id: number,
  overrides: Partial<MarketScreenerCharacter> = {},
): MarketScreenerCharacter {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    slug: `char-${id}`,
    name: `Character ${id}`,
    crew: id % 2 === 0 ? "Straw Hat Pirates" : "Heart Pirates",
    current_price: 100 + id,
    previous_price: 100,
    category: "growth",
    momentum: id,
    display_order: id,
    ...overrides,
  };
}

function page(
  characters: readonly MarketScreenerCharacter[],
  overrides: Partial<Parameters<typeof selectMarketScreenerPage>[0]> = {},
) {
  return selectMarketScreenerPage({
    characters,
    page: 1,
    pageSize: 20,
    q: "",
    sort: "featured",
    category: "all",
    owned: false,
    ...overrides,
  });
}

function ids(characters: readonly MarketScreenerCharacter[]) {
  return characters.map((row) => row.slug);
}

test("featured ordering uses display order, null-last, name, and ID tie-breakers", () => {
  const rows = [
    character(4, { slug: "zoro", name: "Zoro", display_order: null }),
    character(2, { slug: "alpha-b", name: "Alpha", display_order: 2 }),
    character(1, { slug: "alpha-a", name: "Alpha", display_order: 2 }),
    character(3, { slug: "nami", name: "Nami", display_order: 1 }),
    character(5, { slug: "brook", name: "Brook", display_order: null }),
  ];

  assert.deepEqual(ids(page(rows).rows), ["nami", "alpha-a", "alpha-b", "brook", "zoro"]);
});

test("gainers and losers use percentage change instead of absolute movement", () => {
  const rows = [
    character(1, { slug: "big-absolute", current_price: 200, previous_price: 100 }),
    character(2, { slug: "big-percent", current_price: 20, previous_price: 5 }),
    character(3, { slug: "small-loss", current_price: 95, previous_price: 100 }),
    character(4, { slug: "large-loss", current_price: 50, previous_price: 100 }),
  ];

  assert.deepEqual(ids(page(rows, { sort: "gainers" }).rows).slice(0, 2), [
    "big-percent",
    "big-absolute",
  ]);
  assert.deepEqual(ids(page(rows, { sort: "losers" }).rows).slice(0, 2), [
    "large-loss",
    "small-loss",
  ]);
});

test("price sorting supports high-to-low and low-to-high order", () => {
  const rows = [
    character(1, { slug: "mid", current_price: 50 }),
    character(2, { slug: "high", current_price: 100 }),
    character(3, { slug: "low", current_price: 10 }),
  ];

  assert.deepEqual(ids(page(rows, { sort: "price_desc" }).rows), ["high", "mid", "low"]);
  assert.deepEqual(ids(page(rows, { sort: "price_asc" }).rows), ["low", "mid", "high"]);
});

test("momentum sorting supports high-to-low and low-to-high order", () => {
  const rows = [
    character(1, { slug: "flat", momentum: 0 }),
    character(2, { slug: "hot", momentum: 9.25 }),
    character(3, { slug: "cold", momentum: -4.5 }),
  ];

  assert.deepEqual(ids(page(rows, { sort: "momentum_desc" }).rows), ["hot", "flat", "cold"]);
  assert.deepEqual(ids(page(rows, { sort: "momentum_asc" }).rows), ["cold", "flat", "hot"]);
});

test("name sorting supports A-to-Z and Z-to-A order", () => {
  const rows = [
    character(1, { slug: "nami", name: "Nami" }),
    character(2, { slug: "luffy", name: "Monkey D. Luffy" }),
    character(3, { slug: "zoro", name: "Roronoa Zoro" }),
  ];

  assert.deepEqual(ids(page(rows, { sort: "name_asc" }).rows), ["luffy", "nami", "zoro"]);
  assert.deepEqual(ids(page(rows, { sort: "name_desc" }).rows), ["zoro", "nami", "luffy"]);
});

test("category sorting supports stable-to-volatile and volatile-to-stable order", () => {
  const rows = [
    character(1, { slug: "meme", category: "meme" }),
    character(2, { slug: "growth", category: "growth" }),
    character(3, { slug: "blue", category: "blue_chip" }),
    character(4, { slug: "spec", category: "speculative" }),
  ];

  assert.deepEqual(ids(page(rows, { sort: "category_asc" }).rows), [
    "blue",
    "growth",
    "spec",
    "meme",
  ]);
  assert.deepEqual(ids(page(rows, { sort: "category_desc" }).rows), [
    "meme",
    "spec",
    "growth",
    "blue",
  ]);
});

test("search and category filters compose correctly", () => {
  const rows = [
    character(1, { slug: "luffy", name: "Monkey D. Luffy", crew: "Straw Hat Pirates" }),
    character(2, { slug: "nami", name: "Nami", crew: "Straw Hat Pirates", category: "blue_chip" }),
    character(3, {
      slug: "law",
      name: "Trafalgar Law",
      crew: "Heart Pirates",
      category: "blue_chip",
    }),
  ];

  assert.deepEqual(ids(page(rows, { q: "straw", category: "blue_chip" }).rows), ["nami"]);
});

test("owned-only filters against provided authenticated holding slugs", () => {
  const rows = [character(1, { slug: "luffy" }), character(2, { slug: "nami" })];

  assert.deepEqual(ids(page(rows, { owned: true, ownedSlugs: ["NAMI"] }).rows), ["nami"]);
});

test("empty owned portfolios return zero matches", () => {
  const rows = [character(1, { slug: "luffy" })];
  const result = page(rows, { owned: true, ownedSlugs: [] });

  assert.equal(result.total, 0);
  assert.deepEqual(result.rows, []);
});

test("pagination totals and ranges reflect filtered results", () => {
  const rows = Array.from({ length: 12 }, (_, index) =>
    character(index + 1, {
      category: index < 7 ? "growth" : "meme",
      display_order: index + 1,
    }),
  );
  const result = page(rows, { category: "growth", pageSize: 3, page: 2 });

  assert.equal(result.total, 7);
  assert.equal(result.totalPages, 3);
  assert.equal(result.page, 2);
  assert.deepEqual(ids(result.rows), ["char-4", "char-5", "char-6"]);
});

test("pages clamp when filtering reduces the result count", () => {
  const rows = [
    character(1, { category: "growth" }),
    character(2, { category: "growth" }),
    character(3, { category: "meme" }),
  ];
  const result = page(rows, { category: "meme", pageSize: 2, page: 99 });

  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.deepEqual(ids(result.rows), ["char-3"]);
});

test("sorting never mutates the source array", () => {
  const rows = [character(1, { slug: "b", name: "B" }), character(2, { slug: "a", name: "A" })];
  const before = ids(rows);

  page(rows, { sort: "name_asc" });

  assert.deepEqual(ids(rows), before);
});

test("zero or invalid previous prices do not produce nonfinite comparisons", () => {
  const rows = [
    character(1, { slug: "zero", current_price: 100, previous_price: 0 }),
    character(2, { slug: "negative", current_price: 100, previous_price: -5 }),
    character(3, { slug: "normal", current_price: 120, previous_price: 100 }),
  ];

  assert.equal(Number.isFinite(calculatePriceChangePercent(rows[0])), true);
  assert.equal(Number.isFinite(calculatePriceChangePercent(rows[1])), true);
  assert.deepEqual(ids(page(rows, { sort: "gainers" }).rows).slice(0, 1), ["normal"]);
});

test("deterministic tie behavior ends with name and character ID", () => {
  const tied = [
    character(3, {
      slug: "third",
      name: "Tie",
      current_price: 100,
      previous_price: 50,
      momentum: 0,
    }),
    character(1, {
      slug: "first",
      name: "Tie",
      current_price: 100,
      previous_price: 50,
      momentum: 0,
    }),
    character(2, {
      slug: "second",
      name: "Tie",
      current_price: 100,
      previous_price: 50,
      momentum: 0,
    }),
  ];
  const sorts: MarketScreenerSort[] = [
    "gainers",
    "losers",
    "price_desc",
    "price_asc",
    "momentum_desc",
    "momentum_asc",
    "name_asc",
    "name_desc",
    "category_asc",
    "category_desc",
  ];

  for (const sort of sorts) {
    assert.deepEqual(
      ids(page(tied, { sort }).rows),
      ["first", "second", "third"],
      `${sort} should use ID as final deterministic tie-breaker`,
    );
  }
});
