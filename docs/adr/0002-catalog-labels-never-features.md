# ADR 0002 — The catalog may label a training example; it must never feature-ize one

- Status: Accepted
- Date: 2026-06-15
- Deciders: SpaceSight team

## Context

This is the resolution of finding **F1**, the most important issue in the
codebase (see [ROADMAP.md §1](../ROADMAP.md)).

In the current model, channel 1 (the secondary-eclipse view) is built from KOI
catalog ephemerides. For planet hosts it carries real flux; for false positives
it is always flat fill (1.0). So "ch1 is flat" correlates directly with the
label, and the CNN can learn the shortcut "ch1 has structure → planet" without
learning any eclipse physics. Because val/test are built the same way, this
**inflates the reported metrics too**.

Worse, at serving time uploaded stars have no catalog entry, so ch1 is *always*
flat — the channel that the model leaned on in training simply vanishes in
production. This is a textbook **train/serve mismatch**: a model input that is
present in training and absent in reality.

The deeper diagnosis (from [research-directions-discussion.md §4](../research-directions-discussion.md)):
whatever produces a model *input feature* must be the **same mechanism** at
training and serving time. The catalog is available at training and absent at
serving, so it can never be the source of a feature.

## Decision

**The catalog may be used to *label* a training example ("is this BLS candidate a
known planet?"). It must never be used to *build a feature* (an input channel).**

This is enforced *structurally*, not by discipline: the Vet channel builder is a
pure function

    build_vetting_channels(segments, ephemeris) -> tensor

that takes **no catalog argument**. Because BLS produces the ephemeris at both
training and serving time, this function runs identically in both, so a
train/serve mismatch on the vetting channels is *impossible* — you would have to
change the function signature to reintroduce it, which the design forbids.

The same function is imported by `ml/` training and by the serving backend (one
implementation — finding F2). Training wraps it with a catalog *label* lookup;
serving does not.

## Alternatives considered

- **Fix ch1 construction so false positives also get a real (FP-derived) channel,
  keeping the catalog as the source.** Better than the flat-fill leak, but still
  makes a feature depend on catalog availability — broken for uncatalogued
  uploads, and blocks cross-instrument generalization. Rejected.
- **Rely on review discipline ("remember not to feature-ize the catalog").**
  Rejected: F1 happened *because* discipline is not enforceable. The function
  signature is.

## Consequences

- F1 cannot recur for the vetting model — this is **architectural success
  criterion #2** in the design doc.
- Stellar radius is *not* affected by this rule: it is an output *scaler*, never a
  model input, and comes from independent upstream stellar data — see
  [ADR 0010](0010-stellar-radius-is-an-output-scaler.md).
- The Triage model sidesteps the issue entirely by being single-channel and
  ephemeris-free ([ADR 0003](0003-single-channel-triage.md)).
