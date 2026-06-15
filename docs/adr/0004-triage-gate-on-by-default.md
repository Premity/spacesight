# ADR 0004 — Triage gate is ON by default, implemented as an isolated policy

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

After Triage scores every window, the per-window probabilities are aggregated to
a star-level decision (`max(window probs) > triage_threshold`). A star that fails
skips Search and Vet entirely — the **cost gate** (BLS is ~10× the cost of
triage; see [parallel-processing.md §1](../parallel-processing.md)).

The gate trades recall for cost: a gated-out star is a permanent miss. This is
fine for a broad survey (most stars host no detectable planet, so the gate skips
the expensive stage on the majority) but is over-aggressive for a
curiosity-driven upload tool, where a user specifically asked about *this* star
and a silent skip is the worst outcome. F1 currently *amplifies* the danger:
uploaded planet hosts get a flat ch1 and are pushed toward "not a planet", so they
can fail the gate and never get a search.

## Decision

- **v1: the gate is ON, hard.** A star failing triage skips Search/Vet.
- **But it is implemented as a single isolated policy function**
  `apply_triage_gate(scored_stars, policy) -> survivors`, *not* as an inline
  early-return welded into the per-star loop (which is how the current code does
  it). v1 implements one mode.
- **Future (roadmap toggle, not built now):** `soft-gate` (run BLS on all, use the
  triage score only to rank/flag) and `off`. Because the gate is already an
  isolated function, adding modes is a pure addition, not a refactor.
- The gate's threshold is **star-level-selected** ([ADR 0006](0006-option-b-model-loading.md),
  finding F3), because the decision it governs is star-level.

## Alternatives considered

- **Remove the gate.** Rejected: it is the core cost-saving step; without it BLS
  runs on every star.
- **Soft-gate by default now.** Deferred: more honest for the upload product, but
  costs the v1 the simple cost win and adds config surface before it is needed.
  The isolated-policy implementation keeps this a cheap future flip.

## Consequences

- v1 keeps the cost win and is continuous with current behavior.
- "Turn the gate off later" is genuinely a one-line addition, not a refactor —
  the decision deliberately does *not* weld the gate shut.
- A star that passes triage but yields no BLS detection is reported honestly
  (`cnn_candidate: true, planets_detected: 0`), never hidden.
