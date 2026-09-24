# Public-site research corpus pilot

Run `pnpm research collect --version 0` to execute the curated one-step cases and write the ignored `artifacts/research-corpus-v0.json` artifact. Pass `--output PATH` to change the output path. The command prints a readiness assessment and a SHA-256 digest of canonically ordered samples. The collection is offline and does not change the browser decision path.

The research implementation lives in `apps/cli/src/research/`. `cases/` holds authored flows; `catalog.ts` selects the corpus and held-out flows for each version; `sources.ts` owns the approved origin-to-split assignment and reserved test origins. The `pnpm research` command dispatches collection, readiness, training, baselines, and live probes as separate processes so their native model runtimes remain isolated. Use `pnpm research --help` for options and specify `--version` when working with a versioned corpus. To add a corpus version, add its cases and held-out flows to the catalog and approve any new origins in `sources.ts`; the readiness and source checks then use the same assignment. Training remains an explicit command and collection never trains a model.

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

Run `pnpm research collect --version 1` to write `artifacts/research-corpus-v1.json`. This is a new collection version using the same JSON schema, not an update to the Parquet dataset. It keeps the earlier training sites, adds [QA Practice Hub](https://qapracticehub.com/) button cases to training, keeps ExpandTesting for calibration, and adds [Practice Automation](https://practice-automation.com/) click and selection cases to calibration. The earlier four public test sites are absent from v1. New test cases use [QA Practice](https://www.qa-practice.com/) and the HTTPS [UI Testing Playground installation](https://playground.go-bigger.de/) on distinct origins. Their cases were authored and deterministic outcomes checked before scoring any decision model.

The 2026-09-23 v1 collection yielded 68/68 validated labels and digest `9a3226fbd80e73873a9aea6d3a29738e728b6c5dddefba81acef173d2de82933`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 3 | 35 | 13 | 3 | 19 |
| Calibration | 2 | 22 | 10 | 3 | 9 |
| Test | 2 | 11 | 7 | 1 | 3 |

The origin and per-action admission gates pass. The collector waits up to 1.5 seconds for an expected text outcome before validating it; this handles asynchronous form results during offline labeling and does not change Jolty's browser hot path. Labels still require the exact action target, execution, validator result, and postcondition. The added button and selection cases improve action variety, but eleven test decisions across two practice sites remain too few for a generalization claim. The [revised experiment](frozen-encoder-experiment.md#revised-corpus-v1) reports the new held-out result. These test cases have now been inspected through the experiment and must not be reused as untouched evaluation for a further tuned candidate.

## Corpus v2

Run `pnpm research collect --version 2` to create `artifacts/research-corpus-v2.json`. It retains the v1 training and calibration origins, adds a prepared invalid-login submission on QA Practice Hub and two modal-opening decisions on Practice Automation, and replaces all test cases with ten one-step decisions on [Test Track](https://www.testtrack.org/) and [WebDriverUniversity](https://webdriveruniversity.com/). The test cases and their deterministic outcomes were checked before model scoring. A proposed registration submission was excluded before scoring because its target was absent from the retrieved Top-10, despite successful execution and validation; it is not a training label.

The 2026-09-23 collection produced 70/70 validated labels with digest `d23d9fb65aad9fef1e736e8f0c9b1bebfcf29cacfe466d95a0d1089b89aeee2b`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 3 | 36 | 14 | 3 | 19 |
| Calibration | 2 | 24 | 12 | 3 | 9 |
| Test | 2 | 10 | 4 | 0 | 6 |

The engineering admission gate passes. The two test origins are disjoint from earlier evaluated origins and from v2 training and calibration. The cases are still authored on public practice pages; six test decisions are simple fields, so the set cannot establish broad generalization. Its test outcomes are now inspected and cannot be treated as untouched for future tuning.

## Corpus v3: fixed-head abstention probe

Run `pnpm research collect --version 3` to create `artifacts/research-corpus-v3.json`. It retains the v2 training and calibration cases and substitutes ten newly authored test decisions on [Lastest Playground](https://lastest.cloud/playground) and [QA Playground](https://qaplayground.com/). The test actions and deterministic outcomes were checked before scoring the frozen v2 head. The final 2026-09-24 collection produced 70/70 validated labels: 36 training, 24 calibration, and ten test, across disjoint origin splits. Its digest was `cf544117ee150a30e7ac7bd9af411aa0c0b9871d1efed416757522731475be0f`; the engineering admission gate passes. Two repeat captures also validated 70/70 but had different digests because QA Playground inserted an optional feedback button into one observed page at different times. Its goal, retrieved candidates, and label were unchanged. Keep each report tied to its collected digest; live public pages are not byte-for-byte pinned fixtures.

The v3 corpus is used to score the unchanged head trained on v2, not to fit or calibrate a new head. Its new test split contains six clicks, one select, and three type actions. These outcomes are now inspected and cannot serve as untouched evaluation for another tuned variant. See the [fixed-head probe](frozen-encoder-experiment.md#fixed-head-abstention-probe-on-v3).

## Corpus v4

Run `pnpm research collect --version 4` to create `artifacts/research-corpus-v4.json`. This version keeps the v3 non-test cases, adds four QA Practice Hub training clicks for clearing a form, removing a dynamic item, and opening two tabs, and adds two Practice Automation modal-close decisions to calibration. Ten new test decisions use [QA Automation Labs](https://testing.qaautomationlabs.com/) and [Practice Test Automation](https://practicetestautomation.com/practice/), neither of which appears in earlier training, calibration, or test splits. Their targets and postconditions were checked before model scoring. The modal postconditions wait for the close animation to finish.

The 2026-09-24 collection validated 76/76 labels with digest `bc300fd8f944dc5addf8be40c0c025cedba1e28c12d93bce33166716231de3fb`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 3 | 40 | 18 | 3 | 19 |
| Calibration | 2 | 26 | 14 | 3 | 9 |
| Test | 2 | 10 | 6 | 0 | 4 |

The engineering admission gate passes. The ten test outcomes have now been inspected through the [v4 experiment](frozen-encoder-experiment.md#corpus-v4-experiment); they cannot be reused as untouched evaluation for a tuned variant. These remain authored, one-step decisions on public practice sites, with no independent multistep or throughput evidence.

## Corpus v5

Run `pnpm research collect --version 5` to create `artifacts/research-corpus-v5.json`. This version retains the v4 non-test cases, adds a QA Practice Hub toast click to training and a Practice Automation accordion click to calibration, and tests ten new cases on [DemoQA](https://demoqa.com/) and [Automation Bible](https://www.automation-bible.com/). The new test origins have not appeared in earlier splits. A proposed DemoQA registration case initially lacked Top-10 target retrieval; its goal was clarified to name the visible Add control before any model scoring. Two cases whose compact observations and labels were duplicates were removed before scoring. A different site with email addresses in extracted link text was excluded under the dataset sensitive-text guard.

The 2026-09-24 collection validated 78/78 labels with digest `efc5434ea213a6eb8b35ef9487b463be12a92208a56ac148643d84f72131a1fd`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 3 | 41 | 19 | 3 | 19 |
| Calibration | 2 | 27 | 15 | 3 | 9 |
| Test | 2 | 10 | 8 | 0 | 2 |

The engineering gate passes. The new test cases are now inspected through the [v5 comparison](frozen-encoder-experiment.md#corpus-v5-action-bias-ablation) and cannot be reused as untouched evaluation. The modal-close page presents two controls named Close, but the observed errors in this comparison selected the Small modal trigger rather than either Close control. The set remains small, authored, and one-step.

## Corpus v6 and multistep probe

Run `pnpm research collect --version 6` to collect the v5 training and validation cases with twenty newly authored one-step test decisions on [StepCampus](https://www.stepcampus.in/playground) and [Sreenidhi Rajakrishnan's practice page](https://www.sreenidhirajakrishnan.com/practice). Both origins are new to the research splits. The cases cover thirteen clicks, five typed fields, and two native selections; each has a deterministic postcondition. Collection waits for network idle before observing these pages. The 2026-09-24 collection validated 88/88 labels with digest `e24a663a7ca581e87fece887b434c2ae6c8c9b39ecb118c59f1586377dc9c604`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 3 | 41 | 19 | 3 | 19 |
| Calibration | 2 | 27 | 15 | 3 | 9 |
| Test | 2 | 20 | 13 | 2 | 5 |

The engineering admission gate passes. During collection, a target index on the Sreenidhi page resolved to a different control because Playwright locators pierce Shadow DOM while browser-state extraction uses main-document `querySelectorAll`. The executor now resolves observed indices with that same DOM query, and a focused regression test reproduces the mismatch. The collected test outcomes are now inspected and must not be used as untouched evaluation for a tuned candidate. See the [fixed-head and multistep comparison](frozen-encoder-experiment.md#fixed-v5-heads-on-v6-and-multistep-flows).

## Corpus v7: broader training and calibration

Run `pnpm research collect --version 7` to rebuild the ignored `artifacts/research-corpus-v7.json` artifact. V7 retains the 68 v6 training and validation cases, adds 49 training cases on Automation Testing Register, LetsKodeIt, Blogspot Automation Testing Practice, and LetCode, and adds 20 calibration cases on QA Practice and AppTesting. The 21 new held-out cases use TestForge and LearnAQA. Previously evaluated v6 test pages are absent. The 2026-09-24 collection validated 158/158 distinct labels with digest `00ea9701e673f4251c5f5e3aa86d2a6e7060d25067fad147f7bca5a7ac65610a`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 7 | 90 | 39 | 13 | 38 |
| Calibration | 4 | 47 | 28 | 5 | 14 |
| Test | 2 | 21 | 15 | 3 | 3 |

Every label passed target retrieval within Top-10, bounded execution, deterministic validation, and a case-specific outcome check for clicks. All observed text passed the dataset sensitive-text guard. A LetCode case needed a network-idle wait to avoid an occasional state change between observation and execution; it passed 20 repeated isolated validations before the successful full collection. Public pages remain externally mutable, so the digest and outcomes should be checked on every rerun.

A local Ollama model on an 8 GB GPU was tried for site and action ideation. LFM2.5 proposed unsupported actions and unverified routes; Qwen3.5:9b identified two page risks but produced no accepted case labels. The accepted cases were authored from browser inspection and validated with Playwright. A candidate page that nearly duplicated an earlier evaluated site was excluded despite having a different origin. No local-model dependency or automatic labeling path was added. The v7 test labels were first scored after the training recipe was fixed; they are now inspected and cannot serve as untouched evaluation for a tuned variant. See the [v7 frozen-head experiment](frozen-encoder-experiment.md#corpus-v7-frozen-head-experiment).
## Corpus v8 protocol (fixed before model scoring)

V8 is one bounded frozen-head iteration. It retains v7 training and validation cases, excludes every v7 test case, and adds training cases on PlayLab and XQA, validation cases on Gaurav Khurana's practice hub, and test cases on Process Practice and Snippy Lab. The two v8 test origins are reserved by `sources.ts`; no previous evaluated origin is promoted to training. New cases are authored from browser inspection and must pass deterministic execution, postconditions, and Top-10 retrieval before model fitting.

The single fitting recipe is `pnpm research train --version 8 --bias zero`: the pinned MiniLM encoder, 400 head steps, learning rate 0.5, L2 0.01, validation-only temperature and threshold. The native-select marker and adjacent unique label fallback are fixed before fitting. Public-page email addresses are replaced with `[email address]` before corpus persistence; the sensitive-text guard still rejects other credential-like content. No hyperparameter search or test-guided edit is allowed. The test set is read once after this recipe and the corpus are fixed. Score exact decisions, validated live task completion, coverage and correctness at confidence 0.9, and calibration; compare the same ten live cases with Laya. The prior two multistep sites are diagnostic only because their outcomes are already inspected. A candidate is not suitable for runtime integration if it has a wrong decision at confidence 0.9 or above, even if its task count exceeds Laya on these ten cases. Ten authored decisions across two sites cannot establish broad cross-site generalization; a no-gain or unsafe result closes this frozen-head iteration and motivates a separately designed PEFT experiment.

The 2026-09-24 collection validated all 166 cases with digest `aa9d1e4b8827547e43dfc7ab697de49d61943b9807654a91bc7b94200275595a`:

| Split | Origins | Distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 9 | 104 | 39 | 17 | 48 |
| Calibration | 5 | 52 | 29 | 5 | 18 |
| Test | 2 | 10 | 8 | 0 | 2 |

The readiness gate passed, and no training label was excluded. All ten test targets appeared in Top-10 and passed deterministic execution and validation before model fitting. These test outcomes have now been scored and must remain outside future training and calibration. The [v8 experiment](frozen-encoder-experiment.md#corpus-v8-frozen-head-iteration) reports the model comparison and the inspected multistep diagnostic.

## Corpus v9: PEFT experiment admission

Run `pnpm research collect --version 9` to recreate `artifacts/research-corpus-v9.json`. V9 retains the v8 train and validation cases, excludes the inspected v8 test cases, and adds 67 train decisions on Play QA (31) and UPEX Dojo (36), 24 validation decisions on Syntax, and 40 untouched test decisions on Automation Exercise (15), DemoBlaze (13), and ParaBank (12). Every new decision has an independent postcondition and its target appeared in the main-document Top-10 during collection. The test decisions have not been scored by a model. The [PEFT experiment protocol](peft-experiment.md) fixes the fitting and evaluation rules.

The 2026-09-24 collection validated 287/287 labels with digest `067e957e44c7d33e39f03527da2b754323ff31429d52e164921b08e9ad40914c`; the corpus reader verified its checksum and the engineering admission gate passed:

| Split | New decisions | Total distinct labels | Click | Select | Type |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 67 | 171 | 61 | 17 | 93 |
| Validation | 24 | 76 | 32 | 8 | 36 |
| Test | 40 | 40 | 8 | 0 | 32 |

Across train and validation, the persisted failure-mode tags cover 11 search-field/button conflicts, 45 duplicate or nearby labels, and 11 post-transition controls. Nine new test flows contain three steps each, with three flows per test origin. The curated reference completed all 27/27 executions in three fresh contexts per flow; 81/81 steps passed their validators and postconditions, and all 81 targets appeared in Top-10. This verifies the authored flows, not model performance.

GlobalSQA was replaced by Syntax before label authoring because its widgets use frames outside the main-document contract. Cases requiring targets outside Top-10, query-bearing URLs rejected by the privacy guard, or unsupported postconditions were excluded or revised before model scoring. These are live public pages and can change between collections. No PEFT weights have been fitted yet, and Milestone 13 remains open.
