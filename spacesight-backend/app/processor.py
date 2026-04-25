import math
import logging

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from astropy.timeseries import BoxLeastSquares
from scipy.sparse.linalg import spsolve

logger = logging.getLogger(__name__)


class ExoplanetProcessor:
    """
    Triage-and-Verify exoplanet detection pipeline.

    Stage 1 — CNN Triage (runs on every star):
        Segments the detrended light curve into overlapping 2-channel windows
        and passes them through an InceptionResNet1D classifier. Stars whose
        maximum window confidence falls below `cnn_threshold` are rejected
        immediately; no BLS work is done for them.

    Stage 2 — BLS Physics Verification (runs only on CNN candidates):
        Runs BLS independently on each detrended quarter segment, combines
        the per-segment power spectra by summing at each trial period, then
        picks the best global period. This avoids the inter-quarter flux
        offset problem where slow brightness drifts across quarters dominate
        the full-array noise floor and bury shallow (~200-500 ppm) transits.

        Each detected planet is then masked out (pre-whitening) before the
        next iteration, enabling multi-planet recovery.
    """

    def __init__(self, model, catalog_df, config, cnn_threshold=0.70, bls_threshold=7.0):
        self.model = model
        self.catalog = catalog_df
        self.config = config
        self.cnn_threshold = cnn_threshold
        self.bls_threshold = bls_threshold

    # =========================================================================
    # PUBLIC API
    # =========================================================================

    def analyze_raw_lightcurve(self, kic_id, raw_time, raw_flux):
        """
        End-to-end pipeline: clean -> CNN triage -> (BLS verification if candidate).

        Parameters
        ----------
        kic_id   : str or int  KIC identifier
        raw_time : ndarray     Raw time array (Kepler BJD)
        raw_flux : ndarray     Raw flux array (counts or pre-normalized)

        Returns
        -------
        dict with keys:
            kic_id, cnn_candidate, max_confidence, windows_analyzed,
            planets_detected, detections
        """

        # ------------------------------------------------------------------
        # STAGE 1A - PREPROCESSING
        # Detrend each gap-split segment independently. Returns:
        #   cnn_windows   : (-1, 2, window_length) strided array -> CNN
        #   segments      : list of (time, flux) tuples, one per valid segment
        #                   -> BLS (each segment is quarter-normalized)
        # ------------------------------------------------------------------
        cnn_windows, segments = self._preprocess_and_window(kic_id, raw_time, raw_flux)

        if len(cnn_windows) == 0:
            return {
                "kic_id": kic_id,
                "error": "No valid data windows remained after cleaning.",
            }

        # ------------------------------------------------------------------
        # STAGE 1B - CNN INFERENCE
        # ------------------------------------------------------------------
        tensor_data = torch.tensor(cnn_windows, dtype=torch.float32)
        self.model.eval()
        with torch.no_grad():
            preds = self.model(tensor_data)
            probs = torch.sigmoid(preds).numpy().flatten()

        max_conf     = float(np.max(probs))
        is_candidate = max_conf > self.cnn_threshold

        logger.info(
            "KIC %s | CNN confidence: %.4f | candidate: %s",
            kic_id, max_conf, is_candidate,
        )

        # ------------------------------------------------------------------
        # TRIAGE GATE
        # Non-candidates exit here. BLS never runs for them — this is the
        # core cost-saving step of the pipeline.
        # ------------------------------------------------------------------
        if not is_candidate:
            return {
                "kic_id":           kic_id,
                "cnn_candidate":    False,
                "max_confidence":   max_conf,
                "windows_analyzed": len(cnn_windows),
                "planets_detected": 0,
                "detections":       [],
            }

        # ------------------------------------------------------------------
        # STAGE 2 - ITERATIVE BLS PHYSICS VERIFICATION
        # Only reached when CNN flagged a candidate.
        # Pre-whitening: after each detection, mask that planet's transits
        # across all segments, then re-run BLS to find more planets.
        # Harmonic guard: reject any new detection whose period is within
        # 5% of an already-found period or a simple harmonic of it.
        # ------------------------------------------------------------------
        found_planets        = []
        accepted_periods     = []   # periods of confirmed detections
        accepted_period_info = []   # (period, transit_time, duration) tuples
        current_segs         = [(t.copy(), f.copy()) for t, f in segments]
        max_iterations       = 10
        max_harmonic_skips   = 5    # abort if BLS keeps returning harmonics

        harmonic_skips = 0

        for i in range(max_iterations):
            planet_result = self._verify_physics(kic_id, current_segs)

            if planet_result["calculated"]["bls_power"] < self.bls_threshold:
                logger.info(
                    "KIC %s | BLS iteration %d: power %.2f below threshold %.1f - stopping.",
                    kic_id, i + 1,
                    planet_result["calculated"]["bls_power"],
                    self.bls_threshold,
                )
                break

            new_p = planet_result["calculated"]["period"]

            # --- HARMONIC / DUPLICATE GUARD ---
            # Check whether new_p is a duplicate or harmonic of any accepted
            # period. Ratios checked: 1x (duplicate), 2x, 0.5x, 3x, 1/3x.
            is_harmonic = False
            for prev_p in accepted_periods:
                for ratio in [1.0, 2.0, 0.5, 3.0, 1/3]:
                    if abs(new_p - prev_p * ratio) / prev_p < 0.05:
                        is_harmonic = True
                        break
                if is_harmonic:
                    break

            if is_harmonic:
                harmonic_skips += 1
                logger.info(
                    "KIC %s | Iteration %d: period %.4f d is a harmonic/duplicate "
                    "of a previous detection — masking and retrying (%d/%d).",
                    kic_id, i + 1, new_p, harmonic_skips, max_harmonic_skips,
                )
                if harmonic_skips >= max_harmonic_skips:
                    logger.info(
                        "KIC %s | Too many consecutive harmonic detections — stopping.",
                        kic_id,
                    )
                    break
                # Mask using the PARENT period's transit time, not the harmonic's.
                # The harmonic detection has a slightly shifted t0 each iteration
                # because BLS fits different ingress/egress edges. Using its own t0
                # places the mask on the wrong cadences, leaving the true transit
                # residual untouched so BLS keeps rediscovering it.
                # Instead, find which accepted period this is a harmonic of and
                # use that period's known transit time for the mask.
                p   = planet_result["calculated"]["period"]
                t0  = planet_result["calculated"]["transit_time"]
                dur = planet_result["calculated"]["duration"]
                # Find the parent accepted period
                for prev_p, prev_t0, prev_dur in accepted_period_info:
                    for ratio in [1.0, 2.0, 0.5, 3.0, 1/3]:
                        if abs(new_p - prev_p * ratio) / prev_p < 0.05:
                            # Mask at the parent's period and t0 with generous buffer
                            p   = prev_p
                            t0  = prev_t0
                            dur = prev_dur
                            break
                masked_segs = []
                for seg_time, seg_flux in current_segs:
                    folded     = (seg_time - t0 + 0.5 * p) % p - 0.5 * p
                    in_transit = np.abs(folded) < (dur * 2.5 / 2.0)
                    seg_flux   = seg_flux.copy()
                    seg_flux[in_transit] = 1.0
                    masked_segs.append((seg_time, seg_flux))
                current_segs = masked_segs
                continue

            # Reset harmonic skip counter on a genuine new detection
            harmonic_skips = 0
            planet_result["planet_number"] = i + 1
            found_planets.append(planet_result)
            accepted_periods.append(new_p)
            accepted_period_info.append((
                new_p,
                planet_result["calculated"]["transit_time"],
                planet_result["calculated"]["duration"],
            ))

            logger.info(
                "KIC %s | Planet %d detected - period: %.4f d, radius: %.2f R_earth, power: %.2f",
                kic_id, i + 1,
                planet_result["calculated"]["period"],
                planet_result["calculated"]["radius"],
                planet_result["calculated"]["bls_power"],
            )

            # Pre-whitening: mask this planet's transits in every segment.
            p   = planet_result["calculated"]["period"]
            t0  = planet_result["calculated"]["transit_time"]
            dur = planet_result["calculated"]["duration"]

            masked_segs = []
            for seg_time, seg_flux in current_segs:
                folded     = (seg_time - t0 + 0.5 * p) % p - 0.5 * p
                in_transit = np.abs(folded) < (dur * 1.5 / 2.0)
                seg_flux   = seg_flux.copy()
                seg_flux[in_transit] = 1.0
                masked_segs.append((seg_time, seg_flux))
            current_segs = masked_segs

        # ------------------------------------------------------------------
        # FINAL PAYLOAD
        # ------------------------------------------------------------------
        return {
            "kic_id":           kic_id,
            "cnn_candidate":    True,
            "max_confidence":   max_conf,
            "windows_analyzed": len(cnn_windows),
            "planets_detected": len(found_planets),
            "detections":       found_planets,
        }

    # =========================================================================
    # PREPROCESSING
    # =========================================================================

    def _preprocess_and_window(self, kic_id, raw_time, raw_flux):
        """
        Split on observation gaps, detrend each segment, then produce:
          - CNN windows (strided, for the classifier)
          - Per-segment (time, flux) pairs (for BLS, one per Kepler quarter)

        Keeping segments separate for BLS is critical. Kepler's per-quarter
        aperture and sensitivity changes create inter-quarter flux offsets of
        1-5% that WH cannot fully remove in a single pass. Concatenating all
        quarters before BLS raises the noise floor to ~12,000 ppm, completely
        drowning the 200-500 ppm transit signals in Kepler-11. Running BLS
        independently on each detrended quarter and summing the power spectra
        is the standard approach in the literature (Kovacs et al. 2002).

        Returns
        -------
        cnn_windows : ndarray (-1, 2, window_length)
        segments    : list of (time_array, flux_array) tuples
        """
        gap_threshold_days = self.config.get("gap_threshold_hrs", 24.0) / 24.0
        gaps = np.where(np.diff(raw_time) > gap_threshold_days)[0] + 1

        time_segments = np.split(raw_time, gaps)
        flux_segments = np.split(raw_flux, gaps)

        clean_flux_full = np.array([])  # full array for CNN windowing
        segments        = []            # per-segment pairs for BLS

        for t_seg, f_seg in zip(time_segments, flux_segments):
            if len(f_seg) < 100:
                clean_flux_full = np.concatenate(
                    [clean_flux_full, np.full_like(f_seg, np.nan)]
                )
                continue

            detrended = self._detrend_segment(t_seg, f_seg)
            clean_flux_full = np.concatenate([clean_flux_full, detrended])

            # Strip any remaining NaNs before storing for BLS
            valid = ~np.isnan(detrended)
            if valid.sum() > 50:
                segments.append((t_seg[valid], detrended[valid]))

        cnn_windows, _, _ = self._segment_into_windows(kic_id, raw_time, clean_flux_full)

        return cnn_windows, segments

    def _detrend_segment(self, time, flux):
        """
        Sigma-clip outliers then apply Whittaker-Henderson baseline correction.

        Automatically detects whether the flux is pre-normalized (median ~1.0,
        std < 0.05) or raw counts and skips WH for pre-normalized data.

        For flat segments (relative variability < 500 ppm) standard WH is used
        directly. For variable segments (stellar variability > 500 ppm) the
        weighted asymmetric iteration (airPLS-style) is used to anchor the
        baseline to the out-of-transit continuum rather than chasing dips.
        """
        median_flux  = np.nanmedian(flux)
        std_flux     = np.nanstd(flux)
        outlier_mask = np.abs(flux - median_flux) > (self.config["sigma_clip"] * std_flux)

        flux_clean = np.copy(flux).astype(np.float64)
        flux_clean[outlier_mask] = np.nan

        valid = ~np.isnan(flux_clean)
        if valid.sum() == 0:
            return flux_clean

        flux_interp = np.interp(time, time[valid], flux_clean[valid])

        # Pre-normalized check: skip WH entirely if data is already ~1.0
        pre_normalized = (abs(median_flux - 1.0) < 0.05) and (std_flux < 0.05)
        if pre_normalized:
            logger.debug("Segment pre-normalized (median=%.4f) — skipping WH.", median_flux)
            return np.where(np.isnan(flux_interp), 1.0, flux_interp)

        m   = len(flux_interp)
        lam = float(self.config["wh_lambda"])
        D   = sp.diags([1.0, -2.0, 1.0], [0, 1, 2], shape=(m - 2, m))
        DDT = D.T.dot(D)
        E   = sp.eye(m, format="csc")

        # Initial standard WH solve
        baseline = spsolve(E + lam * DDT, flux_interp)

        # Flat segments (variability < 500 ppm relative): the asymmetric
        # iteration diverges because floating-point noise causes nearly all
        # points to fall below the initial baseline, making weights collapse
        # to 1e-6 everywhere and the solve return a nonsense result.
        # Standard WH is sufficient — there's no stellar variability to remove.
        relative_variability = std_flux / median_flux
        use_asymmetric = relative_variability >= 5e-4

        if use_asymmetric:
            n_iter = self.config.get("wh_asymmetric_iters", 10)
            for _ in range(n_iter):
                weights  = np.where(flux_interp >= baseline, 1.0, 1e-6)
                W        = sp.diags(weights, format="csc")
                baseline = spsolve(W + lam * DDT, W.dot(flux_interp))

        baseline = np.where(np.abs(baseline) < 1e-10, 1.0, baseline)

        detrended  = flux_interp / baseline
        seg_median = np.nanmedian(detrended)
        if seg_median == 0:
            seg_median = 1.0
        normed = detrended / seg_median

        valid_norm = ~np.isnan(normed)
        return np.interp(time, time[valid_norm], normed[valid_norm])

    def _segment_into_windows(self, kic_id, time, flux):
        """
        Produce overlapping 2-channel CNN windows from the detrended flux.

        Channel 0 - primary transit window (normalized flux).
        Channel 1 - secondary eclipse window at phase 0.5 (or flat 1.0 if no
                    catalog period is available for this star).
        """
        window_size = self.config["window_length"]
        stride      = self.config["stride"]
        min_valid   = self.config.get("min_valid_frac", 0.90)
        fill_val    = self.config.get("secondary_fill_value", 1.0)
        buf_frac    = self.config.get("transit_buffer_frac", 0.5)
        half_w      = window_size // 2

        ttimes, tdurs, tperiods = self._get_known_transits(
            kic_id, time.min(), time.max()
        )

        windows, valid_time_indices = [], []

        for start_idx in range(0, len(flux) - window_size + 1, stride):
            segment = flux[start_idx : start_idx + window_size]
            wtime   = time[start_idx : start_idx + window_size]

            if (np.sum(~np.isnan(segment)) / window_size) < min_valid:
                continue

            window_median     = np.nanmedian(segment)
            normalized_window = segment / window_median
            normalized_window = np.nan_to_num(normalized_window, nan=1.0)

            best_period = None
            tlo, thi    = wtime[0], wtime[-1]
            for tm, dur, P in zip(ttimes, tdurs, tperiods):
                buffer = buf_frac * dur
                if tlo - buffer < tm < thi + buffer:
                    best_period = P
                    break

            t_window_center = float(wtime[half_w])
            if best_period is not None:
                sec_channel = self._extract_secondary_window(
                    time, flux, t_window_center, best_period,
                    half_w=half_w, fill_value=fill_val,
                )
            else:
                sec_channel = np.full(window_size, fill_val, dtype=np.float32)

            stacked = np.stack([normalized_window, sec_channel], axis=0)
            windows.append(stacked)
            valid_time_indices.extend(range(start_idx, start_idx + window_size))

        if not windows:
            return [], np.array([]), np.array([])

        cnn_matrix     = np.stack(windows)
        unique_indices = sorted(set(valid_time_indices))

        return cnn_matrix, time[unique_indices], flux[unique_indices]

    def _extract_secondary_window(
        self, time_full, flux_full, t_center, period, half_w=100, fill_value=1.0
    ):
        """Extract the 201-cadence window centred on the secondary eclipse (phase 0.5)."""
        W           = 2 * half_w + 1
        t_secondary = t_center + period / 2.0

        idx_center = int(np.argmin(np.abs(time_full - t_secondary)))
        i_start    = idx_center - half_w
        i_end      = idx_center + half_w + 1

        if i_start < 0 or i_end > len(flux_full):
            return np.full(W, fill_value, dtype=np.float32)

        sec = flux_full[i_start:i_end].copy()

        if int(np.isfinite(sec).sum()) < 2:
            return np.full(W, fill_value, dtype=np.float32)

        if np.isnan(sec).any():
            nans = np.isnan(sec)
            idx  = np.arange(W)
            sec[nans] = np.interp(idx[nans], idx[~nans], sec[~nans])

        wmed = np.median(sec)
        if wmed != 0:
            sec = (sec / wmed).astype(np.float32)

        return sec.astype(np.float32)

    def _get_known_transits(self, kic_id, t_min, t_max):
        """
        Fetch all catalog transit mid-times for this KIC ID within [t_min, t_max].
        Used to align the secondary-eclipse channel in _segment_into_windows.
        """
        try:
            numeric_id = int("".join(filter(str.isdigit, str(kic_id))))
            kois = self.catalog[
                (self.catalog["kepid"] == numeric_id)
                & (self.catalog["koi_period"].notna())
                & (self.catalog["koi_time0bk"].notna())
            ]
        except (ValueError, TypeError):
            return [], [], []

        all_times, all_durations, all_periods = [], [], []

        for _, row in kois.iterrows():
            P       = float(row["koi_period"])
            t0      = float(row["koi_time0bk"])
            dur_hrs = row["koi_duration"]
            dur     = float(dur_hrs) / 24.0 if not pd.isna(dur_hrs) else 0.2

            if P <= 0:
                continue

            n_lo = int(np.floor((t_min - t0) / P))
            n_hi = int(np.ceil((t_max - t0) / P))

            for n in range(n_lo, n_hi + 1):
                tm = t0 + n * P
                if t_min <= tm <= t_max:
                    all_times.append(tm)
                    all_durations.append(dur)
                    all_periods.append(P)

        return all_times, all_durations, all_periods

    # =========================================================================
    # PHYSICS VERIFICATION
    # =========================================================================

    def _verify_physics(self, kic_id, segments):
        """
        Run BLS independently on each detrended quarter segment, sum the power
        spectra across segments at each trial period, then extract planet
        parameters at the best combined period.

        This is the standard approach for multi-quarter Kepler data. Running
        BLS on the full concatenated light curve fails because inter-quarter
        flux offsets (1-5%) raise the noise floor to ~12,000 ppm, completely
        drowning 200-500 ppm transit signals. Per-segment BLS keeps the noise
        floor within each quiet quarter (~200-300 ppm), and summing powers
        across segments gives the same transit-SNR accumulation benefit as
        using the full baseline without the offset penalty.

        Parameters
        ----------
        kic_id   : str
        segments : list of (time_array, flux_array) tuples

        Returns a dict with keys: status, calculated, catalog_truth, accuracy_metrics.
        """

        # ------------------------------------------------------------------
        # 1. CATALOG LOOKUP
        # Pull stellar radius (s_rad) and all KOI rows for this star.
        # nasa_period / nasa_radius are matched to the detected period later
        # (after BLS) so each planet gets its own catalog entry, not always
        # the first row.
        # ------------------------------------------------------------------
        s_rad        = 1.0
        disposition  = "UNKNOWN"
        koi_rows     = pd.DataFrame()   # all KOIs for this star

        try:
            numeric_id = int("".join(filter(str.isdigit, str(kic_id))))
            all_rows   = self.catalog[self.catalog["kepid"] == numeric_id]

            if not all_rows.empty:
                # Stellar radius: use first row (same star for all KOIs)
                s_rad = (
                    float(all_rows["koi_srad"].values[0])
                    if not pd.isna(all_rows["koi_srad"].values[0])
                    else 1.0
                )
                koi_rows = all_rows  # save all KOIs for period-matching later

        except (ValueError, TypeError):
            pass

        # ------------------------------------------------------------------
        # 2. BUILD A SHARED PERIOD GRID
        # ------------------------------------------------------------------
        t_all_min = min(t.min() for t, _ in segments)
        t_all_max = max(t.max() for t, _ in segments)
        max_search_period = min(400.0, (t_all_max - t_all_min) / 2.0)

        t0_seg, f0_seg = segments[0]
        bls_ref = BoxLeastSquares(t0_seg, f0_seg)
        period_grid = bls_ref.autoperiod(
            duration=0.2,
            minimum_period=0.5,
            maximum_period=max_search_period,
            frequency_factor=5.0,
        )
        if len(period_grid) > 50000:
            period_grid = np.linspace(0.5, min(50.0, max_search_period), 50000)

        durations = np.linspace(0.05, 0.2, 10)

        # ------------------------------------------------------------------
        # 3. PER-SEGMENT BLS + POWER SUM
        # Run BLS on each segment independently, accumulate raw (un-normalised)
        # depth-weighted power so the combined_depth array stays in physical
        # flux units (fraction of stellar flux) for the radius calculation.
        # Power is still normalised per-segment before summing so noisy
        # quarters don't dominate the period selection, but we track the
        # raw depth separately via a weighted accumulator.
        # ------------------------------------------------------------------
        combined_power    = np.zeros(len(period_grid))
        combined_duration = np.zeros(len(period_grid))
        combined_t0       = np.zeros(len(period_grid))
        # depth accumulator: sum of (depth * weight) / sum of weights
        depth_num         = np.zeros(len(period_grid))
        depth_den         = np.zeros(len(period_grid))
        n_contributing    = 0

        for seg_time, seg_flux in segments:
            if (seg_time.max() - seg_time.min()) < 1.0:
                continue

            seg_baseline   = seg_time.max() - seg_time.min()
            seg_max_period = seg_baseline / 2.0
            seg_pg         = period_grid[period_grid <= seg_max_period]

            if len(seg_pg) < 10:
                continue

            try:
                bls     = BoxLeastSquares(seg_time, seg_flux)
                results = bls.power(seg_pg, durations)

                seg_power = np.array(results.power)
                seg_depth = np.array(results.depth)

                # Normalise power by median for stable period selection
                seg_med = np.median(seg_power)
                if seg_med > 0:
                    seg_norm = seg_power / seg_med
                else:
                    seg_norm = seg_power

                n_seg = len(seg_pg)
                combined_power[:n_seg]    += seg_norm
                combined_duration[:n_seg]  = np.array(results.duration)
                combined_t0[:n_seg]        = np.array(results.transit_time)
                # Weighted depth: weight by normalised power so high-SNR
                # segments dominate the depth estimate
                depth_num[:n_seg] += seg_norm * seg_depth
                depth_den[:n_seg] += seg_norm
                n_contributing += 1

            except Exception as e:
                logger.debug("KIC %s | BLS segment failed: %s", kic_id, e)
                continue

        if n_contributing == 0:
            longest = max(segments, key=lambda s: len(s[0]))
            seg_time, seg_flux = longest
            bls     = BoxLeastSquares(seg_time, seg_flux)
            results = bls.power(period_grid, durations)
            best    = int(np.argmax(results.power))
            max_power          = float(results.power[best])
            calc_period        = float(results.period[best])
            calc_duration      = float(results.duration[best])
            calc_transit_time  = float(results.transit_time[best])
            combined_depth_val = float(results.depth[best])
        else:
            best              = int(np.argmax(combined_power))
            max_power         = float(combined_power[best])
            calc_period       = float(period_grid[best])
            calc_duration     = float(combined_duration[best]) if combined_duration[best] > 0 else 0.1
            calc_transit_time = float(combined_t0[best])
            # Weighted-average depth in physical flux units
            combined_depth_val = (
                float(depth_num[best] / depth_den[best])
                if depth_den[best] > 0 else 0.0
            )

        logger.debug(
            "KIC %s | BLS best: power=%.2f  period=%.4f d  duration=%.4f d  "
            "(%d segments contributed)",
            kic_id, max_power, calc_period, calc_duration, n_contributing,
        )

        # ------------------------------------------------------------------
        # 4. T0 + DEPTH via ALL-SEGMENT PHASE FOLD
        #
        # Strategy: concatenate all detrended segments, then find the transit
        # phase by scanning t0 values and measuring the deepest median dip.
        #
        # Key correctness requirements:
        #  1. t0 must be an ABSOLUTE time (BJD), not a phase offset, because
        #     the pre-whitening masking in analyze_raw_lightcurve uses absolute
        #     times. Returning a phase-relative t0 causes masking to land in
        #     the wrong place and the same period is rediscovered every iter.
        #  2. Duration must be >= the actual transit duration or the in-transit
        #     window will miss the dip. Scan from 0.05d to 0.5d to cover all
        #     Kepler-11 planets (shortest ~3h = 0.13d, longest ~10h = 0.4d).
        #  3. The scan must have fine enough resolution to resolve the transit.
        #     Use 500 steps over one period — step size = period/500.
        #     For a 115d period: 0.23d/step, still larger than the 0.4d transit.
        #     So anchor the scan around the coarse BLS t0 with a fine window.
        # ------------------------------------------------------------------

        all_times  = np.concatenate([t for t, _ in segments])
        all_fluxes = np.concatenate([f for _, f in segments])
        t_global_min = float(all_times.min())

        # Step 1: coarse scan across the full period to find the right phase.
        # Use 500 steps so step size < half the shortest transit duration.
        n_coarse   = 500
        coarse_t0s = np.linspace(t_global_min,
                                  t_global_min + calc_period,
                                  n_coarse, endpoint=False)

        # For coarse scan use the median duration as window
        coarse_dur  = 0.20   # ~5 hours, middle of Kepler-11 range
        half_coarse = coarse_dur / 2.0

        coarse_depths = np.zeros(n_coarse)
        for i, t0c in enumerate(coarse_t0s):
            folded     = (all_times - t0c + 0.5 * calc_period) % calc_period - 0.5 * calc_period
            in_transit = np.abs(folded) < half_coarse
            if in_transit.sum() >= 3:
                coarse_depths[i] = max(0.0, 1.0 - float(np.nanmedian(all_fluxes[in_transit])))

        # Step 2: fine scan around the top-3 coarse candidates
        top3_idx    = np.argsort(coarse_depths)[-3:][::-1]
        dur_grid    = np.linspace(0.05, 0.50, 30)

        best_depth  = 0.0
        best_t0_abs = coarse_t0s[top3_idx[0]]   # absolute time fallback
        best_dur    = coarse_dur

        for ci in top3_idx:
            centre_t0 = coarse_t0s[ci]
            # Fine window: ±1 coarse step either side
            fine_half  = calc_period / n_coarse
            fine_t0s   = np.linspace(centre_t0 - fine_half,
                                      centre_t0 + fine_half, 80)
            for dur in dur_grid:
                half_dur = dur / 2.0
                for t0f in fine_t0s:
                    folded     = (all_times - t0f + 0.5 * calc_period) % calc_period - 0.5 * calc_period
                    in_transit = np.abs(folded) < half_dur
                    n_in       = int(in_transit.sum())
                    # Require at least 2 cadences per expected transit
                    # (cadence ~0.02d, so min cadences ~ dur/0.02 * 2 transits)
                    min_cadences = max(3, int(dur / 0.021))
                    if n_in < min_cadences:
                        continue
                    med_in = float(np.nanmedian(all_fluxes[in_transit]))
                    depth  = max(0.0, 1.0 - med_in)
                    if depth > best_depth:
                        best_depth  = depth
                        best_t0_abs = t0f     # absolute BJD time
                        best_dur    = dur

        # Step 3: baseline-corrected depth at best t0
        folded_best  = (all_times - best_t0_abs + 0.5 * calc_period) % calc_period - 0.5 * calc_period
        oot_mask     = np.abs(folded_best) > (best_dur * 3.0)
        baseline_med = float(np.nanmedian(all_fluxes[oot_mask])) if oot_mask.sum() > 10 else 1.0
        in_mask      = np.abs(folded_best) < (best_dur / 2.0)
        if in_mask.sum() >= 3:
            in_med     = float(np.nanmedian(all_fluxes[in_mask]))
            calc_depth = max(0.0, baseline_med - in_med)
        else:
            calc_depth = best_depth

        # best_t0_abs is an absolute BJD — safe to use directly in masking
        calc_transit_time = best_t0_abs
        calc_duration     = best_dur

        logger.debug(
            "KIC %s | Phase-scan depth: t0=%.4f d (abs)  dur=%.4f d  "
            "depth=%.6f (%.0f ppm)  baseline=%.6f",
            kic_id, calc_transit_time, calc_duration,
            calc_depth, calc_depth * 1e6, baseline_med,
        )

        # ------------------------------------------------------------------
        # 6. RADIUS CALCULATION
        # ------------------------------------------------------------------
        limb_darkening_correction = 1.15
        radius_ratio = math.sqrt(max(0.0, calc_depth))
        p_rad_earth  = (s_rad * 109.2) * radius_ratio * limb_darkening_correction

        # ------------------------------------------------------------------
        # 7. CATALOG TRUTH MATCH
        # Match the detected period to the closest KOI entry for this star
        # so each planet gets its own catalog ground-truth, not always row 0.
        # ------------------------------------------------------------------
        nasa_period = None
        nasa_radius = None
        disposition = "UNKNOWN"

        if not koi_rows.empty:
            best_match_idx = None
            best_match_err = np.inf

            for idx, row in koi_rows.iterrows():
                if pd.isna(row["koi_period"]) or float(row["koi_period"]) <= 0:
                    continue
                koi_p = float(row["koi_period"])
                # Check direct period match and simple harmonics (0.5x, 2x, 3x, 1/3x)
                for ratio in [1.0, 2.0, 0.5, 3.0, 1/3]:
                    err = abs(calc_period - koi_p * ratio) / koi_p
                    if err < best_match_err:
                        best_match_err = err
                        best_match_idx = idx

            # Accept the match only if within 10% of a catalog period
            if best_match_idx is not None and best_match_err < 0.10:
                row = koi_rows.loc[best_match_idx]
                nasa_period  = float(row["koi_period"]) if not pd.isna(row["koi_period"]) else None
                nasa_radius  = float(row["koi_prad"])   if not pd.isna(row["koi_prad"])   else None
                disposition  = str(row["koi_disposition"])

        # ------------------------------------------------------------------
        # 8. PHYSICAL CLASSIFICATION
        # ------------------------------------------------------------------
        if p_rad_earth > 25.0:
            status = "ECLIPSING_BINARY"
        elif p_rad_earth < 0.4:
            status = "NOISE_ARTIFACT"
        elif max_power > self.bls_threshold:
            status = "CONFIRMED_CANDIDATE"
        else:
            status = "CANDIDATE"

        # ------------------------------------------------------------------
        # 9. PAYLOAD
        # ------------------------------------------------------------------
        return {
            "status": status,
            "calculated": {
                "period":       calc_period,
                "radius":       p_rad_earth,
                "bls_power":    max_power,
                "duration":     calc_duration,
                "transit_time": calc_transit_time,
            },
            "catalog_truth": {
                "disposition": disposition,
                "nasa_period": nasa_period,
                "nasa_radius": nasa_radius,
            },
            "accuracy_metrics": {
                "period_error": abs(calc_period - nasa_period) if nasa_period else "N/A",
            },
        }