# Kena dashboard flow benchmark

This Milestone 13 probe uses the Kena dashboard source at `~/kena-workspace/webs/dash.kena.bot` and its `KENA_TEST_MODE` fake adapters. It **does not access production accounts** at `https://dash.kena.bot`. The public production sign-in page exposes one Discord OAuth button, so the local fake-adapter server provides the reproducible authenticated navigation flows. Kena is treated as a held-out application, separate from Jolty's authored browser fixtures. This benchmark stores aggregate outcomes only; it does not export Kena browser state or test-account data to the training dataset.

Start `pnpm dev:test` in the Kena dashboard checkout, then run `pnpm run benchmark:kena` in Jolty. The benchmark accepts only an HTTP localhost URL (`JOLTY_KENA_TEST_URL`, default `http://localhost:3012`). `JOLTY_KENA_RUNS` controls measured repetitions; each policy also gets one warmup per flow. `JOLTY_INCLUDE_CODEX=1` adds the signed-in ChatGPT subscription reference using `gpt-6-sol`, without an API key. Run policies serially. The benchmark resets Kena's fake guild before every task, waits for React hydration, and resolves a target oracle from each extracted browser state before asking the policy. Oracle work and page setup are outside reported decision latency. The seven one-step flows comprise five exact-URL sidebar navigations, a settings-prefix edit checked by input value, and opening the language menu checked by the appearance of the English option. A Custom bots probe was excluded because navigation did not complete reliably even with a manually selected correct link in this local checkout.

On 2026-09-23, with three measured runs per local policy and one warmup each:

| Policy | Exact selected link | Validated task completion | Retrieved target in Top-10 |
| --- | ---: | ---: | ---: |
| Retrieved Top-1 heuristic | 15/15 | 15/15 | 15/15 |
| Laya | 12/15 | 12/15 | 15/15 |

Laya selected the wrong action for Staff in all three measured runs. Its per-flow decision latency p50 ranged from 184 to 225 ms in this run. The heuristic's measured decision function is much smaller, but this report does not measure comparable end-to-end task latency or memory. These are five similar sidebar navigations in one application, so the 15 observations are repetitions of five cases, not 15 independent UI designs.

A separate one-measured-run comparison on the same five flows found the ChatGPT subscription reference correct and successful on **5/5**, while Laya was **4/5** and the heuristic **5/5**. The reference's individual decision latencies were roughly 4.0–6.0 seconds, including Codex CLI overhead. One run does not support latency tail or reliability claims. The reports are generated locally under ignored `artifacts/m13-kena-*.json` paths.

The first attempt exposed a validator race: Kena's client-side navigation could commit after Playwright's click returned, so an immediate URL comparison produced false failures even when the action and target were correct. The `url_changed` check now waits up to 1.5 seconds for the expected URL. The four retained flows that had failed this way then validated in all three measured runs per policy. The wait is part of validation latency, not model decision latency.

An expanded run on 2026-09-23 added the settings-prefix `type` flow and the language-menu `click` flow. With three measured runs each, candidate retrieval found the labeled target in the Top-10 for all 21 decisions per policy. The heuristic completed 18/21 (five navigation flows plus the prefix edit); Laya completed 12/21 (four navigation flows). Neither completed the language-menu flow. The heuristic chose `select` for Kena's Radix combobox, which Jolty's executor permits only on a native `<select>`; Laya did not select the expected `click` decision. A manual Playwright click on the combobox revealed the English option, so the intended action and check are feasible. These are repeated observations of seven cases on one site, not independent UI designs. The earlier five-flow ChatGPT subscription comparison remains the only measured reference result; it has not been rerun on the expanded set.

A follow-up run on the same date corrected action construction: only native `<select>` controls now receive `select`; custom comboboxes and options receive `click`. With three measured repetitions per flow, the heuristic completed **21/21**, including **3/3** language-menu openings; Laya remained at **12/21** and still did not select the expected click on that flow. The action-contract failure is resolved, while Laya's remaining errors concern candidate selection on these cases. The earlier measurements above are retained as the before state, not a current result.

Further candidates from Kena's E2E suite:

| Flow | Steps | Deterministic outcome | Status |
| --- | --- | --- | --- |
| Toggle music message retention | Click the switch; save | Checked state and persisted setting after reload | Manually probed; Jolty's validator does not yet check switch state. |
| Search a member | Open settings access tab; open user picker; type a query | Seeded Test Member becomes visible | Specified by Kena E2E; needs a multistep Jolty task and local replay. |
| Handle unsaved changes | Toggle music setting; navigate to Greeter; stay or discard | Dialog appears, then URL and dirty form match the selected branch | Specified by Kena E2E; needs multistep branching and local replay. |
| Add a music prefix | Type in token editor; commit the token | Added prefix chip is visible | A direct `fill("!")` left the textbox empty in a manual probe; the one-step input-value check is unsuitable. |
| Choose a dashboard language | Open Radix combobox; click an option | Selected language changes | Menu opening is benchmarked with a supported click; option selection needs a multistep task and a suitable outcome check. |

Kena adds one genuinely different application for evaluation, including `click` and `type` labels, but the [dataset readiness gate](research-readiness.md) still fails: train, calibration, action coverage, and independent test-site breadth remain inadequate for a frozen-encoder experiment. Keep these Kena flows out of training if they serve as the held-out application.
