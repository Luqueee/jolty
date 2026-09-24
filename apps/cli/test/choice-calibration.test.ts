import { describe, expect, it } from "vitest";
import {
  calibrateChoices,
  scaledProbabilities,
} from "../src/research/choice-calibration.ts";

describe("validation-only choice calibration", () => {
  it("chooses a threshold that accepts no observed wrong decision", () => {
    const rows = [
      { id: "correct", probabilities: [0.95, 0.05], correctIndex: 0 },
      { id: "wrong", probabilities: [0.8, 0.2], correctIndex: 1 },
      { id: "missing", probabilities: [0.55, 0.45], correctIndex: null },
    ];
    const policy = calibrateChoices(rows);
    const accepted = rows.filter((row) => {
      const p = scaledProbabilities(row.probabilities, policy.temperature);
      return Math.max(...p) >= policy.threshold;
    });
    expect(accepted.map((row) => row.id)).toEqual(["correct"]);
    expect(policy.validation_covered).toBe(1);
    expect(policy.missing_correct_option).toBe(1);
  });

  it("rejects duplicate IDs and invalid probability arrays", () => {
    expect(() =>
      calibrateChoices([
        { id: "same", probabilities: [0.5, 0.5], correctIndex: 0 },
        { id: "same", probabilities: [0.4, 0.6], correctIndex: 1 },
      ]),
    ).toThrow(/Duplicate/);
    expect(() => scaledProbabilities([0, 0], 1)).toThrow(/invalid/);
  });
});
