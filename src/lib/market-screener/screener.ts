export const MARKET_SCREENER_SORTS = [
  "featured",
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
] as const;

export type MarketScreenerSort = (typeof MARKET_SCREENER_SORTS)[number];

export const MARKET_SCREENER_CATEGORIES = [
  "all",
  "blue_chip",
  "growth",
  "speculative",
  "meme",
] as const;

export type MarketScreenerCategory = (typeof MARKET_SCREENER_CATEGORIES)[number];

export type MarketScreenerCharacterCategory = Exclude<MarketScreenerCategory, "all">;

export type MarketScreenerCharacter = {
  id: string;
  slug: string;
  name: string;
  crew: string | null;
  current_price: number;
  previous_price: number;
  category: MarketScreenerCharacterCategory;
  momentum: number;
  display_order: number | null;
};

export type MarketScreenerInput<TCharacter extends MarketScreenerCharacter> = {
  characters: readonly TCharacter[];
  page: number;
  pageSize: number;
  q: string;
  sort: MarketScreenerSort;
  category: MarketScreenerCategory;
  owned: boolean;
  ownedSlugs?: ReadonlySet<string> | readonly string[];
};

export type MarketScreenerPage<TCharacter extends MarketScreenerCharacter> = {
  rows: TCharacter[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const CATEGORY_ORDER: Record<MarketScreenerCharacterCategory, number> = {
  blue_chip: 0,
  growth: 1,
  speculative: 2,
  meme: 3,
};

const sortSet = new Set<string>(MARKET_SCREENER_SORTS);
const categorySet = new Set<string>(MARKET_SCREENER_CATEGORIES);

export function normalizeMarketScreenerSort(value: unknown): MarketScreenerSort {
  return typeof value === "string" && sortSet.has(value)
    ? (value as MarketScreenerSort)
    : "featured";
}

export function normalizeMarketScreenerCategory(value: unknown): MarketScreenerCategory {
  return typeof value === "string" && categorySet.has(value)
    ? (value as MarketScreenerCategory)
    : "all";
}

export function calculatePriceChangePercent(character: {
  current_price: number;
  previous_price: number;
}) {
  const current = Number(character.current_price);
  const previous = Number(character.previous_price);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function numberValue(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function compareNumber(a: number, b: number, direction: "asc" | "desc") {
  const left = numberValue(a);
  const right = numberValue(b);
  if (left === right) return 0;
  return direction === "asc" ? left - right : right - left;
}

function compareNameThenId(a: MarketScreenerCharacter, b: MarketScreenerCharacter) {
  const name = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (name !== 0) return name;
  return a.id.localeCompare(b.id);
}

function compareFeatured(a: MarketScreenerCharacter, b: MarketScreenerCharacter) {
  const aOrder = a.display_order ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.display_order ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return compareNameThenId(a, b);
}

function compareBySort(sort: MarketScreenerSort) {
  return (a: MarketScreenerCharacter, b: MarketScreenerCharacter) => {
    let primary = 0;

    switch (sort) {
      case "featured":
        return compareFeatured(a, b);
      case "gainers":
        primary = compareNumber(
          calculatePriceChangePercent(a),
          calculatePriceChangePercent(b),
          "desc",
        );
        break;
      case "losers":
        primary = compareNumber(
          calculatePriceChangePercent(a),
          calculatePriceChangePercent(b),
          "asc",
        );
        break;
      case "price_desc":
        primary = compareNumber(a.current_price, b.current_price, "desc");
        break;
      case "price_asc":
        primary = compareNumber(a.current_price, b.current_price, "asc");
        break;
      case "momentum_desc":
        primary = compareNumber(a.momentum, b.momentum, "desc");
        break;
      case "momentum_asc":
        primary = compareNumber(a.momentum, b.momentum, "asc");
        break;
      case "name_asc":
        primary = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        break;
      case "name_desc":
        primary = b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
        break;
      case "category_asc":
        primary = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
        break;
      case "category_desc":
        primary = CATEGORY_ORDER[b.category] - CATEGORY_ORDER[a.category];
        break;
    }

    if (primary !== 0) return primary;
    return compareNameThenId(a, b);
  };
}

function ownedSlugSet(ownedSlugs: MarketScreenerInput<MarketScreenerCharacter>["ownedSlugs"]) {
  if (!ownedSlugs) return new Set<string>();
  const values = ownedSlugs instanceof Set ? [...ownedSlugs] : [...ownedSlugs];
  return new Set(values.map((slug) => slug.toLowerCase()));
}

export function selectMarketScreenerPage<TCharacter extends MarketScreenerCharacter>(
  input: MarketScreenerInput<TCharacter>,
): MarketScreenerPage<TCharacter> {
  const query = input.q.trim().toLowerCase();
  const heldSlugs = ownedSlugSet(input.ownedSlugs);

  const filtered = input.characters.filter((character) => {
    if (query) {
      const haystack = `${character.name} ${character.slug} ${character.crew ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (input.category !== "all" && character.category !== input.category) return false;
    if (input.owned && !heldSlugs.has(character.slug.toLowerCase())) return false;

    return true;
  });

  const sorted = filtered.slice().sort(compareBySort(input.sort));
  const total = sorted.length;
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number.isFinite(input.page) ? Math.floor(input.page) : 1;
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;

  return {
    rows: sorted.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}
