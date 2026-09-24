# Executor v0

`executeAction(page, observedState, command)` in `@jolty/executor` translates a selected action into a bounded Playwright operation. It accepts the plain `{ action, targetId?, value? }` contract, without importing or invoking a model. `type` and `select` require an explicit string value from the caller; the current decision baseline chooses only action and target. The executor returns `status`, `action_ms`, and either the executed action or a failure reason and message. The separate [validator](validator.md) checks explicit outcomes after execution.

## Binding planned values

`bindStepIntent(state, selection, intent)` from `@jolty/executor/bind-step-intent` is a pure, optional boundary between action selection and `executeAction`. A structured `StepIntent` holds the goal and explicit `type` or `select` values. The caller passes only `intent.goal` into retrieval and the decision model, then binds the selected action and target against the *same* observed state before execution:

```ts
const intent = {
  goal: "Enter the email address",
  values: [{
    action: "type",
    target: { role: "textbox", name: "Email" },
    value: "person@example.test",
  }],
};
const binding = bindStepIntent(state, selectedDecision, intent);
if (binding.status === "ready") {
  await executeAction(page, state, binding.command);
}
```

The binder matches the selected action, target role, and accessible name. It fails if no planned value matches, two values match, or the role and name identify multiple observed elements. For duplicate labels, the caller may add the selected observation's `id` to `target` after disambiguating the current state; IDs are valid only for that observation. These failures do not include values in their messages. Non-value actions pass through without a value. The binder does not choose a target or infer a value from page text, and `executeAction` still validates target actionability and freshness. Keep planned values out of goal strings, model questions, and persistent traces, especially credentials and other sensitive data.

## Supported actions

| Action | Playwright operation | Target | Value |
| --- | --- | --- | --- |
| `click` | `ElementHandle.click()` | Required | None |
| `type` | `ElementHandle.fill()` | Required, editable | Required string; empty clears the field |
| `select` | `ElementHandle.selectOption()` | Required, native `<select>` | Required option value |
| `scroll` | Mouse wheel down by 80% of viewport height | None | None |
| `wait` | Fixed 100 ms wait | None | None |
| `back` | Browser history navigation | None | None |
| `done` | No browser operation | None | None |

For target actions, the executor checks that the ID exists in the supplied observation and is visible and enabled. It then extracts a fresh state, compares the page context and the full selected element record, and captures an `ElementHandle` at the recorded `domIndex` using the same main-document `querySelectorAll` lookup as state extraction. Playwright locators pierce open shadow roots and can enumerate a different order, so they cannot resolve this index. The handle prevents a subsequent selector re-resolution from clicking a different element. A changed or detached target fails with `stale_state`; a missing, disabled, or action-incompatible target fails with `invalid_target`. Unsupported actions, missing values, missing history, and Playwright errors have separate failure reasons. Every result includes elapsed `action_ms`, including target resolution and failures.

The executor only dispatches its fixed action vocabulary. It does not evaluate model-generated code. The same ID must not be reused after a new observation or DOM change. `select` currently supports native controls; custom listboxes need their own explicit interaction contract later. `wait` and `scroll` initiate bounded operations but do not assert a resulting page change.
