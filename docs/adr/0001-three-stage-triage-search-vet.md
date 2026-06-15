# ADR 0001 — Three-stage architecture: Triage → Search → Vet

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

The current model uses a single CNN as a *pre-search triage* — it scores windows
before BLS runs. But the literature models it borrows from (AstroNet, ExoNet,
ExoMiner) are *post-search vetters*: they classify candidates *after* a transit
search has produced an ephemeris (period, t₀, duration). Using a vetter-style
architecture as a pre-search triager is a category error, and it is the root
cause of the F1 leakage (the model needed an ephemeris it did not have, so the
second channel was faked from the catalog — see [ADR 0002](0002-catalog-labels-never-features.md)).

The two problems — "is this star worth searching?" (cheap, pre-search) and "is
this candidate real?" (precise, post-search) — are genuinely different and want
different models.

## Decision

Split detection into three decision stages:

1. **Triage** — a cheap, ephemeris-free, single-channel CNN ([ADR 0003](0003-single-channel-triage.md))
   that gates which stars are worth an expensive search. Tuned for high
   star-level recall.
2. **Search** — BLS (unchanged): per-segment power summing + iterative
   pre-whitening. *Produces* the ephemeris.
3. **Vet** — a post-search CNN that, with the ephemeris in hand, builds the
   powerful multi-view channels (global/local fold, secondary eclipse, odd/even)
   and renders the per-candidate verdict ([ADR 0009](0009-vet-labels-never-drops.md)).

This is the **three-stage architecture**. (Never "two-stage" — that name counted
CNN passes and confused everyone.) Preprocess and Report bookend the three.

## Alternatives considered

- **Keep the single pre-search CNN.** Rejected: it cannot construct the channels
  that drive precision (they need a period), which is exactly the gap that forced
  the F1 leak.
- **Drop triage; BLS everything; one post-search CNN.** Viable *only* if BLS
  becomes cheap (GPU-BLS). Parked until then — see
  [research-directions-discussion.md §4](../research-directions-discussion.md).

## Consequences

- The Vet channels become constructible at serving time exactly as in training,
  which permanently resolves F1.
- Two CNNs means two checkpoints, two thresholds ([ADR 0006](0006-option-b-model-loading.md)).
- Vet runs per-candidate, not per-star (a star with N detected planets gets N
  vetting passes).
- This is ROADMAP item **R4**; the full execution order lives in
  [ROADMAP.md §6](../ROADMAP.md).
