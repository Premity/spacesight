# SpaceSight — Model Training (`ml/`)

Everything related to building and training the exoplanet CNN lives here. The serving
side (FastAPI backend that *uses* the trained model) lives in `spacesight-backend/`.

**Status (June 2026):** this directory holds the two research notebooks and is currently
gitignored (research not yet published — the team decides when to start committing it).
The plans below describe the target state; see
[docs/repo-restructure-and-mlops-plan.md](../docs/repo-restructure-and-mlops-plan.md)
for the migration plan and [docs/ROADMAP.md](../docs/ROADMAP.md) for what gets built in
what order.

## Layout

```
ml/
├── notebooks/             exploration & smoke tests (thin — stable code moves to src/)
├── src/spacesight_ml/     importable package: data.py, model.py, train.py, evaluate.py
├── configs/               hyperparameters per experiment
├── data/                  gitignored; downloaded from Drive, never committed
│   ├── raw/               per-star light curves from MAST (download what you need)
│   └── processed/         detrended curves, windowed training shards
├── MODELS.md              model registry (see "Archiving model iterations")
└── README.md              this file
```

Today's reality: the two dated notebooks at the top level are the pipeline
(`Preprocessing + Second Channel` → builds the windowed dataset;
`Dual-Channel InceptionResNet Model Building` → trains and evaluates). They get ported
into `src/` during roadmap phase R3.

## Ground rules

1. **Data never goes into git.** The ~10 GB dataset lives on Google Drive; each
   teammate downloads the subset they need into the gitignored `data/`. Not everyone
   needs the whole dataset all the time.
2. **The KOI catalog may label training examples; it must never feature-ize them.**
   Any input channel must be constructible at serving time from the light curve alone
   (or from BLS output). See ROADMAP §4b and finding F1 for why this rule exists.
3. **Notebooks are for exploration.** When a cell stabilizes, it moves into
   `src/spacesight_ml/` and the notebook imports it. Notebook outputs are stripped
   before commit (`nbstripout` pre-commit hook) once notebooks are tracked.
4. **One preprocessing implementation.** Training and the backend must import the same
   detrending/windowing code — never maintain two copies (finding F2).

## Training workflow

Training runs on the college GPU machine (Ubuntu, reachable over Tailscale).

```bash
# from your laptop
ssh <gpu-box>                 # via Tailscale; VS Code Remote-SSH also works
tmux new -s train             # long runs must survive disconnects
git pull                      # sync code
# download the dataset subset you need from Drive into ml/data/ (if not already there)
python -m spacesight_ml.train
# detach (Ctrl-B D) and watch the run live on the W&B dashboard
# when done: upload the new .pt to its dated Drive folder + add a MODELS.md row
```

- **Experiment tracking: Weights & Biases** — metrics, configs, figures, and GPU stats
  are logged per run; the whole team watches from a browser. Keep the local CSV history
  writer as the offline backup.
- For notebook work: run `jupyter lab --no-browser` on the box, open it from your laptop
  via the Tailscale IP.

## Archiving model iterations

The old system (dated folders on Google Drive containing model + logs + figures + a copy
of the notebook) is replaced by a lighter scheme — git records the *code*, W&B records
the *run*, Drive holds the *bytes*, and MODELS.md ties them together:

| Old date-folder contents | Where it lives now |
|---|---|
| Copy of the notebook used | The **git commit hash** (W&B records it automatically) |
| Logs, metrics, figures | The **W&B run** |
| Model weights | A **dated Google Drive folder** (the `.pt`) |
| The folder itself | A **git tag** + a **MODELS.md row** |

**The discipline: one model iteration = one git tag**, named
`model/<YYYY-MM-DD>-<short-name>` (e.g. `model/2026-04-10-inception-resnet-v3`). The tag
pins the code; the **MODELS.md row** records the Drive folder holding the weights, the
dataset revision used, and the W&B run. To restore any iteration ever:

```bash
git checkout model/<tag>     # the code
# then download that row's weights + dataset folder from Drive
```

Because weights aren't auto-pinned to commits (no DVC), the MODELS.md row is the link —
keep it accurate. The checkpoint itself embeds its own config/threshold/provenance, so a
downloaded `.pt` is self-describing even if separated from its row.

Additional rules:

- **Checkpoints embed their own provenance:** `train_cfg`, val metrics, the operating
  threshold, the git commit hash, and the data revision. A checkpoint found on a random
  disk should be able to testify about its origins. The backend reads the operating
  threshold *from the checkpoint* — never hardcode it server-side (finding F3).
- **Register every iteration in [MODELS.md](MODELS.md):** version, date, tag, W&B run
  link, Drive folder, dataset revision, test metrics, and whether it is the deployed
  model.
- **Keep best-per-metric + last checkpoints only.** Do not archive all per-epoch
  checkpoints (roadmap T7).

## Where to read more

- [docs/kepler-system-design.md](../docs/kepler-system-design.md) — the canonical
  backend design (the three-stage architecture, the checkpoint contract this registry
  feeds, core-vs-profile)
- [docs/ROADMAP.md](../docs/ROADMAP.md) — findings from the June 2026 review, the
  three-stage triage→BLS→vetting architecture, channel priorities, execution phases
- [docs/research-directions-discussion.md](../docs/research-directions-discussion.md) —
  why LSTM/TimeGAN were skipped, the transit-injection and Kepler→TESS plans, tooling
  verdicts
- [docs/repo-restructure-and-mlops-plan.md](../docs/repo-restructure-and-mlops-plan.md)
  — dataset-on-Drive workflow, git workflow, CLAUDE.md/README plans
