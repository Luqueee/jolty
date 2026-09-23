import { type DecisionProvider, runControlledTask } from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import type { DecisionInput } from "@jolty/decision/contract";
import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../packages/browser/fixtures/routes.ts";
import { scenarios } from "../../../packages/browser/fixtures/scenarios.ts";
import { expectedTargetId } from "../benchmarks/step-accuracy.ts";
import { codexFallback } from "./codex-fallback.ts";
import { controlledTasks } from "./controlled-tasks.ts";
import {
  type DatasetRow,
  makeDatasetRow,
  SPLITS,
  writeDataset,
} from "./dataset.ts";

const output =
  process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
  "artifacts/dataset-v1";
const includeFallback = process.argv.includes("--fallback");
const browser = await chromium.launch();
try {
  const model = await LayaDecisionModel.load();
  try {
    const rows: DatasetRow[] = [];
    for (const fixtureId of Object.keys(SPLITS) as (keyof typeof SPLITS)[]) {
      const task = controlledTasks[fixtureId];
      const labels = scenarios.find(
        ({ id }) => id === fixtureId,
      )?.decisionLabels;
      if (!task || !labels || labels.length !== task.steps.length)
        throw new Error(`Fixture ${fixtureId} needs one label per task step`);
      const page = await browser.newPage();
      try {
        await installFixtureRoutes(page);
        await page.goto(fixtureUrl(fixtureId));
        const captured: {
          input: DecisionInput;
          expectedTargetId: string | null;
        }[] = [];
        const provider: DecisionProvider = {
          async decide(input) {
            const label = labels[captured.length];
            if (!label) throw new Error("Unexpected decision step");
            captured.push({
              input,
              expectedTargetId: await expectedTargetId(
                page,
                input.state,
                label,
              ),
            });
            return model.decide(input);
          },
        };
        const result = await runControlledTask(
          page,
          provider,
          task,
          { name: "Laya", version: LAYA_REVISION },
          `dataset-v1:${fixtureId}`,
          includeFallback ? codexFallback(0.2) : undefined,
        );
        if (captured.length !== result.steps.length)
          throw new Error("Decision inputs and traces disagree");
        result.steps.forEach((trace, index) => {
          const capture = captured[index];
          const label = labels[index];
          if (!capture || !label)
            throw new Error("Missing dataset step evidence");
          rows.push(
            makeDatasetRow({
              fixtureId,
              stepIndex: index + 1,
              input: capture.input,
              trace,
              label,
              expectedTargetId: capture.expectedTargetId,
            }),
          );
        });
      } finally {
        await page.close();
      }
    }
    const manifest = await writeDataset(rows, output);
    console.log(JSON.stringify({ output, ...manifest }, null, 2));
  } finally {
    await model.close();
  }
} finally {
  await browser.close();
}
