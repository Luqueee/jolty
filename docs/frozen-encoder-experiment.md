# Frozen encoder experiment v0

Run `pnpm run research:train-frozen` after `pnpm run research:collect`. The command verifies the JSON corpus digest and admission gate, loads the official MiniLM ONNX encoder at pinned revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, and produces ignored head and report files in `artifacts/`. It uses the CPU `fp32` model through `@huggingface/transformers` 3.8.1. The old model revision in Decision 0002 lacked an ONNX export, so the experiment pins this newer official revision. The encoder weights never change.

On the measured host with CUDA 13, ONNX Runtime's optional GPU postinstall probe failed. `pnpm install --frozen-lockfile --ignore-scripts` installed the pinned dependencies, and the bundled CPU binaries passed the experiment. This install workaround is specific to the measured CPU-only setup; a fresh environment should verify its own native runtime installation.

Each candidate becomes an action, role, and accessible-label sentence. The frozen encoder produces unit-length 384-dimensional embeddings for the goal and candidate sentence. The head receives their elementwise product, the normalized retrieval score, and a three-way action indicator. It is a linear listwise softmax scorer trained for 400 fixed gradient steps with L2 regularization. Only the 28 training labels update the 388 head weights. The 14 calibration labels choose one temperature from a fixed grid and a coverage threshold; the 13 test labels are read only for the final score. The artifact records the encoder revision, corpus digest, training-ID digest, hyperparameters, threshold, temperature, and weights. This is an offline research artifact, not a Jolty runtime provider or an ONNX export.

`pnpm run research:baseline-laya` scores Laya on the same saved test observations in a separate process. Set `JOLTY_RESEARCH_INCLUDE_CODEX=1` to add a `gpt-6-sol` reference through the signed-in ChatGPT subscription; no API key is used. Separate processes are necessary because the two Node model packages load different native ONNX Runtime versions. `pnpm run research:benchmark-frozen` executes the trained head on fresh live versions of the thirteen public benchmark flows. For a scoped Laya comparison, run `JOLTY_PUBLIC_RUNS=1 JOLTY_PUBLIC_POLICIES='Laya verbose/ranked' pnpm run benchmark:public`. The Laya benchmark includes a warmup per flow; the frozen-head run has no per-flow warmup. Both load the model before timing each decision and apply the same deterministic task and postcondition checks.

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

Run `pnpm run research:collect-v1` and then `pnpm run research:train-frozen-v1`. The latter uses the same encoder revision, feature construction, 400 training steps, learning rate, L2 penalty, temperature grid, and threshold rule as v0. The training set grows from 28 to 35 distinct labels and includes seven new QA Practice Hub clicks. Calibration grows from 14 to 22 labels across two origins. The eleven test decisions come only from QA Practice and the HTTPS UI Testing Playground installation; the four v0 test origins are absent. No v1 model setting was chosen using the earlier test mistakes.

`pnpm run research:baseline-laya-v1` evaluates saved v1 observations. Set `JOLTY_RESEARCH_INCLUDE_CODEX=1` for the ChatGPT subscription reference. `pnpm run research:benchmark-frozen-v1` executes the candidate on fresh pages. For Laya on those same flows, run `JOLTY_PUBLIC_CORPUS_VERSION=1 JOLTY_PUBLIC_RUNS=1 JOLTY_PUBLIC_POLICIES='Laya verbose/ranked' pnpm run benchmark:public`. Model loading and page setup remain outside decision timing. Laya has one warmup per flow; the frozen-head benchmark does not.

The 2026-09-23 v1 run used corpus digest `9a3226fbd80e73873a9aea6d3a29738e728b6c5dddefba81acef173d2de82933`:

| Measure | Frozen head | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: |
| Exact next decisions on saved test observations | 7/11 | 6/11 | 10/11 |
| Exact decisions on fresh live flows | 7/11 | 6/11 | — |
| Deterministically completed live tasks | 7/11 | 6/11 | — |
| Live decision latency p50 / p95 | 8.3 / 16.4 ms | 198.7 / 246.0 ms | — |

The head matched 31/35 training and 22/22 calibration decisions. Calibration again selected temperature 0.25 and zero abstention threshold. Its test top-choice correctness Brier score was 0.275; among nine test choices above 0.9 confidence, seven were correct despite mean confidence 0.998. The live Node process reached 454 MiB RSS. The head missed the QA Practice simple and checkbox submissions, the prepared language submission, and the button-name update on UI Testing Playground. Laya completed one fewer task on this one-run comparison. These are eleven authored one-step tasks on two practice sites, with no repeated runs for the head, no multistep recovery, and no measured throughput. The one-case difference is inconclusive, and overconfidence prevents safe autonomous execution. Do not ship this head or treat the revised test origins as untouched for a later variant.

## Corpus v2 experiment

Run `pnpm run research:collect-v2`, `pnpm run research:train-frozen-v2`, and `pnpm run research:benchmark-frozen-v2`. The encoder, feature construction, head fitting, and calibration recipe are unchanged from v0 and v1. `JOLTY_RESEARCH_INCLUDE_CODEX=1 pnpm run research:baseline-laya-v2` measures Laya and the subscription-backed `gpt-6-sol` teacher on saved observations. `JOLTY_PUBLIC_CORPUS_VERSION=2 JOLTY_PUBLIC_RUNS=1 JOLTY_PUBLIC_POLICIES='Laya verbose/ranked' pnpm run benchmark:public` runs Laya on fresh pages. The teacher does not execute browser actions.

The 2026-09-23 run used corpus digest `d23d9fb65aad9fef1e736e8f0c9b1bebfcf29cacfe466d95a0d1089b89aeee2b`:

| Measure | Frozen head | Laya | ChatGPT subscription reference |
| --- | ---: | ---: | ---: |
| Exact next decisions on saved test observations | 7/10 | 6/10 | 10/10 |
| Exact decisions and completed tasks on fresh pages | 7/10 | 6/10 | — |
| Live decision latency p50 / p95 | 9.4 / 14.3 ms | 159.3 / 174.2 ms | — |

The head matched 32/36 training and 24/24 calibration decisions. Calibration selected temperature 0.25 and a zero abstention threshold again. The test top-choice correctness Brier score was 0.068. All three head errors were Test Track text, email, or search fields, with confidence 0.297–0.580; all six choices above 0.9 confidence were correct. This is a useful failure pattern, but the six examples cannot validate a high-confidence execution policy. Laya also missed those three fields and one WebDriverUniversity field. The head's live Node process peaked at 450 MiB RSS. Each flow was measured once for the head, while Laya had one warmup per flow; model loading, page setup, and candidate extraction are outside the decision timer. No throughput or multistep recovery was measured. The one-task lead over Laya is inconclusive, so the head remains a research artifact outside the runtime. Further tuning requires new test origins.
