# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SpaceSight is a two-part application for detecting exoplanet candidates in Kepler telescope light curve data. Users upload a `.npz` file (one star) or a `.zip` of up to 20 `.npz` files (multi-star), each containing raw time/flux arrays; the backend runs a CNN+BLS pipeline and returns planet candidates with visualizations.

> **Docs orientation.** This file describes the system *as it currently exists*. The **target (fixed) design** — the three-stage Triage→Search→Vet architecture, the F1 fix, core-vs-profile, the checkpoint contract — lives in [docs/kepler-system-design.md](docs/kepler-system-design.md), with decisions in [docs/adr/](docs/adr/), execution order in [docs/ROADMAP.md](docs/ROADMAP.md), and the glossary in [CONTEXT.md](CONTEXT.md). When working on the system, prefer the design doc as the source of truth for *where it's going*; use this file for *what's there now*.

## Repository Structure

```
spacesight-backend/   # Python FastAPI backend
spacesight-frontend/  # React + Vite + Tailwind frontend
```

## Backend (spacesight-backend/)

### Installing dependencies

```bash
cd spacesight-backend
bash setup.sh
```

`setup.sh` installs everything in `requirements.txt` then detects CUDA via `nvidia-smi` and installs the appropriate `torch` build (GPU or CPU-only). Run this instead of `pip install -r requirements.txt` directly.

### Running the server

```bash
cd spacesight-backend
uvicorn main:app --reload
```

Server runs at `http://127.0.0.1:8000`. The model (`models/exoplanet_cnn_model.pt`) and catalog (`data/koi_cumulative.csv`) are loaded at startup.

### Running the standalone pipeline test

```bash
cd spacesight-backend
python test_processor.py
```

Requires a `.npz` file named `KIC_<id>.npz` in the backend root (set `TEST_FILE` in the script). The KIC ID is parsed from the filename to look up stellar parameters in the catalog.

### Architecture

The pipeline runs in three stages:

1. **Preprocessing** (`app/processor.py → _preprocess_and_window`): Splits on observation gaps (>24h), detrends each segment independently using Whittaker-Henderson (WH) smoothing with asymmetric weighting for variable stars, then stacks overlapping 2-channel windows (201 cadences, stride 50) for the CNN. Per-segment detrending is mandatory — inter-quarter flux offsets of 1–5% would otherwise destroy BLS sensitivity.

2. **CNN Triage** (`app/model_def.py → InceptionResNet1D`): An InceptionTime-style 1D ResNet with SE attention classifies each window. Stars below `cnn_threshold=0.70` max confidence are rejected without running BLS.

3. **BLS Physics Verification** (`app/processor.py → _verify_physics`): For CNN candidates, BLS runs on each segment independently and power spectra are summed at each trial period. Iterative pre-whitening with harmonic guard enables multi-planet recovery (up to 10 iterations).

**Key constraint**: The `.npz` input must have keys `time` and `flux`. Job state lives in the `jobs` in-memory dict (no persistence across restarts).

### API Endpoints

- `POST /analyze` — accepts a `.npz` or multi-star `.zip` upload, returns `{ "jobId": "uuid", "totalStars": N }`
- `GET /status/{jobId}` — returns `{ stage, stageIndex, progress, done, error, currentStar, currentStarName, totalStars }`
- `GET /results/{jobId}` — returns the full nested result schema (authoritative contract: [docs/kepler-system-design.md](docs/kepler-system-design.md) §4–5)

Stage enum (current): `start → loading → preprocessing → cnn_inference → bls_analysis → generate_visualizations → done`. (The target enum renames `cnn_inference` → `cnn_triage` and inserts `cnn_vetting` — see design doc §4.1.)

Multi-star zip uploads are processed sequentially with per-star progress; a single failing star is reported with an `error` field without sinking the job.

## Frontend (spacesight-frontend/)

### Development

```bash
cd spacesight-frontend
npm install
npm run dev        # Vite dev server (hot reload)
npm run build      # Production build → dist/
npm run lint       # ESLint
npm run preview    # Preview production build locally
```

### Architecture

- **Routing**: `HashRouter` (required for GitHub Pages static hosting) with three routes: `/` (Home), `/analyze` (Upload), `/results` (Results).
- **Global state**: `AppContext` (`src/context/AppContext.jsx`) holds `results` — the raw API response — shared between AnalyzePage and ResultsPage.
- **API layer**: `src/services/api.js` — `BASE_URL` is hardcoded to `http://127.0.0.1:8000`. Update this for production deployments.
- **Polling**: `src/hooks/usePipeline.js` polls `/status` every 2 seconds until `done: true`, then fetches `/results`.
- **Charts**: Recharts library renders the light curve and BLS periodogram.
- **Export**: `ExportButton` uses `html2canvas` + `jspdf` for PDF export of results.

### Deployment

The frontend deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `master`. The workflow runs inside `spacesight-frontend/` (note: the workflow `working-directory` is not set — `npm install` and `npm run build` must be run from within that directory).

## Input Format

Backend expects `.npz` files with two arrays:
- `time`: Kepler Barycentric Julian Day (BJD) timestamps
- `flux`: raw photon counts (or pre-normalized to ~1.0)

The KIC ID is currently hardcoded as `"uploaded_star"` for API uploads (catalog matching is skipped). Stellar radius defaults to 1.0 R☉ when no catalog match is found, making radius estimates unreliable.
