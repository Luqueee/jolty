import { expect, test } from "vitest";
import {
  completeStepTrace,
  createStepTraceDraft,
  type StepTraceDraftInput,
} from "../src/step-draft.ts";

function traceInput(): StepTraceDraftInput {
  return {
    runId: "run-1",
    stepId: "step-1",
    goalSummary: "Fill email",
    model: { name: "Laya", version: "revision-1" },
    page: { url: "https://example.test/login", elementCount: 3 },
    candidates: [{ id: "e1", role: "textbox", score: 50 }],
    decision: {
      status: "selected",
      action: "type",
      targetId: "e1",
      confidence: 0.7,
    },
    execution: { status: "executed", action_ms: 12 },
    timing: {
      state_extraction_ms: 1,
      candidate_filter_ms: 0.1,
      candidate_retrieval_ms: 0.2,
      tokenization_ms: 0.5,
      inference_ms: 80,
      decision_latency_ms: 81,
    },
  };
}

test("records pre-validation stages without copying values or URL query", () => {
  const input = {
    ...traceInput(),
    page: {
      url: "https://example.test/login?token=secret#fragment",
      elementCount: 3,
    },
    candidates: [{ id: "e1", role: "textbox", score: 50, name: "private" }],
    decision: {
      status: "selected" as const,
      action: "type",
      targetId: "e1",
      confidence: 0.7,
      value: "secret",
    },
    execution: { status: "executed" as const, action_ms: 12, value: "secret" },
  };
  const draft = createStepTraceDraft(input);
  expect(draft).toMatchObject({
    run_id: "run-1",
    browser_state: { origin: "https://example.test", pathname: "/login" },
    candidates: [{ id: "e1", role: "textbox", score: 50 }],
    validation_outcome: "pending",
  });
  expect(JSON.stringify(draft)).not.toContain("secret");
  expect(JSON.stringify(draft)).not.toContain("private");
});

test("records validated success and stage timing without copying check messages", () => {
  const trace = completeStepTrace(createStepTraceDraft(traceInput()), {
    status: "passed",
    checks: [{ kind: "input_value_changed", passed: true, message: "secret" }],
    validation_ms: 3,
  });
  expect(trace).toMatchObject({
    model: { name: "Laya", version: "revision-1" },
    decision: { action: "type", target_id: "e1", confidence: 0.7 },
    validation: {
      status: "passed",
      checks: [{ kind: "input_value_changed", passed: true }],
    },
    timing: { action_ms: 12, validation_ms: 3 },
    validation_outcome: "passed",
    final_outcome: "passed",
  });
  expect(JSON.stringify(trace)).not.toContain("secret");
});

test("distinguishes validation and action failures", () => {
  const draft = createStepTraceDraft(traceInput());
  const failedValidation = completeStepTrace(draft, {
    status: "validation_failed",
    checks: [{ kind: "text_visible", passed: false, message: "Missing" }],
    validation_ms: 4,
  });
  expect(failedValidation).toMatchObject({
    final_outcome: "validation_failed",
    validation: { checks: [{ kind: "text_visible", passed: false }] },
  });
  const failedAction = createStepTraceDraft({
    ...traceInput(),
    execution: { status: "failed", action_ms: 8, reason: "stale_state" },
  });
  expect(
    completeStepTrace(failedAction, {
      status: "action_failed",
      action_reason: "stale_state",
      checks: [],
      validation_ms: 0.2,
    }),
  ).toMatchObject({
    execution: { reason: "stale_state" },
    final_outcome: "action_failed",
  });
});

test("records decision failures without fabricated action or validation", () => {
  const draft = createStepTraceDraft({
    ...traceInput(),
    decision: { status: "failed", reason: "model_error: secret" },
    execution: { status: "skipped" },
  });
  const trace = completeStepTrace(draft, { status: "skipped" });
  expect(trace).toMatchObject({
    decision: { status: "failed", reason: "unknown" },
    execution: { status: "skipped" },
    timing: { action_ms: null, validation_ms: null },
    validation_outcome: "skipped",
    final_outcome: "decision_failed",
  });
  expect(JSON.stringify(trace)).not.toContain("secret");
  expect(() =>
    completeStepTrace(draft, {
      status: "validation_failed",
      checks: [],
      validation_ms: 1,
    }),
  ).toThrow("Failed decisions must skip validation");
});

test("records fallback evidence without provider error text", () => {
  const input: StepTraceDraftInput = {
    ...traceInput(),
    decision: { status: "failed", reason: "provider_error: private detail" },
    execution: { status: "skipped" },
    fastDecision: { status: "failed", reason: "model_error" },
    fallback: {
      reason: "model_failure",
      model: { name: "Codex", version: "test" },
      decision: { status: "failed", reason: "provider_error: private detail" },
      latency_ms: 42,
      input_tokens: null,
      output_tokens: null,
      estimated_cost_usd: null,
    },
  };
  const trace = completeStepTrace(createStepTraceDraft(input), {
    status: "skipped",
  });
  expect(trace).toMatchObject({
    fast_decision: { status: "failed", reason: "model_error" },
    fallback_reason: "model_failure",
    fallback: {
      decision: { status: "failed", reason: "unknown" },
      latency_ms: 42,
    },
    timing: {
      decision_latency_ms: 81,
      fallback_ms: 42,
      total_decision_ms: 123,
    },
  });
  expect(JSON.stringify(trace)).not.toContain("private detail");
});
