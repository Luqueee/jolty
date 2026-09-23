# Decision 0002: Gate encoder adaptation on independent labels

Status: accepted for the Milestone 13 experiment setup. No Jolty BDM has been trained or deployed.

## Context

The first Parquet dataset contains decisions from five local fixture templates under one origin. A run with the ChatGPT subscription fallback yielded four validated training actions, two validation actions, and three test actions. The training labels contain only `click`; validation also contains `type`, and test also contains `wait`. Repeated runs of the same fixtures add observations of the same templates, not independent examples. The existing Laya and large-model comparisons cover these fixtures, but they cannot establish transfer to another site.

## Decision

Use `sentence-transformers/all-MiniLM-L6-v2` as the first **candidate** pretrained encoder, pinned to revision `acbb28c8aa70f5503c85d6b90e8cd65606993a20` when training becomes admissible. Its [model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/tree/acbb28c8aa70f5503c85d6b90e8cd65606993a20) documents an Apache-2.0 licensed, 384-dimensional sentence embedding model. This is a research choice, not a performance claim or a runtime dependency. The first adaptation should freeze the encoder and train a small candidate-action scoring head. Escalate to PEFT, partial fine-tuning, and full fine-tuning only after the cheaper candidate has a valid held-out comparison and a concrete failure mode.

Before fitting any head, run `pnpm run research:readiness` on a versioned dataset. The admission gates require at least 20 distinct validated training decisions, 10 calibration decisions, 10 held-out decisions, every evaluated action represented in training, at least two training site origins, and at least one test site origin absent from training. These counts are conservative engineering gates for this first experiment, **not** statistical sufficiency guarantees. The report must retain per-split fixture groups, origin coverage, and action coverage. Duplicate observations of one template do not satisfy the independent-site gate.

When admitted, keep the encoder frozen, score each `(goal, state, candidate action)` pair with the same feature construction in all splits, fit a small head using train only, choose thresholds using validation only, and report the untouched test results against Laya and the ChatGPT subscription teacher on the same flows. Measure exact action-and-target accuracy, validated task completion, fallback coverage, calibration by confidence bucket and Brier score, inference latency, resident memory, and throughput. Export an ONNX artifact only for a candidate with a demonstrated held-out value. A failed or inconclusive experiment stays an explicit result; it does not become a shipped model.

## Consequences

The current dataset fails the gate. Training now would make the outcome depend on a few authored click labels, while type and wait would be evaluated without training examples. Milestone 13 remains in progress until independent data and a same-flow comparison can support the exit criterion. The browser hot path and existing Laya provider are unchanged.
