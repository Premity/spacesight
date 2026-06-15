# ADR 0008 — Execution strategy: batch the CNN, fan out BLS (by computational shape)

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

When many stars are processed in one job, we want parallelism. A first instinct is
an IntroSort-style "adapt to input size" rule applied uniformly. But the CNN and
BLS have opposite computational shapes, and the bottleneck is BLS, not the CNN
(CNN ~1–3 s/star, BLS ~10–30 s/star — [parallel-processing.md §1](../parallel-processing.md)).

A CNN forward pass does **not** degrade as stars are added — it gets *more*
efficient per window (batching amortizes overhead). BLS is the opposite:
irregular, iterative (pre-whitening masks depend on prior results), data-dependent
control flow.

## Decision

Parallelize each stage according to its shape; GPU and CPU-pool target *different*
stages, not competing strategies.

- **Triage / Vet (CNN):** regular, uniform op → **batch wide**, one inference
  instance, on **GPU** when available. Chunk only against a memory budget (rarely
  fires: ~42 MB for 26k windows). Spawning more CNN instances buys ~nothing.
- **Search (BLS):** irregular, embarrassingly parallel *across stars* → **fan out
  across CPU processes** (`ProcessPoolExecutor`, one star per worker), adaptive on
  N (serial for small N). **BLS stays on CPU** — astropy's BLS is a mature
  single-threaded C kernel; a GPU/torch port is a research project, not a speedup
  (parallel-processing.md §5).
- **Stage interfaces are batch-native** (`triage(N windows)→N probs`,
  `vet(M candidates)→M scores`), so serial execution is "batch of one" and the
  parallel/GPU path is an **executor strategy swap, not an architecture change**.

## Alternatives considered

- **Uniform IntroSort-style splitting on every stage.** Rejected: the analogy
  breaks because the CNN doesn't degrade with size — splitting it saves nothing,
  and it isn't the bottleneck anyway.
- **GPU BLS.** Rejected: irregular iterative control flow is GPU-hostile, and
  porting off astropy's C kernel is a validation-heavy research effort.

## Consequences

- All execution-strategy work is **deferred** (see parallel-processing.md); v1
  ships serial. Only the batch-native interfaces are built now, so the deferred
  work slots in cleanly.
- **Known limit:** parallelism is across stars; a single degenerate star's
  iterative BLS cannot be split — mitigated only by a per-star timeout.
