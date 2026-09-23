import { expect, test } from "vitest";
import { createStepTraceDraft } from "../src/step-draft.ts";

test("records pre-validation stages without copying values or URL query", () => {
  const input = {
    runId: "run-1",
    stepId: "step-1",
    goalSummary: "Fill email",
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
    timing: {
      state_extraction_ms: 1,
      candidate_filter_ms: 0.1,
      candidate_retrieval_ms: 0.2,
      tokenization_ms: 0.5,
      inference_ms: 80,
      decision_latency_ms: 81,
    },
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
