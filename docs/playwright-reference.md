# Deterministic Playwright reference

Run `pnpm run benchmark:playwright` to measure human-written Playwright flows against every scenario in the [fixture manifest](../packages/browser/fixtures/scenarios.ts). Each flow follows the scenario's declared actions and finishes only when its exact expected outcome is visible. A failure makes the command exit with a nonzero status.

The benchmark launches one Chromium browser, then uses a fresh page and locally routed fixture for each run. It executes one warmup and 20 measured runs per scenario, serially. Each duration starts immediately before navigation and ends when the expected outcome becomes visible. Browser launch, page creation, and route installation are excluded. The delayed fixtures use real browser timers. The JSON output records Node and Chromium versions, success and failure counts, and p50/p95/p99 task durations for each scenario.

These controlled fixtures provide an execution reference for later comparisons on the same tasks. The measurements include browser navigation and action time but no natural-language planning, model inference, or Jolty decision loop. Do not interpret them as real-site performance or as evidence that an intelligent runner is faster or slower. Compare task success and timing under the same environment and timing scope when the other baselines exist.

On 2026-09-23, Node.js 25.9.0 and Chromium 153.0.8010.12 completed all 300 measured runs across 15 scenarios. Per-scenario p50 duration ranged from 15.6 ms (`select`) to 219.8 ms (`dynamic-results`); `delayed` was 219.7 ms. These are observations from one local run, not stable performance claims.
