# SpaceSight — Development Roadmap (Single Source of Truth)

Last updated: 2026-06-11. Consolidates: review of the two training notebooks (`ml/`),
the converted future-implementation PDFs, the backend inference code, and the
[repo restructure & MLOps plan](repo-restructure-and-mlops-plan.md). The
[parallel-processing design doc](parallel-processing.md) covers serving-side
throughput and remains separate. Research-direction verdicts (LSTM, TimeGAN/TimeGEN,
telescope generalization, the LS-vs-BLS ephemeris discussion, tracking-tool choice) are
recorded with full reasoning in
[research-directions-discussion.md](research-directions-discussion.md) — summarized in
§5 below.

**Current model:** Dual-channel InceptionResNet1D (~ ch0 primary window, ch1
secondary-eclipse window), trained 2026-04 on RTX 3070, 80 epochs.
Val AUC **0.9429** / Test AUC **0.9415**; at t=0.69: P≈0.60, R≈0.93 (window-level).

---

## 1. Critical findings (fix before anything else)

### F1 — Secondary channel: label leakage in training, dead weight in serving ⚠️

This is the most important finding in the review.

**Training side:** in the preprocessing notebook, channel 1 is built from KOI catalog
ephemerides. For planet-host stars it contains real flux; for false-positive stars it is
**always flat fill (1.0)**. Channel-1 "flatness" therefore correlates directly with the
label. The CNN can learn *"ch1 has noise → planet star"* as a shortcut, without learning
anything about secondary eclipses. Because val/test are built the same way, this shortcut
**inflates val/test metrics too** — the reported "+15 points of precision from the second
channel" may be partly or largely this leak, not eclipse physics.

**Serving side:** uploaded stars get `kic_id="uploaded_star"`; in
`processor.py → _get_known_transits`, digit extraction yields nothing, the catalog lookup
fails, and **channel 1 is always flat 1.0 for every uploaded star**. So in production:
(a) the channel carries zero information, and (b) given the training correlation, a flat
ch1 actively pushes the model toward "not a planet" — uploaded planet hosts look like
training negatives.

**Actions:**
1. **Leakage probe (cheap, do first):** on val, compare model output distributions for
   windows grouped by ch1-flat vs ch1-real, within the same label. Also train/eval a
   trivial classifier on `std(ch1)` alone — if it gets meaningful AUC, the leak is real.
2. **Single-channel ablation:** retrain with `in_channels=1` on `windows/`, identical
   settings. This is the honest baseline the +15-precision claim must beat.
3. **Fix the construction** so ch1's *availability* is label-independent: for FP stars,
   extract ch1 using the FP KOI's own ephemeris (FP KOIs have periods in the catalog);
   never use a fill pattern that only one class receives. AstroNet's convention (fold
   negatives on a random period) is the model to copy.
4. Until fixed, treat current val/test numbers as **upper bounds**, and expect deployed
   performance on uploads to be worse than reported.

### F2 — Train/serve preprocessing mismatch (verify & align)

The backend detrends with WH smoothing **with asymmetric weighting for variable stars**
(per `processor.py` / CLAUDE.md). The training notebook uses **plain symmetric WH**
(`wh_lambda=1e6, p=2`). If the serving detrend differs from the training detrend, the CNN
sees a shifted input distribution at inference. Diff the two implementations
function-by-function; either port the backend's exact preprocessing into training, or
(better, post-restructure) make both import **one** implementation from
`ml/src/spacesight_ml/`. The same applies to window normalisation (`np.nan_to_num` after
median-divide in backend vs interpolate-then-divide in training).

### F3 — Threshold provenance is inconsistent: 0.74 vs 0.69 vs 0.70

The automatic sweep selected **0.74**; it was manually overridden to **0.69** (defensible
recall-first choice, documented in the run summary); the backend ships with
`cnn_threshold=0.70`, matching neither. Worse, the override was done by hand-editing the
Section 6 cell (the original computation is commented out; `final_val_metrics` is
referenced before being computed; `BEST_THRESHOLD = 0.69` is assigned *after* it's used).
**Actions:** pick the operating threshold via the documented science case, write it into
the checkpoint (already supported), and make the backend **read the threshold from the
checkpoint** instead of hardcoding it. Restore the Section 6 cell to runnable form.

### F4 — Failed downloads are never retried

In the full-dataset download loop, `done_ids` is built from *all* manifest rows —
including `status='failed'` — so failed stars are excluded from `pending` on every rerun.
The "re-run this cell to retry" message is wrong; those stars are silently lost from the
dataset. Fix: exclude `failed` rows when building `done_ids`, or add a retry pass.

### F5 — Notebooks are not runnable top-to-bottom

Known breaks: `ANNOT_COLOR` used in the Figure-5 cell but defined only inside the
Figure-7 cell; the Section-8 "recovery" cell reads `star_labels_modified.csv` (and prints
`STAR_LABELS_PATH`) before the cell that creates either; Step 8 shadows Step-6 functions
in kernel scope with "run these cells first" ordering rules; the training notebook's
Section 6 references commented-out variables (F3). This is the strongest argument for the
planned migration of stable logic into `ml/src/spacesight_ml/` — notebooks become thin
drivers that can't accumulate hidden cell-order dependencies.

---

## 2. Preprocessing notebook — full critique

Beyond F1/F4/F5. Strengths worth keeping: manifest-based resumable downloads, star-level
split (correct leakage defence), EDA figures that justify design constants, per-segment
detrending, batched window shards, the windows_plus output audit.

| # | Issue | Detail / suggested fix |
|---|-------|------------------------|
| P1 | Boundary-window label noise | A window whose edge clips a transit (midpoint just outside the ±0.5×duration buffer) is labeled 0 while containing a partial dip. Standard fix: **drop ambiguous windows** (midpoint within ±1 duration of the window edge but failing the strict test) from training instead of labeling them negative. The run summary itself identifies this as a likely cause of the precision ceiling. |
| P2 | Global sigma-clip before segmentation | 5σ computed on the whole stitched curve; inter-quarter offsets (1–5%) inflate the std and weaken the clip. Clip **per segment**, and use a robust scale (MAD) instead of std. |
| P3 | WH baseline absorbs transits | The smoother fits *through* dips, biasing depths shallow — especially for long transits relative to λ. Mask known in-transit cadences before fitting (train side has ephemerides), or implement the same asymmetric reweighting the backend uses (ties into F2). One fixed `wh_lambda=1e6` for all stars is also crude; consider per-star λ by variability. |
| P4 | Augmentation is baked to disk | 3×/2× copies written into `windows_plus` inflate storage and freeze diversity. Move noise/phase-shift into the PyTorch `Dataset.__getitem__` (fresh draw every epoch). This also removes the unintended class-rebalancing (3 copies for pos vs 2 for neg contradicts the stated "pos_weight handles imbalance" philosophy and silently moves the natural ratio). |
| P5 | `np.roll` phase shift wraps the seam | Rolling wraps flux from one edge to the other, creating a discontinuity artifact and (for transits near the right edge) wrapping the dip across the boundary. Use a crop-and-pad shift or sample the window at an offset start index instead. |
| P6 | Secondary extraction details | `t_secondary = t_center + P/2` always looks *forward*; the nearest secondary may be at −P/2. For no-transit windows on host stars, `tperiods[0]` is an arbitrary choice. Both fine once F1's redesign happens — handle then. |
| P7 | `quarter` array is a collection index, not the Kepler quarter number | `enumerate(lc_collection)` indexes downloaded files; harmless today (only used for plot boundaries) but will bite if quarter-dependent logic is added. Use `lc.meta['QUARTER']`. |
| P8 | Dead/misleading code | `is_pos = kic_id in train_set \| val_set \| test_set` (unused); `koi_meta` built in 8.1 but never consumed; markdown "8.4 reuses flush_batch" while the code defines `flush_batch_plus`. |
| P9 | Drive I/O pattern | Thousands of per-star `.npz` files on Drive is the slowest possible layout for Colab. Resolved by the move to the GPU box + DVC (restructure plan), but consider sharding `raw/` and `processed/` like `windows/` when migrating. |

## 3. Training notebook — full critique

Strengths worth keeping: the streaming pre-batched dataset (real measured win),
unweighted-loss comparability fix, collapse-direction-aware early-stopping guard,
three best-metric checkpoints + crash-safe history CSV, run-once test-set discipline
(stated, mostly followed), honest PR-curve-first reporting.

| # | Issue | Detail / suggested fix |
|---|-------|------------------------|
| T1 | **No star-level evaluation** | All metrics are window-level, but the product decision is star-level: backend triages on `max(window prob) ≥ cnn_threshold`. Correlated overlapping windows (stride 50 over length 201 → 75% overlap) make window metrics optimistic, and max-aggregation is FP-sensitive. Add a star-level eval: per star, aggregate window probs (max / top-k mean), report star recall & FP rate vs threshold. **This, not the window sweep, should set `cnn_threshold`.** |
| T2 | No recall-vs-depth/SNR breakdown | One aggregate recall hides whether the model only finds hot Jupiters. Stratify test recall by `koi_depth`, `koi_model_snr`, period. Defines the detection floor for the README/report. |
| T3 | Batches never mix across shard files | Each yielded batch comes from one `batch_*.npz` (~100 stars, same augmentation families). Gradient batches are correlated, and a shard dominated by one pathological star is a plausible mechanism for the **epoch-76 loss spike**. Add a shuffle buffer that interleaves windows across several open shards. |
| T4 | `lr=5e-6` as OneCycle max_lr | Extremely low for AdamW (typical 1e-3–3e-3 for this size); with div_factor=25 the warmup starts at 2e-7, making OneCycle's shape pointless. If high LRs were unstable, that's worth knowing *why* (often the leakage/imbalance interplay or T3). Run an LR-range test; revisit after F1. |
| T5 | Weight-init pseudo-rigor | The 1.702 "GELU gain" justification conflates the GELU sigmoid approximation constant with an init gain, and the cited SELU paper doesn't establish it. Default Kaiming init is fine for a 4-block network with BN; delete the custom scaling unless an A/B shows benefit. |
| T6 | Doc-rot between markdown and code | `min_recall` 0.95 vs 0.85; pos_weight "3.2 changed from 5.0" vs 4.2; "monitors val recall" vs AUC; peak-LR print uses 0.3 while `pct_start=0.2`; `NpzInMemoryDataset` docstring says "always 1" channel for 2-channel data. Sweep and fix when porting to `ml/src/`. |
| T7 | Per-epoch full checkpoints | 80 × (model+optimizer+scheduler) state to Drive is wasteful; keep best-X checkpoints + last, or save weights-only for the per-epoch series. |
| T8 | Eval loss criterion inconsistency | Section 6 val inference and Section 8 test inference use the **weighted** criterion while the training loop reports unweighted val loss — losses aren't comparable across sections. Use `criterion_unweighted` for all reported eval losses. |
| T9 | No AMP / mixed precision | `torch.autocast` + `GradScaler` is a near-free ~2× speedup on the 3070 for this model. |
| T10 | No experiment tracking | 16-hour runs with results spread across logs/CSv/JSON/figures. W&B integration (see MLOps plan) replaces all of it and gives the team live visibility. |
| T11 | Checkpoint/threshold coupling bug | Section 6 writes `best_threshold` into `BEST_CKPT_PATH` even when `EVAL_MODE` selected a different checkpoint; Section 8 then asserts the threshold exists in `eval_ckpt_path`. Write the threshold into the checkpoint actually being evaluated. |

## 4. Critique of the future-implementation plans

The two converted PDFs are AI-chat transcripts, not vetted engineering docs — this
ROADMAP supersedes them; keep them as appendix references. The channel research itself is
well-sourced (AstroNet, ExoNet, NASA DV) and the run-interpretation doc is largely sound
(the epoch-76 analysis, the precision-ceiling hypotheses, and its five next steps are all
reasonable — and notably, its own #3 admits the ablation needed to support the
"+15 precision from ch1" claim was never run).

Two structural problems cut across the entire channel roadmap:

### 4a. Almost every proposed channel needs an ephemeris the serving pipeline doesn't have

Global phase-folded view, local phase-folded view, and odd/even depth difference all
require a period + t₀ **per candidate**. In training these come from the KOI catalog. At
serving time, SpaceSight runs **CNN before BLS** — no period exists when the CNN runs.
Centroid channels are worse: they need pixel-level data, and uploaded `.npz` files contain
only `time`/`flux`. Building these channels as proposed recreates F1's train/serve
mismatch at scale.

**The literature models (AstroNet, ExoNet) are post-search vetters** — they classify TCEs
*after* a BLS/TPS search has produced ephemerides. SpaceSight currently uses its CNN as a
*pre-search triage*. These are different problems, and the channel list belongs to the
first one.

### 4b. Proposed recommendation: split into triage + vetting (two-stage architecture)

1. **Stage A — Triage CNN (pre-BLS):** single-channel (ch0 only), ephemeris-free,
   cheap. Its only job is "is this star worth a BLS run?" Tune for very high star-level
   recall; precision matters less. This is roughly the current model minus the broken ch1.
2. **Stage B — BLS search:** unchanged (per-segment power summing, pre-whitening).
   Produces candidate (P, t₀, duration) per detection.
3. **Stage C — Vetting CNN (post-BLS):** *this* is where the channel roadmap lives.
   With BLS ephemerides in hand, every high-value channel becomes constructible at
   serving time exactly as in training: global fold, local fold, secondary at phase 0.5,
   odd/even difference, transit-subtracted residual. Its output replaces/augments the
   current harmonic-guard physics checks and directly attacks the 0.60 precision ceiling.

**Stage-C training protocol (adopted, supersedes the earlier jitter-augmentation idea —
see [discussion doc §4](research-directions-discussion.md)):** build Stage-C training
features by running the **actual BLS code on the training light curves**; use the KOI
catalog only to *label* each BLS candidate (matches a known planet or not). Training-time
channel noise then has exactly the serving-time error statistics — same algorithm, same
errors. Governing principle: **the catalog may label training examples; it must never
feature-ize them.** (A "BLS everything, drop triage" single-model variant becomes viable
if GPU-BLS from [parallel-processing.md](parallel-processing.md) makes BLS cheap —
revisit then.)

This makes the secondary-eclipse idea *correct* — at the vetting stage — and resolves F1
permanently.

### 4c. Vetted channel priority (for the Stage-C vetting model)

| Priority | Channel | Servable post-BLS? | Notes |
|---|---|---|---|
| 1 | Global phase-folded view | ✅ | Biggest literature-backed gain (AstroNet ablation); EB signatures live here |
| 2 | Local phase-folded view | ✅ | Stacked-SNR vs single-window comparison; fold negatives on random period (label-independent fill — the lesson of F1) |
| 3 | Secondary eclipse (rebuilt) | ✅ | Current ch1, but constructed from BLS ephemeris, identically for both classes |
| 4 | Odd/even depth difference | ✅ | NASA DV test; fill must be label-independent (zeros for *all* windows lacking neighbours, both classes) |
| 5 | Transit-subtracted residual | ✅ | Orthogonal signal; no extra metadata needed |
| 6 | Out-of-transit ACF or LS variability spectrum | ✅ (also pre-BLS) | The one channel usable in Stage A too — stellar-variability context, ephemeris-free. (LS is correct *here*, as a variability descriptor — not as a transit period finder; see discussion doc §4) |
| — | Centroid / difference-image channels | ❌ | Requires pixel data not present in `.npz` uploads. Park unless the input format grows a TPF option; revisit for a "fetch from MAST by KIC ID" feature where pixel files are obtainable |

### 4d. Other notes on the run-summary doc

- The precision-ceiling investigation it proposes (audit the 126K FP windows visually) is
  right — do it **after** the F1 leakage probe, since the leak may reshape the FP set.
- The epoch-76 spike investigation should add T3 (single-shard batches) as a hypothesis
  alongside its weight-diff plan; gradient-norm logging per step (free with W&B) would
  catch the next one in the act.
- pos_weight 4.2 → ~3.5 suggestion is sensible; re-derive after augmentation moves
  on-the-fly (P4), since that changes the natural ratio it's calibrated against.

---

## 5. Research directions (verdicts)

Full reasoning in [research-directions-discussion.md](research-directions-discussion.md);
summary table here so the roadmap stays self-contained:

| Idea | Verdict | One-line reason | Do instead / notes |
|---|---|---|---|
| LSTM/GRU architecture | ❌ Skip | Transit detection in a short window is morphology, not long-range sequence — CNNs won this comparison in the literature | Optional contained ablation: small Transformer encoder over CNN features (post-dataset-v2 only) |
| TimeGEN-1 (Nixtla) | ❌ Skip | Forecasting foundation model; ours is a classification task | — |
| TimeGAN synthetic data | ❌ Skip | Can't prove physical fidelity of GAN transits; months of convergence risk | **Transit injection with `batman`** (✅ adopted): known-parameter transits into real light curves → unlimited labeled positives + injection–recovery curves (feeds T2) |
| Telescope generalization | ✅ Pursue | Strongest research angle; TESS is a free labeled test bed, PLATO imminent | Physical-units preprocessing (into R2), domain randomization, **Kepler→TESS transfer eval**, backend "telescope profile" abstraction. Scope claims to short-period planets (27-day TESS sectors) |
| LS-first secondary channel | 🔁 Adopt modified | Right instinct (derive features from data, not catalog); wrong tool (LS finds sinusoids/rotation, not box transits) | Became the **Stage-C BLS training protocol** in §4b; LS recast as variability channel (§4c #6) |
| Experiment tracking | ✅ W&B | Free for academic teams (verify terms); outbound-push fits the GPU-box topology; zero ops | MLflow on GPU box via Tailscale as documented fallback; keep CSV history as offline backup; no dual-tracker wrappers |

## 6. Execution order

Phases 0–1 of the [repo restructure plan](repo-restructure-and-mlops-plan.md)
(branch fix, `ml/` scaffold, DVC, SSH/W&B workflow) are prerequisites and proceed in
parallel.

| Phase | Work | Outcome |
|---|---|---|
| **R1 — Truth audit** | F1 leakage probe; single-channel ablation; star-level eval (T1); recall-vs-depth breakdown (T2) | Honest baseline numbers; know how much of the dual-channel gain is real |
| **R2 — Data fixes** | F4 retry fix; P1 ambiguous-window dropping; P2 per-segment robust clipping; F2 preprocessing alignment (single shared implementation in `ml/src/`); **physical-units windowing** (hours, not cadences — §5 generalization); regenerate dataset | Clean dataset v2, train/serve parity, instrument-agnostic by construction |
| **R3 — Training rebuild** | Port notebook logic to `ml/src/spacesight_ml/` (fixes F5, T6); on-the-fly augmentation (P4, P5); cross-shard shuffle buffer (T3); AMP (T9); W&B (T10); LR-range test (T4); retrain single-channel triage model | Reproducible `python -m spacesight_ml.train`; triage model v2 with star-level-selected threshold (F3) |
| **R4 — Two-stage architecture** | Implement Stage-C vetting model with channels 1–5 from §4c, trained via the **BLS-derived-ephemeris protocol** (§4b); backend pipeline becomes triage → BLS → vetting; backend reads thresholds from checkpoints; TorchScript export | Precision attack on the 0.60 ceiling; channels finally constructible at serving time |
| **R5 — Research results** | **Transit injection with `batman`** (detection-efficiency curves, augmented training set); **Kepler→TESS transfer evaluation** (zero-shot + fine-tuned, short-period scope); domain-randomization augmentation | Injection–recovery characterization per instrument; the cross-instrument generalization result |
| **R6 — Stretch** | ACF/LS variability channel in triage; Transformer-encoder vs SE-block ablation; backend "telescope profile" abstraction; centroid channels if TPF input lands; calibration (temperature scaling) so thresholds transfer across retrains | |

**Definition of "model v2 shipped":** single-channel triage model trained on dataset v2,
star-level evaluated, threshold stored in checkpoint, backend loading it via TorchScript,
metrics reported in README with the depth-stratified recall table.
