# Research hypothesis

Jolty's central question is: **What share of real-world end-to-end browser decisions can a specialized local decision model handle without a generative LLM in the repeated execution path, while maintaining task success?** This remains untested in the repository.

The main hypothesis is that compact [browser state](../docs/browser-state.md) plus a small, relevant candidate set will let a non-generative BDM select a large share of next actions at lower decision latency and with fewer large-model calls than an agent that calls a large model at every step. "Large share" and "lower" must be quantified by the [benchmark plan](../docs/benchmarks.md), not assumed.

## Testable sub-hypotheses

| Hypothesis | How to test it |
| --- | --- |
| Simple filtering and lexical retrieval can preserve the correct target in a small top-K set across varied sites. | Measure candidate Recall@K by site and UI difficulty; inspect omissions. |
| A small local model can select next actions from retrieved candidates on unfamiliar flows. | Compare step accuracy and task success with Laya and large-model baselines on held-out sites or flows. |
| Calibrated confidence can route difficult decisions to fallback without materially reducing success. | Plot accuracy by confidence bucket; compare success and fast-path coverage across thresholds. |
| Specializing a model on validated browser traces can improve the accuracy, latency, or fallback tradeoff over the initial baseline. | Evaluate a Jolty BDM against Laya under the same scenarios and hardware. |
| A compact local fast path can reduce decision latency, token use, and cost. | Measure p50/p95/p99 decision latency, per-stage cost, LLM calls, tokens, and cost per test while tracking total test duration. |
| Compiling successful traces can reduce AI use on repeated known tests. | Compare repeat-run LLM calls, duration, and task success before and after compilation; measure recovery when compiled tests break. |

Risks to test explicitly include retrieval failures, overconfident wrong decisions, teacher-label errors, dynamic interfaces, and poor generalization beyond training sites. No conclusion follows until these measurements are available.
