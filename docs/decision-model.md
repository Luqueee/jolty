# Browser Decision Model

The **Browser Decision Model (BDM)** is the proposed small, local, non-generative model for repeated browser-navigation decisions. It selects among constrained actions and candidate elements rather than producing prose or code. It is intended to reduce large-model calls while preserving test success.

## Decision contract

The expected inputs are the current goal, compact [browser state](browser-state.md), retrieved candidate actions or elements, and relevant interaction history. The expected output is a ranked decision with an action, a candidate ID when the action needs a target, and confidence. The initial proposed action vocabulary is `click`, `type`, `select`, `scroll`, `wait`, `back`, and `done`. New actions should be added only when needed.

The current [candidate retrieval](candidate-retrieval.md) uses heuristic scores to shorten the input list. Milestone 5's Laya baseline receives the goal, page URL and title, and the retrieved Top-K candidates as choice options. Candidate options carry their browser-state IDs; `type` is used for editable controls, `select` for list controls, and `click` for other retained controls. `scroll`, `wait`, `back`, and `done` are options without a target. The output contains the selected action and optional target ID, the selected option probability, Laya's entropy-based confidence, all option probabilities, and the considered options. A model error or invalid choice produces an explicit failure. The choice does not contain a value to type; execution belongs to a later milestone.

## Confidence and fallback

Confidence must be calibrated against observed correctness. A score of 0.90 is meaningful only if decisions in that score range are correct at roughly the corresponding rate. High-confidence valid decisions may execute directly; uncertain decisions may receive extra validation or go to the large-model **fallback**. The numeric thresholds illustrated in [SPECS.md](../SPECS.md) are placeholders, not operational settings.

Fallback receives structured state and candidates. Its decision should be validated where possible before it is used as a training label. A wrong action, retrieval omission, or confidently wrong BDM output remains a risk even with fallback.

## Baseline and future direction

The implemented baseline uses the English `convaiinnovations/laya` checkpoint through the pinned `receptron/laya-onnx` export. One ONNX session and tokenizer are loaded per `LayaDecisionModel` instance and reused until `close()`. The `@receptron/laya` package supplies the revision-pinned bundle download and configuration contract; Jolty owns the small choice-only inference adapter so tokenization and ONNX time can be measured separately. This is an evaluation baseline, not a permanent dependency. See the [baseline decision record](decisions/0001-laya-baseline.md).

`confidence` is Laya's normalized entropy score, not a calibrated probability that a browser action is correct. `selected_probability` is the model's probability for one option; it also needs browser-specific calibration before any execution threshold can use it. Milestone 5 deliberately performs no fallback or browser action. The [controlled benchmark](benchmarks.md) reports wrong selections as failures.

A later Jolty-specific BDM could fine-tune a pretrained encoder on validated navigation traces and export it to ONNX for the Node runtime. The spec proposes escalating training complexity only as needed: a zero-shot baseline, frozen encoder with decision head, parameter-efficient tuning, then broader fine-tuning. Dataset quality, hard cases, cross-site generalization, and confidence calibration are central research concerns. See [research hypotheses](../research/hypothesis.md) and [benchmarks](benchmarks.md).
