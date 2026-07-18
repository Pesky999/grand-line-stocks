/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const homeSource = readFileSync(join(process.cwd(), "src/routes/index.tsx"), "utf8");
const marketApiSource = readFileSync(
  join(process.cwd(), "src/lib/api/market.functions.ts"),
  "utf8",
);

test("homepage market screener validates URL-backed state", () => {
  assert.match(
    homeSource,
    /type MarketSearch = \{[\s\S]*page\?: number;[\s\S]*q\?: string;[\s\S]*sort\?: MarketScreenerSort;[\s\S]*category\?: MarketScreenerCategory;[\s\S]*owned\?: boolean;/,
  );
  assert.match(homeSource, /page = 1,[\s\S]*q = "",[\s\S]*sort = "featured"/);
  assert.match(homeSource, /normalizeMarketScreenerSort\(raw\.sort\)/);
  assert.match(homeSource, /normalizeMarketScreenerCategory\(raw\.category\)/);
  assert.match(homeSource, /raw\.owned === true \|\| raw\.owned === "true"/);
  assert.match(homeSource, /const q = rawQ\.slice\(0, 80\)/);
});

test("homepage screener controls reset pagination and preserve URL state", () => {
  assert.match(
    homeSource,
    /navigate\(\{[\s\S]*search: \(prev: MarketSearch\) => \(\{ \.\.\.prev, q: trimmed, page: 1 \}\),[\s\S]*replace: true/,
  );
  assert.match(
    homeSource,
    /\.\.\.prev,[\s\S]*sort: event\.target\.value as MarketScreenerSort,[\s\S]*page: 1/,
  );
  assert.match(
    homeSource,
    /\.\.\.prev,[\s\S]*category: event\.target\.value as MarketScreenerCategory,[\s\S]*page: 1/,
  );
  assert.match(homeSource, /\.\.\.prev,[\s\S]*owned: event\.target\.checked,[\s\S]*page: 1/);
  assert.match(
    homeSource,
    /search: \(\) => \(\{[\s\S]*page: 1,[\s\S]*q: "",[\s\S]*sort: "featured",[\s\S]*category: "all",[\s\S]*owned: false/,
  );
});

test("homepage uses existing character and holdings queries as screener inputs", () => {
  assert.match(homeSource, /queryKey: \["characters"\]/);
  assert.match(homeSource, /queryFn: \(\) => listCharacters\(\)/);
  assert.match(
    homeSource,
    /const \{ data: me, user, authLoading, isLoading: meLoading \} = useMe\(\)/,
  );
  assert.match(homeSource, /me\?\.holdings \?\? \[\]/);
  assert.match(homeSource, /holding\.slug\.toLowerCase\(\), holding\.shares/);
  assert.match(homeSource, /ownedSlugs/);
  assert.match(homeSource, /formatShares\(heldShares\)/);
});

test("homepage handles owned-only auth and loading states without URL-trusting ownership", () => {
  assert.match(homeSource, /if \(!authLoading && !user && owned\)/);
  assert.match(homeSource, /owned: false, page: 1/);
  assert.match(
    homeSource,
    /const ownedDataPending = owned && \(authLoading \|\| \(!!user && meLoading\)\)/,
  );
  assert.match(homeSource, /if \(ownedDataPending\) return null/);
  assert.match(homeSource, /Loading your holdings\.\.\./);
  assert.match(homeSource, /You do not own any stocks yet\./);
  assert.doesNotMatch(homeSource, /ownedSlugs.*Route\.useSearch/s);
});

test("market page no longer issues a redundant page query or quick-trade controls", () => {
  assert.doesNotMatch(homeSource, /listMarketPage|marketPageQO|\["market", "page"/);
  assert.doesNotMatch(marketApiSource, /listMarketPage|marketPageInput|MarketPageRow/);
  assert.doesNotMatch(homeSource, /buyShares|sellShares|Max Buy|Max Sell|Trade value/);
});
