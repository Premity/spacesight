import numpy as np
import os
import pandas as pd
import math
import scipy.sparse as sp
import torch
from astropy.timeseries import BoxLeastSquares
from scipy.sparse.linalg import spsolve

class ExoplanetProcessor:
    def __init__(self, model, catalog_df, config, cnn_threshold=0.70, bls_threshold=10.0):
        self.model = model
        self.catalog = catalog_df
        self.config = config 
        self.cnn_threshold = cnn_threshold
        self.bls_threshold = bls_threshold

    def analyze_raw_lightcurve(self, kic_id, raw_time, raw_flux):
        """End-to-End Pipeline: Cleans raw data, runs AI, and verifies physics."""
        
        # 1. PREPROCESSING & WINDOWING
        cnn_windows, valid_time, valid_flux = self._preprocess_and_window(kic_id, raw_time, raw_flux)
        
        if len(cnn_windows) == 0:
            return {"kic_id": kic_id, "error": "No valid data windows remained after cleaning."}

        # 2. PYTORCH INFERENCE
        # Convert numpy matrix to PyTorch tensor
        tensor_data = torch.tensor(cnn_windows, dtype=torch.float32)

        # Run inference without tracking gradients (saves memory)
        self.model.eval() 
        with torch.no_grad():
            outputs = self.model(tensor_data)
            # Apply sigmoid if your model outputs raw logits; else just .numpy()
            predictions = torch.sigmoid(outputs).numpy()

        is_candidate = bool(np.any(predictions >= self.cnn_threshold))
        max_confidence = float(np.max(predictions))

        # Base response package
        response = {
            "kic_id": kic_id,
            "cnn_candidate": is_candidate,
            "max_confidence": max_confidence,
            "windows_analyzed": len(cnn_windows),
            "verification": None
        }

        # 3. OFFLINE BLS VERIFICATION
        if is_candidate:
            response["verification"] = self._verify_physics(kic_id, valid_time, valid_flux)

        return response

    # -------------------------------------------------------------------------
    # INTERNAL PREPROCESSING METHODS
    # -------------------------------------------------------------------------
    def _preprocess_and_window(self, kic_id, raw_time, raw_flux):
        """Handles gap splitting, detrending, and window generation."""
        gap_threshold_days = self.config.get('gap_threshold_hrs', 24.0) / 24.0
        gaps = np.where(np.diff(raw_time) > gap_threshold_days)[0] + 1
        
        time_segments = np.split(raw_time, gaps)
        flux_segments = np.split(raw_flux, gaps)
        
        clean_flux_full = np.array([])
        
        for t_seg, f_seg in zip(time_segments, flux_segments):
            if len(f_seg) < 100: 
                clean_flux_full = np.concatenate([clean_flux_full, np.full_like(f_seg, np.nan)])
                continue
                
            detrended_seg = self._detrend_segment(t_seg, f_seg)
            clean_flux_full = np.concatenate([clean_flux_full, detrended_seg])
        
        return self._segment_into_windows(kic_id, raw_time, clean_flux_full)

    def _detrend_segment(self, time, flux):
        """Applies Sigma Clipping and WH Smoothing."""
        median_flux = np.nanmedian(flux)
        std_flux = np.nanstd(flux)
        mask = np.abs(flux - median_flux) > (self.config['sigma_clip'] * std_flux)
        
        flux_clean = np.copy(flux)
        flux_clean[mask] = np.nan
        
        valid = ~np.isnan(flux_clean)
        if valid.sum() == 0:
            return flux_clean
            
        flux_interp = np.interp(time, time[valid], flux_clean[valid])
        
        m = len(flux_interp)
        E = sp.eye(m, format='csc')
        D = sp.diags([1, -2, 1], [0, 1, 2], shape=(m-2, m))
        A = E + self.config['wh_lambda'] * D.T.dot(D)
        baseline = spsolve(A, flux_interp)
        
        detrended_flux = flux / baseline
        segment_median = np.nanmedian(detrended_flux)
        normalized_flux = detrended_flux / segment_median
        
        valid_norm = ~np.isnan(normalized_flux)
        return np.interp(time, time[valid_norm], normalized_flux[valid_norm])
    
    def _get_known_transits(self, kic_id, t_min, t_max):
        """Safely fetches known transit times to locate the secondary eclipse."""
        try:
            numeric_id = int(''.join(filter(str.isdigit, str(kic_id))))
            kois = self.catalog[
                (self.catalog['kepid'] == numeric_id) &
                (self.catalog['koi_period'].notna()) &
                (self.catalog['koi_time0bk'].notna())
            ]
        except (ValueError, TypeError):
            return [], [], []

        all_times, all_durations, all_periods = [], [], []
        for _, row in kois.iterrows():
            P = float(row['koi_period'])
            t0 = float(row['koi_time0bk'])
            # Handle possible NaNs in duration by defaulting to a standard 0.2 days (~5 hours)
            dur_hrs = row['koi_duration']
            dur = float(dur_hrs) / 24.0 if not pd.isna(dur_hrs) else 0.2

            if P <= 0: continue
            n_lo = int(np.floor((t_min - t0) / P))
            n_hi = int(np.ceil((t_max - t0) / P))
            
            for n in range(n_lo, n_hi + 1):
                tm = t0 + n * P
                if t_min <= tm <= t_max:
                    all_times.append(tm)
                    all_durations.append(dur)
                    all_periods.append(P)
                    
        return all_times, all_durations, all_periods

    def _extract_secondary_window(self, time_full, flux_full, t_center, period, half_w=100, fill_value=1.0):
        """Extracts the 201-cadence window centered on the secondary eclipse."""
        W = 2 * half_w + 1
        t_secondary = t_center + period / 2.0

        idx_center = int(np.argmin(np.abs(time_full - t_secondary)))
        i_start = idx_center - half_w
        i_end = idx_center + half_w + 1

        if i_start < 0 or i_end > len(flux_full):
            return np.full(W, fill_value, dtype=np.float32)

        sec = flux_full[i_start:i_end].copy()

        n_valid = int(np.isfinite(sec).sum())
        if n_valid < 2:
            return np.full(W, fill_value, dtype=np.float32)

        if np.isnan(sec).any():
            nans = np.isnan(sec)
            idx = np.arange(W)
            sec[nans] = np.interp(idx[nans], idx[~nans], sec[~nans])

        wmed = np.median(sec)
        if wmed != 0:
            sec = (sec / wmed).astype(np.float32)

        return sec.astype(np.float32)

    def _segment_into_windows(self, kic_id, time, flux):
        """Chops data and enforces NaN limits."""
        window_size = self.config['window_length'] 
        stride = self.config['stride']             
        min_valid = self.config.get('min_valid_frac', 0.90) 
        fill_val = self.config.get('secondary_fill_value', 1.0)
        buf_frac = self.config.get('transit_buffer_frac', 0.5)
        half_w = window_size // 2

        ttimes, tdurs, tperiods = self._get_known_transits(kic_id, time.min(), time.max())
        
        windows, valid_time_indices = [], []
        
        for start_idx in range(0, len(flux) - window_size + 1, stride):
            segment = flux[start_idx : start_idx + window_size]
            wtime = time[start_idx : start_idx + window_size]
            
            if (np.sum(~np.isnan(segment)) / window_size) >= min_valid:
                window_median = np.nanmedian(segment)
                normalized_window = segment / window_median
                normalized_window = np.nan_to_num(normalized_window, nan=1.0)
                
                best_period = None
                tlo, thi = wtime[0], wtime[-1]

                for tm, dur, P in zip(ttimes, tdurs, tperiods):
                    buffer = buf_frac * dur
                    if tlo - buffer < tm < thi + buffer:
                        best_period = P
                        break

                t_window_center = float(wtime[half_w])
                if best_period is not None:
                    sec_channel = self._extract_secondary_window(
                        time, flux, t_window_center, best_period,
                        half_w=half_w, fill_value = fill_val
                    )
                else:
                    sec_channel = np.full(window_size, fill_val, dtype = np.float32)

                stacked = np.stack([normalized_window, sec_channel], axis=0)
                windows.append(stacked)
                valid_time_indices.extend(range(start_idx, start_idx + window_size))
            
        if not windows:
            return [], [], []
    
        cnn_matrix = np.stack(windows) # Naturally yields (-1, 2, 201)
        unique_indices = sorted(list(set(valid_time_indices)))
        
        return cnn_matrix, time[unique_indices], flux[unique_indices]

    # -------------------------------------------------------------------------
    # INTERNAL VERIFICATION METHODS
    # -------------------------------------------------------------------------
    def _verify_physics(self, kic_id, time_array, flux_array):
        """Optimized BLS with Catalog Ground-Truth Verification."""        
        # 1. INITIALIZE BLS
        bls = BoxLeastSquares(time_array, flux_array)
        
        # 2. OPTIMIZED PERIOD SEARCH
        # frequency_factor=5.0 prevents the infinite hang by lowering grid density slightly
        period_grid = bls.autoperiod(
            duration=0.2, 
            minimum_period=0.5, 
            maximum_period=50.0,
            frequency_factor=5.0 
        )
        
        # Safety cap: don't let it search more than 50k periods in production
        if len(period_grid) > 50000:
            period_grid = np.linspace(0.5, 50.0, 50000)

        results = bls.power(period_grid, 0.2)
        best_idx = np.argmax(results.power)
        
        # 3. EXTRACT CALCULATED VALUES
        calc_period = float(results.period[best_idx])
        calc_depth = float(results.depth[best_idx])
        max_power = float(results.power[best_idx])

        # 4. CATALOG LOOKUP (Ground Truth)
        # Use a robust ID parse to handle the "KIC_" or random names
        try:
            numeric_id = int(''.join(filter(str.isdigit, str(kic_id))))
            star_row = self.catalog[self.catalog['kepid'] == numeric_id]
        except (ValueError, TypeError):
            star_row = pd.DataFrame()

        # 5. FETCH STELLAR & NASA DATA
        if not star_row.empty:
            s_rad = float(star_row['koi_srad'].values[0]) if not pd.isna(star_row['koi_srad'].values[0]) else 1.0
            nasa_period = float(star_row['koi_period'].values[0]) if not pd.isna(star_row['koi_period'].values[0]) else None
            nasa_radius = float(star_row['koi_prad'].values[0]) if not pd.isna(star_row['koi_prad'].values[0]) else None
            disposition = str(star_row['koi_disposition'].values[0])
        else:
            s_rad, nasa_period, nasa_radius, disposition = 1.0, None, None, "NOT_IN_CATALOG"

        # 6. RADIUS CALCULATION
        # Ensure depth is positive before sqrt
        radius_ratio = math.sqrt(max(0, calc_depth))
        p_rad_earth = (s_rad * 109.2) * radius_ratio

        # 7. FINAL PAYLOAD
        return {
            "status": "CONFIRMED" if max_power > self.bls_threshold else "CANDIDATE",
            "calculated": {
                "period": calc_period,
                "radius": p_rad_earth,
                "bls_power": max_power
            },
            "catalog_truth": {
                "disposition": disposition,
                "nasa_period": nasa_period,
                "nasa_radius": nasa_radius
            },
            "accuracy_metrics": {
                "period_error": abs(calc_period - nasa_period) if nasa_period else "N/A"
            }
        }