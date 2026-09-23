# Candidate filtering v0

`filterCandidates(state)` in `packages/retrieval/src/candidate-filter.ts` takes a `BrowserState` and returns candidate elements with their original step IDs plus filter metrics. It has no browser or model dependency at runtime.

The filter removes elements marked invisible or disabled by BrowserState v0. It also removes clearly non-actionable roles such as headings, regions, status messages, and presentation nodes, unless an element is editable. Unknown roles and focusable generic elements remain candidates so an interactive control is not discarded merely because its role is unfamiliar. The filter does not rank elements against a goal; that belongs to candidate retrieval in a later milestone.

`CandidateFilterMetrics` reports `input_element_count`, `output_element_count`, and `candidate_filter_ms`. The elapsed time covers the filtering loop only. The output keeps document order and does not mutate the input state.

Playwright tests check that initial targets across all 12 [controlled fixtures](fixtures.md) survive, including both duplicate `Continue` buttons and a target below the initial viewport. A modal test checks its `Confirm` button after opening. A separate noisy page checks that hidden, disabled, and non-actionable controls are removed.

Run `pnpm run benchmark:filter` for a controlled 5,000-element synthetic state with 4,400 hidden controls, 450 disabled controls, 100 non-actionable headings, and 50 enabled controls. The benchmark reports p50, p95, and p99 filtering time after warmup. Its reduction and latency are not real-site measurements. Comparison with model inference remains open until a model baseline exists.
