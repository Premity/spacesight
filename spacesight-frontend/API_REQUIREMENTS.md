# API Contract

## Overview

The SpaceSight backend is a FastAPI server that exposes a single synchronous inference endpoint. The frontend posts a raw Kepler light curve file; the backend runs the full pipeline and returns a JSON result payload. There is no async job queue — the response arrives when the pipeline finishes.

**Base URL (dev):** `http://127.0.0.1:8000`

**CORS origins allowed:**
- `http://localhost:5173`
- `http://localhost:3000`
- `https://premity.github.io`

---

## Endpoints

### POST /predict

Run the full triage-and-verify pipeline on a single Kepler light curve.

**Request**

`multipart/form-data` with one field:

| Field | Type | Description |
|---|---|---|
| `file` | file | `.npz` file containing `time` and `flux` arrays |

The filename must follow the pattern `KIC_<id>.npz`. The `<id>` portion is parsed as the KIC identifier for catalog lookups.

The `.npz` file must contain:
- `time` — 1-D float array, Kepler Barycentric Julian Date (BJD − 2454833)
- `flux` — 1-D float array, raw or pre-normalized flux values matching `time` in length

**Success response — no planet detected (CNN confidence below threshold)**

HTTP 200

```json
{
  "kic_id": "757450",
  "cnn_candidate": false,
  "max_confidence": 0.31,
  "windows_analyzed": 842,
  "planets_detected": 0,
  "detections": [],
  "detrended_flux": [1.0002, 0.9998, ...],
  "detrended_time": [131.5122, 131.5338, ...]
}
```

**Success response — planet(s) detected**

HTTP 200

```json
{
  "kic_id": "757450",
  "cnn_candidate": true,
  "max_confidence": 0.94,
  "windows_analyzed": 842,
  "planets_detected": 2,
  "detections": [
    {
      "planet_number": 1,
      "status": "CONFIRMED_CANDIDATE",
      "calculated": {
        "period": 10.3039,
        "radius": 2.74,
        "bls_power": 18.43,
        "duration": 0.1832,
        "transit_time": 133.8211
      },
      "catalog_truth": {
        "disposition": "CONFIRMED",
        "nasa_period": 10.3039,
        "nasa_radius": 2.78
      },
      "accuracy_metrics": {
        "period_error": 0.0001
      }
    },
    {
      "planet_number": 2,
      "status": "CONFIRMED_CANDIDATE",
      "calculated": {
        "period": 13.0241,
        "radius": 1.91,
        "bls_power": 11.72,
        "duration": 0.1420,
        "transit_time": 140.1033
      },
      "catalog_truth": {
        "disposition": "CONFIRMED",
        "nasa_period": 13.0241,
        "nasa_radius": 1.97
      },
      "accuracy_metrics": {
        "period_error": 0.0002
      }
    }
  ],
  "detrended_flux": [1.0002, 0.9998, ...],
  "detrended_time": [131.5122, 131.5338, ...]
}
```

**Error response — bad file type**

HTTP 400

```json
{ "detail": "Invalid file type. Must be an .npz file" }
```

**Error response — missing arrays**

HTTP 400

```json
{ "detail": "Data extraction error: Uploaded .npz must contain 'time' and 'flux' arrays." }
```

---

## Response field reference

### Top-level

| Field | Type | Description |
|---|---|---|
| `kic_id` | string | KIC identifier parsed from the filename |
| `cnn_candidate` | boolean | Whether the CNN confidence exceeded the 0.70 threshold |
| `max_confidence` | float | Highest sigmoid score across all windows, 0–1 |
| `windows_analyzed` | integer | Number of 201-cadence windows passed to the CNN |
| `planets_detected` | integer | Number of planets confirmed by BLS |
| `detections` | array | One object per confirmed planet (empty if `planets_detected` is 0) |
| `detrended_flux` | float[] | Full detrended, normalized flux array (same length as raw input) |
| `detrended_time` | float[] | Corresponding time array in Kepler BJD |

### Detection object

| Field | Type | Description |
|---|---|---|
| `planet_number` | integer | Detection order (1-indexed, by BLS iteration) |
| `status` | string | `CONFIRMED_CANDIDATE`, `CANDIDATE`, `ECLIPSING_BINARY`, or `NOISE_ARTIFACT` |
| `calculated` | object | BLS-derived orbital parameters |
| `catalog_truth` | object | Matched NASA KOI entry, if found |
| `accuracy_metrics` | object | Period error vs. catalog, or `"N/A"` if no catalog match |

### `calculated` object

| Field | Type | Unit | Description |
|---|---|---|---|
| `period` | float | days | Best BLS period from summed per-segment power spectra |
| `radius` | float | R⊕ | Estimated planet radius (transit depth + stellar radius + limb darkening correction of 1.15) |
| `bls_power` | float | — | Peak combined BLS power (threshold for `CONFIRMED_CANDIDATE` is 7.0) |
| `duration` | float | days | Transit duration from phase-scan refinement |
| `transit_time` | float | Kepler BJD | Absolute transit mid-time, used for pre-whitening masking |

### `catalog_truth` object

| Field | Type | Description |
|---|---|---|
| `disposition` | string | NASA KOI disposition: `CONFIRMED`, `CANDIDATE`, `FALSE POSITIVE`, or `UNKNOWN` |
| `nasa_period` | float \| null | Catalog orbital period in days (null if no match within 10%) |
| `nasa_radius` | float \| null | Catalog planet radius in R⊕ (null if no match) |

### `accuracy_metrics` object

| Field | Type | Description |
|---|---|---|
| `period_error` | float \| "N/A" | Absolute difference between detected and catalog period in days |

---

## Status classification rules

| Status | Condition |
|---|---|
| `ECLIPSING_BINARY` | Estimated radius > 25 R⊕ |
| `NOISE_ARTIFACT` | Estimated radius < 0.4 R⊕ |
| `CONFIRMED_CANDIDATE` | BLS power ≥ 7.0 and radius in plausible range |
| `CANDIDATE` | BLS power < 7.0 but passed the CNN gate |

---

## Frontend integration note

`src/services/api.js` currently calls `/analyze`, `/status/{jobId}`, and `/results/{jobId}`, which reflects an earlier async design. Those endpoints do not exist in the current backend. The frontend needs to be updated to call `POST /predict` directly and handle the synchronous response.
