# Berry Street Market Movement V1

This document describes the isolated deterministic V1 daily market movement engine and offline simulator for
Berry Street.

This phase is pure TypeScript. It does not connect to Supabase, read live market data, update prices, create events,
publish reports, run cron jobs, or modify the database.

## Daily Formula

Daily movement uses exactly four components:

```text
rawTotalChangePct =
  approvedEventImpactPct
  + momentumContributionPct
  + meanReversionPct
  + marketIndexEffectPct
```

The result is clamped to the applicable category cap:

- `normalMovementCapPct` for ordinary days
- `majorEventCapPct` only when `isMajorEvent` is explicitly true

The engine never promotes an event to major-event status automatically. Major-event status applies only to the
specific simulated day that carries `isMajorEvent: true`; later residual-momentum days use the normal cap unless they
have their own explicit major event.

## Approved Event Impact

`approvedEventImpactPct` is an explicit human-approved input from `-30` through `30`.

The engine does not interpret chapters, scrape content, call AI, infer events, or create events. It only applies the
approved input it receives.

## Momentum And Decay

Daily momentum contribution is:

```text
momentumContributionPct = currentMomentumPct
```

Momentum updates after the daily movement:

```text
nextMomentumPct =
  currentMomentumPct * momentumDecay
  + approvedEventImpactPct * eventMomentumCarry
```

Defaults:

- `momentumDecay = 0.75`
- `eventMomentumCarry = 0.35`

`nextMomentumPct` is clamped from `-5` through `5`.

The approved event affects today through `approvedEventImpactPct` and future days through momentum carry. This is not
double-counting: one value is the immediate approved move, and the other is residual market momentum on later days.

## Mean Reversion

Mean reversion uses a logarithmic pull toward fair value:

```text
meanReversionPct =
  meanReversionStrength
  * Math.log(fairValue / currentPrice)
  * 100
```

Default:

- `meanReversionStrength = 0.05`

The component is clamped from `-2%` through `+2%`.

Meaning:

- underpriced characters drift upward
- overpriced characters drift downward
- characters at fair value have zero mean reversion

## Market Index Effect

`marketIndexEffectPct` is a human-supplied or simulator-supplied input from `-1` through `1`.

The engine does not calculate it automatically from external data.

## Category Caps

The engine reuses the V1 pricing-core category movement limits.

| Category | Normal cap | Major-event cap |
| --- | ---: | ---: |
| blue_chip | 4% | 12% |
| growth | 7% | 18% |
| speculative | 12% | 25% |
| meme | 18% | 30% |

Caps apply after all four daily components are combined.

## Price Floor

The raw next price is:

```text
rawNextPrice =
  currentPrice
  * (1 + clampedTotalChangePct / 100)
```

The minimum price floor is Berry `0.01`.

## Precision And Rounding

The engine uses full internal precision throughout movement and simulation.

Public Berry price fields are rounded to two decimals only when returned for display. Rounded public prices are not
used as inputs to later calculation stages.

The simulator advances each day using the precise next price from the previous day, not the rounded display price.
Momentum is also carried forward at full precision.

`finalPriceDifferenceFromFairValuePct` is signed: negative means the ending price is below fair value, positive means
it is above fair value, and zero means it equals fair value.

## Why Randomness Is Excluded

V1 intentionally has no random daily movement. Every price change must be traceable to one of the four explicit
components:

- approved event impact
- existing momentum
- mean reversion
- market index effect

This keeps inactive characters stable and makes every simulation reproducible.

## Inactive Characters

An inactive character near fair value with zero momentum, no approved events, and zero market effect should not drift
meaningfully. Any movement should come only from small mean reversion toward fair value.

## Simulation Assumptions

The simulator is offline and deterministic. It accepts:

- initial price
- fair value
- category
- initial momentum
- number of days
- optional approved events
- optional market index effects
- optional configuration overrides

Simulation days must be from `1` through `365`.

Same-day approved events are summed deterministically before movement calculation. The combined same-day impact must
remain from `-30` through `30`.

Duplicate market index effects for the same day are rejected to avoid ambiguous input.

Largest gain and largest loss summary ties are deterministic: the earliest tied day wins.

Warnings are informational. A major-event day reports `Major-event movement cap was applicable.` to clarify that the
major-event cap was selected for that day, even if the raw movement did not need clamping.

## 30-Day Scenario Results

These results are deterministic fixture outputs from the offline runner.

| Scenario | Start | End | Return % | Min | Max | Capped days | Final price difference % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Scenario A - no events for 30 days | 100.00 | 100.00 | 0.0000 | 100.00 | 100.00 | 0 | 0.0000 |
| Scenario B - underpriced character for 30 days | 60.00 | 89.11 | 48.5169 | 60.00 | 89.11 | 0 | -10.8899 |
| Scenario C - overpriced character for 30 days | 160.00 | 110.71 | -30.8034 | 110.71 | 160.00 | 0 | 10.7146 |
| Scenario D - one major positive event | 100.00 | 129.10 | 29.0952 | 100.00 | 139.61 | 1 | 7.5794 |
| Scenario E - one major negative event | 100.00 | 79.35 | -20.6550 | 67.25 | 100.00 | 1 | -11.8389 |
| Scenario F - repeated positive events | 80.00 | 219.25 | 174.0621 | 80.00 | 262.54 | 5 | 82.7081 |
| Scenario G - inactive character | 101.00 | 100.21 | -0.7785 | 100.21 | 101.00 | 0 | 0.2138 |
| Scenario H - category comparison blue_chip | 100.00 | 106.48 | 6.4820 | 100.00 | 117.51 | 2 | 6.4820 |
| Scenario H - category comparison growth | 100.00 | 107.37 | 7.3650 | 100.00 | 120.62 | 1 | 7.3650 |
| Scenario H - category comparison speculative | 100.00 | 108.48 | 8.4777 | 100.00 | 124.77 | 1 | 8.4777 |
| Scenario H - category comparison meme | 100.00 | 109.76 | 9.7606 | 100.00 | 129.83 | 1 | 9.7606 |

## 90-Day Stability Result

| Scenario | Start | End | Return % | Min | Max | Capped days | Final price difference % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 90-day stability - overpriced drift | 120.00 | 100.18 | -16.5170 | 100.18 | 120.00 | 0 | 0.1796 |

## Known Limitations

- Humans still approve events and final publication.
- The engine does not write prices or momentum to the database.
- The simulator does not model liquidity, order books, user trading behavior, or external news.
- Market index effect is supplied, not inferred.
- Approved event impact is supplied, not interpreted.
- V1 does not include cron scheduling or automatic publishing.
