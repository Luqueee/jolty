# Benchmarks

This is an evaluation plan. The repository has controlled [browser-state extraction](browser-state.md), [candidate filtering](candidate-filter.md), [candidate retrieval](candidate-retrieval.md), [Laya decision baseline](decision-model.md), [deterministic Playwright reference](playwright-reference.md), and [five-task Jolty loop](controlled-loop.md) benchmarks. General-site and fallback comparisons remain unmeasured.

## Controlled task comparison

Run `pnpm run benchmark:compare` for the deterministic Playwright reference, a retrieved Top-1 heuristic, and Laya on the same five task plans and fixture success texts. Each policy gets a fresh page and fixture state, one warmup, then 20 measured serial runs by default. `JOLTY_BENCH_RUNS` changes the measured repetitions. The timer starts before fixture navigation and ends after the final action, validation, and exact success-text check. Browser launch, model load, page creation, and route installation are excluded. Failed runs remain in duration and success summaries. The JSON report includes p50/p95/p99 for task duration and decision latency, validated-step rate, model calls, input/output tokens when available, and failure reasons. Playwright's hand-written reference has no model decisions, so its decision and step metrics are `null`.

On 2026-09-23, with Node 25.9.0, Chromium 153.0.8010.12, an AMD Ryzen 7 9700X, 31 GiB RAM, and the pinned Laya revision, the 20-run comparison measured:

| Task | Playwright success; task p50 ms | Heuristic success; task p50 ms | Laya success; task p50 ms |
| --- | ---: | ---: | ---: |
| Modal | 20/20; 71.4 | 20/20; 86.7 | 20/20; 238.8 |
| Settings | 20/20; 38.8 | 20/20; 55.6 | 20/20; 240.6 |
| Cookie overlay | 20/20; 72.3 | 0/20; 3023.3 | 0/20; 115.3 |
| Dynamic results | 20/20; 220.1 | 0/20; 86.8 | 20/20; 422.4 |
| Ambiguous row | 20/20; 39.2 | 0/20; 55.6 | 0/20; 138.7 |

Laya made two calls per successful modal/settings task, three per dynamic-results task, and one before failure on cookie-overlay and ambiguous-row. Its per-decision p50 ranged from 83.2 to 90.8 ms across these tasks; p95 ranged from 91.6 to 107.3 ms, and p99 from 98.5 to 132.2 ms. The heuristic made no model calls. Its cookie-overlay choice reached the Playwright action timeout, which explains the high failed-task duration. These are local fixtures with repeated identical states, so the 20 repetitions measure execution variability, not generalization or independent accuracy. The [offline decision benchmark](#laya-baseline-measurement) separately measured 22/22 targeted Top-10 retrieval recall; that figure is not a per-task retrieval result. Validated-step rate is an outcome proxy, not an independently labeled next-action accuracy metric.

For a subscription-backed large-model reference, run `JOLTY_INCLUDE_CODEX=1 JOLTY_BENCH_RUNS=1 pnpm run benchmark:compare` after signing in to Codex with ChatGPT. This runs `gpt-6-sol` through Codex CLI on the same tasks and checks. A new CLI turn starts for each decision, so CLI and agent overhead are part of its measured latency. The [adapter contract](large-model-baseline.md) explains usage and cost fields.

A one-warmup, three-measured-run comparison with Codex CLI 0.156.1 on the same machine found:

| Task | Codex success | Task p50 ms | Turns per task | Input tokens per task |
| --- | ---: | ---: | ---: | ---: |
| Modal | 2/3 | 13092.3 | 2 | 27,940 |
| Settings | 3/3 | 9069.6 | 2 | 27,999 |
| Cookie overlay | 3/3 | 11001.9 | 2 | 27,952 |
| Dynamic results | 0/3 | 10036.4 | 2 | 27,907 |
| Ambiguous row | 0/3 | 5339.7 | 1 | 13,996 |

The modal failure was an action failure; dynamic-results and ambiguous-row failed validation in every measured run. The large input counts include Codex agent overhead and cannot be interpreted as only the compact browser question. Subscription usage has no per-task API charge, so estimated USD cost is `null`. Three measured runs per task expose these failure modes but do not establish stable p95/p99 latency or general-site success. The fast policies have 20 repetitions per task in the separate run above; do not infer a reliable speed ratio from these different sample sizes.

## Laya baseline measurement

Run `pnpm run benchmark:decision` after `pnpm install --frozen-lockfile` and installing Playwright Chromium. The first run downloads a roughly 1.7 GB ONNX bundle into the user's cache. The script loads the model once, warms it once, then evaluates 17 initial-state decisions across 15 local browser fixtures, four previously labeled later phases, one labeled `wait` phase, three terminal `done` states, and a modal Confirm probe. Later states are prepared by replaying fixture actions through Playwright and checking their outcomes. The dynamic-results timer is controlled with Playwright's clock so its `loading` and `report-ready` states are reproducible. These scripts create benchmark states only and do not test Jolty's execution loop. Target-free `wait` and `done` decisions are scored for action correctness but excluded from retrieval coverage. The three newer initial cases and four previously labeled later cases use selector labels to locate their ground-truth targets. The benchmark reports expected and selected action and target, retrieval rank and Top-K misses, a deterministic heuristic Top-1 decision, considered candidates, confidence buckets with observed accuracy, explicit failure reason, per-stage timings, and summary percentiles. It includes separate initial, later-phase, and target-free summaries. The heuristic chooses the highest-ranked candidate and maps its role and editability to the same action vocabulary used by the model input; it has no `wait` or `done` rule. Neither policy executes selected actions, validates outcomes, or calls a fallback in this benchmark.

On an AMD Ryzen 7 9700X CPU with 31 GiB of RAM, `@receptron/laya@0.1.2`, ONNX Runtime Node 1.30.0, and the pinned `receptron/laya-onnx` revision `68f27dfe5a27a54fb2b1fefc432f43f972e90868`, the expanded controlled run found the target in retrieved Top-10 for **17/17 cases**. The heuristic Top-1 decision matched **14/17 (82.4%)** action-and-target labels; Laya matched **11/17 (64.7%)**, with no model errors. Cached model load was 1.65 s. Tokenization p50/p95 was **0.49/0.97 ms**; ONNX inference **82.7/97.5 ms**; full decision **83.2/98.3 ms**. Candidate filtering was **0.0032/0.0099 ms** p50/p95. Laya missed the email and message inputs, the duplicate-label Pro button, the below-fold target, the cookie notice, and the approved request row. These are small, curated fixtures, and one decision per case is insufficient for a stable accuracy or latency estimate. The heuristic result applies only to these labeled initial states. Laya confidence is not calibrated for browser decisions; the output's confidence buckets are diagnostics, not execution thresholds.

The recorded run used Node.js 25.9.0 and Chromium 153.0.8010.12, with one decision at a time. Each benchmark output includes these versions for reruns.

The earlier later-phase controlled run found the target in retrieved Top-10 for **4/4 cases**. The heuristic and Laya each matched **4/4** action-and-target labels. Across those 21 initial and later-phase cases, retrieval Top-10 covered **21/21**, the heuristic matched **18/21**, and Laya matched **15/21**. `pnpm run benchmark:retrieval` still measures these 21 target-bearing cases; its 2,100 measured retrieval calls had p50/p95 **0.0028/0.0043 ms** in that run.

In a subsequent 26-case isolated decision run on the same hardware, Node.js 25.9.0, and Chromium 153.0.8010.12, retrieval covered **22/22 targeted cases**. The heuristic matched **19/26** labels, and Laya matched **17/26**. Laya chose `wait` for the clock-frozen loading phase (confidence 0.8511) and correctly chose the modal Confirm button in the separate dialog-open probe (confidence 0.8121). In all three terminal states, Laya chose a `click` instead of `done`; the heuristic also missed those states because it always chooses a target. The current model question includes the goal, URL, title, and interactive candidates but omits visible status text such as “Signed in” or “Report opened,” so these results cannot isolate the model's ability to recognize completion from an adequate state representation. The run's ONNX inference p50/p95 was **84.8/98.3 ms**, and full decision p50/p95 was **85.3/98.8 ms**. These few curated decisions do not establish task success, generalization, or confidence calibration. Recovery remains unmeasured.

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
