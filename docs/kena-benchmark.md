# Kena dashboard navigation benchmark

This Milestone 13 probe uses the Kena dashboard source at `~/kena-workspace/webs/dash.kena.bot` and its `KENA_TEST_MODE` fake adapters. It **does not access production accounts** at `https://dash.kena.bot`. The public production sign-in page exposes one Discord OAuth button, so the local fake-adapter server provides the reproducible authenticated navigation flows. Kena is treated as a held-out application, separate from Jolty's authored browser fixtures. This benchmark stores aggregate outcomes only; it does not export Kena browser state or test-account data to the training dataset.

Start `pnpm dev:test` in the Kena dashboard checkout, then run `pnpm run benchmark:kena` in Jolty. The benchmark accepts only an HTTP localhost URL (`JOLTY_KENA_TEST_URL`, default `http://localhost:3012`). `JOLTY_KENA_RUNS` controls measured repetitions; each policy also gets one warmup per flow. `JOLTY_INCLUDE_CODEX=1` adds the signed-in ChatGPT subscription reference using `gpt-6-sol`, without an API key. Run policies serially. The benchmark resets Kena's fake guild before every task, waits for React hydration, starts at the same fake guild home, and resolves an exact sidebar-link oracle before asking each policy. Oracle work and page setup are outside the reported decision latency. Success requires the exact final URL, checked by Jolty's deterministic validator. The five flows open Configuration, Moderation, Levels, Automations, and Staff. A Custom bots probe was excluded because navigation did not complete reliably even with a manually selected correct link in this local checkout.

On 2026-09-23, with three measured runs per local policy and one warmup each:

| Policy | Exact selected link | Validated task completion | Retrieved target in Top-10 |
| --- | ---: | ---: | ---: |
| Retrieved Top-1 heuristic | 15/15 | 15/15 | 15/15 |
| Laya | 12/15 | 12/15 | 15/15 |

Laya selected the wrong action for Staff in all three measured runs. Its per-flow decision latency p50 ranged from 184 to 225 ms in this run. The heuristic's measured decision function is much smaller, but this report does not measure comparable end-to-end task latency or memory. These are five similar sidebar navigations in one application, so the 15 observations are repetitions of five cases, not 15 independent UI designs.

A separate one-measured-run comparison on the same five flows found the ChatGPT subscription reference correct and successful on **5/5**, while Laya was **4/5** and the heuristic **5/5**. The reference's individual decision latencies were roughly 4.0–6.0 seconds, including Codex CLI overhead. One run does not support latency tail or reliability claims. The reports are generated locally under ignored `artifacts/m13-kena-*.json` paths.

The first attempt exposed a validator race: Kena's client-side navigation could commit after Playwright's click returned, so an immediate URL comparison produced false failures even when the action and target were correct. The `url_changed` check now waits up to 1.5 seconds for the expected URL. The four retained flows that had failed this way then validated in all three measured runs per policy. The wait is part of validation latency, not model decision latency.

Kena adds one genuinely different application for evaluation, but it supplies only five labeled `click` decisions. The [dataset readiness gate](research-readiness.md) still fails: train, calibration, action coverage, and independent test-site breadth remain inadequate for a frozen-encoder experiment. Keep these Kena flows out of training if they serve as the held-out application.
