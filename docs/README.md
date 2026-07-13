# SpaceSight Documentation — Index & Ownership Map

**SpaceSight** detects exoplanet candidates in space-telescope light curves: a user
uploads a star's brightness-over-time data, a CNN+BLS pipeline screens it, and the app
returns candidate planets with explainable diagnostics. The backend is FastAPI +
PyTorch; the frontend is React. This folder holds the planning and design docs.

To keep the doc set lean as it grows, **each kind of fact has exactly one home;
everything else points to it** (no fact is explained twice — that's how the docs stay
navigable instead of drifting).

## Start here — what to read, in what order

New to the project? Read in this order; stop when you have what you need.

1. **This file** (you're here) — the map. How the docs are arranged and who owns what.
2. **[`../CONTEXT.md`](../CONTEXT.md)** — the glossary. ~5 minutes. Learn the vocabulary
   (Triage / Search / Vet, core-vs-profile, the F1 rule) so the rest reads smoothly.
3. **[kepler-system-design.md](kepler-system-design.md)** — the canonical design. Start
   with its preamble and §1 (the pipeline overview + diagram); that alone gives you the
   mental model. Read the rest when you need a specific subsystem.
4. **[ROADMAP.md](ROADMAP.md)** — what's being built and in what order. §0 ("the whole
   arc") is the one-glance version; the phase checklists are the actual task list.
5. **Then, as needed:**
   - About to *write code*? → [style-guide.md](style-guide.md).
   - Wondering *why* a design choice was made? → the relevant [ADR](adr/) (the design
     doc and ROADMAP link to them inline).
   - Working on the research extension? → [jwst-biosignature-prd.md](jwst-biosignature-prd.md).
   - Setting up the repo / training environment? →
     [repo-restructure-and-mlops-plan.md](repo-restructure-and-mlops-plan.md).
   - Contributing (commits, PRs, versioning)? → the restructure plan's
     [Team workflow + Versioning](repo-restructure-and-mlops-plan.md) section; commit
     template `.gitmessage`, PR template `.github/PULL_REQUEST_TEMPLATE.md`.

**Reading tips:**
- The design doc is the *target* (fixed) system; **[`../CLAUDE.md`](../CLAUDE.md)**
  describes what *currently exists*. If they seem to disagree, that's the gap the
  roadmap closes — not an error.
- **`[finalize]`** in any doc marks a decision deliberately left open — not an
  oversight. It must be settled before the task it gates.
- Diagrams: most are committed SVGs in [assets/](assets/); a few are inline Mermaid.
- The [archive/](archive/) folder is **superseded history** — ignore it for current work.

## Who owns what

| Fact type | Single home | Everyone else |
|---|---|---|
| **Why** a decision was made | [`adr/`](adr/) + [research-directions-discussion.md](research-directions-discussion.md) | link to them |
| **What** to build, in what order | [ROADMAP.md](ROADMAP.md) | link to it |
| **How** the target system is built | [kepler-system-design.md](kepler-system-design.md) | link to it |
| **How** we write code/notebooks | [style-guide.md](style-guide.md) | link to it |
| **Terms** (the glossary) | [`../CONTEXT.md`](../CONTEXT.md) | link to it |
| **What exists now** (agent guide) | [`../CLAUDE.md`](../CLAUDE.md) | — |

If you find yourself re-explaining something that already has a home, link instead.

## The document family

SpaceSight is a *system of systems*. The Kepler design is canonical; the others
**derive** from it:

```
            kepler-system-design.md  ── canonical "how" (the fixed Kepler backend)
                      │
        ┌─────────────┴──────────────┐
        ▼ (profile swap)             ▼ (new stage)
   TESS competition PRD         jwst-biosignature-prd.md
   (not yet written)            (early-stage capture)
```

- **Kepler** is the foundation (internal; also the engine the JWST work builds on).
- **TESS** is a *fork* — same core, a new instrument profile, presented standalone
  for a competition. Its own PRD (the *what/why* for judges). Not yet written.
- **JWST / biosignature** is an *extension* — a new analysis stage on top. Its PRD is
  an early-stage capture of the design discussion (architecture, flow, traces, the
  three rungs), not yet an execution-ready plan.

The Kepler doc is a **design doc** (the *how*); TESS and JWST are **PRDs** (the
*what/why*, different audiences). See the design doc's preamble for the split.

## Active docs

| Doc | Type | Role |
|---|---|---|
| [kepler-system-design.md](kepler-system-design.md) | design doc | **Canonical.** Target-state backend (three-stage architecture, core-vs-profile, contracts, F1 fix, traces, testing, current→target gap). |
| [style-guide.md](style-guide.md) | style guide | How we write code (Python/frontend) and notebooks — the human-judgment layer; tooling (Ruff/Prettier/ESLint/Pyright) enforces the rest. |
| [ROADMAP.md](ROADMAP.md) | execution plan / task list | The master ordered task list: current → fixed-Kepler → JWST overlay, every change enumerated with `[finalize]` markers. Findings catalogue (F/P/T) in its appendix. Source of truth for *what/when*. |
| [jwst-biosignature-prd.md](jwst-biosignature-prd.md) | PRD (early-stage) | The JWST atmosphere/biosignature extension: two-engine architecture, ephemeris link, three rungs, speculative framing, traces. Derived from the Kepler design; months out. |
| [research-directions-discussion.md](research-directions-discussion.md) | decision record | *Why* the research bets were made (LSTM/TimeGAN skipped; transit-injection + Kepler→TESS adopted; tooling verdicts). |
| [repo-restructure-and-mlops-plan.md](repo-restructure-and-mlops-plan.md) | plan | Git/branch fixes, `ml/` scaffold, dataset-on-Drive workflow, W&B, CLAUDE.md/README fixes. |
| [parallel-processing.md](parallel-processing.md) | design doc (deferred) | CPU-pool + GPU-batching serving throughput upgrades. Not yet implemented. |
| [adr/](adr/) | decision records | One file per architectural decision — the canonical "why". |
| [assets/](assets/) | — | Diagrams (e.g. the pipeline SVG). |

## Markdown outside this folder

Not all docs live in `docs/` — some sit next to what they describe. Here's the full map
so nothing is orphaned:

| File | Where | What it's for |
|---|---|---|
| [`../README.md`](../README.md) | repo root | **Getting-started / how-to-run** (install, run, tech stack). The GitHub landing page; it routes here for everything else. |
| [`../CONTEXT.md`](../CONTEXT.md) | repo root | The glossary (loaded into agent context each session). |
| [`../CLAUDE.md`](../CLAUDE.md) | repo root | Agent guide — *what currently exists* (vs. the design doc's target state). |
| [`../ml/README.md`](../ml/README.md) | `ml/` | How to train: workflow, ground rules, archiving model iterations. |
| [`../ml/MODELS.md`](../ml/MODELS.md) | `ml/` | The model registry (one row per iteration — the model version axis). |
| `.gitmessage` / `.github/PULL_REQUEST_TEMPLATE.md` | repo root / `.github/` | Commit + PR templates (conventions in the [restructure plan](repo-restructure-and-mlops-plan.md)). |

Rule of thumb: **planning/design docs live in `docs/`; a readme lives next to the
thing it documents** (root = the repo, `ml/` = training). This file is the hub that
ties them together.

## Reference & historical

| Doc | Note |
|---|---|
| [SpaceSight_Reference_Paper.md](SpaceSight_Reference_Paper.md) | The NASA Space Apps hackathon paper that inspired the JWST/biosignature direction. Inspiration, not a spec. |
| [archive/](archive/) | **Superseded — historical reference only.** Old AI-chat transcripts; ROADMAP supersedes them. Do not treat as current. |

## Architecture Decision Records

| ADR | Decision |
|---|---|
| [0001](adr/0001-three-stage-triage-search-vet.md) | Three-stage architecture: Triage → Search → Vet |
| [0002](adr/0002-catalog-labels-never-features.md) | The catalog may label, never feature-ize (the F1 fix) |
| [0003](adr/0003-single-channel-triage.md) | Triage is single-channel; multi-view channels belong to Vet |
| [0004](adr/0004-triage-gate-on-by-default.md) | Triage gate ON by default, as an isolated policy |
| [0005](adr/0005-in-memory-job-registry.md) | In-memory ephemeral job registry; single worker |
| [0006](adr/0006-option-b-model-loading.md) | Model loading: shared-class + metadata now; TorchScript deferred |
| [0007](adr/0007-core-vs-profile.md) | Core vs. Profile factoring (instrument-agnostic) |
| [0008](adr/0008-batch-cnn-fanout-bls.md) | Batch the CNN, fan out BLS (by computational shape) |
| [0009](adr/0009-vet-labels-never-drops.md) | Vet labels candidates; never silently drops |
| [0010](adr/0010-stellar-radius-is-an-output-scaler.md) | Stellar radius from catalog is safe (an output scaler) |
| [0011](adr/0011-notebook-package-backend-promotion.md) | Notebook → package → backend: one shared `spacesight_ml`, promotion as the unit of stabilization |
| [0012](adr/0012-two-axis-versioning.md) | Two-axis versioning: model iterations (`model/` tags) vs. system releases (`v*` tags) |
