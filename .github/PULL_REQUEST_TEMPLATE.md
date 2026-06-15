<!--
PRs squash-merge into main. Write the PR title in Conventional Commits form
(type(scope): summary) — it becomes the squashed commit on main.
Keep it light; delete sections that don't apply.
-->

## What & why

<!-- One or two sentences: what this changes and why. Link the roadmap item, finding,
     or ADR it advances (e.g. "Closes F3", "Implements R3 triage retrain", "ADR-0011"). -->

## Changes

<!-- Bullet the notable changes. -->
-

## Type

- [ ] feat  - [ ] fix  - [ ] perf  - [ ] refactor  - [ ] test  - [ ] docs  - [ ] chore

## Checklist

- [ ] Title is in Conventional Commits form (`type(scope): summary`).
- [ ] Formatters/linters pass locally (Ruff + Prettier; pre-commit hooks ran).
- [ ] Type checks pass (Pyright) for changed Python.
- [ ] Follows the [style guide](../docs/style-guide.md) (naming, docstrings, comments).
- [ ] No logic duplicated across notebooks / `spacesight_ml` / backend (import from the
      package — ADR-0011).

## Tests run

<!-- What did you actually run to verify this change? Be specific — "tested locally" is
     not enough. Check what applies and note results / commands. -->

- [ ] Automated tests (`pytest`) — pass. <!-- once the suite exists -->
- [ ] Manual verification (ran the app / endpoint / notebook and observed correct
      behavior). What you did:
- [ ] Frontend builds + renders (`npm run build`, checked in browser) — for UI changes.
- [ ] N/A — docs/config only, no runtime behavior changed.

Commands run / evidence (paste output, screenshots, or a short note):

```
```

## Behavior / science impact

<!-- Required if this touches the detection pipeline (preprocess / triage / search /
     vet / report). Otherwise write "n/a". -->

- [ ] Ran the golden-master regression on the pinned `test_data/KIC_*.npz` fixtures;
      detected planets/periods unchanged within tolerance — OR the change to detection
      behavior is intended and described below.
- Behavior delta (if any):

## Model changes (if this trains/changes a model)

<!-- Delete if not a model change. -->

- [ ] New iteration tagged `model/<YYYY-MM-DD>-<short-name>` and registered in
      [`ml/MODELS.md`](../ml/MODELS.md) (Drive folder, dataset rev, W&B run, metrics).
- [ ] Operating thresholds + preprocessing config are in the checkpoint, not hardcoded.

## Notes for reviewers

<!-- Anything that needs explanation, screenshots for UI changes, open questions. -->
