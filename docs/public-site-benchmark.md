# Public-site one-step benchmark

Run `pnpm run benchmark:public` to compare the retrieved Top-1 heuristic with Laya's verbose/ranked, compact/ranked, verbose/reversed, and verbose/reversed plus unique-label gate presentations. `JOLTY_PUBLIC_RUNS` controls measured repetitions (default three). `JOLTY_PUBLIC_FLOWS` accepts a comma-separated list of flow IDs, and `JOLTY_PUBLIC_POLICIES` accepts a comma-separated list of policy names for scoped probes; both reject unknown or duplicate entries. Each flow and policy gets one warmup and a fresh Chromium context for every attempt. The benchmark runs serially and prints a JSON report with per-flow exact decision accuracy, validated completion, target Recall@10 and Recall@policy K, selected choices, gate selections, option and state token drops, and decision latency. Page setup and oracle resolution precede `runControlledTask` and are excluded from its task duration. Site responses and application state are live; no pages or assets are pinned locally. A network or setup error fails the benchmark rather than counting as a model error.

`JOLTY_PUBLIC_CORPUS_VERSION=1` switches the flow list to the revised research corpus's eleven new test cases on QA Practice and the HTTPS UI Testing Playground installation. The default remains the original thirteen flows. The [frozen-encoder report](frozen-encoder-experiment.md#revised-corpus-v1) records a one-run Laya comparison on the revised list.

`JOLTY_PUBLIC_CORPUS_VERSION=2` selects the ten cases on Test Track and WebDriverUniversity from the [third research corpus](research-corpus.md#corpus-v2). The [experiment report](frozen-encoder-experiment.md#corpus-v2-experiment) records the one-run comparison. The default flow list is unchanged.

`JOLTY_PUBLIC_CORPUS_VERSION=3` selects the ten fixed-head abstention probe cases on Lastest Playground and QA Playground. The [probe report](frozen-encoder-experiment.md#fixed-head-abstention-probe-on-v3) compares Laya with the unchanged v2 head. The default remains the original thirteen flows.

`JOLTY_PUBLIC_CORPUS_VERSION=4` selects ten cases on QA Automation Labs and Practice Test Automation. The [v4 experiment](frozen-encoder-experiment.md#corpus-v4-experiment) compares Laya with a newly fitted frozen-encoder head. The default remains the original thirteen flows.

`JOLTY_PUBLIC_CORPUS_VERSION=5` selects ten cases on DemoQA and Automation Bible. The [v5 ablation](frozen-encoder-experiment.md#corpus-v5-action-bias-ablation) compares Laya with two frozen-encoder heads. The default remains the original thirteen flows.

The thirteen one-step flows use four public demonstration sites:

| Site | Prepared state and measured action | Deterministic check |
| --- | --- | --- |
| [The Internet](https://the-internet.herokuapp.com/) | Add and then delete an element; select Option 2 in a native dropdown | Delete button appears or disappears; select value becomes `2` |
| [TodoMVC React](https://todomvc.com/examples/react/dist/) | Create two tasks and complete one, then choose the Completed or Active filter or clear completed tasks | URL hash changes to the requested filter; Clear completed disappears |
| [SauceDemo](https://www.saucedemo.com/) | Enter the published demo username; sign in with published demo credentials, then open Backpack details, open the cart, or add Backpack to the cart | Input value, exact destination URL, or Backpack-specific Remove control |
| [Selenium web form](https://www.selenium.dev/selenium/web/web-form.html) | Enter text, select Two, or submit a prepared form | Input or select value; confirmation page and `Received!` text |

The benchmark does not submit an order or use a private account. Preparation uses Playwright, not a model decision. These cases remain evaluation only and are not added to Jolty's training export. They test one decision at a time and do not measure autonomous multistep navigation or post-action recovery.

The initial seven-flow run on 2026-09-23, with one warmup and three measured repetitions per flow and policy, found:

| Policy | Exact decisions | Validated completions | Target recall at policy K | Option tokens dropped |
| --- | ---: | ---: | ---: | ---: |
| Retrieved Top-1 heuristic | 18/21 | 18/21 | 18/21 | — |
| Laya verbose/ranked | 18/21 | 18/21 | 21/21 | 588 |
| Laya compact/ranked | 15/21 | 15/21 | 21/21 | 114 |
| Laya verbose/reversed | 18/21 | 18/21 | 21/21 | 588 |
| Laya verbose/reversed plus editable-label gate | 18/21 | 18/21 | 21/21 | 588 |

No state tokens were dropped. The gate matches the published username field but does not change completion on these cases. Laya verbose/ranked missed the dropdown in all three runs; verbose/reversed selected it correctly in all three. The reversed variant instead chose `done` for the TodoMVC Completed filter in all three runs, which verbose/ranked clicked correctly. Compact/ranked additionally chose `done` for the Active filter. The heuristic missed the cart link because its labeled target was rank two, outside its Top-1 policy, although it was in the shared Top-10 set. All measured choices were stable over the three repetitions of each flow. These are seven distinct states across three sites, not 21 independent designs. Live network and site changes limit repeatability, and policy order was not randomized for a latency comparison. This probe does not support enabling reversed order or the gate in the normal runner.

A fresh expanded run on 2026-09-23 measured all thirteen flows three times per policy, again after one warmup each:

| Policy | Exact decisions | Validated completions | Target recall at policy K | Gate selections |
| --- | ---: | ---: | ---: | ---: |
| Retrieved Top-1 heuristic | 33/39 | 33/39 | 33/39 | — |
| Laya verbose/ranked | 36/39 | 36/39 | 39/39 | — |
| Laya compact/ranked | 33/39 | 33/39 | 39/39 | — |
| Laya verbose/reversed | 33/39 | 33/39 | 39/39 | — |
| Laya verbose/reversed plus editable-label gate | 33/39 | 33/39 | 39/39 | 6/39 |

The gate selected the username and Selenium text input in all three measured runs and did not change their already-correct outcomes. Reversed order fixed The Internet dropdown but missed the TodoMVC Completed filter and chose a different SauceDemo product instead of Backpack. In the latter case, a generic `Remove` button appeared and would have passed the core check despite the wrong product; the benchmark now requires `#remove-sauce-labs-backpack` as an additional exact postcondition. The heuristic's two SauceDemo misses were retrieval Top-1 misses; both labeled targets were in Top-10. The expanded results comprise thirteen distinct states repeated three times, with no autonomous multistep navigation, recovery, or representative-site sampling. The unchanged default verbose/ranked policy performed best in this probe; the evidence still does not establish a general-site success rate or justify enabling an alternative presentation globally.
