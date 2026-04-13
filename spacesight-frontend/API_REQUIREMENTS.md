# API Requirements Specification

## 1. Overview
This document specifies the interaction flows between the frontend and the Python FastAPI backend engine for SpaceSight.

## 2. Global API Constraints
- **CORS:** Must allow cross-origin requests from the GitHub Pages frontend deployment origin.
- **Content-Type:** All JSON endpoints return `application/json`.
- **Error Handling:** All error responses use JSON format: `{ "error": "Diagnostic message string", "code": HTTP_STATUS_CODE }`
- **Framework:** Python FastAPI.

## 3. Endpoints

### 3.1 Initialize Analysis
- **URL:** `POST /analyze`
- **Behavior:** Accepts multipart Form-data `.npz` or `.zip` files containing Kepler light curves. Immediately begins background async pipeline processing.
- **Request:** `multipart/form-data` -> `file`
- **Response Format:**
  ```json
  { "jobId": "uuid-v4-string" }
  ```

### 3.2 Poll Pipeline Status
- **URL:** `GET /status/{jobId}`
- **Behavior:** Returns current sequence of the async job. Returns percentage progress and a strict enum of stage identification keys.
- **Response Format:**
  ```json
  {
    "stage": "preprocessing", // Enum: 'start', 'loading', 'preprocessing', 'filtering', 'normalization', 'cnn_inference', 'bls_analysis', 'generate_visualizations', 'done'
    "stageIndex": 3,
    "progress": 35, // 0-100%
    "done": false
  }
  ```

### 3.3 Get Analysis Results
- **URL:** `GET /results/{jobId}`
- **Behavior:** Fetches the completed `single` or `multi` nested JSON tree describing all planet candidates, their BLS and orbital structures, and raw flux outputs across targets.
- **Response Shape Schema:**
  ```json
  {
    "type": "single" | "multi",
    "stars": [
      {
        "id": "Target-String-UUID",
        "name": "KIC 757450",
        "planets": [
           {
              "id": "Planet-String",
              "orbitalPeriod": 12.5,
              "transitDepth": 0.45,
              "estimatedRadius": 2.1,
              "confidence": "High"
           }
        ],
        "noPlanetConfidence": 73, // Only when planets == 0
        "lightCurve": [{"time": 0, "flux": 1.0}, ...],
        "blsPeriodogram": [{"period": 0, "power": 1.0}, ...],
        "orbitalParams": {},
        "observationSpan": 1459,
        "dataPoints": 65000
      }
    ]
  }
  ```
