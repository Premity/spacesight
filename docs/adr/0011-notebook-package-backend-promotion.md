# ADR 0011 — Notebook → package → backend: one shared `spacesight_ml`, promotion as the unit of stabilization

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

`ml/` is an experimentation playground — a lot of trial-and-error, many failed
attempts. The serving backend, by contrast, must be stable. We need a relationship
between the two that (a) keeps the backend insulated from the messy playground,
(b) prevents train/serve drift (finding F2 — the backend and training must not
carry diverging copies of preprocessing / model code), and (c) does not force the
backend to depend on churny notebook code.

Two architectures were on the table:

- **Model A — shared library.** A stable, reviewed package is the single source of
  truth; both notebooks *and* the backend import from it.
- **Model B — manual copy at milestones.** `ml/` is fully independent; when a model
  is ready, its code is hand-copied/ported into the backend. The two sync manually.

Model B reintroduces drift risk (two copies, manually synced). Model A makes drift
structurally impossible (one import) — but only if the shared thing is *curated*,
not the notebooks themselves.

## Decision

**Model A, where the shared thing is the curated `ml/src/spacesight_ml/` package —
not the notebooks.** Three layers, with a clear membrane:

```
ml/
├── notebooks/           ← the PLAYGROUND. Messy, trial-and-error. Imports from src/.
└── src/spacesight_ml/   ← the PACKAGE. Curated, reviewed CODE (functions/classes):
        data.py, model.py, train.py, build_vetting_channels, …
                ▲                              ▲
       imports │                              │ imports
       notebooks (playground)        spacesight-backend/ (serving)
```

- The **package** holds *code* (functions, classes) — **not** trained model
  versions. Trained weights are *data*; they live on Google Drive + a MODELS.md row
  (see the restructure plan and `ml/README.md`).
- **Promotion is the unit of stabilization:** when notebook logic is good, it is
  lifted out of the notebook into `src/spacesight_ml/` as a clean, reviewed change
  (a PR). This is the deliberate, milestone-ish event — *not* a daily occurrence.
- After promotion, the **notebook imports** the function from the package instead of
  redefining it, and the **backend may also import** it. One definition, imported in
  up to three places (notebook, package-internal, backend) — never copied.
- The backend **never imports notebook code** — only the curated package. The
  playground and the serving code are insulated *by the package between them*.

## Alternatives considered

- **Model B (hard copy at milestones).** Keeps the backend insulated, but
  reintroduces F2 drift (two manually-synced copies). Rejected.
- **Backend imports directly from notebooks / notebook-level scripts.** Makes the
  serving code depend on the experimentation scratchpad. Rejected.

## Consequences

- F2 train/serve drift is structurally impossible for any promoted code (one
  import, not two copies).
- The playground stays a playground (notebooks messy and fast); the backend stays
  insulated (it rides the curated package, which changes only at deliberate
  promotions).
- A daily habit follows (recorded in the style guide): **no logic duplication across
  notebooks / package / backend — import from `spacesight_ml`; promoting notebook
  code into the package is a reviewed PR, not a casual paste.**
- The design doc's checkpoint contract and "one shared implementation" (F2) statements
  point here for the *why*.
