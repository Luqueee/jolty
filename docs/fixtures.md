# Controlled browser fixtures

Milestone 2 provides 12 local browser scenarios under `packages/browser/fixtures/pages/`. The [scenario manifest](../packages/browser/fixtures/scenarios.ts) declares each goal, valid action sequence, and exact visible success text. The [Playwright tests](../packages/browser/test/fixtures.test.ts) exercise each scenario and check its declared outcome.

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

Use `installFixtureRoutes(page)` from `packages/browser/fixtures/routes.ts` before navigating to `fixtureUrl(id)`. Playwright fulfills requests from the local HTML files and aborts all other requests; no external service or network access is required. A new Playwright page gives each run isolated browser state. Tests and future benchmarks can use the same route helper and manifest.

Run `pnpm run test` to verify all outcomes. The delayed scenario uses an 80 ms timer; its final outcome is deterministic, while elapsed time can vary with scheduling. These fixtures are controlled development cases, not representative real-site benchmarks.
