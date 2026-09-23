# Controlled browser fixtures

The repository provides 15 local browser scenarios under `packages/browser/fixtures/pages/`. The [scenario manifest](../packages/browser/fixtures/scenarios.ts) declares each goal, valid action sequence, and exact visible success text. The [Playwright tests](../packages/browser/test/fixtures.test.ts) exercise each scenario and check its declared outcome.

| Scenario | Behavior covered |
| --- | --- |
| `login` | Credential form and sign-in confirmation. |
| `logout` | Signed-in state and logout transition. |
| `settings` | Profile field update. |
| `form` | Generic message submission. |
| `validation` | Invalid email error. |
| `modal` | Dialog open and confirmation. |
| `select` | Native dropdown selection. |
| `tabs` | Tab and panel state change. |
| `redirect` | Same-origin navigation to `/redirected`. |
| `delayed` | Loading state followed by a timed result. |
| `duplicate` | Two identically named buttons in distinct regions. |
| `scroll` | A target below the initial viewport. |
| `cookie-overlay` | A modal cookie notice covers the checkout action until dismissed. |
| `dynamic-results` | A report action appears after a timed loading state. |
| `ambiguous-row` | Two `Open` buttons require row context to choose the approved request. |

The `login`, `cookie-overlay`, `dynamic-results`, and `ambiguous-row` scenarios carry `decisionLabels` for offline step evaluation. Each label names a page `phase`, a phase-specific `goal`, an expected action, and a unique CSS `targetSelector` for targeted actions. It also declares `expectedAfterAction`: an exact input value, exact visible text, hidden element, or visible element. The selector is a fixture ground-truth locator, not a runtime browser-state ID; evaluators must resolve it against the page observation because IDs can change after DOM updates. `initial` identifies the state immediately after navigation. Later phases require the preceding fixture actions. Login has three action phases (email, password, submit); cookie dismissal exposes the checkout action; `dynamic-results` has a target-free `wait` label while the report is loading. The fixture tests check that targeted labels resolve to one visible, enabled element and that each action's declared condition holds after execution. These labels and conditions are controlled test expectations, not evidence of real-site decision accuracy.

Use `installFixtureRoutes(page)` from `packages/browser/fixtures/routes.ts` before navigating to `fixtureUrl(id)`. Playwright fulfills requests from the local HTML files and aborts all other requests; no external service or network access is required. A new Playwright page gives each run isolated browser state. Tests and future benchmarks can use the same route helper and manifest.

Run `pnpm run test` to verify all outcomes. The delayed scenario uses an 80 ms timer; its final outcome is deterministic, while elapsed time can vary with scheduling. These fixtures are controlled development cases, not representative real-site benchmarks.

The controlled loop also has task plans for `cookie-overlay`, `dynamic-results`, and `ambiguous-row` in `apps/cli/src/controlled-tasks.ts`. These plans add validation checks to the fixture goals; they do not supply target actions to the running decision model. Cookie dismissal must precede checkout. The dynamic report task checks `Loading report`, then `Report ready`, then `Report opened`. Its readiness check is a state condition because the 80 ms timer can finish during model inference, before the wait action starts. The ambiguous-row task requires `Approved request opened`, so choosing the draft row fails validation. A scripted test model verifies that each plan can complete and that the draft-row choice fails. Actual Laya selections remain visible as successful or failed benchmark outcomes rather than being replaced with fixture labels.
