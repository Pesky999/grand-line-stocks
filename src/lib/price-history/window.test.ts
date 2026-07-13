/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CHARACTER_PRICE_HISTORY_WINDOW,
  selectLatestPriceHistoryWindowForChart,
  type CharacterPriceHistoryPoint,
} from "./window.ts";

function historyPoint(index: number): CharacterPriceHistoryPoint {
  return {
    id: `history-${String(index).padStart(4, "0")}`,
    price: index,
    note: `point ${index}`,
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  };
}

test("price history window selects the newest records when history exceeds the limit", () => {
  const rows = Array.from({ length: CHARACTER_PRICE_HISTORY_WINDOW + 5 }, (_, index) =>
    historyPoint(index),
  );

  const selected = selectLatestPriceHistoryWindowForChart(rows);

  assert.equal(selected.length, CHARACTER_PRICE_HISTORY_WINDOW);
  assert.equal(selected[0].id, "history-0005");
  assert.equal(
    selected.at(-1)?.id,
    `history-${String(CHARACTER_PRICE_HISTORY_WINDOW + 4).padStart(4, "0")}`,
  );
  assert.equal(
    selected.some((row) => row.id === "history-0000"),
    false,
  );
});

test("price history window returns chart data oldest-to-newest", () => {
  const rows = [historyPoint(3), historyPoint(1), historyPoint(2)];

  const selected = selectLatestPriceHistoryWindowForChart(rows);

  assert.deepEqual(
    selected.map((row) => row.id),
    ["history-0001", "history-0002", "history-0003"],
  );
});

test("price history window preserves complete smaller history and empty history", () => {
  const rows = [historyPoint(2), historyPoint(0), historyPoint(1)];

  assert.deepEqual(
    selectLatestPriceHistoryWindowForChart(rows).map((row) => row.id),
    ["history-0000", "history-0001", "history-0002"],
  );
  assert.deepEqual(selectLatestPriceHistoryWindowForChart([]), []);
});

test("price history window handles tied timestamps deterministically", () => {
  const created_at = "2026-07-12T00:00:00.000Z";
  const rows: CharacterPriceHistoryPoint[] = [
    { id: "history-b", price: 2, note: null, created_at },
    { id: "history-c", price: 3, note: null, created_at },
    { id: "history-a", price: 1, note: null, created_at },
  ];

  const selected = selectLatestPriceHistoryWindowForChart(rows, 2);

  assert.deepEqual(
    selected.map((row) => row.id),
    ["history-b", "history-c"],
  );
});

test("character API fetches newest price history first and returns a chronological chart window", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/api/market.functions.ts"), "utf8");
  const historyQuery = source.match(
    /const \{ data: historyRows, error: historyError \} = await db[\s\S]*?\.returns<CharacterPriceHistoryPoint\[\]>\(\);/,
  )?.[0];

  assert.ok(historyQuery, "character history query should exist");
  assert.match(historyQuery, /\.select\("id,price,note,created_at"\)/);
  assert.match(historyQuery, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(historyQuery, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(historyQuery, /\.limit\(CHARACTER_PRICE_HISTORY_WINDOW\)/);
  assert.doesNotMatch(historyQuery, /\.limit\(200\)/);
  assert.match(source, /if \(historyError\) throw historyError;/);
  assert.match(source, /const history = priceHistoryRowsSchema\.parse\(historyRows \?\? \[\]\);/);
  assert.match(source, /selectLatestPriceHistoryWindowForChart\(history\)/);
});
