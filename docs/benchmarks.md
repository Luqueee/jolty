# Benchmarks

This is an evaluation plan. The repository has controlled [browser-state extraction](browser-state.md), [candidate filtering](candidate-filter.md), [candidate retrieval](candidate-retrieval.md), [Laya decision baseline](decision-model.md), [deterministic Playwright reference](playwright-reference.md), and [two-task Jolty loop](controlled-loop.md) benchmarks. General-site and fallback comparisons remain unmeasured.

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
