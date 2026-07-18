import { normalizeShareQuantityText } from "./fractional-shares.ts";

export const TRADE_REQUEST_ID_TTL_MS = 24 * 60 * 60 * 1000;

const STORAGE_KEY_PREFIX = "grand-line-stocks:trade-request";
const STORAGE_VERSION = 1;

export type TradeSide = "buy" | "sell";

export type TradeRequestIntent = {
  userId: string;
  slug: string;
  side: TradeSide;
  shares: number;
};

type TradeRequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

type TradeRequestOptions = {
  storage?: TradeRequestStorage | null;
  now?: number;
  generateRequestId?: () => string;
};

type NormalizedTradeRequestIntent = {
  userId: string;
  slug: string;
  side: TradeSide;
  quantity: string;
};

type StoredTradeRequest = NormalizedTradeRequestIntent & {
  version: typeof STORAGE_VERSION;
  requestId: string;
  createdAt: number;
};

function normalizeIntent(intent: TradeRequestIntent): NormalizedTradeRequestIntent | null {
  const userId = intent.userId.trim();
  const slug = intent.slug.trim().toLowerCase();
  const quantity = normalizeShareQuantityText(intent.shares);

  if (!userId || !slug || !quantity) return null;
  if (intent.side !== "buy" && intent.side !== "sell") return null;

  return { userId, slug, side: intent.side, quantity };
}

function storageKeyFor(intent: NormalizedTradeRequestIntent) {
  return [
    STORAGE_KEY_PREFIX,
    encodeURIComponent(intent.userId),
    encodeURIComponent(intent.slug),
    intent.side,
    intent.quantity,
  ].join(":");
}

export function getTradeRequestStorageKey(intent: TradeRequestIntent) {
  const normalized = normalizeIntent(intent);
  return normalized ? storageKeyFor(normalized) : null;
}

function getBrowserSessionStorage(): TradeRequestStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getStorage(options: TradeRequestOptions): TradeRequestStorage | null {
  if ("storage" in options) return options.storage ?? null;
  return getBrowserSessionStorage();
}

function generateRequestId(options: TradeRequestOptions) {
  if (options.generateRequestId) return options.generateRequestId();
  return crypto.randomUUID();
}

function parseStoredTradeRequest(value: string | null): StoredTradeRequest | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredTradeRequest>;
    if (parsed.version !== STORAGE_VERSION) return null;
    if (parsed.side !== "buy" && parsed.side !== "sell") return null;
    if (typeof parsed.userId !== "string" || parsed.userId.trim() === "") return null;
    if (typeof parsed.slug !== "string" || parsed.slug.trim() === "") return null;
    if (typeof parsed.quantity !== "string" || parsed.quantity.trim() === "") return null;
    if (typeof parsed.requestId !== "string" || parsed.requestId.trim() === "") return null;
    if (typeof parsed.createdAt !== "number" || !Number.isFinite(parsed.createdAt)) return null;

    return {
      version: STORAGE_VERSION,
      userId: parsed.userId,
      slug: parsed.slug,
      side: parsed.side,
      quantity: parsed.quantity,
      requestId: parsed.requestId,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function isExpired(record: StoredTradeRequest, now: number) {
  return now - record.createdAt > TRADE_REQUEST_ID_TTL_MS;
}

function removeStorageItem(storage: TradeRequestStorage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Session storage can fail in restricted browser modes. Trading still uses
    // database idempotency; this just drops the local retry hint.
  }
}

function pruneStoredTradeRequests(storage: TradeRequestStorage, now: number) {
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;

      const record = parseStoredTradeRequest(storage.getItem(key));
      if (!record || isExpired(record, now)) removeStorageItem(storage, key);
    }
  } catch {
    // Treat storage inspection failures as unavailable storage.
  }
}

function isStoredRequestForIntent(
  record: StoredTradeRequest,
  intent: NormalizedTradeRequestIntent,
  now: number,
) {
  return (
    !isExpired(record, now) &&
    record.userId === intent.userId &&
    record.slug === intent.slug &&
    record.side === intent.side &&
    record.quantity === intent.quantity
  );
}

export function getOrCreateTradeRequestId(
  intent: TradeRequestIntent,
  options: TradeRequestOptions = {},
) {
  const normalized = normalizeIntent(intent);
  if (!normalized) {
    throw new Error("Invalid trade request intent");
  }

  const now = options.now ?? Date.now();
  const storage = getStorage(options);
  if (!storage) return generateRequestId(options);

  const key = storageKeyFor(normalized);
  let requestId: string | null = null;

  try {
    pruneStoredTradeRequests(storage, now);

    const existing = parseStoredTradeRequest(storage.getItem(key));
    if (existing && isStoredRequestForIntent(existing, normalized, now)) {
      return existing.requestId;
    }

    if (existing) removeStorageItem(storage, key);

    requestId = generateRequestId(options);
    const record: StoredTradeRequest = {
      version: STORAGE_VERSION,
      ...normalized,
      requestId,
      createdAt: now,
    };
    storage.setItem(key, JSON.stringify(record));
    return requestId;
  } catch {
    return requestId ?? generateRequestId(options);
  }
}

export function clearTradeRequestId(intent: TradeRequestIntent, options: TradeRequestOptions = {}) {
  const normalized = normalizeIntent(intent);
  if (!normalized) return;

  const storage = getStorage(options);
  if (!storage) return;

  removeStorageItem(storage, storageKeyFor(normalized));
}

export function isTradeRequestPayloadConflictError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /request id was already used for a different trade/i.test(message);
}

export function clearTradeRequestIdForPayloadConflict(
  error: unknown,
  intent: TradeRequestIntent,
  options: TradeRequestOptions = {},
) {
  if (!isTradeRequestPayloadConflictError(error)) return false;
  clearTradeRequestId(intent, options);
  return true;
}
