import { expect, test } from "vitest";
import { fallbackReason } from "../src/fallback-policy.ts";

const metrics = {
  decision_latency_ms: 1,
  model_call_ms: 1,
  tokenization_ms: null,
  inference_ms: null,
  input_tokens: null,
};

test("escalates only low confidence and configured model failures", () => {
  const policy = { minConfidence: 0.2, onModelFailure: true };
  expect(
    fallbackReason(
      { status: "selected", action: "done", confidence: 0.14, metrics },
      policy,
    ),
  ).toBe("low_confidence");
  expect(
    fallbackReason(
      { status: "selected", action: "click", confidence: 0.2, metrics },
      policy,
    ),
  ).toBeNull();
  expect(
    fallbackReason(
      { status: "selected", action: "click", confidence: null, metrics },
      policy,
    ),
  ).toBeNull();
  expect(
    fallbackReason(
      { status: "failed", reason: "model_error", metrics },
      policy,
    ),
  ).toBe("model_failure");
  expect(
    fallbackReason(
      { status: "failed", reason: "model_error", metrics },
      { ...policy, onModelFailure: false },
    ),
  ).toBeNull();
});

test("rejects an invalid confidence threshold", () => {
  expect(() =>
    fallbackReason(
      { status: "failed", reason: "model_error", metrics },
      { minConfidence: 2, onModelFailure: true },
    ),
  ).toThrow(RangeError);
});
