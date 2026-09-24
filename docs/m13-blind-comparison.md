# Milestone 13 blind comparison: frozen compact input

The [blind manifest](../research/blind_sites/manifest.json) and [comparison plan](../research/blind_sites/comparison-plan.json) were fixed before any model read the 72 blind observations. The [evidence summary](../research/blind_sites/comparison-evidence.json) records SHA-256 digests of both frozen inputs, the ignored observation and label files, every model output, and the final report. The 40 v9 test decisions and nine v9 flows remained sealed. No weights were trained or runtime fast path changed in this comparison.

## Validation-only calibration

All policies used the same 76 v9 **validation** decisions from the train/validation-only projection. The heuristic accepts the top retrieved candidate when its score margin meets its threshold. The other candidates choose their highest-probability action and target. Temperature and the maximum-coverage threshold with zero observed accepted errors were fixed before blind capture. The MiniLM policies were fitted earlier; original Laya and browser Laya v10s were calibrated here. Browser Laya uses its pinned `v10s` format-v3 checkpoint and the declared product of operation and target probabilities over Jolty's ranked Top 10.

| Candidate | Validation exact | Correct accepted | Temperature | Threshold |
| --- | ---: | ---: | ---: | ---: |
| Top-1 retrieval heuristic | 65/76 | 38/38 | — | score margin 34 |
| Original Laya | 44/76 | 2/2 | 1 | 0.938606 |
| Browser Laya v10s | 64/76 | 5/5 | 1 | 0.979100 |
| Frozen MiniLM head v9 | 68/76 | 41/41 | 0.25 | 0.999679 |
| MiniLM LoRA v9 | 69/76 | 42/42 | 0.25 | 0.999679 |

The five scorers and the teacher passed an unlabeled validation smoke check before blind capture. The browser Laya scorer reproduced its validation probabilities exactly on two smoke rows; the LoRA scorer matched its prior validation confidence within `1.2e-7`. A preflight checked the frozen source, model, policy, and manifest hashes. One fresh Chromium context per flow then produced 72 **unlabeled** observation rows and a separate label file. All 12 curated flows and independent validators passed during capture. Every model scored the same observation file once; the teacher only scored saved observations and never controlled the browser.

## One-time blind result

An exact decision requires the expected action and target. “Accepted correct/wrong” applies the validation-fixed threshold. A reference flow counts as complete only when every one of its saved decisions is both accepted and exactly correct; this is a trace-based completion measure, **not** a model-driven live run with recovery. Target Recall@10 was 72/72 by blind-case admission and is not a population retrieval estimate.

| Candidate | Exact decisions | Accepted correct/wrong | Reference flows complete | Diagnostic model-process p95 |
| --- | ---: | ---: | ---: | ---: |
| Top-1 retrieval heuristic | 55/72 | 22/0 | 0/12 | 0.001 ms |
| Original Laya | 45/72 | 5/0 | 0/12 | 188 ms |
| Browser Laya v10s | 53/72 | 20/3 | 1/12 | 12.7 ms |
| Frozen MiniLM head v9 | 62/72 | 22/0 | 0/12 | 14.3 ms |
| MiniLM LoRA v9 | 60/72 | 22/0 | 0/12 | 3.0 ms |
| `gpt-6-sol` teacher, diagnostic only | 56/72 | No abstention policy | 6/12 | 6,704 ms |

The timing column comes from different model processes and runtime paths. It excludes the paired serialization, browser-state extraction, retrieval, validation, process RSS, and device VRAM measurements needed for a resource decision. The <25 ms decision-pipeline value is an engineering goal in `SPECS.md`; the 1 GiB incremental-RSS value is a provisional research target. Neither can be judged from this column.

The 0/12 trace-completion result for MiniLM means no reference trace was completed entirely through accepted local decisions under this threshold. It does not show that the 12 tasks would fail in a live run with controlled fallback.

| Site | Heuristic | Original Laya | Browser Laya v10s | Frozen MiniLM | MiniLM LoRA |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dispatch | 18/21 | 15/21 | 13/21 | 21/21 | 21/21 |
| Ledger | 9/14 | 11/14 | 9/14 | 10/14 | 11/14 |
| TestMuAI | 10/10 | 4/10 | 10/10 | 10/10 | 10/10 |
| H Y R Tutorials | 8/10 | 6/10 | 9/10 | 8/10 | 8/10 |
| Automation Testing UK | 9/10 | 6/10 | 8/10 | 9/10 | 9/10 |
| ScrapingCourse | 1/7 | 3/7 | 4/7 | 4/7 | 1/7 |

Browser Laya v10s made three **accepted wrong decisions**, all on the newly authored Dispatch site: `dispatch-seville:assign`, `dispatch-seville:next-assign`, and `dispatch-bilbao:assign`. Each selected the `Driver` combobox rather than the `Assign driver` button at confidence 0.9798–0.9857. The safety screen therefore rejects this policy despite one reference flow completed. MiniLM LoRA did not improve exact decisions or accepted coverage over the frozen head on this set. The zero-error accepted counts for the other policies cover at most 22 decisions and cannot support a 99% precision claim; none completes a reference flow through accepted local decisions.

## Representation limit and decision

This run tests the **frozen compact Jolty input**, not every capability of the published browser checkpoint. Jolty's extractor exposes the selected native-select text as `InteractiveElement.value`, while `hasValue` is set for editable fields and contenteditable elements. The shared research projection retained `native_select` and `has_value` but omitted the actual selected text. The browser Laya serializer therefore could not tell that a driver was already selected in the three Dispatch assignment states. Its published format expects current values in option descriptions. The missing value is a representation failure in this comparison, so the 53/72 result cannot establish the checkpoint's quality with its intended input. Do not alter the frozen serializer or score these blind cases again to repair it.

Four public sites still have **unknown** exposure to v10s training; only Dispatch and Ledger have demonstrably new source provenance. The 72 decisions include 56 distinct browser-state hashes, with repeated snapshots paired with different goals. The set detects failures but is small and imbalanced across templates. Browser-site drift remains possible even though capture passed.

**Decision:** do not replace MiniLM or change the fast path. Milestone 13 remains open. On development sites, preserve and test current values for native selects and other state needed by each model, then freeze a new independent site/template test before another one-time comparison. A later deployment decision also needs model-driven live flows, a larger site-stratified safety sample, and paired full-pipeline p95, RSS, and VRAM measurements. Keep v9 test sealed.
