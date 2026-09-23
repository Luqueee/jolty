import { describe, expect, it } from "vitest";
import { type StepEvaluation, summarizeSteps } from "./step-summary.ts";

const step = (overrides: Partial<StepEvaluation> = {}): StepEvaluation => ({
  fixture: "test",
  goal: "Open target",
  expected_action: "click",
  expected_target_id: "expected",
  selected_action: "click",
  selected_target_id: "expected",
  confidence: 0.9,
  retrieval_rank: 1,
  retrieval_top_k: 2,
  heuristic_action: "click",
  heuristic_target_id: "expected",
  ...overrides,
});

describe("offline step summary", () => {
  it("separates retrieval misses, heuristic accuracy, and model accuracy", () => {
    const result = summarizeSteps([
      step(),
      step({
        expected_target_id: "second",
        selected_target_id: "second",
        heuristic_target_id: "first",
        retrieval_rank: 2,
        confidence: 0.4,
      }),
      step({
        expected_target_id: "missing",
        selected_target_id: "first",
        heuristic_target_id: "first",
        retrieval_rank: 3,
        confidence: 0.8,
      }),
    ]);
    expect(result.retrieval_top_k_coverage).toBe(2 / 3);
    expect(result.retrieval_top_k_misses).toEqual([
      {
        fixture: "test",
        goal: "Open target",
        expected_target_id: "missing",
        retrieval_rank: 3,
      },
    ]);
    expect(result.heuristic_top_1_step_accuracy).toBe(1 / 3);
    expect(result.model_step_accuracy).toBe(2 / 3);
    expect(result.model_accuracy_given_target_retrieved).toBe(1);
    expect(result.confidence_distribution[1]).toMatchObject({
      count: 1,
      correct: 1,
      accuracy: 1,
    });
    expect(result.confidence_distribution[3]).toMatchObject({
      count: 2,
      correct: 1,
      accuracy: 0.5,
    });
  });

  it("keeps empty rates undefined and includes confidence of one", () => {
    expect(summarizeSteps([]).model_step_accuracy).toBeNull();
    expect(
      summarizeSteps([step({ confidence: 1 })]).confidence_distribution[3],
    ).toMatchObject({ count: 1, correct: 1 });
  });

  it("scores target-free actions without counting them as retrieval misses", () => {
    const result = summarizeSteps([
      step({
        expected_action: "wait",
        expected_target_id: null,
        selected_action: "wait",
        selected_target_id: null,
        heuristic_action: "click",
        heuristic_target_id: "button",
        retrieval_rank: 0,
      }),
      step(),
    ]);
    expect(result.targeted_cases).toBe(1);
    expect(result.targetless_cases).toBe(1);
    expect(result.retrieval_top_k_coverage).toBe(1);
    expect(result.retrieval_top_k_misses).toEqual([]);
    expect(result.model_step_accuracy).toBe(1);
    expect(result.heuristic_top_1_step_accuracy).toBe(0.5);
  });
});
