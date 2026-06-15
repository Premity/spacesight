# ADR 0010 — Stellar radius from the catalog is safe (it is an output scaler, not a model input)

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

Having internalized the F1 lesson ([ADR 0002](0002-catalog-labels-never-features.md)),
the team was rightly suspicious of *any* catalog dependency. Report computes
planet radius from transit depth and the **stellar radius** (`R_p = R_star ×
√depth × limb-darkening`), and `R_star` comes from the catalog, defaulting to
1.0 R☉ when absent. Is this another F1-style cyclical/leakage trap?

## Decision

**No. Catalog stellar radius is safe to use.** It is fundamentally different from
the ch1 leak:

- **It is an output *scaler*, never a model *input*.** It never touches the CNN,
  so it cannot create a learned shortcut. It only converts an already-detected
  transit depth into a physical radius.
- **It is independent upstream data with no circularity.** Stellar radius is a
  property of the *star*, measured separately and earlier (Gaia / KIC / TIC
  photometry + astrometry + spectroscopy), before any planet search. Unlike ch1
  (which was built from the *planet's own ephemeris* — the thing being
  predicted), stellar radius comes from a different measurement chain entirely.

The only real issue is the **fallback**: with no catalog entry, `R_star` defaults
to 1.0 R☉ and the radius becomes unreliable. So radius is reported with explicit
provenance: `stellar_radius_source: catalog | default_assumed`, and the UI flags
the default case as an order-of-magnitude estimate rather than hiding it behind an
authoritative-looking number.

## Consequences

- Radius math may use the profile's catalog adapter without violating
  [ADR 0002](0002-catalog-labels-never-features.md).
- The MAST fetch-by-ID feature (roadmap) supplies the real stellar radius for
  uploads and largely retires the default-1.0 case.
- Distinction worth remembering: the F1 rule is about *model inputs*. Outputs and
  output-scalers are not constrained by it.
