import { readFile, writeFile } from "node:fs/promises";
import type { BrowserState } from "@jolty/browser";
import {
  assertChatGptLogin,
  codexSubscriptionAdapter,
} from "../../../../packages/decision/src/codex-subscription.ts";
import {
  buildModelQuestion,
  type DecisionInput,
  selectedOption,
} from "../../../../packages/decision/src/decision.ts";
import type { ResearchSample } from "./research-corpus-reader.ts";

const inputPath = process.argv[2] ?? "artifacts/blind-once/observations.json";
const outputPath = process.argv[3] ?? "artifacts/blind-once/teacher.json";
const observations = JSON.parse(
  await readFile(inputPath, "utf8"),
) as ResearchSample[];
if (
  !Array.isArray(observations) ||
  observations.some((sample) => sample.training_action !== null)
)
  throw new Error("Teacher scoring requires unlabeled observations");
assertChatGptLogin();
const adapter = codexSubscriptionAdapter();
const results = [];
for (const sample of observations) {
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
  const candidates: DecisionInput["candidates"] = sample.candidates.map(
    (candidate, sourceIndex) => {
      const element = state.elements.find((item) => item.id === candidate.id);
      if (!element) throw new Error(`Missing element for ${sample.sample_id}`);
      return {
        element,
        score: candidate.score,
        signals: candidate.signals,
        sourceIndex,
      };
    },
  );
  const question = buildModelQuestion(
    { goal: sample.goal, state, candidates },
    {
      targetFreeActions: [],
      descriptionStyle: "verbose",
      candidateOrder: "ranked",
    },
  );
  const started = performance.now();
  try {
    const response = await adapter.choose(question);
    const selected = selectedOption(question.options, response.choice);
    const selectedIndex = sample.candidates.findIndex(
      (candidate) => candidate.id === selected.targetId,
    );
    results.push({
      id: sample.sample_id,
      selected_index: selectedIndex,
      action: selected.action,
      decision_ms: performance.now() - started,
      usage: response.usage ?? null,
      failure: null,
    });
  } catch (error) {
    results.push({
      id: sample.sample_id,
      selected_index: -1,
      action: null,
      decision_ms: performance.now() - started,
      usage: null,
      failure:
        error instanceof Error
          ? error.message.slice(0, 160)
          : "Unknown failure",
    });
  }
  console.error(
    `${sample.sample_id}: ${results.length}/${observations.length}`,
  );
}
await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, {
  flag: "wx",
});
console.log(
  JSON.stringify({ model: adapter.model, decisions: results.length }),
);
