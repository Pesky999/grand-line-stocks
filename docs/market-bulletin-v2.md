# Market Bulletin V2

Market Bulletin is the public information hub for Berry Street.

## Public Structure

1. Market Snapshot
2. Featured Daily Brief
3. The Wire

The Wire combines official news, verified catalysts, community speculation, and the latest daily report into one chronological public feed.

## Taxonomy

### Confirmed Catalyst

A confirmed catalyst is a verified market event with authoritative price impact. Catalysts are backed by `market_events` records and published through the existing event workflow.

### Official/Editorial News

News is Berry Street editorial or official market coverage. News can provide context and labels, but it is not itself an automatic price-moving mechanism.

### Community Speculation

Speculation is unconfirmed public discussion. A speculation entry must:

1. Be unconfirmed.
2. Have a stated basis in public community discussion, official teasing, or unresolved canon evidence.
3. Avoid presenting an editorial prediction as a fact.
4. Have an expiration or resolution condition.
5. Be clearly marked as non-price-moving.

### Daily Report

Daily reports summarize visible market activity, sentiment, movers, and discussion from the existing report workflow.

## Exclusions

Do not classify these as speculation:

- anonymous alleged leaks
- early-scan claims
- private insider claims
- unsupported personal predictions
- confirmed canon developments
- official announcements

Confirmed developments become News or Catalysts.

Personal Berry Street analysis may later become an Editorial Thesis feature, but that is outside this release.

## Price Policy

Speculation creates discussion and attention. Verified catalysts create authoritative price movement.

## Implementation Note

The legacy automatic rumor-price generator has been retired through a forward migration. Historical speculation and historical price records are preserved. Speculation is no longer an automatic price-generation mechanism. Verified market events remain the authoritative price-moving workflow.
