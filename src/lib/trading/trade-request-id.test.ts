/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  TRADE_REQUEST_ID_TTL_MS,
  clearTradeRequestId,
  clearTradeRequestIdForPayloadConflict,
  getOrCreateTradeRequestId,
  getTradeRequestStorageKey,
  type TradeRequestIntent,
} from "./trade-request-id.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const baseIntent: TradeRequestIntent = {
  userId: "user-a",
  slug: "luffy",
  side: "buy",
  shares: 1,
};

function ids(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `generated-${index}`;
}

test("first payload creates a request ID and exact payload reuses it", () => {
  const storage = new MemoryStorage();
  const first = getOrCreateTradeRequestId(baseIntent, {
    storage,
    now: 1_000,
    generateRequestId: ids("request-1", "request-2"),
  });
  const second = getOrCreateTradeRequestId(baseIntent, {
    storage,
    now: 2_000,
    generateRequestId: ids("request-2"),
  });

  assert.equal(first, "request-1");
  assert.equal(second, "request-1");
});

test("equivalent 1 and 1.00 quantities map to the same pending request", () => {
  const storage = new MemoryStorage();
  const first = getOrCreateTradeRequestId(baseIntent, {
    storage,
    now: 1_000,
    generateRequestId: ids("request-1"),
  });
  const second = getOrCreateTradeRequestId(
    { ...baseIntent, shares: 1.0 },
    { storage, now: 2_000, generateRequestId: ids("request-2") },
  );

  assert.equal(first, "request-1");
  assert.equal(second, "request-1");
});

test("different quantity, side, character, or user creates a new request ID", () => {
  const storage = new MemoryStorage();
  const generateRequestId = ids(
    "request-base",
    "request-quantity",
    "request-side",
    "request-character",
    "request-user",
  );

  assert.equal(
    getOrCreateTradeRequestId(baseIntent, { storage, generateRequestId }),
    "request-base",
  );
  assert.equal(
    getOrCreateTradeRequestId({ ...baseIntent, shares: 1.25 }, { storage, generateRequestId }),
    "request-quantity",
  );
  assert.equal(
    getOrCreateTradeRequestId({ ...baseIntent, side: "sell" }, { storage, generateRequestId }),
    "request-side",
  );
  assert.equal(
    getOrCreateTradeRequestId({ ...baseIntent, slug: "zoro" }, { storage, generateRequestId }),
    "request-character",
  );
  assert.equal(
    getOrCreateTradeRequestId({ ...baseIntent, userId: "user-b" }, { storage, generateRequestId }),
    "request-user",
  );
});

test("successful completion clears the pending request", () => {
  const storage = new MemoryStorage();
  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000,
      generateRequestId: ids("request-1"),
    }),
    "request-1",
  );

  clearTradeRequestId(baseIntent, { storage });

  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 2_000,
      generateRequestId: ids("request-2"),
    }),
    "request-2",
  );
});

test("payload conflict clears the unusable pending request", () => {
  const storage = new MemoryStorage();
  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000,
      generateRequestId: ids("request-1"),
    }),
    "request-1",
  );

  assert.equal(
    clearTradeRequestIdForPayloadConflict(
      new Error("Trade request ID was already used for a different trade"),
      baseIntent,
      { storage },
    ),
    true,
  );

  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 2_000,
      generateRequestId: ids("request-2"),
    }),
    "request-2",
  );
});

test("expired records are discarded", () => {
  const storage = new MemoryStorage();
  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000,
      generateRequestId: ids("request-1"),
    }),
    "request-1",
  );

  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000 + TRADE_REQUEST_ID_TTL_MS + 1,
      generateRequestId: ids("request-2"),
    }),
    "request-2",
  );
});

test("malformed storage is discarded", () => {
  const storage = new MemoryStorage();
  const key = getTradeRequestStorageKey(baseIntent);
  assert.ok(key);
  storage.setItem(key, "{not-json");

  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000,
      generateRequestId: ids("request-1"),
    }),
    "request-1",
  );
  assert.match(storage.getItem(key) ?? "", /request-1/);
});

test("unavailable session storage degrades safely without crashing", () => {
  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage: null,
      generateRequestId: ids("request-1"),
    }),
    "request-1",
  );
});
