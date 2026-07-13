# SpaceSight

AI-powered exoplanet detection from Kepler Space Telescope light curves.

**Live Demo:** [https://premity.github.io/spacesight](https://premity.github.io/spacesight)

SpaceSight runs a triage-and-verify pipeline on raw Kepler photometric data. An InceptionResNet1D CNN screens each star for transit candidates; only those that pass the CNN threshold proceed to iterative Box Least Squares (BLS) analysis, which determines orbital periods and estimated planet radii. Results are presented in an interactive dashboard with per-star light curves, BLS periodograms, orbital diagrams, and planet size comparisons.

---

## Documentation

This README is the **getting-started / how-to-run** guide. For understanding the
system, the roadmap, and how to contribute, **start at [docs/README.md](docs/README.md)** —
it's the documentation hub, with a guided reading order and a map of every doc.

Quick links:
- **[docs/README.md](docs/README.md)** — documentation index + "start here" reading path
- **[docs/kepler-system-design.md](docs/kepler-system-design.md)** — the canonical system design (target state)
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — the ordered task list (what's being built, in what order)
- **[docs/style-guide.md](docs/style-guide.md)** — code & notebook conventions (read before contributing)
- **[docs/adr/](docs/adr/)** — architecture decision records (the *why*)
- **[CONTEXT.md](CONTEXT.md)** — glossary · **[CLAUDE.md](CLAUDE.md)** — what currently exists (agent guide)

Other readmes live next to what they document: **[ml/README.md](ml/README.md)** (how to
train) and **[ml/MODELS.md](ml/MODELS.md)** (the model registry).

---

## Repository structure

```
spacesight/
├── .github/workflows/               CI + GitHub Pages deploy
├── spacesight-backend/              FastAPI + PyTorch backend
│   ├── app/
│   │   ├── __init__.py
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
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── ml/                              Training: notebooks + spacesight_ml package
│   ├── notebooks/                   Research notebooks (exploration)
│   ├── src/spacesight_ml/           Importable package (stable logic graduates here)
│   ├── configs/                     Experiment configs
│   ├── data/                        gitignored — dataset lives on Google Drive
│   ├── MODELS.md                    Model registry (one row per iteration)
│   └── README.md                    How to train
│
├── docs/                            Design docs, ROADMAP, ADRs — start at docs/README.md
├── test_data/                       Sample .npz / .zip files for testing
│   ├── KIC_6541920.npz
│   ├── KIC_6850504.npz
│   ├── KIC_10593626.npz
│   └── Test_Files.zip               All three .npz files bundled
├── CLAUDE.md
├── CONTEXT.md                       Glossary
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

Sample `.npz` and `.zip` files are in [test_data/](test_data/) at the repo root. Drop either into the Analyze page to run a full end-to-end test — `Test_Files.zip` contains all three single-star `.npz` files bundled together to exercise the multi-star pipeline.

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

- `POST /analyze` — accepts a single `.npz` upload, or a `.zip` containing multiple `.npz` files (capped at 20 stars per job). Returns `{ "jobId": "uuid", "totalStars": N }`
- `GET /status/{jobId}` — `{ stage, stageIndex, progress, done, error, currentStar, currentStarName, totalStars }`
- `GET /results/{jobId}` — full nested result schema (authoritative contract: [docs/kepler-system-design.md](docs/kepler-system-design.md) §4–5)

Stage progression: `start → loading → preprocessing → cnn_inference → bls_analysis → generate_visualizations → done`.

Each `.npz` input must have two arrays: `time` (Kepler BJD timestamps) and `flux` (raw photon counts or pre-normalized). Multi-star zip uploads are processed sequentially with per-star progress reporting — see [docs/parallel-processing.md](docs/parallel-processing.md) for future parallel/GPU upgrades.

---

## Pipeline overview

1. **Preprocessing** — the raw flux array is split on observation gaps (>24 h), each segment is sigma-clipped and detrended with Whittaker-Henderson smoothing. Segments are windowed into overlapping 201-cadence frames (stride 50) and stacked into a 2-channel input (primary transit view + secondary eclipse view).

2. **CNN triage** — all windows are scored by `InceptionResNet1D`. Stars whose maximum window confidence falls below 0.70 are rejected immediately; BLS never runs for them.

3. **BLS verification** — BLS runs independently on each detrended quarter segment and the power spectra are summed at each trial period. The best-period planet is extracted, its transits are masked (pre-whitening), and the loop repeats up to 10 times to recover multi-planet systems. A harmonic guard prevents the same period being reported twice.

4. **Results** — the API returns detected planets with orbital period, estimated radius, BLS power, and a match against the NASA KOI catalog for ground-truth comparison.

---

## Deployment

The frontend deploys automatically to GitHub Pages on every push to `main` via [.github/workflows/deploy.yml](.github/workflows/deploy.yml). The backend is not currently deployed — point the frontend at any reachable `http://...:8000` instance by editing `BASE_URL` in [src/services/api.js](spacesight-frontend/src/services/api.js).

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

[GPL-3.0](LICENSE)
