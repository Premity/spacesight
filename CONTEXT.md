# SpaceSight — Context & Glossary

The shared language of the SpaceSight system — canonical terms with one-line
definitions and a pointer to where the full treatment lives. This file is the
glossary, **not** a design doc: detail lives in
[`docs/kepler-system-design.md`](docs/kepler-system-design.md), decisions (the
"why") live in [`docs/adr/`](docs/adr/), execution order lives in
[`docs/ROADMAP.md`](docs/ROADMAP.md), and code is the implementation. When a term
needs more than a sentence, it points there rather than re-explaining (so nothing
drifts). The doc map is [`docs/README.md`](docs/README.md).

## Glossary

### Three-stage architecture
The canonical name for the detection design: the three decision stages **Triage →
Search → Vet** (Preprocess and Report bookend them). The full pipeline has five
stages; "three-stage" names the three that define the architecture. **Never
"two-stage".** → design doc §1–2, [ADR 0001](docs/adr/0001-three-stage-triage-search-vet.md).

### Pipeline stages
**Preprocess** (gap-split + per-segment detrend + window) · **Triage**
(single-channel CNN, the cost gate) · **Search** (BLS, emits candidates) · **Vet**
(per-candidate CNN, the verdict) · **Report** (radius, classification, catalog
match, viz). → design doc §2.

### Stage enum (API / frontend)
The public `stage` field the loading screen renders (distinct from internal
stages): `loading → preprocessing → cnn_triage → bls_analysis → cnn_vetting →
generate_visualizations → done`. → design doc §4.1.

### Candidate
One BLS detection within a star: `(period, t₀, duration, bls_power)`, `t₀`
absolute BJD. A star yields zero or more; Vet runs once per candidate. → design
doc §2.3.

### Triage gate
Aggregates per-window probs to a star-level decision (`max > threshold`); a star
that fails skips Search/Vet (the cost gate). v1: ON, hard, as an isolated policy
function. → design doc §2.2, [ADR 0004](docs/adr/0004-triage-gate-on-by-default.md).

### Vetting verdict
Vet's per-candidate output. Vet **labels, never silently drops** — every candidate
is reported and inspectable; a threshold sorts confirmed vs low-confidence. →
[ADR 0009](docs/adr/0009-vet-labels-never-drops.md).

### Core vs. Profile
The backend = an instrument-agnostic **core** (algorithms + serving layer; speaks
physical units, never names a mission) + a swappable **profile** (cadence, time
system, catalog adapter, checkpoint files…). Forking to TESS = a new profile. →
design doc §3, [ADR 0007](docs/adr/0007-core-vs-profile.md).

### The F1 rule — "the catalog may label, never feature-ize"
No model *input* may be derived from the catalog. Enforced structurally:
`build_vetting_channels(segments, ephemeris)` takes no catalog argument, so
train/serve mismatch is impossible. The catalog is used at training only to attach
*labels*. → design doc §6, [ADR 0002](docs/adr/0002-catalog-labels-never-features.md).
Contrast: **stellar radius** is safe (an output scaler from independent stellar
data, not a model input) → [ADR 0010](docs/adr/0010-stellar-radius-is-an-output-scaler.md).

### Checkpoint contract
What a trained checkpoint must carry for the backend to consume it safely:
`model_state_dict` + `operating_threshold` (star-level, read not hardcoded — F3) +
`preprocessing_config` (single source of truth, so no train/serve drift — F2) +
`provenance`. Loaded via a shared architecture class (Option B; TorchScript
deferred). → design doc §5.1, [ADR 0006](docs/adr/0006-option-b-model-loading.md).

### Execution strategy
Batch the CNN wide (GPU when available); fan BLS out across CPU processes (it's
the bottleneck and GPU-hostile). Stage interfaces are batch-native so the
parallel/GPU path is a strategy swap. All deferred — v1 is serial. → design doc
§4.4, [ADR 0008](docs/adr/0008-batch-cnn-fanout-bls.md), `docs/parallel-processing.md`.

### Job registry
`jobs` — in-memory, single-process, ephemeral; the only link between the async
`/analyze`→`/status`→`/results` calls; disposable across restarts (deliberate
scope boundary). → design doc §4.2, [ADR 0005](docs/adr/0005-in-memory-job-registry.md).

### Document scope
The design doc covers the **backend serving system** (detection pipeline + FastAPI
serving layer). Training is referenced only via the checkpoint contract; the React
frontend only as an API consumer. The TESS competition entry and the
JWST/biosignature extension are separate **PRDs** derived from the design doc.
