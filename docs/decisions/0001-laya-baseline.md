# Decision 0001: Laya as the first browser decision baseline

## Context

`SPECS.md` asks for an existing non-generative model before training Jolty BDM. Milestone 5 needs local inference, a bounded action set, candidate IDs, confidence, and measured latency. Laya provides a choice head, but its English checkpoint is 421M parameters and has not been trained or calibrated for Jolty's browser decisions.

## Decision

Use the English `convaiinnovations/laya` checkpoint exported at `receptron/laya-onnx` revision `68f27dfe5a27a54fb2b1fefc432f43f972e90868`. `@receptron/laya@0.1.2` downloads the pinned ONNX bundle. A choice-only Node adapter owns one tokenizer and ONNX session so tokenization and inference can be timed separately. The adapter follows that package's sequence and temperature rules; a live parity check matched its choice, probabilities, and confidence on the same input.

The decision package accepts a compact browser state and retrieval Top-K, offers valid target actions plus `scroll`, `wait`, `back`, and `done`, and returns the selected option or an explicit error. It does not execute actions or invoke a large-model fallback. Confidence is recorded as a raw model score, without a browser-specific threshold.

## Consequences

The bundle is about 1.7 GB and the measured CPU inference p50 exceeds the proposed 25 ms decision target. The 14 controlled cases establish only a local baseline, not generalization. A later model can replace the adapter behind Jolty's action and target contract. Trace collection, confidence calibration, execution, and fallback belong to later milestones.
