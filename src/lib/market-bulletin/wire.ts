export const WIRE_FEEDS = ["all", "news", "catalysts", "speculation", "reports"] as const;

export type WireFeed = (typeof WIRE_FEEDS)[number];
export type WireItemKind = "news" | "catalyst" | "speculation" | "report";

export type WireCharacter = {
  slug: string;
  name: string;
};

type MaybeLinkedCharacter = {
  slug?: string | null;
  name?: string | null;
} | null;

export type NewsWireSource = {
  id: string;
  title: string;
  body?: string | null;
  impact?: string | null;
  created_at?: string | null;
  characters?: MaybeLinkedCharacter;
};

export type CatalystWireSource = {
  id: string;
  title: string;
  description?: string | null;
  event_type?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  market_event_impacts?: Array<{
    pct_change?: number | string | null;
    price_before?: number | string | null;
    price_after?: number | string | null;
    characters?: MaybeLinkedCharacter;
  }> | null;
};

export type SpeculationWireSource = {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  characters?: WireCharacter[] | null;
};

export type ReportWireSource = {
  id?: string | null;
  report_date?: string | null;
  sentiment?: string | null;
  avg_change_pct?: number | string | null;
  headline?: string | null;
  summary?: string | null;
  gainer?: MaybeLinkedCharacter;
  loser?: MaybeLinkedCharacter;
  trending?: MaybeLinkedCharacter;
  discussed?: MaybeLinkedCharacter;
};

type WireItemBase = {
  id: string;
  kind: WireItemKind;
  label: "NEWS" | "CATALYST" | "SPECULATION" | "REPORT";
  timestamp: string;
  sortTimestamp: string;
  title: string;
  characters: WireCharacter[];
};

export type NewsWireItem = WireItemBase & {
  kind: "news";
  label: "NEWS";
  body: string;
  impact: string | null;
  character: WireCharacter | null;
};

export type CatalystWireItem = WireItemBase & {
  kind: "catalyst";
  label: "CATALYST";
  description: string;
  eventType: string;
  impacts: Array<{
    pctChange: number;
    priceBefore: number | null;
    priceAfter: number | null;
    character: WireCharacter | null;
  }>;
};

export type SpeculationWireItem = WireItemBase & {
  kind: "speculation";
  label: "SPECULATION";
  description: string;
  status: string;
  expiresAt: string | null;
};

export type ReportWireItem = WireItemBase & {
  kind: "report";
  label: "REPORT";
  reportDate: string;
  sentiment: string;
  avgChangePct: number;
  summary: string;
};

export type WireItem = NewsWireItem | CatalystWireItem | SpeculationWireItem | ReportWireItem;

const KIND_ORDER: Record<WireItemKind, number> = {
  catalyst: 0,
  news: 1,
  report: 2,
  speculation: 3,
};

const FEED_KIND: Record<Exclude<WireFeed, "all">, WireItemKind> = {
  news: "news",
  catalysts: "catalyst",
  speculation: "speculation",
  reports: "report",
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function linkedCharacter(value: MaybeLinkedCharacter | undefined): WireCharacter | null {
  if (!value?.slug) return null;
  return {
    slug: value.slug,
    name: value.name || value.slug,
  };
}

export function dedupeWireCharacters(
  characters: Array<WireCharacter | null | undefined>,
): WireCharacter[] {
  const bySlug = new Map<string, WireCharacter>();
  for (const character of characters) {
    if (character?.slug) bySlug.set(character.slug, character);
  }
  return [...bySlug.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug),
  );
}

export function normalizeWireFeed(value: unknown): WireFeed {
  return WIRE_FEEDS.includes(value as WireFeed) ? (value as WireFeed) : "all";
}

export function reportDateToWireTimestamp(reportDate: string): string {
  return `${reportDate}T12:00:00.000Z`;
}

export function normalizeNewsWireItem(row: NewsWireSource): NewsWireItem {
  const character = linkedCharacter(row.characters);
  const timestamp = row.created_at ?? "";
  return {
    id: row.id,
    kind: "news",
    label: "NEWS",
    timestamp,
    sortTimestamp: timestamp,
    title: cleanText(row.title),
    body: cleanText(row.body),
    impact: row.impact ?? null,
    character,
    characters: character ? [character] : [],
  };
}

export function normalizeCatalystWireItem(row: CatalystWireSource): CatalystWireItem {
  const timestamp = row.published_at ?? row.created_at ?? "";
  const impacts = (row.market_event_impacts ?? []).map((impact) => ({
    pctChange: toNumber(impact.pct_change),
    priceBefore: toNullableNumber(impact.price_before),
    priceAfter: toNullableNumber(impact.price_after),
    character: linkedCharacter(impact.characters),
  }));

  return {
    id: row.id,
    kind: "catalyst",
    label: "CATALYST",
    timestamp,
    sortTimestamp: timestamp,
    title: cleanText(row.title),
    description: cleanText(row.description),
    eventType: cleanText(row.event_type),
    impacts,
    characters: dedupeWireCharacters(impacts.map((impact) => impact.character)),
  };
}

export function normalizeSpeculationWireItem(row: SpeculationWireSource): SpeculationWireItem {
  const timestamp = row.createdAt ?? "";
  return {
    id: row.id,
    kind: "speculation",
    label: "SPECULATION",
    timestamp,
    sortTimestamp: timestamp,
    title: cleanText(row.title),
    description: cleanText(row.description),
    status: row.status ?? "active",
    expiresAt: row.expiresAt ?? null,
    characters: dedupeWireCharacters(row.characters ?? []),
  };
}

export function normalizeReportWireItem(row: ReportWireSource | null): ReportWireItem | null {
  if (!row?.report_date) return null;
  const reportDate = row.report_date;
  return {
    id: row.id ?? `report-${reportDate}`,
    kind: "report",
    label: "REPORT",
    timestamp: reportDate,
    sortTimestamp: reportDateToWireTimestamp(reportDate),
    title: cleanText(row.headline),
    summary: cleanText(row.summary),
    reportDate,
    sentiment: row.sentiment ?? "neutral",
    avgChangePct: toNumber(row.avg_change_pct),
    characters: dedupeWireCharacters([
      linkedCharacter(row.gainer),
      linkedCharacter(row.loser),
      linkedCharacter(row.trending),
      linkedCharacter(row.discussed),
    ]),
  };
}

export function compareWireItemsNewestFirst(a: WireItem, b: WireItem): number {
  const timestampCompare = b.sortTimestamp.localeCompare(a.sortTimestamp);
  if (timestampCompare !== 0) return timestampCompare;

  const kindCompare = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (kindCompare !== 0) return kindCompare;

  const titleCompare = a.title.localeCompare(b.title);
  if (titleCompare !== 0) return titleCompare;

  return a.id.localeCompare(b.id);
}

export function createMarketBulletinWireItems({
  news,
  catalysts,
  speculation,
  latestReport,
}: {
  news: NewsWireSource[];
  catalysts: CatalystWireSource[];
  speculation: SpeculationWireSource[];
  latestReport: ReportWireSource | null;
}): WireItem[] {
  const report = normalizeReportWireItem(latestReport);
  return [
    ...news.map(normalizeNewsWireItem),
    ...catalysts.map(normalizeCatalystWireItem),
    ...speculation.map(normalizeSpeculationWireItem),
    ...(report ? [report] : []),
  ].sort(compareWireItemsNewestFirst);
}

export function filterWireItems(items: WireItem[], feed: WireFeed): WireItem[] {
  if (feed === "all") return items;
  return items.filter((item) => item.kind === FEED_KIND[feed]);
}
