# ADR 0005 — In-memory ephemeral job registry; single worker

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

The backend is async: `POST /analyze` returns a `jobId` immediately and spawns a
background thread; `GET /status` and `GET /results` later read what that thread
wrote. The only channel between the worker and the HTTP handlers is the in-memory
`jobs` dict.

`jobs[job_id]` holds transient progress telemetry (`stage`, `progress`,
`current_star[_name]`, `total_stars`, `done`, `error`) plus the result payload
(`result`, written once at the end). It is load-bearing for the live request
lifecycle but disposable across restarts: progress is meaningless post-run, and
`result` is cheap to regenerate by re-uploading.

## Decision

Keep job state **in-memory, single uvicorn worker**, lost on restart.

- **Non-goals:** restart survival, multi-worker sharing, job history.
- **Escape hatch:** access job state through a small interface
  (write-progress / write-result / read-status / read-result), *not* direct dict
  pokes, so a future shared store is a localized swap.

## Alternatives considered

- **Multiple uvicorn workers (`--workers N`).** Rejected: each worker gets its own
  `jobs` dict, so a status poll could hit the wrong worker and 404. Would require
  a shared store. (parallel-processing.md §5.)
- **Redis / SQLite / a real job queue (Celery/RQ/Arq).** Rejected as overkill for
  the upload-and-wait workload — adds ops burden to persist data nobody needs
  persisted.

## Consequences

- Simple, correct for the actual workload (one user uploads, watches, gets
  results, done — all within one process/session).
- Horizontal scaling or durable jobs would require replacing `jobs` with a shared
  store behind the same interface — explicitly out of current scope.
