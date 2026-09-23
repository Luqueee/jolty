# Benchmarks

This is an evaluation plan. The repository has a controlled [browser-state extraction microbenchmark](browser-state.md), but no end-to-end benchmark results.

## Comparison baselines

Evaluate the same test scenarios with:

1. A large-LLM browser agent choosing an action at every step.
2. Jolty hybrid mode using candidate retrieval and a BDM, with large-model fallback when needed.
3. A human-written deterministic Playwright test.

The deterministic baseline provides a practical execution reference; it does not perform the same planning work as a natural-language agent. Report setup and planning time separately from repeated execution where relevant.

## Measures

| Area | Measures |
| --- | --- |
| Quality | Task success rate, goal completion rate, step accuracy, incorrect actions, retries, recovery rate. |
| Retrieval | Candidate Recall@K: whether the correct target is in the top K passed to the BDM. |
| Fast path | Share of decisions completed without System 2, fallback rate, confidence calibration. |
| Latency | Per-stage decision latency and p50/p95/p99 pipeline latency; total test duration and browser idle time. |
| Usage and cost | LLM calls per test, token usage, cost per test. |
| Capacity | Decisions or tests per second, memory use, and batching effects where relevant. |

Report latency distributions rather than only averages. Record both successful and failed runs; a low fallback rate alone does not establish correctness. Evaluate retrieval separately because the BDM cannot choose a target omitted from its candidate set.

## Fair comparison

Use the same sites, tasks, initial state, success conditions, and test environment across systems. Include easy and difficult UI flows: overlays, duplicate labels, loading states, dynamic content, redirects, form validation, and similar cases described in [SPECS.md](../SPECS.md). Separate training, validation, and test sites or flows so the reported result can reveal generalization failures.

Disclose model versions, hardware, browser settings, concurrency, caching, retries, timeouts, and whether planning or browser startup is included in each timing. Validate outcomes with deterministic checks where possible. Teacher decisions are candidate labels, not automatic ground truth. Report the tradeoff between fast-path coverage and task success across confidence thresholds.
