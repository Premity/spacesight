# 🔭 SpaceSight

> AI-powered planetary transit detection from Kepler Space Telescope light curves.

**Live Demo:** [https://Premity.github.io/spacesight](https://Premity.github.io/spacesight)

SpaceSight is a capstone project that uses a 1D Convolutional Neural Network to identify
planetary transits in Kepler light curve data. Raw photometric flux data is preprocessed
into fixed-size time-series windows, each scored by the CNN for transit probability.
Candidate detections are validated through physics-based false positive elimination before
the Box Least Squares (BLS) algorithm determines each planet's orbital period and estimated
radius. Results are presented as an interactive visual dashboard.

---

## 🚀 Features

- Upload single `.npz` Kepler light curve files or `.zip` archives of multiple targets
- 9-stage real-time pipeline tracker with per-stage progress feedback
- Multi-star results dashboard with sortable planet candidates table
- Per-star interactive visualizations: light curve, BLS periodogram, orbital diagram,
  and planet size comparison
- Aggregate survey charts for multi-target ZIP uploads
- One-click PDF export of full results and visualizations
- Space-themed UI with animated starfield, built for GitHub Pages deployment

---

## 🛠 Tech Stack

### Frontend

| Library | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI component framework |
| Vite | 6.2.0 | Build tool and dev server |
| React Router DOM | 6.30.0 | Hash-based client-side routing |
| TailwindCSS | 3.4.17 | Utility-first styling |
| Recharts | 2.15.2 | Data visualization charts |
| react-dropzone | 14.3.8 | Drag-and-drop file upload |
| Axios | 1.8.4 | HTTP client for API communication |
| jsPDF | 2.5.2 | PDF generation |
| html2canvas | 1.4.1 | DOM screenshot for PDF export |
| Lucide React | 0.487.0 | Icon library |

### Backend (In Development)

| Library | Version | Purpose |
|---|---|---|
| FastAPI | 0.115.x | REST API framework |
| Python | 3.11.x | Runtime |
| TensorFlow / PyTorch | TBD | 1D CNN inference |
| NumPy | 1.26.x | Array processing |
| Astropy | 6.x | Kepler data handling |
| BLS Algorithm | custom | Orbital period determination |

---

## 📁 File Structure
```
spacesight/
│
├── public/
│ └── favicon.ico
│
├── src/
│ ├── pages/ # Route-level page components
│ │ ├── HomePage.jsx # Landing page
│ │ ├── AnalyzePage.jsx # File upload + pipeline tracker
│ │ └── ResultsPage.jsx # Results dashboard
│ │
│ ├── components/
│ │ ├── layout/
│ │ │ ├── Navbar.jsx # Fixed top navigation
│ │ │ └── Footer.jsx # Site footer (hidden on results)
│ │ ├── home/ # Home page sections
│ │ │ └── (hero, pipeline, team sections inline in HomePage.jsx)
│ │ ├── results/ # Results dashboard components
│ │ │ ├── ResultsHeader.jsx # Summary stat cards
│ │ │ ├── PlanetCandidatesTable.jsx
│ │ │ ├── AggregateCharts.jsx # ZIP-only aggregate charts
│ │ │ ├── StarDetailPanel.jsx # Per-star detail + chart panel
│ │ │ ├── StarCharts.jsx # Light curve, BLS, orbital, size charts
│ │ │ ├── PlanetCard.jsx # Individual planet candidate card
│ │ │ └── EmptyState.jsx # Fallback for direct URL navigation
│ │ └── ui/
│ │ └── StarField.jsx # Animated CSS parallax starfield
│ │
│ ├── context/
│ │ └── AppContext.jsx # Global state (results, jobId, clearResults)
│ │
│ ├── hooks/
│ │ └── usePipeline.js # Pipeline polling hook
│ │
│ ├── services/
│ │ └── api.js # API layer (mock now, real FastAPI later)
│ │
│ ├── utils/
│ │ └── constants.js # Pipeline stage names, shared constants
│ │
│ ├── App.jsx # Router setup, global layout
│ ├── main.jsx # React DOM entry point
│ └── index.css # Tailwind directives + global styles
│
├── test_data/
│ ├── test.npz # Sample single light curve for testing
│ └── test.zip # Sample multi-star archive for testing
│
├── .github/
│ └── workflows/
│ └── deploy.yml # GitHub Actions → GitHub Pages auto-deploy
│
├── API_REQUIREMENTS.md # Backend API contract for FastAPI integration
├── vite.config.js # Vite config with /spacesight/ base path
├── tailwind.config.js # Custom space theme tokens
├── package.json
└── README.md
```


---

## ⚙️ Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js** v24.14.1 or higher — [nodejs.org](https://nodejs.org)
- **npm** v11.11.0 or higher (comes with Node)
- **Git** — [git-scm.com](https://git-scm.com)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Premity/spacesight.git
cd spacesight

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

Navigate to `http://localhost:5173/#/analyze`, upload the provided `test_data/test.npz`
or `test_data/test.zip` file, and watch the pipeline run.

### Build for Production

```bash
npm run build
```

Output is in the `/dist` folder. This is what gets deployed to GitHub Pages.

---

## 🔌 Backend Integration

The frontend is currently running with a mock API in `src/services/api.js`.
To connect the real FastAPI backend:

**1. Create a `.env` file in the project root:**
```env
VITE_API_URL=http://localhost:8000
```

**2. Update `src/services/api.js`:**
Replace the mock functions with real Axios calls. The API contract is fully
documented in [`API_REQUIREMENTS.md`](./API_REQUIREMENTS.md).

**3. Run the FastAPI backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Ensure FastAPI has CORS configured to allow `http://localhost:5173` in development
and `https://Premity.github.io` in production.

---

## 🌐 Deployment

This project is deployed via GitHub Actions to GitHub Pages automatically on every
push to the `main` branch.

The workflow (`.github/workflows/deploy.yml`) runs:
1. `npm install`
2. `npm run build`
3. Deploys `/dist` to the `gh-pages` branch via `peaceiris/actions-gh-pages`

The `vite.config.js` is configured with `base: '/spacesight/'` for correct
asset resolution on GitHub Pages.

To trigger a deployment, simply push to `main`:
```bash
git push origin main
```

---

## 👥 Team

**MS Ramaiah Institute of Technology — Capstone Project 2025**

| Name | Student ID |
|---|---|
| Adya Avinash | 1MS23CI006 |
| Diya Vipin | 1MS23CI034 |
| Mohammad Hamd Ashfaque | 1MS23CI068 |

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---

*Built with React, TailwindCSS, and a love for space exploration.*