import logging
import json
import os
import re

import numpy as np
import pandas as pd
import torch

from app.model_def import InceptionResNet1D
from app.processor import ExoplanetProcessor

logging.basicConfig(level=logging.DEBUG)

# --- 1. PATH CONFIGURATION ---
MODEL_PATH   = os.path.join("models", "exoplanet_cnn_model.pt")
CATALOG_PATH = os.path.join("data", "koi_cumulative.csv")

TEST_FILE = "KIC_6541920.npz"   # raw counts file

# --- 2. HYPERPARAMETERS ---
CONFIG = {
    'sigma_clip':           5.0,
    'gap_threshold_hrs':   24.0,
    'wh_lambda':            1e9,   # for raw Kepler counts (~45,000 e-/s)
    'wh_asymmetric_iters':  10,
    'window_length':        201,
    'stride':                50,
    'min_valid_frac':       0.90,
}


# --- 3. NUMPY-SAFE JSON ENCODER ---
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):   return int(obj)
        if isinstance(obj, np.floating):  return float(obj)
        if isinstance(obj, np.bool_):     return bool(obj)
        if isinstance(obj, np.ndarray):   return obj.tolist()
        return super().default(obj)


def run_test():
    print("⏳ Loading InceptionResNet1D Model and Catalog...")
    try:
        cnn_model  = InceptionResNet1D(in_channels=2, nb_filters=32)
        checkpoint = torch.load(MODEL_PATH, map_location=torch.device('cpu'))
        cnn_model.load_state_dict(checkpoint['model_state_dict'])
        cnn_model.eval()
        catalog_df = pd.read_csv(CATALOG_PATH)
        print("✅ Engine loaded successfully.")
    except Exception as e:
        print(f"❌ Loading Error: {e}")
        return

    print("✅ Initializing Processor...")
    processor = ExoplanetProcessor(
        cnn_model, catalog_df,
        config=CONFIG,
        cnn_threshold=0.70,
        bls_threshold=4.0,   # lower for shallow multi-planet systems
    )

    print(f"⏳ Loading test file: {TEST_FILE}...")
    try:
        data     = np.load(TEST_FILE, allow_pickle=True)
        raw_time = data['time']
        raw_flux = data['flux']

        print(f"\n--- RAW DATA ---")
        print(f"  flux median: {np.nanmedian(raw_flux):.2f}  "
              f"std: {np.nanstd(raw_flux):.4f}  "
              f"NaNs: {np.sum(np.isnan(raw_flux))}")

        match = re.search(r'KIC_(\d+)', TEST_FILE, re.IGNORECASE)
        if match:
            kic_id = match.group(1)
            print(f"🆔 Case A Detected: Parsed KIC ID {kic_id}")
        else:
            kic_id = re.sub(r'\D', '', TEST_FILE)
            if kic_id:
                print(f"🆔 Case A (fallback): Parsed ID {kic_id}")
            else:
                kic_id = ""
                print("⚠️  WARNING — Case B: No numeric ID in filename.")
                print("   Stellar radius defaults to 1.0 R☉; radius estimates unreliable.")

    except Exception as e:
        print(f"❌ Error loading .npz file: {e}")
        return

    print("\n🚀 Firing Inference Pipeline (Cleaning -> CNN -> BLS)...")
    results = processor.analyze_raw_lightcurve(kic_id, raw_time, raw_flux)

    print("\n" + "=" * 40)
    print("🎯 FINAL OUTPUT PAYLOAD")
    print("=" * 40)
    print(json.dumps(results, indent=4, cls=NumpyEncoder))
    print("=" * 40)


if __name__ == "__main__":
    run_test()