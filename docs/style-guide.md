# SpaceSight Style Guide

How we write code and notebooks so three people stay in sync. This guide covers the
**human-judgment** layer — the things tools can't decide. The mechanical layer
(formatting, import order, line length) is **enforced by tooling** (§Enforcement), so
this document doesn't repeat what the formatter already guarantees.

It owns *how you write*. It does **not** own *how the system is built* — that's
[kepler-system-design.md](kepler-system-design.md) — or *why* decisions were made —
that's [`adr/`](adr/). When those overlap, this guide states the daily habit and
points there.

**Where the rigor goes (the guide's proportions):**
- **Python / `ml/`** carries the weight — it's the research; correctness and
  followability matter most here.
- **Notebooks** are about *followability*, lightly held — kept readable, not policed.
- **Frontend** is tooling-led and brief — it needs to work; it's not where the science
  lives. Let Prettier + ESLint enforce it and match what's there.

---

## Principles (all languages)

These transcend language and apply to Python, JS, and notebooks alike.

- **Comments: sparse but meaningful.** Code carries the *what*; comments are reserved
  for the *why* and are used **liberally** there. Never narrate the obvious
  (`i += 1  # increment i`). Do explain intent, non-obvious trade-offs, and the
  reasoning behind a choice.
- **Docstrings are maintained.** Every non-trivial function/class has one (§Python for
  format). Non-negotiable.
- **Names are long and descriptive.** `detrended_flux_per_segment`, not `df`. Clarity
  over brevity. (The line-length limit is set high enough to accommodate this — §120.)
- **Function/cell size: pragmatic.** No hard line limit. A unit should do one logical
  thing and be followable; that's the test, not a number.
- **Obvious over clever** — *except* in hot numeric paths. Prefer the explicit,
  readable form over a dense one-liner. The exception: in performance-critical numpy
  code (detrending, BLS, windowing), vectorization is both faster and denser and is
  *encouraged* — **but only if a comment states what it's doing.** Dense is allowed
  when it earns its keep and is explained.

---

## Enforcement

Style is **enforced by tools**, in two layers, so humans only review substance.

**Pre-commit hooks** (local, auto-fix on the way in):
- Ruff format + Ruff lint (Python)
- Prettier (frontend)

**CI (the merge gate — can't be bypassed):**
- Ruff lint — no unfixed violations
- Pyright (lenient mode) — catches signature/type mismatches
- Frontend `npm run lint` + build
- The golden-master test suite, once it exists (see design doc §8)

**Rules:**
- **Formatting failures auto-fix** (the tool just fixes them) — they never block.
- **Lint / type / test failures block merge** — these are real problems.
- **Notebooks are NOT gated in CI** (consistent with "notebooks aren't policed").

**Tooling:**

| Layer | Tool | Config |
|---|---|---|
| Python format + lint | **Ruff** | `ruff.toml` (below) |
| Python types | **Pyright** | lenient mode, CI only |
| Frontend format | **Prettier** | `.prettierrc` |
| Frontend lint | **ESLint** | existing config |

`ruff.toml` (moderate-curated ruleset — real errors + likely bugs + import order +
modernization; grow later if wanted):

```toml
line-length = 120

[lint]
select = [
  "E", "F",   # pyflakes + pycodestyle errors
  "B",        # flake8-bugbear (likely bugs)
  "I",        # isort (import ordering)
  "UP",       # pyupgrade (modern Python syntax)
]
```

Prettier and Ruff are both set to **line-length 120** (§120). `.prettierrc`:

```json
{ "printWidth": 120 }
```

### Adoption (one-time)

- **One big upfront sweep:** run Ruff + Prettier across the whole repo once, commit as
  a single `style: apply formatters repo-wide`, *then* enable hooks + CI. After this,
  every diff is real changes only.
- The frontend's first Prettier run is a large reflow (today ~133 lines exceed 120 and
  the longest is 435 chars — unformatted, not intentional); that's the formatter doing
  its job. Python already conforms (longest line ~115).
- **Add a `.git-blame-ignore-revs`** listing the sweep commit's hash, so `git blame`
  (and GitHub) skip it and real authorship isn't buried under the reformat.

---

## Python (backend + `ml/`)

Ruff handles formatting, imports, line length, and the lint ruleset mechanically. This
section covers what Ruff can't.

- **Type hints required on function signatures** — every parameter and return type,
  everywhere (Pyright enforces in CI, lenient). Local-variable annotations only when
  the type isn't obvious from the assignment (don't write `x: int = 10` — noise).
  ```python
  def detrend_segment(time: np.ndarray, flux: np.ndarray) -> np.ndarray: ...
  ```
- **Docstrings: NumPy style** (matches the existing `processor.py` and is the
  scientific-Python convention). One-line docstrings are fine for trivial local
  helpers; anything non-trivial or cross-module gets the full sectioned form:
  ```python
  def detrend_segment(time: np.ndarray, flux: np.ndarray) -> np.ndarray:
      """Sigma-clip outliers, then apply Whittaker-Henderson baseline correction.

      Parameters
      ----------
      time : ndarray
          Time array for one gap-split segment.
      flux : ndarray
          Raw flux for the segment.

      Returns
      -------
      ndarray
          Detrended, normalized flux.
      """
  ```
- **No logic duplication across notebooks / package / backend.** Import from
  `spacesight_ml`; never copy-paste a function between layers. Promoting stabilized
  notebook code into the package is a **reviewed PR**, not a casual paste. (This is
  the daily habit; the architecture is [ADR 0011](adr/0011-notebook-package-backend-promotion.md),
  and it's how F2 train/serve drift stays impossible.)

---

## Notebooks (`ml/`)

The notebook conventions exist for one reason: **anyone should be able to read a
notebook top-to-bottom as a document and follow it.** These rules codify the existing
practice so teammates taking over parts stay in sync. (Execution order and output
cleanliness are deliberately **not** policed — see "Outputs & git".)

### Structure — the spine

- **Hierarchical section numbering, consistent across all notebooks, starting at 1:**
  `## 1. Header` → `### 1.2 Sub-header` → `#### 1.2.3 Sub-sub-header`. Use the same
  scheme in every notebook (no mixing "Step 2" in one and "2." in another).
- **Every code cell is preceded by a markdown cell** explaining what it does and why.
  The markdown is the narration; the code is the action.
- **Globals up front, once.** One imports cell (nothing imported later in the
  notebook — no mid-notebook re-imports), one global config / hyperparameter cell, one
  path-config cell, near the top.
- **Comment-banner section dividers inside code cells**, one fixed format with **short
  dashes**:
  ```python
  # ── Imports ──────────
  # ── Download function ──────────
  ```
  Short, consistent, scannable. Don't stretch dashes to the full line; don't vary the
  style cell to cell.

### Logging

- **Timestamped, structured logging** for any run of substance. The established
  pattern: a timestamped log *file* at INFO level, console at WARNING (to stay clean
  during long runs), a run header dumping config + device + seed, and short
  status-marker print summaries after key cells (e.g. a leading checkmark glyph,
  as the current notebooks do). Keep this.

### Artifacts

- **Checkpoints named by purpose**, best-per-metric kept (e.g. best-AUC, best-recall,
  best-F1 + last), not every per-epoch checkpoint. Weights live on Drive + a MODELS.md
  row (not in git).
- **Figures saved** to a consistent location with descriptive names.

### End-of-notebook verification (encouraged)

A final numbered section (e.g. `## 9. End-to-End Verification`) that **re-loads the
notebook's saved artifacts from disk** — *not* from in-memory kernel state — and
confirms the pipeline's outputs are correct and self-sufficient. Deliberately
independent of prior cells' state: it's a **smoke test** proving the saved outputs
stand on their own, not an appendix. (This is the notebook-side ancestor of the
golden-master regression in design doc §8 — same instinct: prove the pipeline still
produces the right thing from saved state.)

### Outputs & git

- **Keep outputs — do not strip.** The rendered figures, metrics, and logs *are* the
  value of a research notebook, and re-running to regenerate them is expensive
  (training is hours of trial-and-error). So `nbstripout` is **not** used.
- **Execution order is not policed.** Out-of-order execution counts are fine; the
  cost of demanding a clean "Restart & Run All" before every commit (re-training) is
  not worth it. Followability comes from the *narrative structure* above, not from
  execution counts.
- **Notebooks are edited linearly** — one person at a time, handed off via push/pull.
  This is deliberate: the notebooks are too convoluted to parallelize, and linear
  editing means two people never hold divergent outputs of the same notebook, so
  output blobs never conflict.
- **PR + squash** for notebook changes — squash collapses the noisy intermediate
  output diffs into one commit so `main`'s history stays clean.
- **Escape hatch (not adopted now):** if output-diff noise ever becomes unbearable,
  `jupytext` can pair each notebook with a plain-`.py` mirror that diffs cleanly (code
  reviews via the `.py`, outputs ride along in the `.ipynb`). Overhead we don't need
  yet.

---

## Frontend (`spacesight-frontend/`)

Short and tooling-led: Prettier + the existing ESLint config are the law. Match what's
already there. The four conventions tools don't enforce:

- **One component per file; named exports** (greppable, refactor-safe — no default
  exports that let each importer rename and fragment naming).
- **Function components + hooks only.** Extract a custom hook when stateful logic is
  reused or grows past ~one screenful (as `usePipeline` already does).
- **Tailwind: inline utility classes are the default** (how Tailwind is meant to be
  used). Extract a component only when the *same* class string repeats 3+ times. Avoid
  `@apply`.
- **Naming:** `PascalCase.jsx` for components, `useCamelCase.js` for hooks,
  `camelCase.js` for utils/services.
