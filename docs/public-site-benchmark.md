# Public-site one-step benchmark

Run `pnpm run benchmark:public` to compare the retrieved Top-1 heuristic with Laya's verbose/ranked, compact/ranked, verbose/reversed, and verbose/reversed plus unique-label gate presentations. `JOLTY_PUBLIC_RUNS` controls measured repetitions (default three). Each flow and policy gets one warmup and a fresh Chromium context for every attempt. The benchmark runs serially and prints a JSON report with per-flow exact decision accuracy, validated completion, target Recall@10 and Recall@policy K, selected choices, option and state token drops, and decision latency. Page setup and oracle resolution precede `runControlledTask` and are excluded from its task duration. Site responses and application state are live; no pages or assets are pinned locally. A network or setup error fails the benchmark rather than counting as a model error.

The seven one-step flows use three public demonstration sites:

| Site | Prepared state and measured action | Deterministic check |
| --- | --- | --- |
| [The Internet](https://the-internet.herokuapp.com/) | Add an element; select Option 2 in a native dropdown | Delete button appears; select value becomes `2` |
| [TodoMVC React](https://todomvc.com/examples/react/dist/) | Create two tasks and complete one, then choose the Completed or Active filter | URL hash changes to the requested filter |
| [SauceDemo](https://www.saucedemo.com/) | Enter the published demo username; sign in with published demo credentials, then open Backpack details or the cart | Input value or exact destination URL |

The benchmark does not submit an order or use a private account. Preparation uses Playwright, not a model decision. These cases remain evaluation only and are not added to Jolty's training export. They test one decision at a time and do not measure autonomous multistep navigation or post-action recovery.

On 2026-09-23, with one warmup and three measured repetitions per flow and policy, the live-site run found:

| Policy | Exact decisions | Validated completions | Target recall at policy K | Option tokens dropped |
| --- | ---: | ---: | ---: | ---: |
| Retrieved Top-1 heuristic | 18/21 | 18/21 | 18/21 | — |
| Laya verbose/ranked | 18/21 | 18/21 | 21/21 | 588 |
| Laya compact/ranked | 15/21 | 15/21 | 21/21 | 114 |
| Laya verbose/reversed | 18/21 | 18/21 | 21/21 | 588 |
| Laya verbose/reversed plus editable-label gate | 18/21 | 18/21 | 21/21 | 588 |

No state tokens were dropped. The gate matches the published username field but does not change completion on these cases. Laya verbose/ranked missed the dropdown in all three runs; verbose/reversed selected it correctly in all three. The reversed variant instead chose `done` for the TodoMVC Completed filter in all three runs, which verbose/ranked clicked correctly. Compact/ranked additionally chose `done` for the Active filter. The heuristic missed the cart link because its labeled target was rank two, outside its Top-1 policy, although it was in the shared Top-10 set. All measured choices were stable over the three repetitions of each flow. These are seven distinct states across three sites, not 21 independent designs. Live network and site changes limit repeatability, and policy order was not randomized for a latency comparison. This probe does not support enabling reversed order or the gate in the normal runner.
