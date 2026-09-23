# Executor v0

`executeAction(page, observedState, command)` in `@jolty/executor` translates a selected action into a bounded Playwright operation. It accepts the plain `{ action, targetId?, value? }` contract, without importing or invoking a model. `type` and `select` require an explicit string value from the caller; the current decision baseline chooses only action and target. The executor returns `status`, `action_ms`, and either the executed action or a failure reason and message. It does not validate the goal outcome; that is the next milestone.

| Action | Playwright operation | Target | Value |
| --- | --- | --- | --- |
| `click` | `ElementHandle.click()` | Required | None |
| `type` | `ElementHandle.fill()` | Required, editable | Required string; empty clears the field |
| `select` | `ElementHandle.selectOption()` | Required, native `<select>` | Required option value |
| `scroll` | Mouse wheel down by 80% of viewport height | None | None |
| `wait` | Fixed 100 ms wait | None | None |
| `back` | Browser history navigation | None | None |
| `done` | No browser operation | None | None |

For target actions, the executor checks that the ID exists in the supplied observation and is visible and enabled. It then extracts a fresh state, compares the page context and the full selected element record, and captures an `ElementHandle` at the recorded `domIndex`. The handle prevents a subsequent selector re-resolution from clicking a different element. A changed or detached target fails with `stale_state`; a missing, disabled, or action-incompatible target fails with `invalid_target`. Unsupported actions, missing values, missing history, and Playwright errors have separate failure reasons. Every result includes elapsed `action_ms`, including target resolution and failures.

The executor only dispatches its fixed action vocabulary. It does not evaluate model-generated code. The same ID must not be reused after a new observation or DOM change. `select` currently supports native controls; custom listboxes need their own explicit interaction contract later. `wait` and `scroll` initiate bounded operations but do not assert a resulting page change.
