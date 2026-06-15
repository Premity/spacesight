# ADR 0007 — Core vs. Profile factoring (instrument-agnostic by construction)

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

SpaceSight will fork to other missions — TESS (imminent, a competition entry) and
PLATO (future). The strongest research claim on the table is cross-instrument
generalization (see [research-directions-discussion.md §3](../research-directions-discussion.md)).
If Kepler assumptions (201 cadences, BKJD timestamps, KOI catalog, hour-tuned gap
thresholds) are baked through the pipeline, each fork is a rewrite, and the two
copies drift.

## Decision

Factor the backend into an **instrument-agnostic core** and a swappable
**instrument profile**. Forking to a new mission means writing a new profile, not
rewriting the pipeline.

- **Core (never names a mission):** the algorithms (gap-splitting, per-segment WH
  detrending, windowing, Triage/Vet CNN *architectures*, BLS power-summing +
  pre-whitening + harmonic guard, radius math) and the entire serving layer
  (jobs, API, multi-star, parallel). The core speaks in **physical units** —
  window length in *hours*, not cadences.
- **Profile (instrument-specific):** cadence; window length resolved to cadences;
  time system (BKJD vs BTJD); gap threshold; **catalog adapter** (KOI vs TOI
  schema); max search period (baseline-scoped); detrend params (`wh_lambda` etc.,
  Kepler defaults, tunable per mission); and **which trained checkpoint file is
  loaded** (each mission trains its own weights).

The "checkpoint" word is split three ways to avoid confusion: the checkpointing
*capability* and the *architecture class* are **core**; a checkpoint *file* (the
trained weights for one mission) is **profile**.

## Alternatives considered

- **Fork-and-find-replace (copy the Kepler code, swap strings).** Rejected: two
  specs/codebases that drift — the exact disease elsewhere in the repo
  (`main.py` vs `app/main.py`). Leanness comes from one core + a thin profile, not
  from copies.
- **No abstraction (Kepler-only, deal with TESS later).** Rejected: the
  physical-units rebuild (ROADMAP R2) is happening anyway for the generalization
  research; doing it as a profile boundary costs almost nothing extra and makes
  the fork nearly free.

## Consequences

- Forking to a new instrument requires writing **only a profile**, no core
  changes — this is **architectural success criterion #1** in the design doc.
- The fork carries the *fixed* (post-F1/F2) design, never today's leaky path.
- This is the documentation-layer expression of ROADMAP's "telescope profile"
  (R6) and physical-units (R2/R5) work.
