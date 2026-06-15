# Research Directions — Discussion Record & Verdicts

Date: 2026-06-11. This doc records a design discussion about where to spend the next few
months of research effort: which ideas were considered, the verdict on each, the
reasoning, and what we're doing instead. Action items live in
[ROADMAP.md](ROADMAP.md) (§5–6); this doc preserves the *why* so decisions aren't
re-litigated later.

Verdict key: ✅ adopt · 🔁 adopt in modified form · ❌ skip (reasoning recorded)

---

## 1. ❌ LSTMs for transit classification

**Considered:** replacing or augmenting the CNN with an LSTM/GRU, since transit detection
is a time-series task and recurrent models are a classic fit.

**Verdict: skip.** The reason is structural, not fashion. Within a 201-cadence window,
transit detection is a *morphology* problem — find a U/V-shaped dip wherever it sits in
the window. Multi-scale convolutions + global average pooling encode exactly that
(scale-aware pattern matching, position invariance). An LSTM's strength — carrying state
across long sequences where order and *distance* matter — buys nothing in a short window,
and costs: sequential processing (no training parallelism), harder optimization, and no
empirical gain over CNNs in the published exoplanet comparisons (CNN-vs-RNN baselines
around AstroNet; hybrid CNN→LSTM papers show marginal differences at best). LSTMs were a
reasonable thing to try in 2018; the field tried them; CNNs won this task.

**Instead:** if we want a sequence-modeling experiment, the modern, contained, and more
publishable version is a **small Transformer encoder over the CNN feature map** —
replace/augment the SE block with self-attention over the 25 downsampled time steps.
Direct precedent exists (the 2023 Transformer exoplanet paper cited in our channel
research). This is a ~one-week ablation, to be run **only after dataset v2** (ROADMAP F1/
R2) — architecture results on the leaky dataset are uninterpretable.

## 2. ❌ TimeGAN / TimeGEN for synthetic training data

**Considered:** "Timegen" resolves to two different tools, so both were assessed:
- **TimeGEN-1** (Nixtla): a *forecasting* foundation model — predicts future values of a
  series. Our task is classification; wrong tool, no further analysis needed.
- **TimeGAN** (Yoon et al. 2019): a GAN that synthesizes realistic time series —
  presumably to generate more labeled training positives.

**Verdict: skip both.** The TimeGAN goal (more positives, controlled diversity) is
excellent, but a GAN is the wrong instrument in a physics domain: months of convergence
fighting, and at the end no way to *prove* the synthetic transits are physically faithful
— which kills scientific credibility, since any reviewer asks "how do you know your
generator isn't teaching the classifier artifacts?"

**Instead: physics-based transit injection** (✅ adopted — this is the standard practice
in the field, and strictly dominates a GAN here):
- The `batman` package (already in our preprocessing notebook's install line) generates
  exact limb-darkened transit models from physical parameters (period, depth, duration,
  impact parameter, limb darkening).
- Inject synthetic transits of **known** parameters into *real* quiet-star and
  false-positive light curves → unlimited, perfectly labeled positives with real noise.
- Bonus a GAN can never provide: **injection–recovery curves** ("we recover X% of
  transits at depth Y, period Z") — the field-standard way to characterize detection
  efficiency, and exactly the recall-vs-depth analysis ROADMAP item T2 calls for.
- Leakage guard: injected and real windows from the same star must stay on the same side
  of the train/val/test split.
- Compounds with §3: injection works identically on TESS light curves, giving
  per-instrument detection-efficiency measurements.

## 3. ✅ Generalization to new telescopes

**Considered:** can the pipeline generalize to any newly launched telescope (PLATO is
imminent), or at least have meaningful scope for generalization?

**Verdict: pursue — this is the strongest research angle on the table.** Honest framing:
no model handles an unlaunched instrument's quirks sight-unseen, but a pipeline can be
**instrument-agnostic by construction**, and the claim can be *proven* by cross-instrument
transfer — which is what evaluators credit. TESS provides a free, public, labeled test
bed today (TOI catalog, `lightkurve` access — same API we already use).

The plan:
1. **Physical units everywhere.** The current pipeline is secretly Kepler-shaped
   (201 cadences × 29.4 min, BKJD timestamps, hour thresholds tuned to Kepler gaps).
   Define window length in *hours*, resample any native cadence (TESS: 2/10/30 min) onto
   a fixed-length grid. Goes into the dataset-v2 rebuild (ROADMAP R2) so data is
   regenerated once.
2. **Domain randomization in training.** Augment by varying effective cadence
   (rebinning), noise level, gap structure, baseline length — the model can't overfit to
   Kepler's observing pattern. Cheap once augmentation is on-the-fly (ROADMAP P4).
3. **The killer experiment: train on Kepler, evaluate on TESS.** Zero-shot vs fine-tuned
   transfer against TESS ground truth. A self-contained few-weeks evaluation that
   upgrades the project from "a Kepler classifier" to "a transit-detection pipeline with
   demonstrated cross-instrument generalization."
4. **Product side:** a "telescope profile" abstraction in the backend (cadence, time
   system, catalog adapter) replacing hardcoded Kepler constants.

**Scoping caveat (state it, don't hide it):** TESS's 27-day sectors mean long-period
planets show ≤1 transit — a genuinely different regime. Scope the transfer claim to
short-period planets explicitly.

## 4. 🔁 "Run Lomb-Scargle first, estimate the secondary channel" (proposed in-house)

**Considered:** the secondary channel currently depends on NASA catalog ephemerides,
making it non-generalizable (and broken at serving — ROADMAP F1). Proposal: run
Lomb-Scargle on the light curve first, estimate the period from the data itself, build
the secondary channel from that estimate — identically at training and serving time.

**Diagnosis: the instinct is exactly right; the named tool is wrong; the corrected
version was adopted as official protocol.**

- **The correct core insight:** whatever produces an input feature must be the *same
  mechanism* at training and serving. Catalog-at-train / nothing-at-serve is the F1
  mismatch. Deriving the ephemeris from the data itself fixes it in principle, and
  removes the catalog dependency that blocks generalization. Distilled principle, now
  policy: **the catalog may label training examples; it must never feature-ize them.**
- **Why LS is the wrong period-finder for transits:** LS fits sinusoids. A transit is a
  box-shaped dip with ~1–5% duty cycle — its LS power smears across harmonics, while
  stellar variability (rotation, pulsations) *is* quasi-sinusoidal and dominates the
  spectrum. On a typical light curve, LS's top peak is the star's rotation period, not
  the planet's orbital period. (Our own pipeline encodes this: the preprocessing
  notebook's Figure 3 uses LS to visualize the *variability we detrend away*, and the
  backend uses **BLS** — the matched filter for boxes — to find transit periods.)
  An LS-phased secondary channel would be confidently wrong most of the time, which is
  worse than flat fill.
- **The corrected version:** substitute BLS for LS, and the idea converges to the
  three-stage architecture in ROADMAP §4b — with one genuine improvement contributed by
  this discussion: **train the Stage-C vetting CNN on ephemerides produced by running
  the actual BLS code on the training light curves**, with the catalog used only to
  label each BLS candidate (matches a known planet or not). Training-time channel noise
  then has exactly the serving-time error statistics — same algorithm, same errors. This
  supersedes the earlier "catalog ephemerides + simulated jitter augmentation" plan.
- **The trade-off this creates:** CNN-first triage exists so stars failing triage never
  pay for BLS. Two coherent options:
  1. *(Adopted)* Keep a cheap ephemeris-free single-channel triage CNN gating BLS; BLS
     output feeds the vetting CNN.
  2. Drop triage, BLS everything, single post-BLS CNN — simpler, viable only if BLS gets
     cheap (the GPU-BLS work in [parallel-processing.md](parallel-processing.md) could
     change this calculus later; revisit then).
- **LS recast, not discarded:** as a cheap, ephemeris-free **stellar-variability
  descriptor** (LS spectrum or ACF channel) in the *triage* stage, LS is a good fit —
  no catalog, no BLS, telescope-agnostic. This fills the ROADMAP §4c slot 6.

## 5. Experiment tracking / MLOps tooling

**Considered:** W&B (assumed expensive), MLflow (self-hosted), and — once examined —
DVCLive/DVC Studio.

**Verdict: W&B, starting now (✅); MLflow as the documented fallback.**
- The cost assumption was wrong: W&B's individual free plan covers this work, and the
  **academic program** gives student teams paid-tier features free (apply with MSRIT
  affiliation). *Pricing claims as of June 2026 — verify current terms.*
- W&B fits our topology unusually well: the GPU box pushes metrics *outbound*; all three
  team members watch live runs from any browser with zero inbound access, zero
  infrastructure, automatic GPU/system metrics. This is the direct replacement for
  "AnyDesk in to see what's up."
- **MLflow fallback:** `mlflow server` on the GPU box, reached via Tailscale
  (free tier = 3 users — fits the team exactly). Free forever and private, but we become
  the ops team: server uptime, backing up `mlruns/` to Drive (a college wipe would
  otherwise destroy all experiment history), teammates must join the tailnet, dashboard
  only reachable while the box is up.
- **DVCLive/Studio** noted as the lightest-weight option (history lives in git/DVC) but
  least mature dashboard and weakest live monitoring.
- Migration risk is ~zero either way: the training loop already builds a per-epoch
  metrics dict; both tools consume it in ~10 lines (`wandb.log(epoch_record)` /
  `mlflow.log_metrics(epoch_record, step=epoch)`). Keep the CSV history as offline
  backup. Explicitly rejected: running both trackers or building an abstraction wrapper
  "for flexibility" — complexity buying nothing at this scale.
- Right-sized MLOps stack: experiment tracking (W&B, above) + dataset/weights on
  Google Drive (downloaded as needed) + a MODELS.md registry tying git tags to Drive
  folders (see the [restructure plan](repo-restructure-and-mlops-plan.md)). Model
  registries, orchestrators, serving platforms: enterprise answers to problems we
  don't have — skip.
  > **Update (2026-06-15):** the originally-planned DVC data/model versioning +
  > `dvc.yaml` pipeline was **dropped** in favour of the simpler Drive-based scheme
  > above — for a three-person capstone, "data on Drive, grab what you need" has zero
  > setup and zero ops. Revisit a real versioning/pipeline tool only if manual
  > reproduction becomes a recurring pain.

## 6. How the next few months get spent (agreed shape)

1. ROADMAP R1–R2 first (leakage probe, single-channel ablation, dataset v2 with
   physical-units preprocessing) — every experiment below is uninterpretable without it.
2. Transit injection with `batman` → detection-efficiency curves + augmented training.
3. Kepler→TESS transfer evaluation → the generalization result.
4. Optional: Transformer-encoder vs SE-block ablation.
5. Skipped, with reasoning recorded above: LSTM, TimeGAN, TimeGEN, LS-as-period-finder.
