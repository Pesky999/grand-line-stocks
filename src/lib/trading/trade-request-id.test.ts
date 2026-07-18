/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  TRADE_REQUEST_ID_FUTURE_SKEW_MS,
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

const REQUEST_1 = "00000000-0000-4000-8000-000000000001";
const REQUEST_2 = "00000000-0000-4000-8000-000000000002";
const REQUEST_BASE = "00000000-0000-4000-8000-000000000003";
const REQUEST_QUANTITY = "00000000-0000-4000-8000-000000000004";
const REQUEST_SIDE = "00000000-0000-4000-8000-000000000005";
const REQUEST_CHARACTER = "00000000-0000-4000-8000-000000000006";
const REQUEST_USER = "00000000-0000-4000-8000-000000000007";
const REQUEST_FALLBACK = "00000000-0000-4000-8000-000000000008";

function ids(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

test("first payload creates a request ID and exact payload reuses it", () => {
  const storage = new MemoryStorage();
  const first = getOrCreateTradeRequestId(baseIntent, {
    storage,
    now: 1_000,
    generateRequestId: ids(REQUEST_1, REQUEST_2),
  });
  const second = getOrCreateTradeRequestId(baseIntent, {
    storage,
    now: 2_000,
    generateRequestId: ids(REQUEST_2),
  });

  assert.equal(first, REQUEST_1);
  assert.equal(second, REQUEST_1);
});

test("equivalent 1 and 1.00 quantities map to the same pending request", () => {
  const storage = new MemoryStorage();
  const first = getOrCreateTradeRequestId(baseIntent, {
    storage,
    now: 1_000,
    generateRequestId: ids(REQUEST_1),
  });
  const second = getOrCreateTradeRequestId(
    { ...baseIntent, shares: 1.0 },
    { storage, now: 2_000, generateRequestId: ids(REQUEST_2) },
  );

  assert.equal(first, REQUEST_1);
  assert.equal(second, REQUEST_1);
});

test("different quantity, side, character, or user creates a new request ID", () => {
  const storage = new MemoryStorage();
  const generateRequestId = ids(
    REQUEST_BASE,
    REQUEST_QUANTITY,
    REQUEST_SIDE,
    REQUEST_CHARACTER,
    REQUEST_USER,
  );

  assert.equal(getOrCreateTradeRequestId(baseIntent, { storage, generateRequestId }), REQUEST_BASE);
  assert.equal(
    getOrCreateTradeRequestId({ ...baseIntent, shares: 1.25 }, { storage, generateRequestId }),
    REQUEST_QUANTITY,
  );
  assert.equal(
    getOrCreateTradeRequestId({ ...baseIntent, side: "sell" }, { storage, generateRequestId }),
    REQUEST_SIDE,
  );
  assert.equal(
    getOrCreateTradeRequestId({ ...baseIntent, slug: "zoro" }, { storage, generateRequestId }),
    REQUEST_CHARACTER,
  );
  assert.equal(
    getOrCreateTradeRequestId({ ...baseIntent, userId: "user-b" }, { storage, generateRequestId }),
    REQUEST_USER,
  );
});

test("successful completion clears the pending request", () => {
  const storage = new MemoryStorage();
  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000,
      generateRequestId: ids(REQUEST_1),
    }),
    REQUEST_1,
  );

  clearTradeRequestId(baseIntent, { storage });

  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 2_000,
      generateRequestId: ids(REQUEST_2),
    }),
    REQUEST_2,
  );
});

test("payload conflict clears the unusable pending request", () => {
  const storage = new MemoryStorage();
  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000,
      generateRequestId: ids(REQUEST_1),
    }),
    REQUEST_1,
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
      generateRequestId: ids(REQUEST_2),
    }),
    REQUEST_2,
  );
});

test("expired records are discarded", () => {
  const storage = new MemoryStorage();
  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000,
      generateRequestId: ids(REQUEST_1),
    }),
    REQUEST_1,
  );

  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 1_000 + TRADE_REQUEST_ID_TTL_MS + 1,
      generateRequestId: ids(REQUEST_2),
    }),
    REQUEST_2,
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
      generateRequestId: ids(REQUEST_1),
    }),
    REQUEST_1,
  );
  assert.match(storage.getItem(key) ?? "", new RegExp(REQUEST_1));
});

test("stored request IDs must be valid UUIDs", () => {
  const storage = new MemoryStorage();
  const key = getTradeRequestStorageKey(baseIntent);
  assert.ok(key);
  storage.setItem(
    key,
    JSON.stringify({
      version: 1,
      userId: "user-a",
      slug: "luffy",
      side: "buy",
      quantity: "1",
      requestId: "not-a-uuid",
      createdAt: 1_000,
    }),
  );

  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage,
      now: 2_000,
      generateRequestId: ids(REQUEST_1),
    }),
    REQUEST_1,
  );
});

test("stored request timestamps must be finite, nonnegative, and not unreasonably future", () => {
  for (const createdAt of [Number.NaN, -1, 1_000 + TRADE_REQUEST_ID_FUTURE_SKEW_MS + 1]) {
    const storage = new MemoryStorage();
    const key = getTradeRequestStorageKey(baseIntent);
    assert.ok(key);
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: "user-a",
        slug: "luffy",
        side: "buy",
        quantity: "1",
        requestId: REQUEST_1,
        createdAt,
      }),
    );

    assert.equal(
      getOrCreateTradeRequestId(baseIntent, {
        storage,
        now: 1_000,
        generateRequestId: ids(REQUEST_2),
      }),
      REQUEST_2,
    );
  }
});

test("generated request IDs must be valid UUIDs", () => {
  assert.throws(
    () =>
      getOrCreateTradeRequestId(baseIntent, {
        storage: null,
        generateRequestId: ids("not-a-uuid"),
      }),
    /valid UUID/,
  );
});

test("unavailable session storage degrades safely without crashing", () => {
  assert.equal(
    getOrCreateTradeRequestId(baseIntent, {
      storage: null,
      generateRequestId: ids(REQUEST_FALLBACK),
    }),
    REQUEST_FALLBACK,
  );
});
