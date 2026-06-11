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
   `models/*.pt` is ignored — confusing, and superseded by DVC below.
5. CLAUDE.md is stale: it describes `/analyze` as single-`.npz`-only returning
   `{ jobId }`, but the backend now accepts multi-star zips and returns `totalStars`
   (README is correct; CLAUDE.md predates PR #1).

---

## 1. Directory restructure

Core idea: notebooks come into the repo; the **dataset never does** — git tracks
lightweight DVC pointer files while the bytes live on a remote (§2).

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
│   ├── configs/               experiment configs (params.yaml for DVC)
│   ├── data/                  gitignored contents; DVC pointer files tracked
│   │   ├── raw/               the ~9.5 GB from Drive
│   │   └── processed/         windowed/labeled training tensors
│   ├── dvc.yaml               pipeline: preprocess → train → evaluate
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

### Dataset versioning: DVC, with the GPU machine as the remote

- Git LFS is wrong for 10 GB (GitHub free tier ~1–2 GB, bandwidth caps).
- `dvc add ml/data/raw` produces a tiny `.dvc` pointer file that git tracks; the data
  syncs with `dvc push` / `dvc pull`.
- **Remote = the GPU box itself, over SSH via Tailscale**
  (`ssh://gpu-box/home/<user>/dvc-storage`). The data must live there for training
  anyway, Tailscale makes it reachable from all three laptops, it's free, and it skips
  the pain of DVC's Google Drive remote (Google's OAuth policy changes require creating
  your own GCP OAuth client).
- Keep the existing Drive copy as a **manual cold backup** (refresh occasionally with
  rclone) in case the college machine is wiped.

### Model weights through DVC too

Once retraining regularly, the trained `.pt` becomes an output of the `dvc.yaml`
pipeline — every model version tied to the exact code + data + params that produced it.
Replaces the current force-added checkpoint.

### Notebooks: strip outputs

Pre-commit hook running `nbstripout`. Otherwise every run produces megabytes of base64
PNG diffs and JSON merge conflicts. Highest-value hook for a notebook-heavy team.

### Team workflow (keep it light)

- Branch protection on `main`: require a PR + 1 approving review.
- Minimal CI: frontend `npm run lint` + build; backend `python -m compileall` (pytest
  once tests exist) so PRs get a green check.
- Squash-merge for readable history.
- No CODEOWNERS / heavier process — overkill at this team size.

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
4. **DVC pipeline as the reproducibility layer.** `dvc.yaml` stages
   `preprocess → train → evaluate`; hyperparameters in `params.yaml`; `dvc repro` reruns
   only what changed; `dvc exp run` to queue hyperparameter variations. Any teammate
   reproduces any result with `git pull && dvc pull && dvc repro`.

The loop becomes: edit on laptop (or Remote-SSH) → push branch → on GPU box:
`git pull && dvc pull`, launch in tmux → watch W&B from anywhere → `dvc push` the new
model → PR.

Stretch goal (probably skip): GitHub Actions self-hosted runner on the GPU box for
train-on-push. tmux + W&B gets ~90% of the value at this team size.

## 4. CLAUDE.md changes

- **Check it in** (remove from `.gitignore`) — it's team documentation. Personal
  preferences go in `CLAUDE.local.md` (gitignored) or `~/.claude/CLAUDE.md`.
- **Fix staleness:** `/analyze` multi-star zip support, `totalStars`, the extra
  `/status` fields (`currentStar`, `currentStarName`, `totalStars`).
- **Document the new world** once §1–3 land: `ml/` layout, the DVC commands teammates
  need (`dvc pull` before training, `dvc push` after), the Tailscale/SSH training
  workflow, where data lives.
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
  `ml/README.md`), a **Getting the data** subsection (`dvc pull` + how to get access to
  the remote), and a short **Contributing** blurb (branch → PR → 1 review → squash).
- Nice-to-haves: screenshot/GIF of the results dashboard near the top (capstone
  evaluators read READMEs), link to the W&B project once it exists.

---

## Suggested order of attack

| Phase | Work | Notes |
|---|---|---|
| 1 | Branch rename, move + fix `deploy.yml`, un-ignore CLAUDE.md, fix CLAUDE.md staleness | ~30 min of quick wins; removes active hazards. **Rename needs teammate heads-up** (force-push of `origin/main`). |
| 2 | Scaffold `ml/`, DVC init, SSH remote on GPU box, migrate the 9.5 GB from Drive | |
| 3 | Remote-SSH/Jupyter setup, tmux habit, W&B in the train loop, nbstripout hook | |
| 4 | `dvc.yaml` pipeline, branch protection, CI, README/CLAUDE.md final pass | |

After this: model, codebase, and feature improvements (separate discussion — see also
`docs/parallel-processing.md`).
