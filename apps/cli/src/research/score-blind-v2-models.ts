import { readFile, writeFile } from "node:fs/promises";
import type { BrowserState } from "@jolty/browser";
import type { DecisionInput } from "@jolty/decision/contract";
import type { ResearchSample } from "./research-corpus-reader.ts";

interface UnlabeledObservation extends ResearchSample {
  training_action: null;
}

const modelName = process.argv[2];
const inputPath = process.argv[3];
const outputPath = process.argv[4];
if (
  !["heuristic", "minilm-frozen-v9", "laya-original"].includes(
    modelName ?? "",
  ) ||
  !inputPath ||
  !outputPath
)
  throw new Error("Usage: score-blind-v2-models.ts MODEL INPUT OUTPUT");
const observations = JSON.parse(
  await readFile(inputPath, "utf8"),
) as UnlabeledObservation[];
if (
  !Array.isArray(observations) ||
  observations.some((row) => row.training_action !== null)
)
  throw new Error("Scoring input must contain unlabeled observations only");

function actionFor(
  element: ResearchSample["browser_state"]["elements"][number],
) {
  return element.editable ? "type" : element.native_select ? "select" : "click";
}

function layaInput(sample: ResearchSample): DecisionInput {
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
    if (!element) throw new Error(`Missing element in ${sample.sample_id}`);
    return {
      element,
      score: candidate.score,
      signals: candidate.signals,
      sourceIndex,
    };
  });
  return { goal: sample.goal, state, candidates };
}

const output: {
  id: string;
  probabilities?: number[];
  confidence?: number;
  margin?: number;
  decision_ms: number;
  failure?: string;
}[] = [];
if (modelName === "heuristic") {
  for (const sample of observations) {
    const started = performance.now();
    const first = sample.candidates[0];
    if (!first) throw new Error(`No candidates for ${sample.sample_id}`);
    output.push({
      id: sample.sample_id,
      margin: Math.max(0, first.score - (sample.candidates[1]?.score ?? 0)),
      decision_ms: performance.now() - started,
    });
  }
} else if (modelName === "minilm-frozen-v9") {
  const { loadFrozenEncoder, probabilities } = await import(
    "./frozen-encoder.ts"
  );
  const head = JSON.parse(
    await readFile("artifacts/frozen-encoder-v9.json", "utf8"),
  );
  const encoder = await loadFrozenEncoder();
  try {
    for (const sample of observations) {
      const started = performance.now();
      const encoded = (await encoder.encode([sample])).encoded[0];
      if (!encoded) throw new Error(`Encoding failed for ${sample.sample_id}`);
      output.push({
        id: sample.sample_id,
        probabilities: probabilities(
          head.weights,
          encoded.options,
          head.temperature,
        ),
        decision_ms: performance.now() - started,
      });
    }
  } finally {
    await encoder.close();
  }
} else {
  const { LayaDecisionModel } = await import("@jolty/decision");
  const model = await LayaDecisionModel.load();
  try {
    for (const sample of observations) {
      const result = await model.decide(layaInput(sample), {
        targetFreeActions: [],
        descriptionStyle: "verbose",
        candidateOrder: "ranked",
      });
      if (result.status === "failed") {
        output.push({
          id: sample.sample_id,
          decision_ms: result.metrics.decision_latency_ms,
          failure: result.reason,
        });
        continue;
      }
      output.push({
        id: sample.sample_id,
        probabilities: sample.candidates.map((candidate) => {
          const element = sample.browser_state.elements.find(
            (item) => item.id === candidate.id,
          );
          if (!element)
            throw new Error(`Missing element in ${sample.sample_id}`);
          const option = result.considered.find(
            (item) =>
              item.targetId === candidate.id &&
              item.action === actionFor(element),
          );
          return option ? (result.probabilities[option.key] ?? 0) : 0;
        }),
        decision_ms: result.metrics.decision_latency_ms,
      });
    }
  } finally {
    await model.close();
  }
}
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, {
  flag: "wx",
});
console.log(
  JSON.stringify({ model: modelName, output: outputPath, rows: output.length }),
);
