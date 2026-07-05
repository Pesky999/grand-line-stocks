# Berry Street Market Pricing V1

This document describes the isolated deterministic core for Berry Street V1 character valuation and IPO pricing.
Movement and simulation exist in separate modules. This formula calibration does not change live prices, connect to
an external database, require Supabase access, or modify movement and simulation behavior.

## Purpose

The model gives administrators a repeatable starting point for character IPO pricing. It produces a fundamental
fair value from human-approved ratings, then applies explicit IPO adjustments so admins can compare an opening
price and a possible post-catalyst price without double-counting the same event.

Humans still approve ratings, stock category, comparable adjustment, launch catalyst, and final price.

## Ratings And Weights

Each rating is a finite number from 0 through 100.

| Rating | Weight | Meaning |
| --- | ---: | --- |
| narrativeImportance | 25% | Long-term importance to the story and market attention. |
| currentRelevance | 20% | How relevant the character is to current discussion. |
| strengthStatus | 15% | Current perceived strength or market stature. |
| popularity | 15% | Community popularity and recognition. |
| futurePotential | 15% | Plausible upside from future story relevance. |
| investorConfidence | 10% | Admin-approved confidence in the character's market thesis. |
| volatility | 0% | Movement-risk input for later phases; not fundamental value. |

The weighted score is:

```text
weightedScore =
  narrativeImportance * 0.25
  + currentRelevance * 0.20
  + strengthStatus * 0.15
  + popularity * 0.15
  + futurePotential * 0.15
  + investorConfidence * 0.10
```

Volatility does not affect fundamental fair value because it describes expected movement risk, not intrinsic
character value.

## Fair Value Formula

The base fair value is:

```text
baseFairValue = 50 * Math.exp(0.035835 * weightedScore)
```

This produces a theoretical base fair-value range from Berry 50.00 at weighted score 0 to approximately Berry
1,799.97 at weighted score 100.

Calculations use full internal precision. Public Berry values are rounded to two decimal places only when returned
for display. Later calculation stages do not use previously rounded display values.

## Stock Categories

Category remains a human-selected input. The model does not automatically assign a category from ratings.

| Category | Normal movement cap | Major-event cap |
| --- | ---: | ---: |
| blue_chip | 4% | 12% |
| growth | 7% | 18% |
| speculative | 12% | 25% |
| meme | 18% | 30% |

These movement limits are consumed by the separate movement engine.

Returned movement limits are safe copies. Modifying a calculated result cannot mutate the shared category
configuration or affect later calculations.

## IPO Adjustments

The IPO calculator accepts:

- `comparableAdjustment`, between `0.75` and `1.25`
- `uncertaintyDiscountPct`, between `0` and `25`
- `launchCatalystPct`, between `-30` and `30`

The calculation is:

```text
comparableAdjustedFairValue = baseFairValue * comparableAdjustment

suggestedOpeningPrice =
  comparableAdjustedFairValue
  * (1 - uncertaintyDiscountPct / 100)

suggestedPostCatalystPrice =
  suggestedOpeningPrice
  * (1 + launchCatalystPct / 100)
```

The opening price and launch catalyst are returned separately.

Administrators should use one of these approaches:

A. Open at `suggestedOpeningPrice` and later apply the launch catalyst as an approved market event.

B. Open directly at `suggestedPostCatalystPrice` with zero launch momentum.

Do not do both. Applying both would double-count the launch event.

## Confidence Classification

Confidence is deterministic and based only on uncertainty discount:

| Uncertainty discount | Confidence |
| ---: | --- |
| 0 through 5 | high |
| greater than 5 through 15 | medium |
| greater than 15 through 25 | low |

Warnings are informational only. They do not alter the result.

Warnings are returned when:

- confidence is low
- comparable adjustment is below `0.85` or above `1.15`
- absolute launch catalyst exceeds `15`
- suggested opening price is below Berry 40
- suggested opening price exceeds Berry 2,000

## Algorithm Versioning

The current algorithm version is `1.1.0`.

Changing weights, formulas, validation ranges, rounding, or warning thresholds should increment the algorithm version
and add migration or release notes in a later integration phase.

## Example Fixtures

These examples use fictional placeholders, not One Piece characters.

### Established Blue-Chip Character

- Category: `blue_chip`
- Ratings: high narrative importance, relevance, strength, popularity, confidence; moderate future potential; low volatility
- Comparable adjustment: `1.05`
- Uncertainty discount: `4`
- Launch catalyst: `0`
- Intended use: stable high-confidence IPO baseline

### New Growth Character With Medium Uncertainty

- Category: `growth`
- Ratings: medium current profile, strong future potential, medium volatility
- Comparable adjustment: `0.95`
- Uncertainty discount: `12`
- Launch catalyst: `8`
- Intended use: open conservatively, then decide whether to apply the catalyst later

### Highly Speculative Character With Low Confidence

- Category: `speculative`
- Ratings: mixed fundamentals, high popularity upside, high volatility
- Comparable adjustment: `0.82`
- Uncertainty discount: `22`
- Launch catalyst: `-18`
- Intended use: highlight low confidence and unusual adjustment warnings before human approval

## Current Limitations

- No live character data is read or modified.
- No ratings are persisted.
- No official price is published.
- No database prices, momentum, reports, events, news, cron jobs, or attributes are changed.
- Movement and simulation behavior live in separate modules and are not modified by this formula.
- Category assignment remains manual.
- Launch catalyst handling is advisory only.
- Final approval and price publication remain human/admin controlled.
