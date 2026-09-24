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

The [public-site benchmark](public-site-benchmark.md) adds thirteen one-step cases from four public demonstration sites. A three-run comparison found that reversing Laya's candidate order corrected a dropdown decision but regressed a TodoMVC filter and a SauceDemo product choice: verbose/ranked completed 36/39 attempts and verbose/reversed completed 33/39. Those four sites remain reserved for held-out evaluation. The [research corpus pilot](research-corpus.md) collects training and calibration cases from three other public practice sites; its 2026-09-23 run passes the engineering admission gate. The [first frozen-encoder experiment](frozen-encoder-experiment.md) found no value over Laya on the thirteen reserved cases.

A [revised corpus](research-corpus.md#revised-corpus-v1) adds one training and one calibration origin and reserves two new origins for test. It also passes the engineering gate, but its [eleven-case evaluation](frozen-encoder-experiment.md#revised-corpus-v1) differs from Laya by only one completed task. Confidence remains overoptimistic, and the milestone exit criterion is not met.

A [third corpus](research-corpus.md#corpus-v2) adds one prepared training submission, two calibration modals, and ten decisions on two more unseen origins. Its [one-run comparison](frozen-encoder-experiment.md#corpus-v2-experiment) again differs from Laya by one task. The head's three mistakes were lower confidence, but calibration selected zero abstention. These few cases still do not meet the milestone exit criterion.

A [fourth corpus](research-corpus.md#corpus-v3-fixed-head-abstention-probe) tested the unchanged v2 head on two further origins. Its [predeclared 0.9 confidence probe](frozen-encoder-experiment.md#fixed-head-abstention-probe-on-v3) covered six decisions and included two high-confidence errors. Laya also completed two more of the ten tasks. The candidate remains outside the runtime and Milestone 13 is still open.

A [fifth corpus](research-corpus.md#corpus-v4) adds four training clicks and two calibration modal closes, then tests on two more unseen origins. Its [one-run comparison](frozen-encoder-experiment.md#corpus-v4-experiment) tied Laya at 8/10 completed tasks. The validation-selected threshold covered nine of ten test decisions but admitted both high-confidence mistakes. The engineering admission gate passes, but the small authored set does not establish general value or a safe autonomous execution policy. Milestone 13 remains open.

A [sixth corpus](research-corpus.md#corpus-v5) adds one training click and one distinct calibration click and reserves two more test origins. Its [action-bias ablation](frozen-encoder-experiment.md#corpus-v5-action-bias-ablation) completed 9/10 live tasks with zero global action intercept, versus 8/10 for the fitted-intercept head and Laya. The validation-selected threshold covered eight test decisions, all correct in this small set. The one-case difference and one-run measurement are insufficient to establish a general gain. Milestone 13 remains open and the head is not deployed.
