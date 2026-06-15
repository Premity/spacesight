# ADR 0009 — Vet labels candidates; it never silently drops them

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

Search emits a list of candidates per star (multi-planet via pre-whitening). Vet
runs per candidate. What does a Vet verdict *do* to a candidate? Options: (i) drop
failing candidates from results; (ii) report every candidate with its verdict;
(iii) threshold into "confirmed" vs "low-confidence" buckets, both inspectable.

The project ethos is explainability and honest reporting (ROADMAP's
"PR-curve-first reporting"; the reference paper's "flag for review, don't
auto-reject"). The current code already assigns `status` labels rather than
dropping (`CONFIRMED_CANDIDATE` / `CANDIDATE` / `ECLIPSING_BINARY` /
`NOISE_ARTIFACT`).

## Decision

**Vet labels, never silently drops** — option (ii) trending to (iii). Every BLS
candidate is reported with its vetting verdict/score and remains inspectable. A
vetting threshold sorts candidates into "confirmed candidate" vs
"low-confidence/rejected" buckets, both visible.

The vetting CNN **replaces the current heuristic** that assigns `status` labels.
Radius-based rules (radius > 25 R⊕ → possible EB, < 0.4 R⊕ → noise) demote to
secondary *sanity flags* shown alongside the Vet verdict, not a competing status.

## Alternatives considered

- **(i) Drop failing candidates.** Rejected: hides information and makes Vet an
  unaccountable black box — antithetical to the explainability goal, and destroys
  the data needed to later tune the vetting threshold from real usage.

## Consequences

- Vet is the verdict owner; Report presents that verdict honestly.
- Stars that pass triage but yield no detection are still reported
  (`planets_detected: 0`) — see [ADR 0004](0004-triage-gate-on-by-default.md).
- The vetting threshold is checkpoint-stored, like the triage threshold
  ([ADR 0006](0006-option-b-model-loading.md)).
