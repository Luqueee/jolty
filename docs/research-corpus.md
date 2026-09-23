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
