from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import pandas as pd
import io
import os
import torch
from app.processor import ExoplanetProcessor

app = FastAPI(title="SpaceSight Inference API")

# Allow requests from your React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://premity.github.io"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

processor = None

@app.on_event("startup")
async def startup_event():
    """Loads the heavy AI model, Catalog, and Config into RAM once when the server boots."""
    global processor
    print("Loading ML Model and Catalog...")
    
    model_path = os.path.join("models", "exoplanet_cnn_model.keras")
    catalog_path = os.path.join("data", "koi_cumulative.csv")

    cnn_model = torch.load(model_path, map_location=torch.device('cpu'))
    catalog_df = pd.read_csv(catalog_path)
    
    # Define the exact hyperparameters used during model training
    CONFIG = {
        'sigma_clip': 5.0,
        'gap_threshold_hrs': 24.0,
        'wh_lambda': 1e6,
        'window_length': 201,
        'stride': 50,
        'min_valid_frac': 0.90
    }
    
    processor = ExoplanetProcessor(cnn_model, catalog_df, config=CONFIG)
    print("🚀 SpaceSight Unified Backend Ready!")

@app.post("/predict")
async def predict_star(file: UploadFile = File(...)):
    """Receives raw data from the React UI and processes it end-to-end."""
    if not file.filename.endswith('.npz'):
        raise HTTPException(status_code=400, detail="Invalid file type. Must be an .npz file")

    kic_id = file.filename.replace('KIC_', '').replace('.npz', '')

    try:
        # 1. Read the raw file directly into RAM
        contents = await file.read()
        data = np.load(io.BytesIO(contents), allow_pickle=True)

        # 2. Extract the continuous raw arrays
        # The frontend now only needs to send 'time' and 'flux'
        if 'time' not in data or 'flux' not in data:
            raise ValueError("Uploaded .npz must contain 'time' and 'flux' arrays.")
            
        raw_time = data['time']
        raw_flux = data['flux']

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Data extraction error: {str(e)}")

    # ==========================================
    # PIPELINE EXECUTION (Master Engine)
    # ==========================================
    
    # 3. Pass the raw arrays directly to the unified processor.
    # It automatically handles cleaning, windowing, CNN triage, and BLS verification!
    final_results = processor.analyze_raw_lightcurve(kic_id, raw_time, raw_flux)

    # Send the final JSON payload back to the React charts
    return final_results