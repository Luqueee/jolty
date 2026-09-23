# Candidate retrieval v0

`retrieveCandidates(goal, candidates, topK)` in `packages/retrieval/src/candidate-retrieval.ts` ranks the filtered `InteractiveElement` list against a goal. It uses deterministic lexical scoring and no model or embedding service. The default Top-K is 10; invalid values fail with `RangeError`.

Each `RankedCandidate` retains the original element ID, a score, the source index, and a breakdown of scoring signals. The result includes the full ranked list for inspection, the requested Top-K, input/output counts, and `candidate_retrieval_ms`. Equal scores preserve input order. Scores are heuristic ranking values, not probabilities or calibrated confidence.

Signals include exact name or visible-text match, case/diacritic-normalized match, phrase match against the accessible name or visible text, keyword overlap, simple action-to-role compatibility, and a small editable/selected-state adjustment. Common English function words are ignored for overlap. Interaction history is not used because the current runtime does not produce one. Retrieval only ranks current candidates; it does not decide or execute a browser action.

The [evaluation cases](../packages/retrieval/eval/cases.ts) identify ground-truth targets in 17 initial states drawn from the 15 [controlled fixtures](fixtures.md). Run `pnpm run benchmark:retrieval` to report Recall@1, Recall@5, Recall@10, target rank per case, and p50/p95/p99 retrieval latency. The expanded controlled run found the target at rank 1 in 14/17 cases and within Top-5 and Top-10 in 17/17. Browser startup, navigation, extraction, and filtering are excluded from the reported retrieval latency. This is a controlled baseline, not evidence of real-site retrieval quality.

The duplicate-label and approved-row cases remain ambiguous: the respective buttons have the same role, name, and text in BrowserState v0. Their parent context is absent, so a lexical ranker cannot reliably choose the intended button at rank 1. Both remain in Top-K. Future browser-state context may address this if evaluation shows the extra data is worthwhile.
