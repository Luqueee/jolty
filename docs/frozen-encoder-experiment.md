# Frozen encoder experiment v0

Run `pnpm research train --version 0 --bias fitted` after `pnpm research collect --version 0`. The command verifies the JSON corpus digest and admission gate, loads the official MiniLM ONNX encoder at pinned revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, and produces ignored head and report files in `artifacts/`. It uses the CPU `fp32` model through `@huggingface/transformers` 3.8.1. The old model revision in Decision 0002 lacked an ONNX export, so the experiment pins this newer official revision. The encoder weights never change.

On the measured host with CUDA 13, ONNX Runtime's optional GPU postinstall probe failed. `pnpm install --frozen-lockfile --ignore-scripts` installed the pinned dependencies, and the bundled CPU binaries passed the experiment. This install workaround is specific to the measured CPU-only setup; a fresh environment should verify its own native runtime installation.

Each candidate becomes an action, role, and accessible-label sentence. The frozen encoder produces unit-length 384-dimensional embeddings for the goal and candidate sentence. The head receives their elementwise product, the normalized retrieval score, and a three-way action indicator. It is a linear listwise softmax scorer trained for 400 fixed gradient steps with L2 regularization. Only the 28 training labels update the 388 head weights. The 14 calibration labels choose one temperature from a fixed grid and a coverage threshold; the 13 test labels are read only for the final score. The artifact records the encoder revision, corpus digest, training-ID digest, hyperparameters, threshold, temperature, and weights. This is an offline research artifact, not a Jolty runtime provider or an ONNX export.

`pnpm research baseline --version 0` scores Laya on the same saved test observations in a separate process. Add `--include-codex` to add a `gpt-6-sol` reference through the signed-in ChatGPT subscription; no API key is used. Separate processes are necessary because the two Node model packages load different native ONNX Runtime versions. `pnpm research benchmark --version 0` executes the trained head on fresh live versions of the thirteen public benchmark flows. For a scoped Laya comparison, run `pnpm research public --runs 1 --policies 'Laya verbose/ranked'`. The Laya benchmark includes a warmup per flow; the frozen-head run has no per-flow warmup. Both load the model before timing each decision and apply the same deterministic task and postcondition checks.

The first run on 2026-09-23 used corpus digest `4ef7f24c4ea8fdad8c0fbb98ebaa7618cc57c49b4f36d5d11d730fa6a44707c6`:

| Measure | Frozen head | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: |
| Exact next decisions on saved test observations | 11/13 | 12/13 | 13/13 |
| Exact decisions on fresh live flows | 9/13 | 12/13 | — |
| Deterministically completed live tasks | 9/13 | 12/13 | — |
| Live decision latency p50 / p95 | 8.0 / 12.4 ms | 158.3 / 176.5 ms | — |

The frozen head matched 24/28 training decisions and 14/14 calibration decisions. Calibration selected temperature 0.25 and a zero abstention threshold because every calibration prediction was correct. Its top-choice correctness Brier score on test was 0.146. In the ten test predictions above 0.9 confidence, nine were correct, versus mean confidence 0.982; two live TodoMVC mistakes had confidence above 0.99. The head's live Node process reached 467 MiB RSS. The recorded decision times exclude model load and page navigation, and each live flow was measured once. The latency numbers do not establish a stable speed ratio or throughput. The saved-observation teacher result excludes browser execution and has Codex CLI overhead.

The live head failed the Completed and Active TodoMVC filters, the Backpack-specific Add action, and Selenium form submission. The first two selected a text field with high confidence; the latter two selected a different candidate. Laya missed the Internet dropdown in its live run. No head weights, feature rules, or thresholds were changed after reading test outcomes. The current candidate does not beat Laya on these reserved flows, and its confidence is unsafe for unattended execution. Keep it out of the browser hot path. More independent training and calibration sites, especially diverse button and filter actions, are needed before a new experiment; previously inspected test flows cannot serve as an untouched evaluation for a revised candidate. No PEFT, partial fine-tuning, full fine-tuning, or ONNX head export is justified by this result.

## Revised corpus v1

Run `pnpm research collect --version 1` and then `pnpm research train --version 1 --bias fitted`. The latter uses the same encoder revision, feature construction, 400 training steps, learning rate, L2 penalty, temperature grid, and threshold rule as v0. The training set grows from 28 to 35 distinct labels and includes seven new QA Practice Hub clicks. Calibration grows from 14 to 22 labels across two origins. The eleven test decisions come only from QA Practice and the HTTPS UI Testing Playground installation; the four v0 test origins are absent. No v1 model setting was chosen using the earlier test mistakes.

`pnpm research baseline --version 1` evaluates saved v1 observations. Add `--include-codex` for the ChatGPT subscription reference. `pnpm research benchmark --version 1` executes the candidate on fresh pages. For Laya on those same flows, run `pnpm research public --version 1 --runs 1 --policies 'Laya verbose/ranked'`. Model loading and page setup remain outside decision timing. Laya has one warmup per flow; the frozen-head benchmark does not.

The 2026-09-23 v1 run used corpus digest `9a3226fbd80e73873a9aea6d3a29738e728b6c5dddefba81acef173d2de82933`:

| Measure | Frozen head | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: |
| Exact next decisions on saved test observations | 7/11 | 6/11 | 10/11 |
| Exact decisions on fresh live flows | 7/11 | 6/11 | — |
| Deterministically completed live tasks | 7/11 | 6/11 | — |
| Live decision latency p50 / p95 | 8.3 / 16.4 ms | 198.7 / 246.0 ms | — |

The head matched 31/35 training and 22/22 calibration decisions. Calibration again selected temperature 0.25 and zero abstention threshold. Its test top-choice correctness Brier score was 0.275; among nine test choices above 0.9 confidence, seven were correct despite mean confidence 0.998. The live Node process reached 454 MiB RSS. The head missed the QA Practice simple and checkbox submissions, the prepared language submission, and the button-name update on UI Testing Playground. Laya completed one fewer task on this one-run comparison. These are eleven authored one-step tasks on two practice sites, with no repeated runs for the head, no multistep recovery, and no measured throughput. The one-case difference is inconclusive, and overconfidence prevents safe autonomous execution. Do not ship this head or treat the revised test origins as untouched for a later variant.

## Corpus v2 experiment

Run `pnpm research collect --version 2`, `pnpm research train --version 2 --bias fitted`, and `pnpm research benchmark --version 2`. The encoder, feature construction, head fitting, and calibration recipe are unchanged from v0 and v1. `pnpm research baseline --version 2 --include-codex` measures Laya and the subscription-backed `gpt-6-sol` teacher on saved observations. `pnpm research public --version 2 --runs 1 --policies 'Laya verbose/ranked'` runs Laya on fresh pages. The teacher does not execute browser actions.

The 2026-09-23 run used corpus digest `d23d9fb65aad9fef1e736e8f0c9b1bebfcf29cacfe466d95a0d1089b89aeee2b`:

| Measure | Frozen head | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: |
| Exact next decisions on saved test observations | 7/10 | 6/10 | 10/10 |
| Exact decisions and completed tasks on fresh pages | 7/10 | 6/10 | — |
| Live decision latency p50 / p95 | 9.4 / 14.3 ms | 159.3 / 174.2 ms | — |

The head matched 32/36 training and 24/24 calibration decisions. Calibration selected temperature 0.25 and a zero abstention threshold again. The test top-choice correctness Brier score was 0.068. All three head errors were Test Track text, email, or search fields, with confidence 0.297–0.580; all six choices above 0.9 confidence were correct. This is a useful failure pattern, but the six examples cannot validate a high-confidence execution policy. Laya also missed those three fields and one WebDriverUniversity field. The head's live Node process peaked at 450 MiB RSS. Each flow was measured once for the head, while Laya had one warmup per flow; model loading, page setup, and candidate extraction are outside the decision timer. No throughput or multistep recovery was measured. The one-task lead over Laya is inconclusive, so the head remains a research artifact outside the runtime. Further tuning requires new test origins.

## Fixed-head abstention probe on v3

The v2 head and its temperature remain unchanged. The v2 calibration split selected zero abstention because it contained no head errors. After inspecting v2 outcomes and before scoring v3, a **0.9 confidence threshold** was fixed as a diagnostic policy. The v3 split uses two new origins and ten validated one-step decisions. `pnpm research collect --version 3` records the labels; `pnpm research benchmark --version 3 --head-version 2` runs the unchanged v2 head on fresh v3 pages and records both its ordinary execution and counterfactual coverage at 0.9. `pnpm research public --version 3 --runs 1 --policies 'Laya verbose/ranked'` measures Laya on the same flows. `pnpm research baseline --version 3 --include-codex` compares saved observations with Laya and the ChatGPT subscription teacher. No fallback action is executed in this probe.

| Measure | Frozen v2 head | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: |
| Exact next decisions on saved v3 observations | — | 9/10 | 10/10 |
| Exact decisions on fresh pages | 7/10 | 9/10 | — |
| Deterministically completed live tasks | 7/10 | 9/10 | — |
| Live decision latency p50 / p95 | 8.1 / 13.8 ms | 180.2 / 201.5 ms | — |

At threshold 0.9, the head would cover **6/10 decisions**, but only **4/6 covered decisions** were correct. Its incorrect Read Value and Clear decisions on QA Playground had confidence 0.9995 and 0.9989; the third error, a Lastest button click, had confidence 0.179. A correct movie-name decision initially failed task completion because the authored step named the field by its placeholder instead of its accessible name. The step metadata was corrected and live execution rerun; the selected decision was unchanged. The final head run's live process reached roughly 474 MiB RSS. Each head flow had one measured run; Laya had one warmup per flow. Timings exclude browser setup and model load, and no throughput or multistep recovery was measured. The high-confidence errors directly reject the proposed 0.9 autonomous-execution gate on these new sites. The head remains outside the runtime. More small-site variants or PEFT experiments should only proceed with a larger, more varied training and calibration set and another reserved evaluation set.

## Corpus v4 experiment

Run `pnpm research collect --version 4`, `pnpm research train --version 4 --bias fitted`, and `pnpm research benchmark --version 4`. The encoder, features, fitting procedure, and calibration rule are unchanged. `pnpm research baseline --version 4 --include-codex` scores saved observations with Laya and the subscription-backed `gpt-6-sol` teacher. `pnpm research public --version 4 --runs 1 --policies 'Laya verbose/ranked'` runs Laya on fresh pages. The teacher does not execute actions.

The 2026-09-24 run used corpus digest `bc300fd8f944dc5addf8be40c0c025cedba1e28c12d93bce33166716231de3fb`:

| Measure | Frozen v4 head | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: |
| Exact next decisions on saved test observations | 8/10 | 8/10 | 10/10 |
| Exact decisions and completed tasks on fresh pages | 8/10 | 8/10 | — |
| Live decision latency p50 / p95 | 11.0 / 22.4 ms | 251.6 / 313.2 ms | — |

The head matched 36/40 training and 24/26 calibration decisions. Calibration selected temperature 0.5 and threshold 0.733669 from validation only; it would cover 23/26 validation decisions, all correct. On the untouched test split, it covered 9/10 but only 7/9 covered decisions were correct. Test top-choice Brier score was 0.198. The two failures were the success and error notification buttons on QA Automation Labs: the head chose a `type` action on another candidate with confidence 0.9748 and 0.9750. These high-confidence errors defeat both the learned threshold and the separate 0.9 diagnostic threshold. The live head process reached 459 MiB RSS. Each head flow had one measured run; Laya had one warmup per flow. Model loading and page setup are excluded from decision timing, and no throughput or multistep recovery was measured. The 8/10 tie does not establish value over Laya. The head stays outside the runtime; further work needs broader click-oriented training and calibration cases and new independent test origins before any architecture or tuning decision is claimed effective.

## Corpus v5 action-bias ablation

The v4 failures exposed a candidate-count imbalance: the 40 training observations contained 302 clickable options and 95 writable options, while their correct labels were 18 clicks and 19 types. The v4 head learned a global click intercept of -2.013 and type intercept of +1.021; on the two notification errors it chose a Search field with retrieval score zero over the correct button with score eight. This is evidence of a global action bias in this small head, not proof that candidate count alone caused it.

The v5 comparison predeclared two heads on the same collected corpus. `pnpm research train --version 5 --bias zero` freezes the three global action-intercept weights at zero while fitting the other 385 weights with the unchanged objective. `pnpm research train --version 5 --bias fitted --output artifacts/frozen-encoder-v5-biased.json` fits all 388 weights as before. Both retain action words in candidate text, choose temperature and threshold from validation only, and use the same pinned encoder. The artifact records `fit_action_bias`; earlier experiments fitted it by default. `pnpm research benchmark --version 5` and `pnpm research benchmark --version 5 --bias fitted` run the respective heads on fresh pages. `pnpm research baseline --version 5 --include-codex` evaluates saved observations with Laya and the subscription-backed `gpt-6-sol` teacher. `pnpm research public --version 5 --runs 1 --policies 'Laya verbose/ranked'` executes Laya on the same flows.

The 2026-09-24 collection used digest `efc5434ea213a6eb8b35ef9487b463be12a92208a56ac148643d84f72131a1fd`:

| Measure | Zero action intercept | Fitted action intercept | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: | ---: |
| Exact next decisions on saved test observations | 9/10 | 8/10 | 8/10 | 9/10 |
| Exact decisions and completed tasks on fresh pages | 9/10 | 8/10 | 8/10 | — |
| Validation correct / total | 24/27 | 24/27 | — | — |
| Validation-selected threshold coverage on test | 8/10, all correct | 6/10, all correct | — | — |
| Live decision latency p50 / p95 | 9.8 / 12.8 ms | 9.0 / 12.4 ms | 204.2 / 380.2 ms | — |

The zero-intercept head matched 35/41 training labels, selected temperature 0.25 and threshold 0.913879, and had test Brier score 0.087. The fitted-intercept head matched 37/41 training labels, selected temperature 0.5 and threshold 0.734952, and had test Brier score 0.154. The zero-intercept head corrected the fitted head's mistaken `select` action on an Automation Bible radio control. Both heads chose the Small modal trigger when asked to close its dialog, so both failed that task. Laya missed that task and the DemoQA Click Me task. The teacher's saved-observation result is exact-label scoring only; it does not validate browser execution. The live head processes reached about 443 and 445 MiB RSS, respectively. Each head flow had one measured run; Laya had one warmup per flow. Decision timings exclude page setup and model load; no throughput or multistep recovery was measured. This one-case improvement on ten authored tasks is encouraging but inconclusive. The research head remains outside the runtime, and the Milestone 13 exit criterion remains open.

## Fixed v5 heads on v6 and multistep flows

`pnpm research collect --version 6` produced twenty validated held-out labels on two new origins with digest `e24a663a7ca581e87fece887b434c2ae6c8c9b39ecb118c59f1586377dc9c604`. The v5 zero-intercept and fitted-intercept artifacts, encoder revision, temperatures, and thresholds were frozen before this collection. `pnpm research benchmark --version 6 --head-version 5` and `pnpm research benchmark --version 6 --head-version 5 --bias fitted` use those v5 artifacts on the new live cases; neither fits on v6. `pnpm research public --version 6 --runs 1 --policies 'Laya verbose/ranked'` measures Laya with a warmup per flow. `pnpm research baseline --version 6 --include-codex` scores saved observations with Laya and the subscription-backed `gpt-6-sol` teacher, without an API key or browser execution by the teacher.

| Measure | Frozen zero intercept | Frozen fitted intercept | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: | ---: |
| Exact decisions and completed tasks on fresh pages | 17/20 | 17/20 | 18/20 | — |
| Exact decisions on saved observations | — | — | 17/20 | 18/20 |
| V5 validation threshold coverage, correct | 13/20, 13 | 12/20, 11 | — | — |
| Live decision latency p50 / p95 | 9.5 / 16.0 ms | 10.4 / 15.1 ms | 167.8 / 225.9 ms | — |

The zero-intercept head missed the country dropdown and two Sreenidhi fields. The fitted-intercept head also missed the country dropdown and the name field, plus the Change Text button. Laya missed a native fruit selection and the name field. The zero-intercept threshold admitted no error among thirteen cases, but this sample is too small to validate a safe execution gate; the fitted-intercept validation threshold admitted one error. Live head processes reached about 445 MiB RSS; model load and navigation are excluded from decision timing. The one-step scores each use one measured run, so the one-task difference is inconclusive.

`pnpm research multistep --policy reference`, `pnpm research multistep --policy zero`, `pnpm research multistep --policy biased`, and `pnpm research multistep --policy laya` execute two three-step public-page flows, each with one warmup and three measured runs. The reference uses curated correct decisions through the same executor and validator. It completed 6/6 measured tasks and validated 18/18 steps. All three model policies completed 3/6 tasks, with 9/12 attempted decisions correct and 9/12 attempted steps validated. Each solved the StepCampus tab and keyboard flow, then failed on the first Sreenidhi form field by selecting another text input; later form steps were therefore not attempted. All policies had Top-10 target recall at every attempted step. These two authored flows are a diagnostic probe, not a representative throughput or recovery measurement. No head is deployed, and Milestone 13 remains open.

## Corpus v7 frozen-head experiment

The v7 corpus digest is `00ea9701e673f4251c5f5e3aa86d2a6e7060d25067fad147f7bca5a7ac65610a`. Before fitting, the existing encoder action mapping rejected one training label: `kodeit-fruit-orange` is a native multiple select projected as `listbox`, while this head maps `listbox` candidates to `click`. The corpus retains its validated label; the trainer now records the excluded training ID in the head and report, and refuses to exclude any validation or test label. Thus 89 of 90 training labels enter fitting. No test label or result was used to select this rule or change the model after the test was scored.

Run `pnpm research train --version 7 --bias zero`, `pnpm research baseline --version 7 --include-codex`, `pnpm research benchmark --version 7`, and `pnpm research public --version 7 --runs 1 --policies 'Laya verbose/ranked'` to reproduce the four stages. The fitted artifact remains ignored under `artifacts/`; the encoder revision, 400 fitting steps, and zero global action intercept follow the earlier v5 recipe. The subscription-backed `gpt-6-sol` reference scores saved observations only and does not execute browser actions.

| Measure | Frozen v7 head | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: |
| Exact decisions on saved test observations | 20/21 | 16/21 | 21/21 |
| Exact decisions on fresh pages | 20/21 | 16/21 | — |
| Deterministically completed fresh one-step tasks | 19/21 | 15/21 | — |
| Live decision latency p50 / p95 | 8.85 / 14.33 ms | 159.4 / 182.6 ms | — |

The head matched 69/89 training labels and 44/47 validation labels. Validation selected temperature 0.25 and threshold 0.916915, covering 36/47 validation decisions with all covered decisions correct. On the held-out observations, it covered 17/21 but only 16 covered decisions were correct; its Brier score was 0.0573. It selected the wrong control for LearnAQA's Create Shadow case with confidence 0.998595, so neither the selected threshold nor a 0.9 diagnostic threshold is safe for unattended execution. On fresh pages, the same decision failed. The head selected the correct target for Keyboard Search but the action failed, making task completion 19/21 rather than 20/21. Laya also had action or validation failures on fresh pages, including cases with correct selected targets.

All 21 targets appeared in Laya's retrieved Top-10 on the fresh pages. The live head process peaked at 466,251,776 bytes RSS. Each head flow had one measured run without per-flow warmup; Laya had one warmup and one measured run per flow. Both runs used Node 25.9.0 and Chromium 153.0.8010.12. Decision timings exclude model load and page setup, and the teacher's saved-observation decision p50 was 4.11 seconds including Codex CLI overhead. These authored one-step flows on two public sites do not establish a stable general-site gain, calibrated fast-path coverage, throughput, or multistep recovery. The test cases are now inspected and cannot be reused as untouched evaluation for further tuning. The head remains outside the runtime and Milestone 13 remains open.

## V7 head on two new multistep sites

The fixed v7 zero-intercept head was tested without fitting or calibration changes on two further origins absent from every research corpus: [Test Automation TV's product catalog](https://demo.testautomationtv.com/products) and [Software Testing Mentor's form validation page](https://practice.softwaretestingmentor.com/form-validation). The catalog flow types a product query, searches, then adds the named product to the cart. The form flow types two fields, selects a priority, then resets the form without submitting it. Goals, target selectors, values, step checks, and final postconditions were authored before model scoring. The curated reference completed both flows and validated all seven steps; every labeled target appeared in the retrieved Top-10.

Run `pnpm research multistep --suite heldout --policy reference --runs 3`, then the same command with `--policy zero` or `--policy laya`. Each policy gets one warmup and three measured runs per flow in fresh Chromium contexts. The zero policy loads the frozen v7 head; the older v6 suite continues to load the v5 head.

| Measure across measured runs | Curated reference | Frozen v7 head | Laya |
| --- | ---: | ---: | ---: |
| Completed tasks | 6/6 | 3/6 | 0/6 |
| Exact decisions / attempted | 21/21 | 12/15 | 3/9 |
| Validated steps / attempted | 21/21 | 12/15 | 3/9 |
| Target recall in Top-10 / attempted | 21/21 | 15/15 | 9/9 |
| Decision latency p50 / p95 | — | 8.79 / 16.02 ms | 172.01 / 194.58 ms |

The v7 head completed all three form runs. It failed the catalog's first step in every run by clicking Search instead of typing in the search box, with confidence 0.8911. Laya failed the same first step by clicking another control with confidence 1.0; on the form it entered the first field correctly, then chose that field again for the second step with confidence about 0.9998. Later steps were not attempted after each failure, so the step-accuracy denominators differ. The head process peaked at 490,852,352 bytes RSS and the Laya process at 1,869,615,104 bytes RSS; these figures include separate model runtimes and are not isolated model-memory measurements. Model loading and page setup are outside decision timing.

The head's catalog error falls below its v7 validation-selected threshold of 0.916915, but this benchmark executes every decision and does not test fallback. These six repeated tasks cover only two authored flows and cannot establish representative throughput, a calibrated autonomous policy, or broad cross-site value. Both new origins are now inspected evaluation sites, and the head remains outside the runtime.
