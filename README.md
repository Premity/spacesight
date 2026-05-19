# SpaceSight

AI-powered exoplanet detection from Kepler Space Telescope light curves.

**Live Demo:** [https://premity.github.io/spacesight](https://premity.github.io/spacesight)

SpaceSight runs a two-stage triage-and-verify pipeline on raw Kepler photometric data. A 2-channel InceptionResNet1D CNN screens each star for transit candidates; only those that pass the CNN threshold proceed to iterative Box Least Squares (BLS) analysis, which determines orbital periods and estimated planet radii. Results are presented in an interactive dashboard with per-star light curves, BLS periodograms, orbital diagrams, and planet size comparisons.

---

## Repository structure

```
spacesight/
├── spacesight-frontend/     React + Vite frontend
└── spacesight-backend/      FastAPI + PyTorch backend
```

---

## Getting started

### Prerequisites

- Node.js v18+
- Python 3.10+
- pip

### Frontend

```bash
cd spacesight-frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`. The frontend expects the backend at `http://127.0.0.1:8000`.

### Backend

```bash
cd spacesight-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend loads the CNN model (`models/exoplanet_cnn_model.pt`) and the KOI catalog (`data/koi_cumulative.csv`) on startup. Both files must be present before starting.

### Test data

Sample `.npz` and `.zip` files are in `spacesight-frontend/test_data/`. Drop either into the Analyze page to run a full end-to-end test.

---

## Tech stack

### Frontend

| Library | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 8 | Build tool and dev server |
| React Router DOM 6 | Hash-based client-side routing |
| TailwindCSS 3 | Utility-first styling |
| Recharts 3 | Data visualization |
| react-dropzone | Drag-and-drop file upload |
| jsPDF + html2canvas | One-click PDF export |

### Backend

| Library | Purpose |
|---|---|
| FastAPI | REST API framework |
| PyTorch | InceptionResNet1D inference |
| NumPy / SciPy | Signal processing, Whittaker-Henderson detrending |
| Astropy | Box Least Squares periodogram |
| Pandas | KOI catalog lookups |

---

## Pipeline overview

1. **Preprocessing** — the raw flux array is split on observation gaps (>24 h), each segment is sigma-clipped and detrended with Whittaker-Henderson smoothing. Segments are windowed into overlapping 201-cadence frames (stride 50) and stacked into a 2-channel input (primary transit view + secondary eclipse view).

2. **CNN triage** — all windows are scored by `InceptionResNet1D`. Stars whose maximum window confidence falls below 0.70 are rejected immediately; BLS never runs for them.

3. **BLS verification** — BLS runs independently on each detrended quarter segment and the power spectra are summed at each trial period. The best-period planet is extracted, its transits are masked (pre-whitening), and the loop repeats up to 10 times to recover multi-planet systems. A harmonic guard prevents the same period being reported twice.

4. **Results** — the API returns detected planets with orbital period, estimated radius, BLS power, and a match against the NASA KOI catalog for ground-truth comparison.

---

## Deployment

The frontend deploys automatically to GitHub Pages on every push to `master` via `.github/workflows/deploy.yml`.

---

## Team

MS Ramaiah Institute of Technology — Capstone Project 2025

| Name | Student ID |
|---|---|
| Adya Avinash | 1MS23CI006 |
| Diya Vipin | 1MS23CI034 |
| Mohammad Hamd Ashfaque | 1MS23CI068 |

---

## License

[MIT](spacesight-frontend/LICENSE)
