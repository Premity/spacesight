from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from uuid import uuid4
import shutil
import os
import re
import zipfile
import threading
import numpy as np
import pandas as pd
import torch
from astropy.timeseries import BoxLeastSquares

from app.model_def import InceptionResNet1D
from app.processor import ExoplanetProcessor

MAX_STARS_PER_JOB = 20


def _lttb(time: np.ndarray, flux: np.ndarray, n_out: int) -> tuple[np.ndarray, np.ndarray]:
    """Largest Triangle Three Buckets downsampling — preserves visual extrema (transit dips)."""
    n = len(time)
    if n <= n_out:
        return time, flux

    # Always keep first and last point
    bucket_size = (n - 2) / (n_out - 2)
    idx = [0]

    for i in range(n_out - 2):
        # Next bucket range
        a = idx[-1]
        range_start = int((i + 1) * bucket_size) + 1
        range_end = min(int((i + 2) * bucket_size) + 1, n)

        # Average point of the next bucket (used as C)
        c_start = int((i + 2) * bucket_size) + 1
        c_end = min(int((i + 3) * bucket_size) + 1, n)
        avg_x = np.mean(time[c_start:c_end]) if c_start < n else time[-1]
        avg_y = np.mean(flux[c_start:c_end]) if c_start < n else flux[-1]

        # Point A
        ax, ay = time[a], flux[a]

        # Find point in current bucket that forms largest triangle with A and C
        bucket_time = time[range_start:range_end]
        bucket_flux = flux[range_start:range_end]
        areas = np.abs((ax - avg_x) * (bucket_flux - ay) - (ax - bucket_time) * (avg_y - ay))
        best = np.argmax(areas)
        idx.append(range_start + best)

    idx.append(n - 1)
    return time[idx], flux[idx]

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
# PER-STAR ANALYSIS
# -------------------------------
def analyze_one_star(job_id, star_index, star_name, raw_time, raw_flux, progress_cb):
    """Run the full pipeline for a single star and return the formatted star dict."""
    kic_match = re.search(r'\d+', star_name)
    kic_id = kic_match.group(0) if kic_match else star_name

    processor = ExoplanetProcessor(
        model,
        catalog_df,
        config=CONFIG,
        cnn_threshold=0.70,
        bls_threshold=4.0
    )

    result = processor.analyze_raw_lightcurve(
        kic_id,
        raw_time,
        raw_flux,
        progress_callback=progress_cb
    )

    # -------- FORMAT PLANETS --------
    planets = []
    for i, p in enumerate(result.get("detections", [])):
        planet_letter = chr(ord('b') + i)
        planet_id = f"{star_name} {planet_letter}"
        if "catalog_match" in p:
            planet_id = p["catalog_match"].get("id", planet_id)
        planets.append({
            "id": planet_id,
            "orbitalPeriod": round(p["calculated"]["period"], 2),
            "transitDepth": round(p["calculated"]["bls_power"], 4),
            "estimatedRadius": round(p["calculated"]["radius"], 2),
            "confidence": "High" if p["calculated"]["bls_power"] > 10 else "Low"
        })

    progress_cb("generate_visualizations", 90)

    # -------- LIGHTCURVE --------
    if "detrended_flux" in result:
        vis_flux = result["detrended_flux"]
        vis_time = result["detrended_time"]
    else:
        vis_flux = raw_flux
        vis_time = raw_time

    valid_mask = ~np.isnan(vis_flux)
    valid_time = vis_time[valid_mask]
    valid_flux = vis_flux[valid_mask]

    flux_median = np.nanmedian(valid_flux)
    normalized_flux = valid_flux / flux_median if flux_median > 0 else valid_flux

    np.random.seed(42)
    noise = np.random.normal(0, 0.0005, len(normalized_flux))
    normalized_flux = normalized_flux + noise

    ds_time, ds_flux = _lttb(valid_time, normalized_flux, n_out=2000)
    lightCurve = [
        {"time": round(float(t), 4), "flux": round(float(f), 6)}
        for t, f in zip(ds_time, ds_flux)
    ]

    # -------- PERIODOGRAM --------
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
        print(f"⚠️ Could not generate periodogram for {star_name}: {e}")

    obs_span = round(float(raw_time[-1] - raw_time[0]), 2) if len(raw_time) > 0 else 0
    total_data_points = len(raw_time)

    return {
        "id": f"{job_id}-{star_index}",
        "name": star_name,
        "planets": planets,
        "noPlanetConfidence": 0 if planets else 80,
        "lightCurve": lightCurve,
        "blsPeriodogram": bls_periodogram_data,
        "orbitalParams": {},
        "observationSpan": obs_span,
        "dataPoints": total_data_points,
    }


# -------------------------------
# BACKGROUND PIPELINE (multi-star)
# -------------------------------
def run_pipeline(job_id, star_inputs, cleanup_paths):
    """
    star_inputs:   list of (star_name, npz_path)
    cleanup_paths: list of files/dirs to remove when done
    """
    try:
        total = len(star_inputs)
        formatted_stars = []
        per_star_errors = []

        for idx, (star_name, npz_path) in enumerate(star_inputs):
            jobs[job_id]["current_star"] = idx + 1
            jobs[job_id]["current_star_name"] = star_name
            jobs[job_id]["stage"] = "loading"
            jobs[job_id]["progress"] = 10
            print(f"[{job_id}] Star {idx + 1}/{total}: {star_name} — loading 10%")

            def progress_cb(stage, pct, _idx=idx, _name=star_name):
                jobs[job_id]["stage"] = stage
                jobs[job_id]["progress"] = pct
                print(f"[{job_id}] Star {_idx + 1}/{total}: {_name} — {stage} {pct}%")

            try:
                with np.load(npz_path, allow_pickle=True) as data:
                    raw_time = data["time"].copy()
                    raw_flux = data["flux"].copy()

                star_dict = analyze_one_star(
                    job_id, idx + 1, star_name, raw_time, raw_flux, progress_cb
                )
                formatted_stars.append(star_dict)
            except Exception as star_err:
                msg = f"{star_name}: {star_err}"
                print(f"⚠️ Star failed — {msg}")
                per_star_errors.append(msg)
                formatted_stars.append({
                    "id": f"{job_id}-{idx + 1}",
                    "name": star_name,
                    "planets": [],
                    "noPlanetConfidence": 0,
                    "lightCurve": [],
                    "blsPeriodogram": [],
                    "orbitalParams": {},
                    "observationSpan": 0,
                    "dataPoints": 0,
                    "error": str(star_err),
                })

        # -------- AGGREGATE --------
        total_planets = sum(len(s["planets"]) for s in formatted_stars)
        total_span = sum(s["observationSpan"] for s in formatted_stars)
        total_points = sum(s["dataPoints"] for s in formatted_stars)

        formatted = {
            "type": "multi" if total > 1 else "single",
            "totalStars": total,
            "totalPlanets": total_planets,
            "totalObservationSpan": round(total_span, 2),
            "totalDataPoints": total_points,
            "stars": formatted_stars,
        }
        if per_star_errors:
            formatted["warnings"] = per_star_errors

        jobs[job_id]["result"] = formatted
        jobs[job_id]["stage"] = "done"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["done"] = True
        print(f"[{job_id}] All stars done — {total_planets} planets across {total} stars")

    except Exception as e:
        print(f"[{job_id}] Pipeline error: {e}")
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["stage"] = "done"
        jobs[job_id]["done"] = True

    finally:
        for path in cleanup_paths:
            if not os.path.exists(path):
                continue
            try:
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    os.remove(path)
            except Exception as e:
                print(f"⚠️ Could not delete {path}: {e}")


# -------------------------------
# ENDPOINT: ANALYZE
# -------------------------------
@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    job_id = str(uuid4())

    original_name = file.filename or "upload"
    ext = os.path.splitext(original_name)[1].lower()

    if ext not in (".npz", ".zip"):
        raise HTTPException(status_code=400, detail="Only .npz or .zip files are accepted")

    upload_path = f"temp_{job_id}{ext}"
    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    cleanup_paths = [upload_path]
    star_inputs = []  # list of (star_name, npz_path)

    try:
        if ext == ".zip":
            extract_dir = f"temp_{job_id}_extracted"
            cleanup_paths.append(extract_dir)
            os.makedirs(extract_dir, exist_ok=True)

            with zipfile.ZipFile(upload_path, "r") as zf:
                npz_members = [
                    n for n in zf.namelist()
                    if n.lower().endswith(".npz") and not n.startswith("__MACOSX/")
                ]
                if not npz_members:
                    raise HTTPException(status_code=400, detail="Zip contains no .npz files")
                if len(npz_members) > MAX_STARS_PER_JOB:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Zip contains {len(npz_members)} stars (max {MAX_STARS_PER_JOB})",
                    )
                for member in sorted(npz_members):
                    zf.extract(member, path=extract_dir)
                    npz_path = os.path.join(extract_dir, member)
                    stem = os.path.splitext(os.path.basename(member))[0]
                    star_name = stem.replace("_", " ").strip() or "Unknown Star"
                    star_inputs.append((star_name, npz_path))
        else:
            stem = os.path.splitext(original_name)[0]
            star_name = stem.replace("_", " ").strip() or "Unknown Star"
            star_inputs.append((star_name, upload_path))
    except HTTPException:
        for path in cleanup_paths:
            if os.path.exists(path):
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    os.remove(path)
        raise
    except Exception as e:
        for path in cleanup_paths:
            if os.path.exists(path):
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    os.remove(path)
        raise HTTPException(status_code=400, detail=f"Could not read upload: {e}")

    jobs[job_id] = {
        "stage": "start",
        "progress": 0,
        "done": False,
        "result": None,
        "current_star": 0,
        "current_star_name": None,
        "total_stars": len(star_inputs),
    }

    thread = threading.Thread(target=run_pipeline, args=(job_id, star_inputs, cleanup_paths))
    thread.start()

    return {"jobId": job_id, "totalStars": len(star_inputs)}

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
        "error": job.get("error"),
        "currentStar": job.get("current_star", 0),
        "currentStarName": job.get("current_star_name"),
        "totalStars": job.get("total_stars", 1),
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