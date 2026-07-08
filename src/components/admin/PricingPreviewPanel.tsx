import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { CharacterRow } from "@/lib/api/market.functions";
import {
  exportCharacterPricingRatingsCsv,
  getCharacterPricingRatings,
  listCharacterPricingRatings,
  resetCharacterPricingRatings,
  saveAndApplyCharacterPricing,
  saveCharacterPricingDraft,
} from "@/lib/api/character-pricing-ratings.functions";
import {
  RATING_KEYS,
  calculatePricingPreview,
  createDefaultPricingPreviewDraft,
  createEmptySimulationEvent,
  validatePricingPreviewDraft,
  type PreviewSimulationEventDraft,
  type PricingPreviewDraft,
} from "@/lib/market-pricing/admin-preview";
import {
  createDefaultPersistentPricingInput,
  hasPersistentPricingDraftChanges,
  hydratePersistentPricingDraftFields,
  persistentPricingInputToDraftFields,
  validatePersistentPricingDraft,
  type CharacterPricingApplicationResult,
  type CharacterPricingRatingsModel,
  type PersistentPricingInput,
} from "@/lib/market-pricing/character-pricing-ratings";

type PricingPreviewPanelProps = {
  characters: CharacterRow[];
};

type CalculationState = {
  calculation: ReturnType<typeof calculatePricingPreview> | null;
  error: string | null;
};

type Operation = "save" | "apply" | "reset" | "export" | null;

const STOCK_CATEGORIES = ["blue_chip", "growth", "speculative", "meme"] as const;
const LARGE_REPRICE_WARNING_PCT = 25;

const RATING_LABELS: Record<(typeof RATING_KEYS)[number], string> = {
  narrativeImportance: "Narrative importance",
  currentRelevance: "Current relevance",
  strengthStatus: "Strength status",
  popularity: "Popularity",
  futurePotential: "Future potential",
  investorConfidence: "Investor confidence",
  volatility: "Volatility",
};

function formatBerry(value: number) {
  return `฿${Number(value).toFixed(2)}`;
}

function formatPct(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${Number(value).toFixed(4)}%`;
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "not recorded";
  return new Date(value).toLocaleString();
}

function calculateSignedPriceChangePct(previousPrice: number, nextPrice: number) {
  if (!Number.isFinite(previousPrice) || previousPrice === 0) return 0;
  return ((nextPrice - previousPrice) / previousPrice) * 100;
}

function buildApplyConfirmation(
  character: CharacterRow,
  calculation: NonNullable<CalculationState["calculation"]>,
) {
  const currentPrice = Number(character.current_price);
  const proposedPrice = calculation.ipo.suggestedPostCatalystPrice;
  const changePct = calculateSignedPriceChangePct(currentPrice, proposedPrice);
  const largeWarning =
    Math.abs(changePct) >= LARGE_REPRICE_WARNING_PCT
      ? ["", `Large repricing warning: this changes the live price by ${formatPct(changePct)}.`]
      : [];

  return [
    `Save Ratings & Apply Price for ${character.name}?`,
    "",
    `Current live price: ${formatBerry(currentPrice)}`,
    `Calculated new live price: ${formatBerry(proposedPrice)}`,
    `Signed percentage change: ${formatPct(changePct)}`,
    `Current category: ${formatCategory(character.category)}`,
    `New category: ${formatCategory(calculation.ipo.category)}`,
    `Pricing algorithm version: ${calculation.ipo.algorithmVersion}`,
    "",
    "This will immediately update the live market price, stock category, and portfolio market values. Share quantities, wallet balances, average costs, and transaction history will not change.",
    ...largeWarning,
  ].join("\n");
}

function statusLabel(state: CharacterPricingRatingsModel | undefined, loadFailed = false) {
  if (loadFailed) return "Load failed";
  if (!state) return "Loading";
  switch (state.state) {
    case "unrated":
      return "Unrated";
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "stale_draft":
      return "Stale draft";
    case "stale_approved":
      return "Stale approved";
  }
}

function statusTone(state: CharacterPricingRatingsModel | undefined, loadFailed = false) {
  if (loadFailed) return "text-bear";
  if (!state) return "text-muted-foreground";
  if (state.state === "approved") return "text-bull";
  if (state.state === "draft") return "text-warn";
  if (state.isStale) return "text-bear";
  return "text-muted-foreground";
}

function validationSummary(errors: Record<string, string>) {
  const first = Object.values(errors)[0];
  return first ?? "Persistent rating inputs need attention.";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getDefaultPersistentBaseline(character: CharacterRow | undefined): PersistentPricingInput {
  return createDefaultPersistentPricingInput(character?.category ?? "growth");
}

function updateDraftField<K extends keyof PricingPreviewDraft>(
  draft: PricingPreviewDraft,
  key: K,
  value: PricingPreviewDraft[K],
): PricingPreviewDraft {
  return { ...draft, [key]: value };
}

function updateEvent(
  draft: PricingPreviewDraft,
  id: string,
  patch: Partial<PreviewSimulationEventDraft>,
): PricingPreviewDraft {
  return {
    ...draft,
    simulationEvents: draft.simulationEvents.map((event) =>
      event.id === id ? { ...event, ...patch } : event,
    ),
  };
}

export function PricingPreviewPanel({ characters }: PricingPreviewPanelProps) {
  const queryClient = useQueryClient();
  const firstCharacter = characters[0];
  const [selectedSlug, setSelectedSlug] = useState(firstCharacter?.slug ?? "");
  const selectedCharacter =
    characters.find((character) => character.slug === selectedSlug) ?? firstCharacter;
  const [draft, setDraft] = useState(() => createDefaultPricingPreviewDraft(firstCharacter));
  const [baselinePersistent, setBaselinePersistent] = useState<PersistentPricingInput>(() =>
    getDefaultPersistentBaseline(firstCharacter),
  );
  const [operation, setOperation] = useState<Operation>(null);
  const [resetNotice, setResetNotice] = useState(
    "Persistent rating inputs start at safe defaults until saved ratings are loaded.",
  );
  const eventIdRef = useRef(1);
  const selectedCharacterIdRef = useRef<string | null>(selectedCharacter?.id ?? null);
  const hydratedRatingsRef = useRef<{
    characterId: string | null;
    state: CharacterPricingRatingsModel | null;
  }>({ characterId: null, state: null });

  const selectedRatingsQueryKey = [
    "character-pricing-ratings",
    selectedCharacter?.id ?? "none",
  ] as const;
  const ratingsQuery = useQuery({
    queryKey: selectedRatingsQueryKey,
    queryFn: () =>
      getCharacterPricingRatings({ data: { characterId: selectedCharacter?.id ?? "" } }),
    enabled: Boolean(selectedCharacter?.id),
    refetchOnWindowFocus: false,
  });
  const ratingsListQuery = useQuery({
    queryKey: ["character-pricing-ratings", "all"],
    queryFn: () => listCharacterPricingRatings(),
    refetchOnWindowFocus: false,
  });

  const validation = useMemo(() => validatePricingPreviewDraft(draft), [draft]);
  const persistentValidation = useMemo(() => validatePersistentPricingDraft(draft), [draft]);
  const persistentDirty = useMemo(
    () => hasPersistentPricingDraftChanges(draft, baselinePersistent),
    [baselinePersistent, draft],
  );
  const calculationState = useMemo<CalculationState>(() => {
    if (!selectedCharacter) return { calculation: null, error: "No character is available." };
    if (!validation.ok) return { calculation: null, error: null };

    try {
      return {
        calculation: calculatePricingPreview(selectedCharacter, validation.value),
        error: null,
      };
    } catch (error) {
      return {
        calculation: null,
        error: error instanceof Error ? error.message : "Preview calculation failed.",
      };
    }
  }, [selectedCharacter, validation]);

  const warnings = useMemo(() => {
    const calculation = calculationState.calculation;
    if (!calculation) return [];

    return Array.from(
      new Set([
        ...calculation.ipo.warnings,
        ...calculation.movement.warnings,
        ...calculation.simulation.days.flatMap((day) => day.warnings),
      ]),
    );
  }, [calculationState.calculation]);

  const ratingsReady = ratingsQuery.isSuccess && Boolean(ratingsQuery.data);
  const ratingsLoadBlocked = !ratingsReady || ratingsQuery.isError || ratingsQuery.isLoading;
  const isBusy = operation != null;
  const persistentInputsDisabled = isBusy || ratingsLoadBlocked;

  useEffect(() => {
    selectedCharacterIdRef.current = selectedCharacter?.id ?? null;
  }, [selectedCharacter?.id]);

  useEffect(() => {
    if (!selectedCharacter || !ratingsQuery.data) return;
    const alreadyProcessed =
      hydratedRatingsRef.current.characterId === selectedCharacter.id &&
      hydratedRatingsRef.current.state === ratingsQuery.data;
    if (alreadyProcessed) return;

    const isInitialCharacterLoad = hydratedRatingsRef.current.characterId !== selectedCharacter.id;
    const nextBaseline =
      ratingsQuery.data.persistent ?? getDefaultPersistentBaseline(selectedCharacter);

    if (!isInitialCharacterLoad && persistentDirty) {
      hydratedRatingsRef.current = { characterId: selectedCharacter.id, state: ratingsQuery.data };
      setResetNotice(
        `${selectedCharacter.name} saved ratings refreshed; unsaved persistent edits were kept.`,
      );
      return;
    }

    setDraft((currentDraft) => {
      const baseDraft = isInitialCharacterLoad
        ? createDefaultPricingPreviewDraft(selectedCharacter)
        : currentDraft;
      return hydratePersistentPricingDraftFields(baseDraft, ratingsQuery.data);
    });
    setBaselinePersistent(nextBaseline);
    hydratedRatingsRef.current = { characterId: selectedCharacter.id, state: ratingsQuery.data };
    if (isInitialCharacterLoad) eventIdRef.current = 1;
    setResetNotice(
      ratingsQuery.data.persistent
        ? `${selectedCharacter.name} selected. Saved persistent ratings were loaded.`
        : `${selectedCharacter.name} selected. No saved ratings found; defaults are ready.`,
    );
  }, [persistentDirty, ratingsQuery.data, selectedCharacter]);

  useEffect(() => {
    if (!persistentDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [persistentDirty]);

  function resetForCharacter(character: CharacterRow | undefined) {
    const nextDraft = createDefaultPricingPreviewDraft(character);
    hydratedRatingsRef.current = { characterId: null, state: null };
    setDraft(nextDraft);
    setBaselinePersistent(getDefaultPersistentBaseline(character));
    eventIdRef.current = 1;
    if (character) {
      setResetNotice(`${character.name} selected. Loading saved persistent ratings...`);
    }
  }

  function handleCharacterChange(slug: string) {
    if (operation) {
      toast.error("Wait for the current ratings operation to finish before switching characters.");
      return;
    }
    if (slug === selectedSlug) return;
    if (
      persistentDirty &&
      !window.confirm("Discard unsaved persistent rating changes and switch characters?")
    ) {
      return;
    }
    setSelectedSlug(slug);
    resetForCharacter(characters.find((character) => character.slug === slug));
  }

  function resetCurrentDraft() {
    if (!selectedCharacter) return;
    if (operation) {
      toast.error("Wait for the current ratings operation to finish before resetting the form.");
      return;
    }
    if (!ratingsReady || !ratingsQuery.data) {
      toast.error("Saved ratings must load before resetting persistent fields.");
      return;
    }
    if (
      persistentDirty &&
      !window.confirm("Reset this form to the last loaded persistent values?")
    ) {
      return;
    }
    const loadedPersistent =
      ratingsQuery.data.persistent ?? getDefaultPersistentBaseline(selectedCharacter);
    const fields = persistentPricingInputToDraftFields(loadedPersistent);
    setDraft((currentDraft) => ({
      ...currentDraft,
      ...fields,
      ratings: fields.ratings,
    }));
    setBaselinePersistent(loadedPersistent);
    setResetNotice(
      "Persistent fields were restored to loaded values. Movement and simulation inputs were kept.",
    );
  }

  function addSimulationEvent() {
    const nextEvent = createEmptySimulationEvent(eventIdRef.current);
    eventIdRef.current += 1;
    setDraft({
      ...draft,
      simulationEvents: [...draft.simulationEvents, nextEvent],
    });
  }

  function removeSimulationEvent(id: string) {
    setDraft({
      ...draft,
      simulationEvents: draft.simulationEvents.filter((event) => event.id !== id),
    });
  }

  async function refreshRatingsState(
    queryKey: typeof selectedRatingsQueryKey,
    characterId: string,
    nextState: CharacterPricingRatingsModel,
  ) {
    if (selectedCharacterIdRef.current !== characterId) return;
    hydratedRatingsRef.current = { characterId, state: nextState };
    queryClient.setQueryData(queryKey, nextState);
    await queryClient.invalidateQueries({ queryKey: ["character-pricing-ratings"] });
  }

  async function refreshAppliedMarketState(
    characterId: string,
    characterSlug: string,
    result: CharacterPricingApplicationResult,
  ) {
    queryClient.setQueryData<CharacterRow[]>(["characters"], (current) =>
      current?.map((character) =>
        character.id === characterId
          ? {
              ...character,
              previous_price: result.previousLivePrice,
              current_price: result.newLivePrice,
              category: result.newCategory,
            }
          : character,
      ),
    );
    await queryClient.invalidateQueries({ queryKey: ["characters"] });
    await queryClient.invalidateQueries({ queryKey: ["market", "page"] });
    await queryClient.invalidateQueries({ queryKey: ["character", characterSlug] });
    await queryClient.invalidateQueries({ queryKey: ["character", characterSlug, "intel"] });
    await queryClient.invalidateQueries({ queryKey: ["top-holders", characterSlug] });
  }

  async function saveDraft() {
    if (!selectedCharacter || operation) return;
    if (!ratingsReady || !ratingsQuery.data) {
      toast.error("Saved ratings must load before saving. Use Retry Load, then try again.");
      return;
    }
    if (!persistentValidation.ok) {
      toast.error(validationSummary(persistentValidation.errors));
      return;
    }

    const operationCharacterId = selectedCharacter.id;
    const operationQueryKey = selectedRatingsQueryKey;
    const persistentSnapshot = persistentValidation.value;
    setOperation("save");
    try {
      const nextState = await saveCharacterPricingDraft({
        data: {
          characterId: operationCharacterId,
          ...persistentSnapshot,
        },
      });
      if (selectedCharacterIdRef.current !== operationCharacterId) return;
      setBaselinePersistent(persistentSnapshot);
      await refreshRatingsState(operationQueryKey, operationCharacterId, nextState);
      toast.success("Draft saved. The live market was not changed.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not save pricing ratings draft."));
    } finally {
      setOperation(null);
    }
  }

  async function saveAndApplyPrice() {
    if (!selectedCharacter || operation) return;
    if (!ratingsReady || !ratingsQuery.data) {
      toast.error("Saved ratings must load before applying. Use Retry Load, then try again.");
      return;
    }
    if (!persistentValidation.ok) {
      toast.error(validationSummary(persistentValidation.errors));
      return;
    }
    if (!calculationState.calculation) {
      toast.error(calculationState.error ?? "Valid pricing output is required before applying.");
      return;
    }
    if (
      calculationState.calculation.ipo.algorithmVersion !==
      ratingsQuery.data.currentAlgorithmVersion
    ) {
      toast.error("The current pricing algorithm must match before applying.");
      return;
    }
    if (!window.confirm(buildApplyConfirmation(selectedCharacter, calculationState.calculation))) {
      return;
    }

    const operationCharacterId = selectedCharacter.id;
    const operationQueryKey = selectedRatingsQueryKey;
    const persistentSnapshot = persistentValidation.value;
    setOperation("apply");
    try {
      const result = await saveAndApplyCharacterPricing({
        data: {
          characterId: operationCharacterId,
          ...persistentSnapshot,
        },
      });
      if (selectedCharacterIdRef.current !== operationCharacterId) return;
      setBaselinePersistent(persistentSnapshot);
      await refreshRatingsState(operationQueryKey, operationCharacterId, result.ratings);
      await refreshAppliedMarketState(operationCharacterId, selectedCharacter.slug, result);
      toast.success(
        `Ratings saved and live price updated to ${formatBerry(result.newLivePrice)} (${formatPct(
          result.percentageChange,
        )}).`,
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not save and apply pricing ratings."));
    } finally {
      setOperation(null);
    }
  }

  async function resetToUnrated() {
    if (!selectedCharacter || operation) return;
    if (!ratingsReady || !ratingsQuery.data) {
      toast.error("Saved ratings must load before resetting. Use Retry Load, then try again.");
      return;
    }
    if (
      !window.confirm(
        "This removes the saved ratings. It does not reverse a price already applied to the market, and existing price-history records remain intact.",
      )
    ) {
      return;
    }

    const operationCharacterId = selectedCharacter.id;
    const operationQueryKey = selectedRatingsQueryKey;
    setOperation("reset");
    try {
      const nextState = await resetCharacterPricingRatings({
        data: { characterId: operationCharacterId },
      });
      if (selectedCharacterIdRef.current !== operationCharacterId) return;
      const nextDraft = createDefaultPricingPreviewDraft(selectedCharacter);
      setDraft(nextDraft);
      setBaselinePersistent(getDefaultPersistentBaseline(selectedCharacter));
      eventIdRef.current = 1;
      await refreshRatingsState(operationQueryKey, operationCharacterId, nextState);
      toast.success("Pricing ratings reset to unrated. The current live price was not reversed.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not reset pricing ratings."));
    } finally {
      setOperation(null);
    }
  }

  async function exportPricingRatingsCsv() {
    if (operation) return;
    setOperation("export");
    try {
      const result = await exportCharacterPricingRatingsCsv();
      downloadCsvFile(result.filename, result.csv);
      toast.success(
        `Pricing ratings CSV exported (${result.ratedCount}/${result.rowCount} rated).`,
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not export pricing ratings CSV."));
    } finally {
      setOperation(null);
    }
  }

  if (!selectedCharacter) {
    return (
      <section className="terminal-panel">
        <div className="terminal-header text-warn">Market Pricing Preview</div>
        <div className="p-4 text-sm text-muted-foreground">
          No characters are available for preview.
        </div>
      </section>
    );
  }

  const fieldErrors = validation.errors;
  const calculation = calculationState.calculation;
  const ratingsState = ratingsQuery.data;
  const savedRatingsCount = ratingsListQuery.data?.length ?? 0;
  const canApply = ratingsReady && persistentValidation.ok && Boolean(calculation) && !isBusy;

  return (
    <div className="space-y-4">
      <section className="terminal-panel">
        <div className="terminal-header flex items-center justify-between gap-2">
          <span>Market Pricing V1 Preview</span>
          <Badge variant="outline">Admin only</Badge>
        </div>
        <div className="space-y-3 p-4 text-xs text-muted-foreground">
          <Alert className="border-accent/40 bg-accent/10">
            <AlertTitle>Character valuation and live pricing</AlertTitle>
            <AlertDescription>
              Save Draft stores ratings without changing the market. Save Ratings & Apply Price
              saves the current ratings and updates the character&apos;s live price and stock
              category using the calculated final valuation. Movement and simulation inputs remain
              temporary.
            </AlertDescription>
          </Alert>
          <div className="grid gap-2 md:grid-cols-3">
            <Metric
              label="Selected status"
              value={`${statusLabel(ratingsState, ratingsQuery.isError)}${
                persistentDirty && ratingsReady ? " (dirty)" : ""
              }`}
            />
            <Metric
              label="Saved records"
              value={ratingsListQuery.isLoading ? "loading" : String(savedRatingsCount)}
            />
            <Metric label="Algorithm" value={ratingsState?.currentAlgorithmVersion ?? "loading"} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => void exportPricingRatingsCsv()}
              disabled={isBusy}
              className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              {operation === "export" ? "Exporting..." : "Export Pricing Ratings CSV"}
            </button>
            <span>
              Downloads the current character pricing dataset. This does not change ratings or
              market data.
            </span>
          </div>
          <p>{resetNotice}</p>
          {ratingsQuery.isError && (
            <div className="flex flex-wrap items-center gap-2 text-bear">
              <p>
                Saved ratings could not be loaded:{" "}
                {getErrorMessage(ratingsQuery.error, "Unknown load failure.")}
              </p>
              <button
                type="button"
                onClick={() => void ratingsQuery.refetch()}
                disabled={ratingsQuery.isFetching || isBusy}
                className="border border-bear px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-bear hover:text-background disabled:opacity-40"
              >
                {ratingsQuery.isFetching ? "Retrying..." : "Retry Load"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="terminal-panel">
        <div className="terminal-header">1. Character</div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Character
            </span>
            <select
              value={selectedCharacter.slug}
              onChange={(event) => handleCharacterChange(event.target.value)}
              disabled={isBusy}
              className="mt-1 w-full border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary disabled:opacity-40"
            >
              {characters.map((character) => (
                <option key={character.id} value={character.slug}>
                  {character.name} ({character.slug.toUpperCase()})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs tabular">
            <Metric label="Current" value={formatBerry(Number(selectedCharacter.current_price))} />
            <Metric
              label="Previous"
              value={formatBerry(Number(selectedCharacter.previous_price))}
            />
            <Metric label="Category" value={formatCategory(selectedCharacter.category)} />
            <Metric label="Momentum" value={Number(selectedCharacter.momentum).toFixed(4)} />
          </div>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="terminal-header flex items-center justify-between gap-2">
          <span>2. Persistent Ratings and IPO Inputs</span>
          <span
            className={`text-[10px] uppercase tracking-widest ${statusTone(
              ratingsState,
              ratingsQuery.isError,
            )}`}
          >
            {ratingsQuery.isLoading ? "Loading" : statusLabel(ratingsState, ratingsQuery.isError)}
          </span>
        </div>
        <div className="grid gap-3 border-b border-border p-4 text-xs md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Persistent dirty" value={persistentDirty ? "yes" : "no"} />
          <Metric label="Stored algorithm" value={ratingsState?.storedAlgorithmVersion ?? "none"} />
          <Metric
            label="Current algorithm"
            value={ratingsState?.currentAlgorithmVersion ?? "loading"}
          />
          <Metric label="Saved" value={formatDateTime(ratingsState?.audit?.updatedAt)} />
          <Metric label="Created by" value={ratingsState?.audit?.createdBy ?? "not recorded"} />
          <Metric label="Updated by" value={ratingsState?.audit?.updatedBy ?? "not recorded"} />
          <Metric label="Approved" value={formatDateTime(ratingsState?.audit?.approvedAt)} />
          <Metric label="Approved by" value={ratingsState?.audit?.approvedBy ?? "not recorded"} />
        </div>
        {ratingsState?.isStale && (
          <div className="border-b border-border p-4">
            <Alert variant="destructive">
              <AlertTitle>{statusLabel(ratingsState)} requires resaving</AlertTitle>
              <AlertDescription>
                Stored algorithm {ratingsState.storedAlgorithmVersion}; current algorithm{" "}
                {ratingsState.currentAlgorithmVersion}. Save current ratings before applying.
              </AlertDescription>
            </Alert>
          </div>
        )}
        <fieldset disabled={persistentInputsDisabled} className="disabled:opacity-60">
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            {RATING_KEYS.map((key) => (
              <NumberField
                key={key}
                label={RATING_LABELS[key]}
                value={draft.ratings[key]}
                min={0}
                max={100}
                step="1"
                error={fieldErrors[`ratings.${key}`]}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    ratings: { ...draft.ratings, [key]: value },
                  })
                }
              />
            ))}
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Persistent stock category
              </span>
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft(
                    updateDraftField(
                      draft,
                      "category",
                      event.target.value as typeof draft.category,
                    ),
                  )
                }
                className="mt-1 w-full border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
              >
                {STOCK_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {formatCategory(category)}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Comparable adjustment"
              value={draft.comparableAdjustment}
              min={0.75}
              max={1.25}
              step="0.01"
              error={fieldErrors.comparableAdjustment}
              onChange={(value) => setDraft(updateDraftField(draft, "comparableAdjustment", value))}
            />
            <NumberField
              label="Uncertainty discount %"
              value={draft.uncertaintyDiscountPct}
              min={0}
              max={25}
              step="0.1"
              error={fieldErrors.uncertaintyDiscountPct}
              onChange={(value) =>
                setDraft(updateDraftField(draft, "uncertaintyDiscountPct", value))
              }
            />
            <NumberField
              label="Launch catalyst %"
              value={draft.launchCatalystPct}
              min={-30}
              max={30}
              step="0.1"
              error={fieldErrors.launchCatalystPct}
              onChange={(value) => setDraft(updateDraftField(draft, "launchCatalystPct", value))}
            />
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={persistentInputsDisabled}
            className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {operation === "save" ? "Saving..." : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={() => void saveAndApplyPrice()}
            disabled={!canApply}
            className="border border-accent px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-accent hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            title={
              !persistentValidation.ok ? "Fix persistent rating inputs before applying" : undefined
            }
          >
            {operation === "apply" ? "Applying..." : "Save Ratings & Apply Price"}
          </button>
          <button
            type="button"
            onClick={() => void resetToUnrated()}
            disabled={persistentInputsDisabled}
            className="border border-bear px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-bear hover:bg-bear hover:text-background disabled:opacity-40"
          >
            {operation === "reset" ? "Resetting..." : "Reset to Unrated"}
          </button>
          <button
            type="button"
            onClick={resetCurrentDraft}
            disabled={persistentInputsDisabled}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            Reset persistent fields to loaded values
          </button>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="terminal-header">3. IPO Preview</div>
        <p className="border-b border-border p-4 text-xs text-muted-foreground">
          Base fair value drives movement and simulation previews. The post-catalyst price is the
          final valuation used by Save Ratings & Apply Price.
        </p>
        {renderBlockedOutput(validation, calculationState)}
        {calculation && (
          <div className="grid gap-2 p-4 text-xs tabular md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Weighted score" value={calculation.ipo.weightedScore.toFixed(4)} />
            <Metric label="Base fair value" value={formatBerry(calculation.ipo.baseFairValue)} />
            <Metric
              label="Comparable fair value"
              value={formatBerry(calculation.ipo.comparableAdjustedFairValue)}
            />
            <Metric
              label="Opening price"
              value={formatBerry(calculation.ipo.suggestedOpeningPrice)}
            />
            <Metric
              label="Post-catalyst price"
              value={formatBerry(calculation.ipo.suggestedPostCatalystPrice)}
            />
            <Metric label="Confidence" value={calculation.ipo.confidenceLevel} />
            <Metric label="Category" value={formatCategory(calculation.ipo.category)} />
            <Metric
              label="Normal cap"
              value={formatPct(calculation.ipo.movementLimits.normalMovementCapPct)}
            />
            <Metric
              label="Major-event cap"
              value={formatPct(calculation.ipo.movementLimits.majorEventCapPct)}
            />
            <Metric label="Algorithm" value={calculation.ipo.algorithmVersion} />
          </div>
        )}
      </section>

      <section className="terminal-panel">
        <div className="terminal-header">4. One-Day Movement Preview</div>
        <p className="border-b border-border p-4 text-xs text-muted-foreground">
          These preview-only fields are never saved to character pricing ratings.
        </p>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberField
            label="Current momentum %"
            value={draft.currentMomentumPct}
            min={-5}
            max={5}
            step="0.01"
            error={fieldErrors.currentMomentumPct}
            onChange={(value) => setDraft(updateDraftField(draft, "currentMomentumPct", value))}
          />
          <NumberField
            label="Approved event impact %"
            value={draft.approvedEventImpactPct}
            min={-30}
            max={30}
            step="0.1"
            error={fieldErrors.approvedEventImpactPct}
            onChange={(value) => setDraft(updateDraftField(draft, "approvedEventImpactPct", value))}
          />
          <NumberField
            label="Market index effect %"
            value={draft.marketIndexEffectPct}
            min={-1}
            max={1}
            step="0.01"
            error={fieldErrors.marketIndexEffectPct}
            onChange={(value) => setDraft(updateDraftField(draft, "marketIndexEffectPct", value))}
          />
          <label className="flex items-center gap-2 pt-6 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.isMajorEvent}
              onChange={(event) =>
                setDraft(updateDraftField(draft, "isMajorEvent", event.target.checked))
              }
            />
            Major-event cap
          </label>
        </div>
        {calculation && (
          <div className="grid gap-2 border-t border-border p-4 text-xs tabular md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Current price" value={formatBerry(calculation.movement.currentPrice)} />
            <Metric label="Fair value" value={formatBerry(calculation.movement.fairValue)} />
            <Metric
              label="Event impact"
              value={formatPct(calculation.movement.approvedEventImpactPct)}
            />
            <Metric
              label="Momentum"
              value={formatPct(calculation.movement.momentumContributionPct)}
            />
            <Metric
              label="Mean reversion"
              value={formatPct(calculation.movement.meanReversionPct)}
            />
            <Metric
              label="Market index"
              value={formatPct(calculation.movement.marketIndexEffectPct)}
            />
            <Metric label="Raw total" value={formatPct(calculation.movement.rawTotalChangePct)} />
            <Metric
              label="Applied cap"
              value={formatPct(calculation.movement.appliedMovementCapPct)}
            />
            <Metric
              label="Clamped change"
              value={formatPct(calculation.movement.clampedTotalChangePct)}
            />
            <Metric label="Next price" value={formatBerry(calculation.movement.nextPrice)} />
            <Metric label="Next momentum" value={formatPct(calculation.movement.nextMomentumPct)} />
            <Metric label="Major event" value={calculation.movement.isMajorEvent ? "yes" : "no"} />
            <Metric label="Algorithm" value={calculation.movement.algorithmVersion} />
          </div>
        )}
      </section>

      <section className="terminal-panel">
        <div className="terminal-header">5. Thirty-Day Simulation</div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Optional hypothetical events stay in this page only. Final price difference is signed:
              negative means below fair value, positive means above fair value.
            </div>
            <button
              type="button"
              onClick={addSimulationEvent}
              className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary"
            >
              Add hypothetical event
            </button>
          </div>
          {draft.simulationEvents.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs tabular">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left">Day</th>
                    <th className="px-2 py-2 text-left">Impact %</th>
                    <th className="px-2 py-2 text-left">Major</th>
                    <th className="px-2 py-2 text-left">Label</th>
                    <th className="px-2 py-2 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.simulationEvents.map((event) => (
                    <tr key={event.id} className="border-b border-border/40">
                      <td className="px-2 py-2 align-top">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          step={1}
                          value={event.day}
                          onChange={(change) =>
                            setDraft(updateEvent(draft, event.id, { day: change.target.value }))
                          }
                          className="w-20 border border-border bg-input px-2 py-1 outline-none focus:border-primary"
                        />
                        <InlineError message={fieldErrors[`simulationEvents.${event.id}.day`]} />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="number"
                          min={-30}
                          max={30}
                          step="0.1"
                          value={event.impactPct}
                          onChange={(change) =>
                            setDraft(
                              updateEvent(draft, event.id, { impactPct: change.target.value }),
                            )
                          }
                          className="w-24 border border-border bg-input px-2 py-1 outline-none focus:border-primary"
                        />
                        <InlineError
                          message={fieldErrors[`simulationEvents.${event.id}.impactPct`]}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={event.isMajorEvent}
                          onChange={(change) =>
                            setDraft(
                              updateEvent(draft, event.id, {
                                isMajorEvent: change.target.checked,
                              }),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          value={event.label}
                          onChange={(change) =>
                            setDraft(updateEvent(draft, event.id, { label: change.target.value }))
                          }
                          placeholder="Optional local label"
                          className="w-full border border-border bg-input px-2 py-1 outline-none focus:border-primary"
                        />
                      </td>
                      <td className="px-2 py-2 text-right align-top">
                        <button
                          type="button"
                          onClick={() => removeSimulationEvent(event.id)}
                          className="text-muted-foreground hover:text-bear"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {calculation && (
          <>
            <div className="grid gap-2 border-t border-border p-4 text-xs tabular md:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Starting price"
                value={formatBerry(calculation.simulation.summary.startingPrice)}
              />
              <Metric
                label="Ending price"
                value={formatBerry(calculation.simulation.summary.endingPrice)}
              />
              <Metric
                label="Absolute return"
                value={formatBerry(calculation.simulation.summary.absoluteReturn)}
              />
              <Metric
                label="Return %"
                value={formatPct(calculation.simulation.summary.percentageReturnPct)}
              />
              <Metric
                label="Minimum price"
                value={formatBerry(calculation.simulation.summary.minimumPrice)}
              />
              <Metric
                label="Maximum price"
                value={formatBerry(calculation.simulation.summary.maximumPrice)}
              />
              <Metric
                label="Largest gain day"
                value={`Day ${calculation.simulation.summary.largestGainDay.day} (${formatPct(
                  calculation.simulation.summary.largestGainDay.changePct,
                )})`}
              />
              <Metric
                label="Largest loss day"
                value={`Day ${calculation.simulation.summary.largestLossDay.day} (${formatPct(
                  calculation.simulation.summary.largestLossDay.changePct,
                )})`}
              />
              <Metric
                label="Capped days"
                value={String(calculation.simulation.summary.numberOfCappedDays)}
              />
              <Metric
                label="Final price difference from fair value"
                value={formatPct(
                  calculation.simulation.summary.finalPriceDifferenceFromFairValuePct,
                )}
              />
              <Metric
                label="Total event impact"
                value={formatPct(calculation.simulation.summary.totalApprovedEventImpactPct)}
              />
              <Metric label="Algorithm" value={calculation.simulation.summary.algorithmVersion} />
            </div>
            <div className="h-[320px] border-t border-border p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calculation.chartRows}>
                  <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    stroke="var(--border)"
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    stroke="var(--border)"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                    }}
                    formatter={(value) => formatBerry(Number(value))}
                    labelFormatter={(value) => `Day ${value}`}
                  />
                  <ReferenceLine
                    y={calculation.ipo.comparableAdjustedFairValue}
                    stroke="var(--accent)"
                    strokeDasharray="3 3"
                  />
                  <Line
                    type="monotone"
                    dataKey="endingPrice"
                    name="Ending price"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[860px] text-xs tabular">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left">Day</th>
                    <th className="px-2 py-2 text-right">Start</th>
                    <th className="px-2 py-2 text-right">End</th>
                    <th className="px-2 py-2 text-right">Event</th>
                    <th className="px-2 py-2 text-right">Momentum</th>
                    <th className="px-2 py-2 text-right">Mean rev.</th>
                    <th className="px-2 py-2 text-right">Applied</th>
                    <th className="px-2 py-2 text-right">Cap</th>
                    <th className="px-2 py-2 text-right">Warn</th>
                  </tr>
                </thead>
                <tbody>
                  {calculation.tableRows.map((row) => (
                    <tr key={row.day} className="border-b border-border/40">
                      <td className="px-2 py-1.5">Day {row.day}</td>
                      <td className="px-2 py-1.5 text-right">{formatBerry(row.startingPrice)}</td>
                      <td className="px-2 py-1.5 text-right">{formatBerry(row.endingPrice)}</td>
                      <td className="px-2 py-1.5 text-right">
                        {formatPct(row.approvedEventImpactPct)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {formatPct(row.momentumContributionPct)}
                      </td>
                      <td className="px-2 py-1.5 text-right">{formatPct(row.meanReversionPct)}</td>
                      <td className="px-2 py-1.5 text-right">
                        {formatPct(row.clampedTotalChangePct)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {formatPct(row.appliedMovementCapPct)}
                      </td>
                      <td className="px-2 py-1.5 text-right">{row.hasWarnings ? "!" : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="terminal-panel">
        <div className="terminal-header">6. Warnings and Limitations</div>
        <div className="space-y-3 p-4 text-xs text-muted-foreground">
          {warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-warn">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p>No pricing or movement warnings for the current temporary inputs.</p>
          )}
          <p>
            Save Draft stores only persistent ratings and IPO inputs. Save Ratings & Apply Price
            updates only the selected character&apos;s live price, category, ratings approval
            metadata, and price history. Movement and simulation inputs are never persisted.
          </p>
        </div>
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  error,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
      />
      <InlineError message={error} />
    </label>
  );
}

function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1 block text-[10px] text-bear">{message}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/60 bg-secondary/30 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}

function renderBlockedOutput(
  validation: ReturnType<typeof validatePricingPreviewDraft>,
  calculationState: CalculationState,
) {
  if (!validation.ok) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Preview inputs need attention</AlertTitle>
          <AlertDescription>
            Fix the highlighted fields before calculation output is shown.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (calculationState.error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Preview calculation failed</AlertTitle>
          <AlertDescription>{calculationState.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}
