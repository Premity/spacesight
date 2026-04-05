# API Requirements Specification

## 1. Overview
This document outlines the behavior and interface schemas for the upcoming backend server in the SpaceSight project. It defines exactly what is expected from the API for the pipeline process.

## 2. Endpoints

### 2.1 Initialize Analysis
- **URL:** `POST /api/analyze`
- **Behavior:** Accepts the Kepler light curve file, securely stores it in a managed job queue, and provisions an execution ID for the user to poll.
- **Request Format:** `multipart/form-data` with property `file` (.npz / .zip limits configured).
- **Response Format:**
  ```json
  {
    "jobId": "uuid-v4-string",
    "status": "accepted"
  }
  ```

### 2.2 Get Pipeline Status / Results
- **URL:** `GET /api/status/:jobId`
- **Behavior:** Lookups the active job and reports the current stage within the pipeline sequence. If the job is complete, it immediately serves the final analysis output.
- **Response Format (In-Progress):**
  ```json
  {
    "jobId": "uuid-v4-string",
    "status": "processing",
    "stageIndex": 3,
    "stageName": "Preprocessing",
    "results": null
  }
  ```
- **Response Format (Done):**
  ```json
  {
    "jobId": "uuid-v4-string",
    "status": "done",
    "stageIndex": 8,
    "stageName": "Done",
    "results": {
       "planetFound": true,
       "confidenceScore": 0.94,
       "orbitalPeriodDays": 12.5,
       "planetRadiusEarths": 2.1,
       "transitDepth": 0.005,
       "visualizations": {
          "phaseFoldedCurve": "url-to-image"
       }
    }
  }
  ```

## 3. Defined Pipeline Stages (for `stageIndex`)
1. **Start**: Job created and added to queue.
2. **Loading**: Reading `.npz` file into numpy array memory layouts.
3. **Preprocessing**: Segmenting 1D flux timeline.
4. **Filtering**: Rejecting outlier metrics and solar flares.
5. **Normalization**: Min-Max scaling for inference.
6. **CNN Inference**: PyTorch model forward pass.
7. **BLS Analysis**: Extracting physical parameters.
8. **Done**: Serializing and serving payloads.
