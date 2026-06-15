# Model Registry

One row per training iteration. Conventions in [README.md](README.md) §"Archiving model
iterations" — tag format `model/<YYYY-MM-DD>-<short-name>`, checkpoint must embed
config/metrics/threshold/commit/data-revision, weights live in a dated Google Drive
folder (recorded here), logs/figures in W&B. The MODELS.md row is the link between a git
tag, its weights on Drive, and the dataset revision used — keep it accurate.

This is the **model version axis** (distinct from the **system release axis**, `v*`
tags on `main`) — see [ADR 0012](../docs/adr/0012-two-axis-versioning.md). A system
release records which model tag(s) it ships.

| Version | Date | Git tag | W&B run | Drive folder (weights) | Dataset rev | Channels | Test metrics | Deployed? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Third Iteration — InceptionResNet1D dual-channel | 2026-04-10/11 | *(pre-convention; tag retroactively)* | *(pre-W&B)* | `models/2026-04-10 Third Iteration/inception_ResNet/` | *(pre-convention)* | 2 (primary + secondary) | AUC 0.9415 · P 0.610 · R 0.932 @ t=0.69 (window-level) | ❓ | Trained on RTX 3070, 80 epochs. Metrics are upper bounds — secondary-channel leakage (ROADMAP F1). |
| *(earlier iterations)* | — | — | — | Drive date-folders | — | 1 | — | — | Backfill best checkpoints + rows when convenient; leave the rest in Drive. |

**Provenance gap to resolve:** `spacesight-backend/models/exoplanet_cnn_model.pt` (the
deployed weights) is not yet pinned to any iteration above. Identify which run produced
it, tag it, record its Drive folder, and mark the Deployed column.
