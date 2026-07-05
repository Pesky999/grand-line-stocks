import { useMemo, useRef, useState } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { CharacterRow } from "@/lib/api/market.functions";
import {
  RATING_KEYS,
  calculatePricingPreview,
  createDefaultPricingPreviewDraft,
  createEmptySimulationEvent,
  validatePricingPreviewDraft,
  type PreviewSimulationEventDraft,
  type PricingPreviewDraft,
} from "@/lib/market-pricing/admin-preview";

type PricingPreviewPanelProps = {
  characters: CharacterRow[];
};

type CalculationState = {
  calculation: ReturnType<typeof calculatePricingPreview> | null;
  error: string | null;
};

const STOCK_CATEGORIES = ["blue_chip", "growth", "speculative", "meme"] as const;

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
  const firstCharacter = characters[0];
  const [selectedSlug, setSelectedSlug] = useState(firstCharacter?.slug ?? "");
  const selectedCharacter =
    characters.find((character) => character.slug === selectedSlug) ?? firstCharacter;
  const [draft, setDraft] = useState(() => createDefaultPricingPreviewDraft(firstCharacter));
  const [resetNotice, setResetNotice] = useState(
    "Temporary scratch inputs start at safe defaults and are discarded on refresh.",
  );
  const eventIdRef = useRef(1);

  const validation = useMemo(() => validatePricingPreviewDraft(draft), [draft]);
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

  function resetForCharacter(character: CharacterRow | undefined) {
    setDraft(createDefaultPricingPreviewDraft(character));
    eventIdRef.current = 1;
    if (character) {
      setResetNotice(`${character.name} selected. Temporary preview inputs were reset.`);
    }
  }

  function handleCharacterChange(slug: string) {
    setSelectedSlug(slug);
    resetForCharacter(characters.find((character) => character.slug === slug));
  }

  function resetCurrentDraft() {
    resetForCharacter(selectedCharacter);
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

  return (
    <div className="space-y-4">
      <section className="terminal-panel">
        <div className="terminal-header flex items-center justify-between gap-2">
          <span>Market Pricing V1 Preview</span>
          <Badge variant="outline">Admin only</Badge>
        </div>
        <div className="space-y-3 p-4 text-xs text-muted-foreground">
          <Alert className="border-accent/40 bg-accent/10">
            <AlertTitle>Temporary preview - no data will be saved or applied.</AlertTitle>
            <AlertDescription>
              These values are scratch inputs for local calculation only. They are not official, and
              leaving or refreshing this page discards them.
            </AlertDescription>
          </Alert>
          <p>{resetNotice}</p>
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
              className="mt-1 w-full border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
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
        <div className="terminal-header">2. Temporary Ratings</div>
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
              Temporary category
            </span>
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft(
                  updateDraftField(draft, "category", event.target.value as typeof draft.category),
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
            onChange={(value) => setDraft(updateDraftField(draft, "uncertaintyDiscountPct", value))}
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
        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={resetCurrentDraft}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
          >
            Reset temporary inputs
          </button>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="terminal-header">3. IPO Preview</div>
        <p className="border-b border-border p-4 text-xs text-muted-foreground">
          Base fair value drives movement and simulation previews. Comparable adjustment,
          uncertainty discount, and launch catalyst are separate hypothetical launch values.
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
            This page reads existing public character quotes and runs deterministic calculations in
            the browser. It does not save ratings, send preview inputs to a server function, change
            prices, publish events, or modify hidden attributes.
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
