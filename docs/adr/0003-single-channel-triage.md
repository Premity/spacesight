# ADR 0003 — Triage is single-channel; multi-view channels belong to Vet

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

A natural instinct (and a literature precedent — ExoMiner/AstroNet feed multiple
"views": global phase-fold, local phase-fold, secondary eclipse, odd/even) is to
give the triage CNN several input channels. The current model already has two
channels, and the second one is the source of the F1 leak ([ADR 0002](0002-catalog-labels-never-features.md)).

## Decision

**Triage is single-channel (ch0, the raw local window). Every multi-view channel
belongs to Vet, not Triage.**

The reason is physical, not stylistic:

> Every multi-view channel requires a **phase-fold**. A phase-fold requires a
> **period**. Triage runs *before* Search (BLS), so at triage time **no period
> exists**. Therefore the multi-view channels are not merely unwise at triage —
> they are *impossible* to construct without inventing a period, which is exactly
> what produced the F1 leak.

ExoMiner-style multi-view models are *post-search vetters*. That role is precisely
what the **Vet** stage is ([ADR 0001](0001-three-stage-triage-search-vet.md)).

## Alternatives considered

- **Multi-channel triage with catalog-derived folds.** This is the current
  design and the F1 bug. Rejected.
- **A second triage channel that is ephemeris-free** — e.g. an ACF / Lomb-Scargle
  stellar-variability descriptor. This is the *only* legitimate candidate for a
  second triage channel (it needs no period). Parked as a stretch experiment
  (ROADMAP §4c slot 6 / R6); triage v1 ships single-channel.

## Consequences

- Triage is cheap and ephemeris-free — a clean high-recall gate.
- The honest single-channel ablation (ROADMAP R1) becomes the baseline the old
  "+15 precision from ch1" claim must beat.
- All feature-engineering ambition moves to Vet, where it is constructible at
  serving time without a catalog.
