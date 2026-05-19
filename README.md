# SpaceSight

AI-powered exoplanet detection from Kepler Space Telescope light curves.

**Live Demo:** [https://premity.github.io/spacesight](https://premity.github.io/spacesight)

SpaceSight runs a two-stage triage-and-verify pipeline on raw Kepler photometric data. A 2-channel InceptionResNet1D CNN screens each star for transit candidates; only those that pass the CNN threshold proceed to iterative Box Least Squares (BLS) analysis, which determines orbital periods and estimated planet radii. Results are presented in an interactive dashboard with per-star light curves, BLS periodograms, orbital diagrams, and planet size comparisons.

---

## Repository structure

```
spacesight/
├── spacesight-backend/              FastAPI + PyTorch backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  (legacy single-shot /predict endpoint)
│   │   ├── model_def.py             InceptionResNet1D architecture
│   │   └── processor.py             Preprocessing, CNN triage, BLS verification
│   ├── data/
│   │   └── koi_cumulative.csv       NASA KOI catalog for ground-truth matching
│   ├── models/
│   │   └── exoplanet_cnn_model.pt   Trained CNN weights
│   ├── main.py                      FastAPI app — /analyze, /status, /results
│   └── test_processor.py            Standalone pipeline test runner
│
├── spacesight-frontend/             React + Vite frontend
│   ├── public/
│   ├── src/
│   │   ├── components/              Charts, upload, export, layout
│   │   ├── context/                 AppContext (shared results state)
│   │   ├── hooks/                   usePipeline polling hook
│   │   ├── pages/                   Home, Analyze, Results
│   │   ├── services/                api.js (BASE_URL hardcoded)
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── test_data/                   Sample .npz / .zip files
│   ├── .github/workflows/           GitHub Pages deploy
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── CLAUDE.md
├── LICENSE
├── README.md
├── requirements.txt                 Python dependencies (backend)
└── setup.sh                         Installs deps + correct torch (CPU/CUDA)
```

---

## Getting started

### Prerequisites

- Python 3.10+
- Node.js v18+
- npm
- (Optional) NVIDIA GPU with CUDA 12.1 drivers for GPU inference

### Backend

```bash
bash setup.sh
cd spacesight-backend
uvicorn main:app --reload --port 8000
```

`setup.sh` installs everything in `requirements.txt`, then detects whether CUDA is available via `nvidia-smi` and installs the matching `torch` wheel (GPU `cu121` build or CPU-only). Run it from the repo root instead of `pip install -r requirements.txt` directly, otherwise you may end up with a torch build that doesn't match your hardware.

The backend loads the CNN model (`models/exoplanet_cnn_model.pt`) and the KOI catalog (`data/koi_cumulative.csv`) on startup — both files must be present.

Server runs at `http://127.0.0.1:8000`.

### Frontend

```bash
cd spacesight-frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`. The frontend expects the backend at `http://127.0.0.1:8000` (hardcoded in [src/services/api.js](spacesight-frontend/src/services/api.js); update this for production deployments).

### Test data

Sample `.npz` and `.zip` files are in [spacesight-frontend/test_data/](spacesight-frontend/test_data/). Drop either into the Analyze page to run a full end-to-end test.

For a backend-only sanity check, drop a `KIC_<id>.npz` file into the backend root and run:

```bash
cd spacesight-backend
python test_processor.py
```

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
| FastAPI + Uvicorn | REST API framework and ASGI server |
| python-multipart | `.npz` multipart upload handling |
| PyTorch | InceptionResNet1D inference |
| NumPy / SciPy | Signal processing, Whittaker-Henderson detrending |
| Astropy | Box Least Squares periodogram (`astropy.timeseries`) |
| Pandas | KOI catalog lookups |

---

## API

- `POST /analyze` — accepts `.npz` multipart upload, returns `{ "jobId": "uuid" }`
- `GET /status/{jobId}` — `{ stage, stageIndex, progress, done, error }`
- `GET /results/{jobId}` — full nested result schema (see [spacesight-frontend/API_REQUIREMENTS.md](spacesight-frontend/API_REQUIREMENTS.md))

Stage progression: `start → loading → preprocessing → cnn_inference → bls_analysis → generate_visualizations → done`.

Backend `.npz` input must have two arrays: `time` (Kepler BJD timestamps) and `flux` (raw photon counts or pre-normalized).

---

## Pipeline overview

1. **Preprocessing** — the raw flux array is split on observation gaps (>24 h), each segment is sigma-clipped and detrended with Whittaker-Henderson smoothing. Segments are windowed into overlapping 201-cadence frames (stride 50) and stacked into a 2-channel input (primary transit view + secondary eclipse view).

2. **CNN triage** — all windows are scored by `InceptionResNet1D`. Stars whose maximum window confidence falls below 0.70 are rejected immediately; BLS never runs for them.

3. **BLS verification** — BLS runs independently on each detrended quarter segment and the power spectra are summed at each trial period. The best-period planet is extracted, its transits are masked (pre-whitening), and the loop repeats up to 10 times to recover multi-planet systems. A harmonic guard prevents the same period being reported twice.

4. **Results** — the API returns detected planets with orbital period, estimated radius, BLS power, and a match against the NASA KOI catalog for ground-truth comparison.

---

## Deployment

The frontend deploys automatically to GitHub Pages on every push to `master` via [.github/workflows/deploy.yml](spacesight-frontend/.github/workflows/deploy.yml). The backend is not currently deployed — point the frontend at any reachable `http://...:8000` instance by editing `BASE_URL` in [src/services/api.js](spacesight-frontend/src/services/api.js).

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

[MIT](LICENSE)
