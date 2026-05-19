# Parallel & GPU Processing — Design Doc

Status: **deferred** — not implemented. Captured here for when the multi-star feature lands and we want to make it faster.

This document describes two upgrades to the multi-star pipeline introduced in `fix/zip-multi-npz-pipeline`:

1. **CPU parallelism** — process multiple stars concurrently using a process pool
2. **GPU acceleration** — batch all stars' CNN inference into a single GPU forward pass

Both build on the existing serial implementation in `spacesight-backend/main.py`. Neither has been started.

---

## 1. Context: where the time goes

A single star (~65k cadences, the test fixture size) takes roughly:

| Stage | Wall time on CPU (i7-1165G7) | Bound by |
|---|---|---|
| Preprocessing (Whittaker-Henderson detrending, ~10 segments) | 2–5 s | SciPy sparse solve, single-threaded |
| CNN inference (~1,300 windows, 1 forward pass) | 1–3 s | PyTorch intra-op threading |
| BLS analysis (up to 10 pre-whitening iterations × segments) | 10–30 s | AstroPy C kernel, single-threaded per call |
| Visualization (LTTB downsample + BLS periodogram for plot) | <1 s | Trivial |

**Total: ~15–40 s per star.** BLS dominates. The 3-star test zip serially takes ~1–2 min.

Memory per star is negligible (~2 MB for the CNN tensor, ~50 MB transient peak for SciPy sparse matrices during detrending). RAM is not the bottleneck.

---

## 2. CPU parallelism

### 2.1 Threads vs processes

Both have been considered:

| Option | Pros | Cons |
|---|---|---|
| `ThreadPoolExecutor` | Simple, shares `model`/`catalog_df` in-memory, no IPC | PyTorch already uses all physical cores via intra-op threading; threads fight for the same cores. AstroPy BLS holds the GIL during C kernel calls. Realistic speedup: **1.3–1.5×** |
| `ProcessPoolExecutor` | True parallelism, no GIL, crashed worker doesn't take down API | Each worker forks ~200–300 MB (PyTorch + model copy). ~2 s import-torch startup tax per worker. IPC overhead for progress + results |

**Recommendation: `ProcessPoolExecutor`.** True parallelism wins on the BLS stage which is the bottleneck, and process isolation is a safety win.

### 2.2 Worker count

```python
import os
MAX_WORKERS = min(os.cpu_count() - 1, num_stars, 4)
```

- `cpu_count() - 1`: leave one core for FastAPI / OS
- `num_stars`: never spawn more workers than work units
- Hard cap of 4: prevents thrashing on machines with many cores but limited RAM (each worker = ~250 MB resident)

On the target laptop (4 physical / 8 logical cores), this resolves to `min(7, N, 4)` → 3 workers for a 3-star zip, which is right.

### 2.3 What gets parallelized

The `analyze_one_star()` function (already extracted in the serial implementation) is the unit of work. Each worker:

1. Loads the npz
2. Loads its own copy of the model + catalog (one-time per worker)
3. Runs preprocessing → CNN → BLS → visualization
4. Returns the formatted star dict + emits progress events via a `multiprocessing.Queue`

Workers do **not** share `jobs` state. The main process owns `jobs[job_id]` and drains the progress queue.

### 2.4 Progress reporting under parallelism

Under serial processing, "Star X of Y — preprocessing 40%" makes intuitive sense because one star is active at a time. Under parallel, multiple stars are active simultaneously and there's no single "current stage."

Three options were considered:

| Option | Description | Verdict |
|---|---|---|
| A — Overall completion | "2 of 3 stars complete, 67%" + indeterminate spinner for in-flight | **Pick this.** Simple, scales to 20-star zips, doesn't lie |
| B — Per-star mini cards | Stack a small progress card per star | Looks great for 3 stars, awful for 20 |
| C — Aggregate bar + event log | Overall % + scrolling log of recent stage events | Information-rich but cluttered |

**Choice: Option A.** Status response becomes:

```json
{
  "stage": "parallel",
  "stageIndex": 4,
  "progress": 67,
  "starsCompleted": 2,
  "starsTotal": 3,
  "starsInFlight": [
    {"name": "KIC 10593626", "stage": "bls_analysis", "progress": 60}
  ],
  "done": false
}
```

The frontend can optionally show the in-flight list as small subtitles ("Currently analyzing: KIC 10593626 — BLS analysis"). Skip if it adds clutter.

### 2.5 Implementation sketch

```python
# spacesight-backend/main.py
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing as mp


# Worker-side: must be top-level to be picklable
def _worker_analyze(payload):
    """Runs in a worker process. Loads its own model on first call."""
    job_id, star_index, star_name, npz_path, progress_queue = payload

    # Lazy-init per-worker globals (one-time torch + model load per worker)
    global _worker_model, _worker_catalog
    if "_worker_model" not in globals():
        import torch, pandas as pd
        from app.model_def import InceptionResNet1D
        m = InceptionResNet1D(in_channels=2, nb_filters=32)
        ckpt = torch.load(MODEL_PATH, map_location="cpu")
        m.load_state_dict(ckpt["model_state_dict"])
        m.eval()
        _worker_model = m
        _worker_catalog = pd.read_csv(CATALOG_PATH)

    def progress_cb(stage, pct):
        progress_queue.put({
            "job_id": job_id, "star_index": star_index,
            "star_name": star_name, "stage": stage, "progress": pct,
        })

    import numpy as np
    with np.load(npz_path, allow_pickle=True) as data:
        raw_time = data["time"].copy()
        raw_flux = data["flux"].copy()

    return analyze_one_star_pure(
        job_id, star_index, star_name, raw_time, raw_flux,
        _worker_model, _worker_catalog, progress_cb,
    )


def run_pipeline_parallel(job_id, star_inputs, cleanup_paths):
    total = len(star_inputs)
    max_workers = min(os.cpu_count() - 1, total, 4)

    # Manager queue so workers can send progress back to the main process
    manager = mp.Manager()
    progress_queue = manager.Queue()

    in_flight = {}  # star_index -> {"name", "stage", "progress"}
    completed_stars = []

    with ProcessPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(_worker_analyze, (job_id, i + 1, name, path, progress_queue)): (i + 1, name)
            for i, (name, path) in enumerate(star_inputs)
        }

        # Drain progress events in a side thread so the main thread can wait on futures
        import threading
        stop = threading.Event()

        def drain_progress():
            while not stop.is_set():
                try:
                    evt = progress_queue.get(timeout=0.5)
                except Exception:
                    continue
                in_flight[evt["star_index"]] = {
                    "name": evt["star_name"],
                    "stage": evt["stage"],
                    "progress": evt["progress"],
                }
                _update_job_progress(job_id, in_flight, len(completed_stars), total)

        drainer = threading.Thread(target=drain_progress, daemon=True)
        drainer.start()

        try:
            for fut in as_completed(futures):
                idx, name = futures[fut]
                try:
                    star_dict = fut.result()
                    completed_stars.append(star_dict)
                except Exception as e:
                    completed_stars.append({"name": name, "error": str(e), ...})
                finally:
                    in_flight.pop(idx, None)
                    _update_job_progress(job_id, in_flight, len(completed_stars), total)
        finally:
            stop.set()
            drainer.join(timeout=2)

    # Stitch results in original order (as_completed gives them out of order)
    completed_stars.sort(key=lambda s: s["id"])
    _finalize_job(job_id, completed_stars, total, cleanup_paths)


def _update_job_progress(job_id, in_flight, completed, total):
    overall_pct = int(100 * completed / total) if total else 0
    jobs[job_id]["stage"] = "parallel"
    jobs[job_id]["progress"] = overall_pct
    jobs[job_id]["stars_completed"] = completed
    jobs[job_id]["stars_total"] = total
    jobs[job_id]["stars_in_flight"] = [
        {"name": v["name"], "stage": v["stage"], "progress": v["progress"]}
        for v in in_flight.values()
    ]
```

### 2.6 Things that will bite

- **`fork` on Linux** is the default `multiprocessing` start method; it copies the parent process. That means our already-loaded `model` and `catalog_df` get inherited for free without re-importing torch. But CUDA contexts don't survive `fork` — if we add GPU support later, switch to `spawn` and pay the import cost.
- **Pickling the npz path, not the data.** Sending raw 65k-element float arrays over IPC is wasteful; send the path instead and let the worker `np.load` it. Frees ~500 KB per star of IPC overhead.
- **Progress queue can flood.** Workers call `progress_cb` ~5–10 times each. With 4 workers that's ~40 events for a 4-star job. Drain at 2 Hz max in the main thread; debounce.
- **Stuck worker.** If a worker hangs on a degenerate BLS input, the whole job hangs. Add a per-star timeout via `concurrent.futures.wait(timeout=...)` and mark stuck stars as failed.
- **Reentrancy of `ExoplanetProcessor`.** Each worker constructs its own; no shared mutable state needed. Safe.

### 2.7 Expected speedup

Realistic numbers on the target laptop:

| Stars | Serial | Parallel (3 workers) | Speedup |
|---|---|---|---|
| 1 | ~25 s | ~27 s | 0.9× (worker startup tax) |
| 3 | ~75 s | ~30 s | 2.5× |
| 10 | ~250 s | ~85 s | 2.9× |
| 20 | ~500 s | ~170 s | 2.9× |

The 2.5–3× plateau is set by `cpu_count() - 1` workers and the fact that each worker still uses PyTorch's intra-op threads (which then fight a bit). Going parallel is worth it once N ≥ 3.

---

## 3. GPU acceleration

The parallel CPU approach scales linearly with worker count. GPU does something different: it batches **all stars' CNN windows into one tensor** and runs inference once.

### 3.1 What changes at the algorithm level

**Current CPU flow (per star):**
```
preprocess → cnn_inference(1,300 windows) → bls → visualize
```

**Proposed GPU flow (whole job):**
```
[parallel CPU] preprocess all stars → collect all windows
[GPU]          single batched inference on (N_stars × 1,300, 2, 201) tensor
[parallel CPU] BLS + visualize for stars that pass the CNN threshold
```

The CNN is the only stage that benefits from GPU. BLS (AstroPy) and preprocessing (SciPy) are CPU-only and stay where they are.

### 3.2 Why this is a big win

A 3-star CPU run does 3 forward passes of ~1,300 windows each → 3 × 1–3 s = ~6 s CNN time.

A 20-star CPU run does 20 forward passes → 20 × 1–3 s = ~40 s CNN time.

GPU batched: one forward pass of `(N × 1300, 2, 201)` ≈ 26k windows. On a mid-range GPU (RTX 3060 or better), that's a **single sub-100 ms inference**. Effectively free.

So the speedup compounds with N: irrelevant for 1–3 stars, transformative for 20–100 stars.

### 3.3 Implementation sketch

```python
# spacesight-backend/main.py (GPU path)
import torch

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Load model once, move to GPU
model = InceptionResNet1D(in_channels=2, nb_filters=32)
checkpoint = torch.load(MODEL_PATH, map_location=DEVICE)
model.load_state_dict(checkpoint["model_state_dict"])
model.to(DEVICE).eval()


def run_pipeline_gpu(job_id, star_inputs, cleanup_paths):
    # PHASE 1: CPU-parallel preprocessing (process pool, as in §2.5)
    # Each worker returns: (star_name, cnn_windows, segments, clean_flux, time)
    preprocessed = _parallel_preprocess_all(star_inputs)

    # PHASE 2: Single batched GPU inference
    jobs[job_id]["stage"] = "cnn_inference"

    # Flatten: list of (windows, star_index) so we can route results back
    all_windows = []
    boundaries = []  # [(star_index, start_offset, end_offset), ...]
    cursor = 0
    for star_idx, (_, windows, *_rest) in enumerate(preprocessed):
        n = len(windows)
        all_windows.append(windows)
        boundaries.append((star_idx, cursor, cursor + n))
        cursor += n

    batched = torch.tensor(np.concatenate(all_windows, axis=0),
                           dtype=torch.float32, device=DEVICE)
    with torch.no_grad():
        probs = torch.sigmoid(model(batched)).cpu().numpy().flatten()

    # Route back: each star gets its slice of the probability vector
    star_probs = {idx: probs[a:b] for idx, a, b in boundaries}

    # PHASE 3: CPU-parallel BLS for candidates only (process pool again)
    candidates = [
        (i, preprocessed[i], star_probs[i])
        for i in range(len(preprocessed))
        if star_probs[i].max() > CNN_THRESHOLD
    ]
    bls_results = _parallel_bls(candidates)

    # PHASE 4: Assemble final response
    ...
```

### 3.4 The non-obvious wins of GPU batching

- **Amortized model load.** One model on GPU serves the whole job; no per-worker reload (which was 2 s × N on CPU).
- **CNN triage gate kicks in earlier.** With CPU, we always pay BLS startup per star. With GPU, all CNN inference completes before any BLS starts — so non-candidate stars exit cleanly without any BLS spin-up at all.
- **Mixed precision.** Add `with torch.autocast("cuda", dtype=torch.float16):` around the forward pass. Free 1.5–2× on inference for negligible accuracy impact (the CNN is a binary classifier with healthy logit margins).

### 3.5 Things that will bite

- **GPU memory.** 26k windows × 2 × 201 × float32 = ~42 MB. Trivial even on a 4 GB GPU. No batching needed inside the inference call.
- **`fork` + CUDA = broken.** As noted in §2.6: if any process touches CUDA before forking, child processes get a corrupted CUDA context. Either:
  - Use `mp.set_start_method("spawn", force=True)` early (pay the ~2 s import-torch tax per worker), or
  - Do CPU work in workers with `fork`, GPU work only in the main process. Cleaner — workers never import torch CUDA.
- **`setup.sh` already handles GPU torch installation.** No extra dependency work needed; just check `torch.cuda.is_available()` at startup and route accordingly.
- **`DEVICE = "cuda"` everywhere.** Need to audit `app/processor.py` to ensure CNN tensors are moved to the same device as the model. Currently it does `torch.tensor(cnn_windows, dtype=torch.float32)` with no `.to(device)` — that's a latent bug that'll surface only on GPU.
- **Deployment.** The current backend has no production deployment; if/when it gets one, GPU support depends on the host. Add a `CUDA_VISIBLE_DEVICES=""` escape hatch env var for forcing CPU mode in mixed environments.

### 3.6 Expected speedup (GPU, RTX 3060 class)

| Stars | CPU serial | CPU parallel (3w) | GPU+CPU hybrid |
|---|---|---|---|
| 1 | 25 s | 27 s | 18 s (no CNN savings, but BLS unchanged) |
| 3 | 75 s | 30 s | 25 s |
| 10 | 250 s | 85 s | 55 s (CNN drops from 20 s to <1 s) |
| 20 | 500 s | 170 s | 95 s |
| 100 | 2500 s | 850 s | 350 s |

GPU is meaningfully better than parallel CPU starting at ~10 stars, dramatic at 100+. Below that, the BLS bottleneck swamps the CNN savings.

---

## 4. Recommended order of implementation

1. **Land the serial multi-star feature** (`fix/zip-multi-npz-pipeline` PR #1) — done.
2. **CPU parallel (§2)** when single-job wall time on 5+ star uploads becomes annoying. Probably ~80–120 lines in `main.py`, new test for the worker pool.
3. **GPU (§3)** when either:
   - someone uploads a zip with 20+ stars regularly, or
   - the project gets a deployment with a GPU available.

Both upgrades are **purely backend changes** if the parallel progress UI sticks with Option A (overall % + counters). No frontend rewrite needed; just additional fields in the status response that the existing hook can pass through.

---

## 5. What we are NOT changing

For the record, things considered and rejected:

- **Multiple uvicorn workers (`--workers N`)** — each worker gets its own in-memory `jobs` dict. A status poll for a job started on worker 1 could hit worker 2 and 404. Would require a real job store (Redis, SQLite). Out of scope.
- **A real job queue (Celery / RQ / Arq)** — overkill for this app's traffic profile. Threads/processes inside one uvicorn worker is fine until proven otherwise.
- **Batching across separate `/analyze` requests** — would mean serializing user uploads into a global queue. Adds latency, complicates progress reporting, doesn't help the common case (single user uploading one zip).
- **Rewriting BLS in torch** — astropy's BLS is a mature C implementation. A torch port would be a research project, not a speedup.
