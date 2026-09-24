import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { ResearchSample } from "./research-corpus-reader.ts";

const input = await readFile("artifacts/peft-training-input.json");
const artifact = JSON.parse(input.toString("utf8"));
if (
  !Array.isArray(artifact.samples) ||
  artifact.samples.some((sample: ResearchSample) => sample.split === "test")
)
  throw new Error(
    "The heuristic may only be calibrated on train/validation data",
  );
const validation = (artifact.samples as ResearchSample[]).filter(
  (sample) => sample.split === "validation",
);
if (validation.length !== 76)
  throw new Error("Unexpected heuristic validation count");
const rows = validation.map((sample) => {
  const first = sample.candidates[0];
  if (!first)
    throw new Error(`Missing retrieved candidates: ${sample.sample_id}`);
  const element = sample.browser_state.elements.find(
    (item) => item.id === first.id,
  );
  if (!element) throw new Error(`Missing top element: ${sample.sample_id}`);
  const action = element.editable
    ? "type"
    : element.native_select
      ? "select"
      : "click";
  const margin = Math.max(0, first.score - (sample.candidates[1]?.score ?? 0));
  return {
    id: sample.sample_id,
    margin,
    correct:
      first.id === sample.training_action?.target_id &&
      action === sample.training_action.action,
  };
});
const thresholds = [
  0,
  ...rows.map((row) => row.margin + Number.EPSILON),
  Math.max(...rows.map((row) => row.margin)) + 1,
];
const safe = thresholds
  .map((threshold) => {
    const accepted = rows.filter((row) => row.margin >= threshold);
    return {
      threshold,
      covered: accepted.length,
      errors: accepted.filter((row) => !row.correct).length,
    };
  })
  .filter((row) => row.errors === 0)
  .sort((a, b) => b.covered - a.covered || a.threshold - b.threshold)[0];
if (!safe) throw new Error("No safe heuristic validation rule");
const report = {
  model: "retrieval-top1-heuristic",
  input_sha256: createHash("sha256").update(input).digest("hex"),
  rule: "Top-ranked retrieved element; type if editable, select if native select, otherwise click. Accept only when top score minus runner-up score meets the validation threshold.",
  validation: {
    total: rows.length,
    correct: rows.filter((row) => row.correct).length,
    covered: safe.covered,
    covered_correct: safe.covered,
    threshold: safe.threshold,
  },
};
await writeFile(
  "artifacts/heuristic-validation-policy.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report));
