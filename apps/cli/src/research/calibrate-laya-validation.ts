import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { BrowserState } from "@jolty/browser";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import type { DecisionInput } from "@jolty/decision/contract";
import {
  type ChoiceValidationRow,
  calibrateChoices,
} from "./choice-calibration.ts";
import type { ResearchSample } from "./research-corpus-reader.ts";

const inputPath = "artifacts/peft-training-input.json";
const outputPath = "artifacts/laya-original-validation-policy.json";
const source = await readFile(inputPath);
const artifact = JSON.parse(source.toString("utf8"));
if (!Array.isArray(artifact.samples))
  throw new Error("Expected a train/validation-only input artifact");
const samples = artifact.samples as ResearchSample[];
if (
  samples.some((sample) => sample.split === "test") ||
  samples.filter((sample) => sample.split === "train").length !== 168 ||
  samples.filter((sample) => sample.split === "validation").length !== 76
)
  throw new Error("Input is not the fixed v9 train/validation projection");

function decisionInput(sample: ResearchSample): DecisionInput {
  const state: BrowserState = {
    url: `${sample.browser_state.origin}${sample.browser_state.pathname}`,
    title: sample.browser_state.title,
    elements: sample.browser_state.elements.map((element) => ({
      id: element.id,
      role: element.role,
      name: element.name,
      text: element.text,
      editable: element.editable,
      visible: element.visible,
      enabled: element.enabled,
      hasValue: element.has_value,
      selected: element.selected,
      value: element.native_select ? "" : undefined,
    })),
  };
  const candidates = sample.candidates.map((candidate, sourceIndex) => {
    const element = state.elements.find((item) => item.id === candidate.id);
    if (!element) throw new Error(`Candidate missing for ${sample.sample_id}`);
    return {
      element,
      score: candidate.score,
      signals: candidate.signals,
      sourceIndex,
    };
  });
  return { goal: sample.goal, state, candidates };
}

const model = await LayaDecisionModel.load();
const rows: ChoiceValidationRow[] = [];
const failures: { id: string; reason: string }[] = [];
const truncation = { option_tokens_dropped: 0, state_tokens_dropped: 0 };
try {
  for (const sample of samples.filter((item) => item.split === "validation")) {
    const result = await model.decide(decisionInput(sample), {
      targetFreeActions: [],
      descriptionStyle: "verbose",
      candidateOrder: "ranked",
    });
    if (result.status === "failed") {
      failures.push({ id: sample.sample_id, reason: result.reason });
      continue;
    }
    const probabilities = result.considered.map(
      (option) => result.probabilities[option.key] ?? 0,
    );
    const correctIndex = result.considered.findIndex(
      (option) =>
        option.action === sample.training_action?.action &&
        option.targetId === sample.training_action.target_id,
    );
    rows.push({
      id: sample.sample_id,
      probabilities,
      correctIndex: correctIndex < 0 ? null : correctIndex,
    });
    truncation.option_tokens_dropped +=
      result.metrics.option_tokens_dropped ?? 0;
    truncation.state_tokens_dropped += result.metrics.state_tokens_dropped ?? 0;
  }
} finally {
  await model.close();
}
const policy = calibrateChoices(rows);
const report = {
  input_sha256: createHash("sha256").update(source).digest("hex"),
  corpus_sha256: artifact.corpus_sha256,
  model: "original-laya",
  revision: LAYA_REVISION,
  serializer: {
    descriptionStyle: "verbose",
    candidateOrder: "ranked",
    targetFreeActions: [],
  },
  policy,
  failures,
  truncation,
  node: process.version,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    output: outputPath,
    policy,
    failures: failures.length,
    truncation,
  }),
);
