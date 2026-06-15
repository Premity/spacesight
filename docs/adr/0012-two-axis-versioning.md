# ADR 0012 — Two-axis versioning: model iterations vs. system releases

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

The roadmap talks about "model v2" (the post-F1 retrained triage model) and also about
shipping "the fixed Kepler system" and later "the JWST version." These are **two
different things changing on two different clocks**:

- A *model iteration* changes when the CNN is retrained (new data, new architecture,
  new channels) — potentially many times, including failed attempts.
- A *system release* changes when a milestone of the whole application ships (fixed
  Kepler, then the JWST extension) — rarely.

If a single version number covers both, "model v2" and "system v2" collide and mean
nothing precise. The MODELS.md scheme already versions *models* (git tag
`model/<date>-<name>` + a registry row). What's missing is a version axis for *system
releases*.

## Decision

Use **two independent version axes**, each with its own tag namespace:

### Model axis — the trained CNN
- Tag: `model/<YYYY-MM-DD>-<short-name>` (e.g. `model/2026-04-10-inception-resnet-v3`).
- Recorded as a row in [`ml/MODELS.md`](../../ml/MODELS.md): tag, date, W&B run, Drive
  folder (weights), dataset revision, channels, test metrics, deployed?.
- One model iteration = one tag = one row. This is the existing scheme
  ([ADR 0011](0011-notebook-package-backend-promotion.md) / restructure plan); this ADR
  just confirms it as the canonical model axis.

### System axis — the application/release
- Tag: semver-style `v<major>.<minor>.<patch>` on `main`.
- Milestones:
  - `v0.x` — current and pre-fixed-Kepler states.
  - **`v1.0` — FIXED KEPLER shipped** (the "model v2 shipped" definition in
    [ROADMAP.md](../ROADMAP.md): single-channel triage on dataset v2, star-level
    threshold in checkpoint, three-stage pipeline, depth-stratified metrics).
  - **`v2.0` — JWST extension shipped.**
  - Minor/patch bumps for smaller releases between milestones.

The two axes reference each other but never merge: a system release records *which
model tag(s)* it ships (in the release notes / MODELS.md "deployed?" column); a model
tag does not imply a system release.

## Alternatives considered

- **Single version line** (one number for model + app). Rejected: "model v2" and
  "system v2" would be the same tag, conflating the two clocks the roadmap treats
  separately — exactly the ambiguity this ADR removes.
- **Only model tags, no system versions.** Rejected: leaves no clean marker for "we
  shipped fixed Kepler" / "we shipped JWST" — the milestones the whole plan is oriented
  around.

## Examples

A worked timeline showing the two axes advancing independently:

```
SYSTEM axis (v* tags on main)        MODEL axis (model/ tags + MODELS.md rows)
─────────────────────────────        ──────────────────────────────────────────
v0.1  current demo (leaky model)  ←── model/2026-04-10-inception-resnet-v3
                                       (the current 2-channel model; deployed in v0.1)

  ... R1–R3 work ...                   model/2026-07-xx-triage-single-channel
                                       (first honest single-channel ablation — may not ship)
                                       model/2026-08-xx-triage-v2
                                       (dataset-v2 triage, star-level threshold)

v1.0  FIXED KEPLER shipped         ←── ships: model/2026-08-xx-triage-v2
                                              + model/2026-09-xx-vet-v1
v1.1  bugfix release               ←── ships: same two model tags (no model change)
v1.2  add Mandel-Agol overlay      ←── same model tags (display-only change)

  ... R5 research ...                  model/2026-1x-xx-triage-tess-finetune
                                       (TESS transfer — a model iteration, no system release)

v2.0  JWST extension shipped       ←── ships: the v1.x Kepler models
                                              + model/2027-xx-xx-molecule-cnn-v1
```

Read it as two clocks. Notice:
- Several **model** tags exist between `v1.0` and `v2.0` (retrains, the TESS fine-tune)
  without any system release — model iterations are frequent, releases are rare.
- `v1.1` and `v1.2` ship the **same** model tags as `v1.0` — a system release does not
  imply a model change (a bugfix or a display feature bumps the system version only).
- A system tag's release note lists the model tag(s) it deploys (the `←── ships:`
  column); that is the only place the two axes are tied together.

Concrete tag commands:

```bash
# model iteration (on the commit that produced the weights)
git tag model/2026-08-15-triage-v2
# ...then add the MODELS.md row (Drive folder, dataset rev, W&B run, metrics)

# system release (on main, at the milestone)
git tag v1.0
```

## Consequences

- "model v2" unambiguously means a `model/` tag + MODELS.md row; "v1.0" unambiguously
  means the fixed-Kepler system release. No collision.
- The fixed-Kepler milestone gets a concrete tag (`v1.0`) that the roadmap's
  "definition of model v2 shipped" maps onto.
- Release notes for a `v*` tag list the model tag(s) deployed, tying the two axes
  together at ship time.
- Light-touch: no release-automation tooling mandated; tags + MODELS.md rows + a short
  release note are enough at this team size.
