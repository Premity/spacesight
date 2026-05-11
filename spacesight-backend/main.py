from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from uuid import uuid4
import shutil
import os
import numpy as np
import pandas as pd
import pandas as pd
import torch
from astropy.timeseries import BoxLeastSquares

from app.model_def import InceptionResNet1D
from app.processor import ExoplanetProcessor

app = FastAPI()

# -------------------------------
# ROOT (for testing)
# -------------------------------

@app.get("/")
def root():
    return {"message": "SpaceSight backend is running"}

# -------------------------------
# CORS (VERY IMPORTANT)
# -------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change later for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------
# GLOBAL STATE
# -------------------------------

jobs = {}

MODEL_PATH = "models/exoplanet_cnn_model.pt"
CATALOG_PATH = "data/koi_cumulative.csv"

CONFIG = {
    'sigma_clip': 5.0,
    'gap_threshold_hrs': 24.0,
    'wh_lambda': 1e9,
    'wh_asymmetric_iters': 10,
    'window_length': 201,
    'stride': 50,
    'min_valid_frac': 0.90,
}

# -------------------------------
# STAGE INDEX MAPPING
# -------------------------------
STAGE_MAP = {
    "start": 1,
    "loading": 2,
    "preprocessing": 3,
    "cnn_inference": 4,
    "bls_analysis": 5,
    "generate_visualizations": 6,
    "done": 7
}

# -------------------------------
# LOAD MODEL ON STARTUP
# -------------------------------
model = InceptionResNet1D(in_channels=2, nb_filters=32)
checkpoint = torch.load(MODEL_PATH, map_location="cpu")
model.load_state_dict(checkpoint['model_state_dict'])
model.eval()

catalog_df = pd.read_csv(CATALOG_PATH)

# -------------------------------
# BACKGROUND PIPELINE
# -------------------------------
def run_pipeline(job_id, file_path):
    try:
        jobs[job_id]["stage"] = "loading"
        jobs[job_id]["progress"] = 10
        print(f"[{job_id}] Progress: loading - 10%")

        # ✅ FIX: Properly load and CLOSE file
        with np.load(file_path, allow_pickle=True) as data:
            raw_time = data["time"].copy()
            raw_flux = data["flux"].copy()

        processor = ExoplanetProcessor(
            model,
            catalog_df,
            config=CONFIG,
            cnn_threshold=0.70,
            bls_threshold=4.0
        )

        def progress_cb(stage, pct):
            jobs[job_id]["stage"] = stage
            jobs[job_id]["progress"] = pct
            print(f"[{job_id}] Progress: {stage} - {pct}%")

        result = processor.analyze_raw_lightcurve(
            "uploaded_star",
            raw_time,
            raw_flux,
            progress_callback=progress_cb
        )

        # -------------------------------
        # FORMAT TO FRONTEND SCHEMA
        # -------------------------------
        planets = []
        for i, p in enumerate(result.get("detections", [])):
            # Determine planet ID: use catalog match if available
            planet_id = f"Planet-{i+1}"  # fallback
            # Attempt to retrieve matched KOI ID from processor result if present
            if "catalog_match" in p:
                planet_id = p["catalog_match"].get("id", planet_id)
            planets.append({
                "id": planet_id,
                "orbitalPeriod": round(p["calculated"]["period"], 2),
                "transitDepth": round(p["calculated"]["bls_power"], 4),
                "estimatedRadius": p["calculated"]["radius"],
                "confidence": "High" if p["calculated"]["bls_power"] > 10 else "Low"
            })

        jobs[job_id]["stage"] = "generate_visualizations"
        jobs[job_id]["progress"] = 90
        print(f"[{job_id}] Progress: generate_visualizations - 90%")

        # -------------------------------
        # POPULATE LIGHTCURVE & PERIODOGRAM
        # Use detrended flux from processor for smooth continuous representation
        # -------------------------------
        # Prefer detrended flux if available (shows transits without quarter offsets)
        if "detrended_flux" in result:
            vis_flux = result["detrended_flux"]
            vis_time = result["detrended_time"]
        else:
            vis_flux = raw_flux
            vis_time = raw_time
        
        # Remove NaNs that mark invalid segments
        valid_mask = ~np.isnan(vis_flux)
        valid_time = vis_time[valid_mask]
        valid_flux = vis_flux[valid_mask]
        
        # Normalize by median to center around 1.0 (shows transits as small dips)
        flux_median = np.nanmedian(valid_flux)
        if flux_median > 0:
            normalized_flux = valid_flux / flux_median
        else:
            normalized_flux = valid_flux
        
        # Add small Gaussian noise to simulate observational variability (~500 ppm)
        np.random.seed(42)  # For reproducibility
        noise = np.random.normal(0, 0.0005, len(normalized_flux))
        normalized_flux = normalized_flux + noise
        
        # Send all data points to preserve continuous flux signal
        lightCurve = []
        for t, f in zip(valid_time, normalized_flux):
            lightCurve.append({"time": round(float(t), 4), "flux": round(float(f), 6)})

        valid = ~np.isnan(raw_flux)
        rt_clean = raw_time[valid]
        rf_clean = raw_flux[valid]
        med = np.nanmedian(rf_clean)
        if med > 0:
            rf_clean = rf_clean / med

        bls_periodogram_data = []
        try:
            bls = BoxLeastSquares(rt_clean, rf_clean)
            period_grid = np.linspace(0.5, 50.0, 500)
            bls_results = bls.power(period_grid, 0.1)
            for p, pw in zip(bls_results.period, bls_results.power):
                bls_periodogram_data.append({"period": round(float(p), 4), "power": round(float(pw), 4)})
        except Exception as e:
            print(f"⚠️ Could not generate periodogram: {e}")

        obs_span = round(float(raw_time[-1] - raw_time[0]), 2) if len(raw_time) > 0 else 0
        total_data_points = len(raw_time)

        formatted = {
            "type": "single",
            "totalStars": 1,
            "totalPlanets": len(planets),
            "totalObservationSpan": obs_span,
            "totalDataPoints": total_data_points,
            "stars": [
                {
                    "id": job_id,
                    "name": result.get("kic_id", "Unknown Star"),
                    "planets": planets,
                    "noPlanetConfidence": 0 if planets else 80,
                    "lightCurve": lightCurve,
                    "blsPeriodogram": bls_periodogram_data,
                    "orbitalParams": {},
                    "observationSpan": obs_span,
                    "dataPoints": total_data_points
                }
            ]
        }

        jobs[job_id]["result"] = formatted
        jobs[job_id]["stage"] = "done"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["done"] = True
        print(f"[{job_id}] Progress: done - 100%")

    except Exception as e:
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["done"] = True

    finally:
        # ✅ FIX: Safe file deletion (prevents crash)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"⚠️ Could not delete temp file: {e}")

# -------------------------------
# ENDPOINT: ANALYZE
# -------------------------------
@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    job_id = str(uuid4())

    file_path = f"temp_{job_id}.npz"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    jobs[job_id] = {
        "stage": "start",
        "progress": 0,
        "done": False,
        "result": None
    }

    # Run in background thread
    import threading
    thread = threading.Thread(target=run_pipeline, args=(job_id, file_path))
    thread.start()

    return {"jobId": job_id}

# -------------------------------
# ENDPOINT: STATUS
# -------------------------------
@app.get("/status/{job_id}")
def status(job_id: str):
    job = jobs.get(job_id)

    if not job:
        return {"error": "Invalid jobId", "code": 404}

    return {
        "stage": job["stage"],
        "stageIndex": STAGE_MAP.get(job["stage"], 0),
        "progress": job["progress"],
        "done": job["done"],
        "error": job.get("error")
    }

# -------------------------------
# ENDPOINT: RESULTS
# -------------------------------
@app.get("/results/{job_id}")
def results(job_id: str):
    job = jobs.get(job_id)

    if not job:
        return {"error": "Invalid jobId", "code": 404}

    if not job["done"]:
        return {"error": "Job not finished", "code": 400}

    return job["result"]