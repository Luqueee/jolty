# Milestone 13: value-aware browser Laya follow-up

The first blind comparison remains diagnostic evidence only. Its 72 opened observations, labels, serializer, and scores are excluded from development and calibration. The v9 test split remains sealed. Browser Laya v10s is not eligible to replace MiniLM: the first comparison admitted three wrong decisions among 23 accepted decisions.

## Development check and validation freeze

The browser extractor already records a native select's selected option text. The first research projection dropped it. The [v2 projection](../apps/cli/src/research/browser-laya-v2-projection.ts) retains `current_value`; the [v2 serializer](../research/laya_browser/serialize_v2.py) puts it in the select candidate description and rejects a missing value. A local inventory development state changed from `Amber` to `Indigo`; retrieval retained the select in Top 10, the reference action passed its independent page assertion, and pinned v10s received `[1] Color (combobox, current value: Indigo)` in its inference request (304 input tokens). This checks delivery, not decision quality.

Nine v9 **validation** observations with native-select candidates were recaptured from four development origins, and all nine reference actions passed validation. The other 67 validation rows had no native-select candidates and were retained from the sealed train/validation projection. No test rows entered the merged validation input. The v2 scorer returned 64/76 exact decisions, unchanged winning choices, and the calibration rule selected temperature 1 and threshold 0.9791, with 5/5 accepted decisions correct on validation. The small accepted count gives no reliable 99% safety claim. The [freeze record](../research/laya_browser/v2-validation-freeze.json) pins source and artifact hashes; any change requires a new version and a new independent test.

The validation input mixes older captures with nine fresh browser states, so site drift remains a limitation. No model was trained, no runtime fast path was changed, and the opened blind decisions were not rescored.

## Next independent evaluation

Reserve six new site origins across at least three independently implemented template families, with reproducible initial states, reference flows, and outcome validators that do not use model outputs. Record provenance and v10s exposure per origin. Newly authored environments can establish post-checkpoint provenance; public origins without the effective v10s training manifest retain `unknown` exposure. Freeze cases and manifest only after reference replay passes. Score all fast candidates once on the same states and Top 10 candidates. Report retrieval Recall@10 separately from action-and-target accuracy, accepted wrong decisions, and model-driven live flow completion with controlled fallback. Measure full pipeline p50/p95/p99 and incremental RSS on specified hardware, batch size, and CPU/GPU settings before a deployment decision.

The [second blind manifest](../research/blind_sites_v2/manifest.json) was frozen before scoring. Six locally authored origins cover catalog, booking, and support layouts. Each flow ran from a fresh browser context; all 17 reference actions passed their page-outcome validators, and all 17 targets were in the retrieved Top 10. The source pages, case definitions, reference runner, and validation freeze are pinned by SHA-256. Local source provenance rules out exact-site inclusion in the earlier v10s training; overlap with broader template patterns is unknown. This is a small diagnostic set, not sufficient for a safety or 99% precision claim. The first blind set cannot serve as its calibration or test input.

## Second blind diagnostic result

The second blind set was subsequently opened once under the [frozen comparison plan](../research/blind_sites_v2/comparison-plan.json). The [evidence record](../research/blind_sites_v2/comparison-evidence.json) pins separate unlabeled observations and labels, scorer outputs, the comparison report, and the runtime incident. The 17 decisions are reference-trajectory snapshots, not model-driven browser executions. Recall@10 was 17/17 by case admission and does not estimate retrieval reliability outside these fixtures.

| Candidate | Exact decisions | Accepted correct / wrong | Unscorable | Reference flows completed entirely by accepted local decisions |
| --- | ---: | ---: | ---: | ---: |
| Top-1 heuristic | 13/17 | 4 / 0 | 0 | 0/6 |
| Original Laya | 13/17 | 0 / 0 | 1 | 0/6 |
| Browser Laya v10s | unavailable | unavailable | 1; 16 scores lost | unavailable |
| Frozen MiniLM v9 | 14/17 | 6 / 2 | 0 | 0/6 |
| MiniLM LoRA v9 | 14/17 | 6 / 2 | 0 | 0/6 |
| Large-model teacher, diagnostic | 12/17 | no abstention policy | 0 | not a fast-path candidate |

Both MiniLM variants confidently chose the already selected combobox instead of the adjacent apply/show button on the two catalog sites. Their accepted wrong decisions were `harbor-stock:apply` and `orchard-catalog:show`, at confidence above 0.9998. This fails the predeclared zero-accepted-error screen for this diagnostic set; it does not imply that the six tasks would fail in production with fallback. No threshold was adjusted using these errors.

The pinned v10s scorer raised `RuntimeError: selected index k out of range` on the final `west-service:open` observation, where **every** question had one option. Its runtime calls `topk(2)` on an all-singleton batch. It had processed 16 earlier observations in memory but wrote no results before aborting. The first incident record incorrectly classified all 17 as structurally unscorable; the [evidence record](../research/blind_sites_v2/comparison-evidence.json) preserves that superseded record and pins the correction: one incompatible observation and 16 lost scores. Since labels had been opened, inference was not repeated. The frozen serializer and threshold were left intact. This prevents a quality comparison for v10s on this set; it is not a measured 0/17 accuracy result. A singleton-safe serializer requires development validation and a new independent test, with this opened set retained only for diagnosis.

The result adds evidence against a fast-path change. Paired full-pipeline latency, incremental RSS/VRAM, throughput, and representative model-driven live success with controlled fallback remain unmeasured for the candidates. This small local set cannot support a 99% accepted-decision precision claim or close Milestone 13.

## Development-only live fallback pilot

The [MiniLM fallback benchmark](../apps/cli/src/research/benchmark-minilm-fallback-development.ts) ran the unchanged frozen v9 head through Jolty's controlled runner on five existing development fixtures, using the fixed 0.999679 threshold and ChatGPT subscription fallback before low-confidence decisions. It used one warmup and three measured serial runs per task, a batch of one, Chromium 153.0.8010.12, Node 25.9.0, and an AMD Ryzen 7 9700X CPU. The ignored report is `artifacts/minilm-live-fallback-development.json` (SHA-256 `c621336530a8a50a27207949fce7217f349396c2f45944824a45a3106291ed42`; benchmark source SHA-256 `c48ed338a31eb7d7f73c95ed9017577599d2b617946fd3fa02fa6577c08f55ab`). No blind site or v9 test row was used.

| Development pilot | Observation |
| --- | ---: |
| Live task success with fallback | 9/15 measured runs |
| Fallback calls / attempted steps | 6/27 |
| Fast decision p50 / p95 / p99 | 3.95 / 6.13 / 8.03 ms |
| Task duration p50 / p95 / p99 | 106 / 14,938 / 14,938 ms |
| Sampled process RSS before / after encoder / highest after a task | 200 / 381 / 491 MB |

The modal, settings, and cookie-overlay tasks each passed 3/3. Dynamic-results and ambiguous-row passed 0/3; failures remained visible as `validation_failed`. The fallback was invoked on all three cookie-overlay and all three ambiguous-row runs. It cannot repair a confidently wrong action already executed, and these results do not establish reliable cross-site recovery. The sampled RSS is not a process peak or a matched incremental-model measurement. Fast decision timing combines serialization, tokenization, inference, and postprocessing; GPU VRAM, stage-separated timings, paired candidate p95, and throughput remain unmeasured. These small p95/p99 samples are descriptive only.

## Next browser Laya integration guard

The [development-only v3 guard](../research/laya_browser/singleton_guard_v3.py) abstains before inference when retrieval supplies fewer than two candidates; otherwise it retains the v2 request unchanged. All 76 validation rows have at least nine candidates, so the guard changes zero validation predictions and retains the frozen v2 temperature and threshold. The [guard freeze](../research/laya_browser/v3-guard-freeze.json) pins that scope. A new independent blind set is required to assess it. Neither opened blind set will be rescored, and this guard has not entered the runtime fast path.
