# ADR 0006 — Model loading: shared-class + metadata now; TorchScript deferred

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

The backend must reconstruct a network in memory to run inference. Two approaches:

- **Way 1 — `state_dict` + class:** the weights file is just numbers, so the
  backend must own a copy of the architecture class to build the empty network
  and pour weights in. Danger: the backend's copy and the training copy must stay
  byte-identical, or weights load into a subtly wrong network (architecture
  drift — the same two-copies-drift disease as the dead `app/main.py`).
- **Way 2 — TorchScript:** `torch.jit.save` bakes architecture + weights into one
  self-contained artifact; `torch.jit.load` needs no class code. Architecture
  drift becomes impossible.

Separately, findings F2 (train/serve preprocessing parity) and F3 (threshold
provenance) require that the **operating threshold** and the **preprocessing
config** travel *with* the model, not hardcoded server-side (the current backend
hardcodes `cnn_threshold=0.70` and carries its own `CONFIG` with `wh_lambda=1e9`
vs training's `1e6`).

## Decision

**Option B for v1:** load `state_dict` + a metadata bundle, with the architecture
as a **single shared class** imported by *both* training and the backend from
`ml/src/spacesight_ml/model.py` — one definition imported twice, not copied
twice, so no architecture drift.

Each checkpoint (one per CNN — `triage_checkpoint`, `vetting_checkpoint`) carries:

- `model_state_dict` — weights
- `operating_threshold` — star-level-selected; backend reads it, never hardcodes (F3)
- `preprocessing_config` — exact detrend/window params; the checkpoint is the
  single source of truth for preprocessing, so serving cannot drift (F2)
- `provenance` — git commit, data version, train metrics, date (MODELS.md)
- `architecture_config` — human/debug provenance only (not load-bearing for
  construction under Option B)

**TorchScript export is a roadmap item**, deferred until the architecture
stabilizes post-R4, so scripting is not re-massaged on every net change.

## Alternatives considered

- **TorchScript now (Way 2).** Maximum desync-proofing, but adds an export step
  and occasional scripting massaging while the net is still churning. Deferred,
  not rejected.

## Consequences

- The *urgent* fixes (F2/F3 — threshold + preprocessing travel with the model)
  ship now.
- Architecture drift is avoided in the meantime via the shared import; upgraded to
  hard-impossible later via TorchScript.
- The backend stops instantiating `InceptionResNet1D(in_channels=2, ...)` with
  hardcoded args — it reads what it needs from the shared class + checkpoint.
