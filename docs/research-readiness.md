# Milestone 13 research readiness

Run `pnpm run dataset:export --fallback` followed by `pnpm run research:readiness`. The second command reads the Parquet file, validates the schema and manifest checksum, and prints validated label counts, action coverage, fixture groups, and site origins by split. Pass a dataset directory as the first positional argument to audit another v1 export.

The first fallback export on 2026-09-23 produced:

| Split | Attempted decisions | Validated labels | Actions | Fixture groups | Origins |
| --- | ---: | ---: | --- | ---: | ---: |
| Train | 5 | 4 | click: 4 | 3 | 1 |
| Validation | 2 | 2 | click: 1, type: 1 | 1 | 1 |
| Test | 3 | 3 | click: 2, wait: 1 | 1 | 1 |

Every origin is `http://fixtures.jolty.test`. These are fixture-separated splits, but not independent-site splits. The readiness report fails the count, per-action, and origin-separation gates. The thresholds and staged model plan are recorded in [Decision 0002](decisions/0002-bdm-research-gate.md). A passing report is only permission to run a first experiment; it does not certify dataset quality or generalization.

The existing [comparison benchmark](benchmarks.md#controlled-task-comparison) establishes Laya, deterministic, heuristic, and optional ChatGPT subscription baselines on the five local flows. Re-run all policies on the same held-out flows once additional site data is available. Current historical results should not be combined with a future candidate trained on overlapping templates or different conditions.

A fresh three-measured-run comparison on 2026-09-23 (`JOLTY_BENCH_RUNS=3 pnpm run benchmark:compare`, one warmup per task and policy) found Laya at 9/15 completed tasks and 21/27 exact labeled decisions; the retrieved Top-1 heuristic completed 6/15 tasks and matched 15/24 attempted labels. Both policies attempted fewer later steps on failed tasks, so the accuracy denominators differ. The local JSON report is written to `artifacts/m13-baseline-compare.json`. This small rerun is a baseline smoke measurement; the 20-run table in [Benchmarks](benchmarks.md#controlled-task-comparison) remains the more stable fixture estimate. No new large-model comparison was run for this audit.

The [Kena dashboard benchmark](kena-benchmark.md) adds seven authenticated fake-adapter one-step flows from a separate application as a held-out probe. It compares Laya and a retrieved Top-1 heuristic using deterministic URL, input-value, and element-appearance checks. The five navigation flows also have a ChatGPT subscription reference run. This is an evaluation probe rather than training data and does not satisfy the encoder experiment gate by itself.

The [public-site benchmark](public-site-benchmark.md) adds thirteen one-step cases from four public demonstration sites. A three-run comparison found that reversing Laya's candidate order corrected a dropdown decision but regressed a TodoMVC filter and a SauceDemo product choice: verbose/ranked completed 36/39 attempts and verbose/reversed completed 33/39. Those four sites remain reserved for held-out evaluation. The [research corpus pilot](research-corpus.md) collects training and calibration cases from three other public practice sites; its 2026-09-23 run passes the engineering admission gate. No model adaptation or same-flow trained-model comparison has been run yet.
