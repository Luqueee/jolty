# Public-site research corpus pilot

Run `pnpm run research:collect` to execute the curated one-step cases and write the ignored `artifacts/research-corpus-v0.json` artifact. An optional positional argument changes the output path. The command prints a readiness assessment and a SHA-256 digest of canonically ordered samples. The collection is offline and does not change the browser decision path.

The collector uses two training origins (EvilTester Test Pages and QA Automation Practice), one calibration origin (ExpandTesting Practice), and four reserved test origins (The Internet, TodoMVC, SauceDemo, and Selenium). It rejects a case whose exact HTTPS origin, split, URL query, or fragment violates this assignment. The thirteen existing public benchmark cases are imported into the test split. Keep all cases from an origin in its assigned split; do not fit features, thresholds, or model weights using test labels.

For each case, a fresh browser context observes the page once, maps the expected target within that same observation, retrieves the top ten candidates, executes the curated action, and checks the deterministic validator plus any case-specific postcondition. A label is present only when the action executed, validation passed, its target was retrieved, and the postcondition passed. Failed cases remain in the artifact with execution and validation statuses, candidate rank, and a null label. The artifact contains projected interactive elements and candidate scores; it excludes form values, URL queries and fragments, raw page HTML, cookies, and credentials. Text passes the existing dataset sensitive-text guard.

The 2026-09-23 collection produced 55/55 validated labels:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 2 | 28 | 6 | 3 | 19 |
| Calibration | 1 | 14 | 2 | 3 | 9 |
| Test | 4 | 13 | 9 | 2 | 2 |

The [readiness gate](decisions/0002-bdm-research-gate.md) passes for this run. This is a small, curated collection of public demonstration pages, heavily weighted toward text fields. Passing is an engineering admission condition, not evidence of statistical sufficiency or cross-site generalization. The JSON `schema_version: 0` artifact is a research pilot and has no Parquet v1 reader. Site content may change, so record a new digest and reassess labels for each collection. The [first frozen-encoder experiment](frozen-encoder-experiment.md) uses this pilot and reports its negative held-out result.

## Revised corpus v1

Run `pnpm run research:collect-v1` to write `artifacts/research-corpus-v1.json`. This is a new collection version using the same JSON schema, not an update to the Parquet dataset. It keeps the earlier training sites, adds [QA Practice Hub](https://qapracticehub.com/) button cases to training, keeps ExpandTesting for calibration, and adds [Practice Automation](https://practice-automation.com/) click and selection cases to calibration. The earlier four public test sites are absent from v1. New test cases use [QA Practice](https://www.qa-practice.com/) and the HTTPS [UI Testing Playground installation](https://playground.go-bigger.de/) on distinct origins. Their cases were authored and deterministic outcomes checked before scoring any decision model.

The 2026-09-23 v1 collection yielded 68/68 validated labels and digest `9a3226fbd80e73873a9aea6d3a29738e728b6c5dddefba81acef173d2de82933`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 3 | 35 | 13 | 3 | 19 |
| Calibration | 2 | 22 | 10 | 3 | 9 |
| Test | 2 | 11 | 7 | 1 | 3 |

The origin and per-action admission gates pass. The collector waits up to 1.5 seconds for an expected text outcome before validating it; this handles asynchronous form results during offline labeling and does not change Jolty's browser hot path. Labels still require the exact action target, execution, validator result, and postcondition. The added button and selection cases improve action variety, but eleven test decisions across two practice sites remain too few for a generalization claim. The [revised experiment](frozen-encoder-experiment.md#revised-corpus-v1) reports the new held-out result. These test cases have now been inspected through the experiment and must not be reused as untouched evaluation for a further tuned candidate.

## Corpus v2

Run `pnpm run research:collect-v2` to create `artifacts/research-corpus-v2.json`. It retains the v1 training and calibration origins, adds a prepared invalid-login submission on QA Practice Hub and two modal-opening decisions on Practice Automation, and replaces all test cases with ten one-step decisions on [Test Track](https://www.testtrack.org/) and [WebDriverUniversity](https://webdriveruniversity.com/). The test cases and their deterministic outcomes were checked before model scoring. A proposed registration submission was excluded before scoring because its target was absent from the retrieved Top-10, despite successful execution and validation; it is not a training label.

The 2026-09-23 collection produced 70/70 validated labels with digest `d23d9fb65aad9fef1e736e8f0c9b1bebfcf29cacfe466d95a0d1089b89aeee2b`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 3 | 36 | 14 | 3 | 19 |
| Calibration | 2 | 24 | 12 | 3 | 9 |
| Test | 2 | 10 | 4 | 0 | 6 |

The engineering admission gate passes. The two test origins are disjoint from earlier evaluated origins and from v2 training and calibration. The cases are still authored on public practice pages; six test decisions are simple fields, so the set cannot establish broad generalization. Its test outcomes are now inspected and cannot be treated as untouched for future tuning.

## Corpus v3: fixed-head abstention probe

Run `pnpm run research:collect-v3` to create `artifacts/research-corpus-v3.json`. It retains the v2 training and calibration cases and substitutes ten newly authored test decisions on [Lastest Playground](https://lastest.cloud/playground) and [QA Playground](https://qaplayground.com/). The test actions and deterministic outcomes were checked before scoring the frozen v2 head. The final 2026-09-24 collection produced 70/70 validated labels: 36 training, 24 calibration, and ten test, across disjoint origin splits. Its digest was `cf544117ee150a30e7ac7bd9af411aa0c0b9871d1efed416757522731475be0f`; the engineering admission gate passes. Two repeat captures also validated 70/70 but had different digests because QA Playground inserted an optional feedback button into one observed page at different times. Its goal, retrieved candidates, and label were unchanged. Keep each report tied to its collected digest; live public pages are not byte-for-byte pinned fixtures.

The v3 corpus is used to score the unchanged head trained on v2, not to fit or calibrate a new head. Its new test split contains six clicks, one select, and three type actions. These outcomes are now inspected and cannot serve as untouched evaluation for another tuned variant. See the [fixed-head probe](frozen-encoder-experiment.md#fixed-head-abstention-probe-on-v3).
