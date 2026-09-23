# Milestone 13 research readiness

Run `pnpm run dataset:export --fallback` followed by `pnpm run research:readiness`. The second command reads the Parquet file, validates the schema and manifest checksum, and prints validated label counts, action coverage, fixture groups, and site origins by split. Pass a dataset directory as the first positional argument to audit another v1 export.

The first fallback export on 2026-09-23 produced:

| Split | Attempted decisions | Validated labels | Actions | Fixture groups | Origins |
| --- | ---: | ---: | --- | ---: | ---: |
| Train | 5 | 4 | click: 4 | 3 | 1 |
| Validation | 2 | 2 | click: 1, type: 1 | 1 | 1 |
| Test | 3 | 3 | click: 2, wait: 1 | 1 | 1 |

Every origin is `http://fixtures.jolty.test`. These are fixture-separated splits, but not independent-site splits. The readiness report fails six gates: fewer than 20 training labels, fewer than 10 validation labels, fewer than 10 test labels, missing training examples for `type` and `wait`, fewer than two training origins, and no unseen test origin. The thresholds and staged model plan are recorded in [Decision 0002](decisions/0002-bdm-research-gate.md). A passing report is only permission to run a meaningful first experiment; it does not certify dataset quality or generalization.

The existing [comparison benchmark](benchmarks.md#controlled-task-comparison) establishes Laya, deterministic, heuristic, and optional ChatGPT subscription baselines on the five local flows. Re-run all policies on the same held-out flows once additional site data is available. Current historical results should not be combined with a future candidate trained on overlapping templates or different conditions.

A fresh three-measured-run comparison on 2026-09-23 (`JOLTY_BENCH_RUNS=3 pnpm run benchmark:compare`, one warmup per task and policy) found Laya at 9/15 completed tasks and 21/27 exact labeled decisions; the retrieved Top-1 heuristic completed 6/15 tasks and matched 15/24 attempted labels. Both policies attempted fewer later steps on failed tasks, so the accuracy denominators differ. The local JSON report is written to `artifacts/m13-baseline-compare.json`. This small rerun is a baseline smoke measurement; the 20-run table in [Benchmarks](benchmarks.md#controlled-task-comparison) remains the more stable fixture estimate. No new large-model comparison was run for this audit.

The [Kena dashboard benchmark](kena-benchmark.md) adds five authenticated fake-adapter navigation flows from a separate application as a held-out probe. It compares Laya, a retrieved Top-1 heuristic, and the ChatGPT subscription reference with deterministic URL checks. It is an evaluation probe rather than training data and does not satisfy the encoder experiment gate by itself.
