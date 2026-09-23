# Browser Decision Model

The **Browser Decision Model (BDM)** is the proposed small, local, non-generative model for repeated browser-navigation decisions. It selects among constrained actions and candidate elements rather than producing prose or code. It is intended to reduce large-model calls while preserving test success.

## Decision contract

The expected inputs are the current goal, compact [browser state](browser-state.md), retrieved candidate actions or elements, and relevant interaction history. The expected output is a ranked decision with an action, a candidate ID when the action needs a target, and confidence. The initial proposed action vocabulary is `click`, `type`, `select`, `scroll`, `wait`, `back`, and `done`. New actions should be added only when needed.

Candidate scoring is attractive because pages have a changing number of elements: the model can score each goal/state/candidate combination and select the highest-ranked valid action. An alternative separates action choice from target choice. These are research options to compare, not settled model architecture.

## Confidence and fallback

Confidence must be calibrated against observed correctness. A score of 0.90 is meaningful only if decisions in that score range are correct at roughly the corresponding rate. High-confidence valid decisions may execute directly; uncertain decisions may receive extra validation or go to the large-model **fallback**. The numeric thresholds illustrated in [SPECS.md](../SPECS.md) are placeholders, not operational settings.

Fallback receives structured state and candidates. Its decision should be validated where possible before it is used as a training label. A wrong action, retrieval omission, or confidently wrong BDM output remains a risk even with fallback.

## Baseline and future direction

The specified initial baseline is an existing open-source fast decision model such as **Laya**. This is a proposed MVP choice, not a model already integrated or a permanent dependency. The first experiment should test whether a small model can handle a meaningful share of decisions.

A later Jolty-specific BDM could fine-tune a pretrained encoder on validated navigation traces and export it to ONNX for the Node runtime. The spec proposes escalating training complexity only as needed: a zero-shot baseline, frozen encoder with decision head, parameter-efficient tuning, then broader fine-tuning. Dataset quality, hard cases, cross-site generalization, and confidence calibration are central research concerns. See [research hypotheses](../research/hypothesis.md) and [benchmarks](benchmarks.md).
