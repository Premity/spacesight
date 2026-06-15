# API Contract

> **Status note (2026-06-15):** this file previously documented a synchronous
> `/predict` endpoint that **no longer exists** (the dead `app/main.py`). It has
> been updated to the real async contract the frontend uses. This file is slated
> to be **removed or merged** into the canonical design doc at the real repo
> restructure — see [docs/repo-restructure-and-mlops-plan.md](../docs/repo-restructure-and-mlops-plan.md).
> Until then, the authoritative API spec is
> [docs/kepler-system-design.md §4–5](../docs/kepler-system-design.md).

## Overview

The SpaceSight backend is an **async** FastAPI server. `POST /analyze` accepts a
light-curve upload, returns a `jobId` immediately, and runs the pipeline in a
background thread. The frontend then polls `GET /status/{jobId}` until `done`, and
fetches `GET /results/{jobId}`.

**Base URL (dev):** `http://127.0.0.1:8000` (hardcoded in `src/services/api.js`).

**CORS:** the dev origins (`localhost:5173`, `localhost:3000`) and
`https://premity.github.io`.

---

## Endpoints

### POST /analyze

`multipart/form-data` with one field `file`: a `.npz` (single star) or a `.zip`
containing up to 20 `.npz` files (multi-star). Each `.npz` must contain `time` and
`flux` 1-D arrays.

**Response (HTTP 200):**

```json
{ "jobId": "uuid", "totalStars": 3 }
```

**Errors:** HTTP 400 for a non-`.npz`/`.zip` upload, an empty zip, or a zip
exceeding 20 stars.

### GET /status/{jobId}

```json
{
  "stage": "bls_analysis",
  "stageIndex": 4,
  "progress": 60,
  "done": false,
  "error": null,
  "currentStar": 2,
  "currentStarName": "KIC 10593626",
  "totalStars": 3
}
```

**Stage enum:** `loading → preprocessing → cnn_triage → bls_analysis →
cnn_vetting → generate_visualizations → done`.

> Note: `cnn_triage` and `cnn_vetting` are the **target** stage names (the
> three-stage architecture). The current backend emits `cnn_inference` and lacks
> `cnn_vetting`; aligning the enum is a tracked gap (design doc §4.1).

An unknown `jobId` returns `{ "error": "Invalid jobId", "code": 404 }`.

### GET /results/{jobId}

Returns the full nested result once `done`. Shape:

```json
{
  "type": "multi",
  "totalStars": 3,
  "totalPlanets": 4,
  "totalObservationSpan": 0,
  "totalDataPoints": 0,
  "stars": [
    {
      "id": "…", "name": "KIC 10593626",
      "planets": [
        { "id": "…", "orbitalPeriod": 7.05, "transitDepth": 18.4,
          "estimatedRadius": 1.32, "confidence": "High" }
      ],
      "noPlanetConfidence": 0,
      "lightCurve": [ { "time": 131.51, "flux": 1.0002 } ],
      "blsPeriodogram": [ { "period": 7.05, "power": 18.4 } ],
      "observationSpan": 0, "dataPoints": 0
    }
  ]
}
```

A star that errors without sinking the job appears with an `error` field and empty
arrays. Before completion, `/results` returns `{ "error": "Job not finished",
"code": 400 }`.

---

## Frontend integration

`src/services/api.js` calls `/analyze`, `/status/{jobId}`, `/results/{jobId}`, and
`src/hooks/usePipeline.js` polls `/status` every 2 s until `done`. This matches the
contract above. (The earlier note claiming the frontend needed to switch to a
synchronous `/predict` is obsolete — that endpoint is gone.)
