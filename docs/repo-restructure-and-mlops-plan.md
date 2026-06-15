# Repo Restructure, Git Strategy & MLOps Plan

Status: **proposal — nothing implemented yet** (drafted 2026-06-11).

Goal: bring model training (notebooks + dataset workflow) into this repo, fix the git
landmines, replace the AnyDesk-based training workflow, and refresh CLAUDE.md / README.

## Context

- Training currently lives in Google Drive: Jupyter notebooks + a ~9.5 GB dataset.
- Notebooks are written locally on a laptop and executed on an Ubuntu GPU machine at
  college. The machine has **Tailscale** and AnyDesk; historically accessed via AnyDesk
  remote desktop. Colab is only good enough for smoke tests.
- Team of three; code is shared via GitHub (`Premity/spacesight`) with feature-branch PRs.

## Problems found (current state)

1. **`main` and `master` have diverged with unrelated histories.** All real work is on
   `master`; GitHub's default branch is `origin/main`, a stale "Initial push" commit.
   New clones and PRs default to the wrong branch.
2. **The GitHub Pages deploy workflow is dead.** It lives at
   `spacesight-frontend/.github/workflows/deploy.yml`, but GitHub Actions only reads
   workflows from the repo root's `.github/workflows/`. It never triggers in this
   monorepo — the live demo is stale.
3. **`CLAUDE.md` is gitignored** despite its header claiming it's checked in. Teammates
   don't get it.
4. `spacesight-backend/models/exoplanet_cnn_model.pt` is force-added to git even though
   `models/*.pt` is ignored — confusing. Superseded by the Drive + git-tag + MODELS.md
   scheme below.
5. CLAUDE.md is stale: it describes `/analyze` as single-`.npz`-only returning
   `{ jobId }`, but the backend now accepts multi-star zips and returns `totalStars`
   (README is correct; CLAUDE.md predates PR #1).

---

## 1. Directory restructure

Core idea: notebooks come into the repo; the **dataset never does** — it lives on
Google Drive and each teammate downloads the subset they need (§2).

```
spacesight/
├── .github/workflows/        ← deploy.yml MOVED here and fixed
├── spacesight-backend/        unchanged
├── spacesight-frontend/       unchanged (minus its .github/)
├── ml/                        ← NEW: everything training-related
│   ├── notebooks/             exploration + smoke tests (outputs stripped, §2)
│   ├── src/spacesight_ml/     importable Python package
│   │   ├── data.py            dataset building, .npz loading, windowing
│   │   ├── model.py           InceptionResNet1D (single source of truth)
│   │   ├── train.py           training loop, callable as a script
│   │   └── evaluate.py        metrics, threshold sweeps
│   ├── configs/               experiment configs (hyperparameters)
│   ├── data/                  gitignored; downloaded from Drive, never committed
│   │   ├── raw/               the ~9.5 GB from Drive (download what you need)
│   │   └── processed/         windowed/labeled training tensors
│   └── README.md              "how to train" for teammates
├── docs/
├── test_data/
├── CLAUDE.md                  ← checked in (currently gitignored)
└── README.md
```

Design points:

- **Notebooks for exploration, package for truth.** When a notebook cell stabilizes
  (windowing logic, train loop), it moves into `ml/src/spacesight_ml/` and the notebook
  imports it. Notebooks stay thin and diffable; code gets reviewed in PRs like normal
  code; the training run becomes `python -m spacesight_ml.train` (which §3 builds on).
- **Single model definition.** `spacesight-backend/app/model_def.py` and the training
  notebooks must not each carry a copy of the architecture. Plan: training owns
  `model.py`; at the end of training, export **TorchScript**
  (`torch.jit.script(model).save(...)`). The backend loads it with `torch.jit.load()`
  and no longer needs the class definition at all — architecture changes can never
  silently desync from serving. (Small backend code change; fold into the
  model-improvements work.)

## 2. Git strategy

### Fix the branch mess first (urgent)

Rename `master` → `main` properly:

1. `git branch -m master main`
2. Force-push to `origin/main` (this rewrites what stale `origin/main` points to —
   **coordinate with teammates first**)
3. Confirm GitHub's default branch is `main`
4. Delete `origin/master`
5. Update the deploy workflow trigger from `master` to `main`
6. Teammates: re-clone or `git fetch && git checkout main`

Standardizing on `main` beats the reverse because GitHub tooling and branch protection
default to it.

### Dataset: stays on Google Drive, downloaded independently

- The dataset (~9.5 GB) **never enters git** — neither the bytes nor pointer files.
  It lives on the shared Google Drive and each teammate downloads the subset they
  need into the gitignored `ml/data/`. Not everyone needs the whole dataset all the
  time, and that's fine.
- This is a deliberate simplicity choice over a versioning tool (DVC/Git-LFS): for a
  three-person capstone, "the data is on Drive, grab what you need" has zero setup
  and zero ops. The cost is that dataset *versions* aren't automatically pinned to
  commits — managed by convention instead (a dated Drive folder per dataset
  revision, referenced from a model's MODELS.md row).

### Model weights: Drive + git tag + MODELS.md row

Trained checkpoints (`.pt`) also stay off git (they're large and regenerable). Each
iteration's weights live in a dated Drive folder; the **git tag** pins the code that
produced them and the **MODELS.md row** records the Drive location, the dataset
revision used, and the W&B run. To restore an iteration: `git checkout model/<tag>`
for the code, then download that row's weights + dataset folder from Drive. The
checkpoint itself embeds its config/threshold/provenance (see the design doc's
checkpoint contract), so a downloaded `.pt` is self-describing. Replaces the current
force-added checkpoint.

### Notebooks: keep outputs, edit linearly

We **keep** notebook outputs (figures, metrics, logs *are* the value of a research
notebook, and re-running to regenerate them is expensive) — so **no `nbstripout`**.
The base64-diff and merge-conflict risks are managed instead by discipline: notebooks
are edited **linearly** (one person at a time, push/pull handoff — they're too
convoluted to parallelize, so divergent outputs never collide) and merged via **PR +
squash** (squash collapses the noisy intermediate diffs). See the
[style guide](style-guide.md) §Notebooks for the full convention.

### Team workflow (keep it light)

- Branch protection on `main`: require a PR + 1 approving review.
- Minimal CI: frontend `npm run lint` + build; backend Ruff lint + Pyright (lenient);
  the golden-master tests once they exist (style guide §Enforcement) so PRs get a green
  check.
- **Squash-merge** for readable history.
- **Conventional Commits** (`type(scope): summary`) — there's a commit template at
  `.gitmessage` (enable once with `git config commit.template .gitmessage`). The PR
  title follows the same form since it becomes the squashed commit on `main`.
- **PR template** at `.github/PULL_REQUEST_TEMPLATE.md` (auto-populates new PRs) —
  prompts for the roadmap/finding/ADR link, the style + golden-master checklist, and
  model-iteration registration.
- **Templates only, not CI-enforced** — they guide; they don't block. No commitlint at
  this team size.
- No CODEOWNERS / heavier process — overkill at this team size.

### Versioning

Two independent axes ([ADR 0012](adr/0012-two-axis-versioning.md)):
- **Model iterations** — git tag `model/<YYYY-MM-DD>-<short-name>` + a row in
  [`ml/MODELS.md`](../ml/MODELS.md). One iteration = one tag = one row.
- **System releases** — semver `v<major>.<minor>.<patch>` on `main`: `v1.0` = fixed
  Kepler shipped, `v2.0` = JWST extension. A release notes which model tag(s) it ships.

## 3. MLOps — replacing the AnyDesk workflow

Target workflow, enabled by Tailscale:

1. **SSH instead of remote desktop.** `ssh gpu-box` from anywhere. Install **VS Code
   Remote-SSH** on the laptop: edit files living on the GPU machine with the local
   editor. For notebooks: run `jupyter lab --no-browser` on the box, open it in the
   laptop browser via the Tailscale IP — local editing experience, remote GPU kernel.
   AnyDesk becomes break-glass fallback.
2. **tmux for long runs.** Launch training inside `tmux`; detach; the run survives
   laptop sleep / Wi-Fi drops. Reattach from anywhere.
3. **Weights & Biases for experiment tracking.** Training logs metrics outbound to
   wandb.ai; all three teammates watch loss curves live from a browser; permanent record
   of every experiment's config + results. Free academic tier; ~5 lines in the train
   loop. (Alternative: self-hosted MLflow on the GPU box over Tailscale if everything
   must stay private — but W&B's zero-hosting and team dashboards win for a capstone.)
4. **Reproducibility by convention** (no pipeline tool). Hyperparameters live in
   `ml/configs/`; the training entry point is `python -m spacesight_ml.train`; W&B
   records the git commit + config for every run. A teammate reproduces a result by
   checking out that run's commit, downloading the matching dataset folder from
   Drive, and rerunning the train command. Lighter than a `dvc.yaml`/`dvc repro`
   pipeline, and adequate at this team size — revisit a real pipeline tool only if
   manual reproduction becomes a recurring pain.

The loop becomes: edit on laptop (or Remote-SSH) → push branch → on GPU box:
`git pull`, download the dataset subset from Drive if needed, launch in tmux → watch
W&B from anywhere → upload the new model `.pt` to its Drive folder + add a MODELS.md
row → PR.

Stretch goal (probably skip): GitHub Actions self-hosted runner on the GPU box for
train-on-push. tmux + W&B gets ~90% of the value at this team size.

## 4. CLAUDE.md changes

- **Check it in** (remove from `.gitignore`) — it's team documentation. Personal
  preferences go in `CLAUDE.local.md` (gitignored) or `~/.claude/CLAUDE.md`.
- **Fix staleness:** `/analyze` multi-star zip support, `totalStars`, the extra
  `/status` fields (`currentStar`, `currentStarName`, `totalStars`).
- **Document the new world** once §1–3 land: `ml/` layout, where the dataset lives
  (Drive — and how to download the subset you need), the Tailscale/SSH training
  workflow, where model weights live (Drive + MODELS.md row).
- **"Tooling Claude should use proactively" section:** run `/code-review` before PRs;
  use the `verify`/`run` skills after functional changes instead of declaring victory;
  reach for `frontend-design`/`ui-ux-pro-max` for React UI work; offer `/grill-me` when
  designing something. **Always ask before invoking.**
- **Gotchas list:** hardcoded `BASE_URL` in `src/services/api.js`, model + catalog
  required at backend startup, jobs dict is in-memory (lost on restart), KIC ID
  hardcoded to `"uploaded_star"` for API uploads.

## 5. README changes

- **Deployment section is wrong today:** claims auto-deploy to Pages on push to
  `master`, but the workflow never fires from its current location (and `master` won't
  exist after the rename). Fix workflow location + trigger; then the text becomes true.
- After restructuring: update the repo tree, add a **Training** section (link to
  `ml/README.md`), a **Getting the data** subsection (how to access the Drive folder
  and download the subset you need), and a short **Contributing** blurb (branch → PR →
  1 review → squash).
- Nice-to-haves: screenshot/GIF of the results dashboard near the top (capstone
  evaluators read READMEs), link to the W&B project once it exists.

---

## Suggested order of attack

| Phase | Work | Notes |
|---|---|---|
| 1 | Branch rename, move + fix `deploy.yml`, un-ignore CLAUDE.md, fix CLAUDE.md staleness | ~30 min of quick wins; removes active hazards. **Rename needs teammate heads-up** (force-push of `origin/main`). |
| 2 | Scaffold `ml/`, SSH remote on GPU box, confirm Drive dataset is reachable/downloadable | |
| 3 | Remote-SSH/Jupyter setup, tmux habit, W&B in the train loop, formatter/lint hooks (style guide) | |
| 4 | Branch protection, CI, README/CLAUDE.md final pass | |

After this: model, codebase, and feature improvements (separate discussion — see also
`docs/parallel-processing.md`).
