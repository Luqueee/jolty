import { cpus, totalmem } from "node:os";
import { runControlledTask } from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../packages/browser/fixtures/routes.ts";
import { controlledTasks } from "../src/controlled-tasks.ts";

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * p) - 1];
}

const browser = await chromium.launch();
try {
  const model = await LayaDecisionModel.load();
  try {
    const results = [];
    for (const task of Object.values(controlledTasks)) {
      const durations: number[] = [];
      const decisionDurations: number[] = [];
      const failures: string[] = [];
      for (let index = 0; index < 11; index++) {
        const page = await browser.newPage();
        try {
          await installFixtureRoutes(page);
          const start = performance.now();
          await page.goto(fixtureUrl(task.id));
          const result = await runControlledTask(page, model, task, {
            name: "Laya",
            version: LAYA_REVISION,
          });
          if (index === 0) continue;
          if (result.status === "completed") {
            durations.push(performance.now() - start);
            decisionDurations.push(
              ...result.steps.map((step) => step.timing.decision_latency_ms),
            );
          } else
            failures.push(result.steps.at(-1)?.final_outcome ?? "no_steps");
        } catch (error) {
          if (index > 0)
            failures.push(
              error instanceof Error ? error.message : String(error),
            );
        } finally {
          await page.close();
        }
      }
      results.push({
        task: task.id,
        successful_runs: durations.length,
        failed_runs: failures.length,
        task_duration_ms: {
          p50: percentile(durations, 0.5),
          p95: percentile(durations, 0.95),
        },
        decision_latency_ms: {
          p50: percentile(decisionDurations, 0.5),
          p95: percentile(decisionDurations, 0.95),
        },
        failures,
      });
    }
    console.log(
      JSON.stringify(
        {
          benchmark: "controlled-loop-v0",
          model_revision: LAYA_REVISION,
          node_version: process.version,
          chromium_version: browser.version(),
          hardware: {
            cpu: cpus()[0]?.model,
            logical_cpus: cpus().length,
            total_memory_gb: Math.round(totalmem() / 2 ** 30),
          },
          concurrency: 1,
          warmup_runs_per_task: 1,
          measured_runs_per_task: 10,
          timing_scope:
            "Fixture navigation through validated completion; browser/model startup, page creation, and route installation excluded",
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await model.close();
  }
} finally {
  await browser.close();
}
