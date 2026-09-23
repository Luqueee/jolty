# Benchmarks

This is an evaluation plan. The repository has controlled [browser-state extraction](browser-state.md), [candidate filtering](candidate-filter.md), [candidate retrieval](candidate-retrieval.md), [Laya decision baseline](decision-model.md), [deterministic Playwright reference](playwright-reference.md), [five-task Jolty loop](controlled-loop.md), and [hybrid fallback](fallback.md) benchmarks. General-site and post-action recovery comparisons remain unmeasured.

The [Kena dashboard probe](kena-benchmark.md) measures seven one-step flows on a separate application's local fake-adapter server. It is an early held-out application check, not a representative multi-site evaluation.

## Controlled hybrid fallback

Run `pnpm run benchmark:hybrid` for one warmup and five measured serial runs per task and mode. It compares Laya-only with Laya plus optional Codex fallback on the same fresh fixtures and exact success texts. The experimental confidence threshold is `0.2` by default and can be set with `JOLTY_FALLBACK_THRESHOLD`. This value was selected after inspecting controlled Laya confidence and must not be interpreted as calibrated or validated on held-out sites. Each Codex choice is constrained to the same retrieved candidates and target-free actions. The report includes success, fast-path coverage, fallback rate, LLM calls and tokens per task, fallback latency, fast decision latency, and task duration. The fallback policy does not retry after a failed executed action.

On 2026-09-23, using Node 25.9.0, Chromium 153.0.8010.12, the pinned Laya revision, Codex CLI with `gpt-6-sol` signed in through ChatGPT, and one task at a time, the five-run comparison found:

| Task | Laya success | Hybrid success | Hybrid fallback calls/task | Hybrid task p50 |
| --- | ---: | ---: | ---: | ---: |
| Modal | 5/5 | 5/5 | 0 | 232.7 ms |
| Settings | 5/5 | 5/5 | 0 | 238.5 ms |
| Cookie overlay | 0/5 | 5/5 | 1 | 5821.7 ms |
| Dynamic results | 5/5 | 5/5 | 0 | 439.9 ms |
| Ambiguous row | 0/5 | 0/5 | 0 | 138.8 ms |

The cookie fallback was invoked on its first step, so that task's fast-path coverage and fallback rate were each **50%**; its fallback latency p50 was **5590.9 ms** and it used about **14,000 input tokens per task**, including Codex agent overhead. Across all 25 hybrid tasks, **5 of 50** attempted decisions escalated, for **90% fast-path coverage** and **0.2 large-model calls per task**. Hybrid success was **20/25**, versus **15/25** for Laya-only. The improvement is limited to the cookie fixture and the measured experimental policy. The ambiguous-row error still passed its confidence gate, so no fallback was attempted. Fast Laya latency remains separately recorded even when fallback runs. Subscription usage has no per-task API price; estimated cost is `null`. These fixtures and five repetitions do not establish a general success gain or a calibrated threshold.

## Controlled task comparison

Run `pnpm run benchmark:compare` for the deterministic Playwright reference, a retrieved Top-1 heuristic, and Laya on the same five task plans and fixture success texts. Each policy gets a fresh page and fixture state, one warmup, then 20 measured serial runs by default. `JOLTY_BENCH_RUNS` changes the measured repetitions. The timer starts before fixture navigation and ends after the final action, validation, and exact success-text check. Browser launch, model load, page creation, route installation, and benchmark-only label resolution are excluded. Failed runs remain in duration and success summaries. The JSON report includes p50/p95/p99 for task duration and decision latency, exact labeled decision accuracy, validated-step rate, model calls, input/output tokens when available, and failure reasons. Playwright's hand-written reference has no model decisions, so its decision and step metrics are `null`.

For each attempted model decision, the benchmark resolves the fixture's expected target selector to the current browser-state ID before asking the policy. A decision is correct only if both its action and target ID match the label; target-free `wait` requires no target. A failed decision counts as incorrect. The denominator includes attempted labeled steps, including those in failed tasks, and excludes later steps that were never reached. Label resolution is timed and subtracted from task duration so the oracle does not inflate policy latency. This metric is distinct from deterministic outcome validation: a step can pass its check after an incorrect action if the page changes independently. The five task plans have 10 labeled steps total; the fixtures remain curated local cases.

On 2026-09-23, with Node 25.9.0, Chromium 153.0.8010.12, an AMD Ryzen 7 9700X, 31 GiB RAM, and the pinned Laya revision, the 20-run comparison measured:

| Task | Playwright success; task p50 ms | Heuristic success; task p50 ms | Laya success; task p50 ms |
| --- | ---: | ---: | ---: |
| Modal | 20/20; 71.6 | 20/20; 68.9 | 20/20; 224.6 |
| Settings | 20/20; 39.1 | 20/20; 41.8 | 20/20; 240.7 |
| Cookie overlay | 20/20; 72.4 | 0/20; 3014.2 | 0/20; 107.9 |
| Dynamic results | 20/20; 220.0 | 0/20; 70.3 | 20/20; 409.5 |
| Ambiguous row | 20/20; 39.1 | 0/20; 42.9 | 0/20; 121.5 |

The exact labeled step counts in the rerun with the accuracy oracle were:

| Task | Heuristic correct / attempted | Laya correct / attempted |
| --- | ---: | ---: |
| Modal | 40/40 | 40/40 |
| Settings | 40/40 | 40/40 |
| Cookie overlay | 0/20 | 0/20 |
| Dynamic results | 20/40 | 60/60 |
| Ambiguous row | 0/20 | 0/20 |

Across attempted steps, the heuristic matched **100/160 (62.5%)** action-and-target labels and Laya matched **140/180 (77.8%)**. These pooled figures depend on which later steps each policy reached; task success remains the more meaningful full-flow result.

Laya made two calls per successful modal/settings task, three per dynamic-results task, and one before failure on cookie-overlay and ambiguous-row. Its per-decision p50 ranged from 82.8 to 93.0 ms across these tasks; p95 ranged from 90.8 to 100.7 ms, and p99 from 96.1 to 115.4 ms. The heuristic made no model calls. Its cookie-overlay choice reached the Playwright action timeout, which explains the high failed-task duration. These are local fixtures with repeated identical states, so the 20 repetitions measure execution variability, not generalization. The [offline decision benchmark](#laya-baseline-measurement) separately measured 22/22 targeted Top-10 retrieval recall; that figure is not a per-task retrieval result. Validated-step rate remains an outcome proxy; labeled step accuracy is the direct next-action metric.

For a subscription-backed large-model reference, run `JOLTY_INCLUDE_CODEX=1 JOLTY_BENCH_RUNS=1 pnpm run benchmark:compare` after signing in to Codex with ChatGPT. This runs `gpt-6-sol` through Codex CLI on the same tasks and checks. A new CLI turn starts for each decision, so CLI and agent overhead are part of its measured latency. The [adapter contract](large-model-baseline.md) explains usage and cost fields.

A one-warmup, three-measured-run comparison with Codex CLI 0.156.1 on the same machine found:

| Task | Codex success | Task p50 ms | Turns per task | Input tokens per task |
| --- | ---: | ---: | ---: | ---: |
| Modal | 3/3 | 11801.7 | 2 | 27,936 |
| Settings | 3/3 | 10716.6 | 2 | 27,998 |
| Cookie overlay | 3/3 | 9534.1 | 2 | 27,955 |
| Dynamic results | 0/3 | 10152.3 | 2 | 27,901 |
| Ambiguous row | 0/3 | 5640.9 | 1 | 13,995 |

Codex matched **21/27 (77.8%)** action-and-target labels across attempted steps: 6/6 each on modal, settings, and cookie-overlay; 3/6 on dynamic-results; and 0/3 on ambiguous-row. Dynamic-results and ambiguous-row failed validation in every measured run. An earlier three-run comparison had one modal action failure, showing that even these controlled choices vary between runs. The large input counts include Codex agent overhead and cannot be interpreted as only the compact browser question. Subscription usage has no per-task API charge, so estimated USD cost is `null`. Three measured runs per task expose these failure modes but do not establish stable p95/p99 latency or general-site success. The fast policies have 20 repetitions per task in the separate run above; do not infer a reliable speed ratio from these different sample sizes.

## Laya baseline measurement

Run `pnpm run benchmark:decision` after `pnpm install --frozen-lockfile` and installing Playwright Chromium. The first run downloads a roughly 1.7 GB ONNX bundle into the user's cache. The script loads the model once, warms it once, then evaluates 17 initial-state decisions across 15 local browser fixtures, four previously labeled later phases, one labeled `wait` phase, three terminal `done` states, and a modal Confirm probe. Later states are prepared by replaying fixture actions through Playwright and checking their outcomes. The dynamic-results timer is controlled with Playwright's clock so its `loading` and `report-ready` states are reproducible. These scripts create benchmark states only and do not test Jolty's execution loop. Target-free `wait` and `done` decisions are scored for action correctness but excluded from retrieval coverage. The three newer initial cases and four previously labeled later cases use selector labels to locate their ground-truth targets. The benchmark reports expected and selected action and target, retrieval rank and Top-K misses, a deterministic heuristic Top-1 decision, considered candidates, confidence buckets with observed accuracy, explicit failure reason, per-stage timings, and summary percentiles. It includes separate initial, later-phase, and target-free summaries. The heuristic chooses the highest-ranked candidate and maps its role and editability to the same action vocabulary used by the model input; it has no `wait` or `done` rule. Neither policy executes selected actions, validates outcomes, or calls a fallback in this benchmark.

On an AMD Ryzen 7 9700X CPU with 31 GiB of RAM, `@receptron/laya@0.1.2`, ONNX Runtime Node 1.30.0, and the pinned `receptron/laya-onnx` revision `68f27dfe5a27a54fb2b1fefc432f43f972e90868`, the expanded controlled run found the target in retrieved Top-10 for **17/17 cases**. The heuristic Top-1 decision matched **14/17 (82.4%)** action-and-target labels; Laya matched **11/17 (64.7%)**, with no model errors. Cached model load was 1.65 s. Tokenization p50/p95 was **0.49/0.97 ms**; ONNX inference **82.7/97.5 ms**; full decision **83.2/98.3 ms**. Candidate filtering was **0.0032/0.0099 ms** p50/p95. Laya missed the email and message inputs, the duplicate-label Pro button, the below-fold target, the cookie notice, and the approved request row. These are small, curated fixtures, and one decision per case is insufficient for a stable accuracy or latency estimate. The heuristic result applies only to these labeled initial states. Laya confidence is not calibrated for browser decisions; the output's confidence buckets are diagnostics, not execution thresholds.

The recorded run used Node.js 25.9.0 and Chromium 153.0.8010.12, with one decision at a time. Each benchmark output includes these versions for reruns.

The earlier later-phase controlled run found the target in retrieved Top-10 for **4/4 cases**. The heuristic and Laya each matched **4/4** action-and-target labels. Across those 21 initial and later-phase cases, retrieval Top-10 covered **21/21**, the heuristic matched **18/21**, and Laya matched **15/21**. `pnpm run benchmark:retrieval` still measures these 21 target-bearing cases; its 2,100 measured retrieval calls had p50/p95 **0.0028/0.0043 ms** in that run.

In a subsequent 26-case isolated decision run on the same hardware, Node.js 25.9.0, and Chromium 153.0.8010.12, retrieval covered **22/22 targeted cases**. The heuristic matched **19/26** labels, and Laya matched **17/26**. Laya chose `wait` for the clock-frozen loading phase (confidence 0.8511) and correctly chose the modal Confirm button in the separate dialog-open probe (confidence 0.8121). In all three terminal states, Laya chose a `click` instead of `done`; the heuristic also missed those states because it always chooses a target. The current model question includes the goal, URL, title, and interactive candidates but omits visible status text such as “Signed in” or “Report opened,” so these results cannot isolate the model's ability to recognize completion from an adequate state representation. The run's ONNX inference p50/p95 was **84.8/98.3 ms**, and full decision p50/p95 was **85.3/98.8 ms**. These few curated decisions do not establish task success, generalization, or confidence calibration. Recovery remains unmeasured.

A paired option-set probe on 2026-09-23 used `JOLTY_DECISION_TOP_K=5` and `3` with `pnpm run benchmark:decision` against the same 26 fixture states. Both variants retained all 22 targeted cases and left Laya at **17/26** exact decisions. Omitting `back` instead (`JOLTY_DECISION_INCLUDE_BACK=0`, Top-10 unchanged) produced **18/26**: one initial form action changed from wrong to correct. These are ablations, not a validated policy or a multi-site improvement. Default inference still offers Top-10 candidates and all four target-free actions.

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
