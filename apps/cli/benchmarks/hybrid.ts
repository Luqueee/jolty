import { execFileSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { runControlledTask } from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import { CODEX_MODEL } from "@jolty/decision/codex-subscription";
import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../packages/browser/fixtures/routes.ts";
import { scenarios } from "../../../packages/browser/fixtures/scenarios.ts";
import { codexFallback } from "../src/codex-fallback.ts";
import { controlledTasks } from "../src/controlled-tasks.ts";

const runs = Number(process.env.JOLTY_BENCH_RUNS ?? 5);
const threshold = Number(process.env.JOLTY_FALLBACK_THRESHOLD ?? 0.2);
if (!Number.isInteger(runs) || runs < 1)
  throw new RangeError("JOLTY_BENCH_RUNS must be a positive integer");
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
  throw new RangeError("JOLTY_FALLBACK_THRESHOLD must be between 0 and 1");

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1];
}

const fallback = codexFallback(threshold);
const browser = await chromium.launch();
try {
  const model = await LayaDecisionModel.load();
  try {
    const results = [];
    for (const task of Object.values(controlledTasks)) {
      const scenario = scenarios.find(({ id }) => id === task.id);
      if (!scenario) throw new Error(`Missing scenario for ${task.id}`);
      for (const mode of ["laya", "hybrid"] as const) {
        const samples = [];
        for (let iteration = 0; iteration <= runs; iteration++) {
          const page = await browser.newPage();
          try {
            await installFixtureRoutes(page);
            const start = performance.now();
            await page.goto(fixtureUrl(task.id));
            const result = await runControlledTask(
              page,
              model,
              task,
              { name: "Laya", version: LAYA_REVISION },
              undefined,
              mode === "hybrid" ? fallback : undefined,
            );
            const visible = await page
              .getByText(scenario.expectedOutcome, { exact: true })
              .isVisible();
            const fallbackSteps = result.steps.flatMap(({ fallback }) =>
              fallback ? [fallback] : [],
            );
            if (iteration > 0)
              samples.push({
                success: result.status === "completed" && visible,
                duration_ms: performance.now() - start,
                fast_decisions: result.steps.length,
                fallback_calls: fallbackSteps.length,
                fallback_latencies_ms: fallbackSteps.map(
                  ({ latency_ms }) => latency_ms,
                ),
                fast_latencies_ms: result.steps.map(
                  ({ timing }) => timing.decision_latency_ms,
                ),
                input_tokens: fallbackSteps.every(
                  ({ input_tokens }) => input_tokens !== null,
                )
                  ? fallbackSteps.reduce(
                      (sum, { input_tokens }) => sum + (input_tokens ?? 0),
                      0,
                    )
                  : null,
                output_tokens: fallbackSteps.every(
                  ({ output_tokens }) => output_tokens !== null,
                )
                  ? fallbackSteps.reduce(
                      (sum, { output_tokens }) => sum + (output_tokens ?? 0),
                      0,
                    )
                  : null,
                failure_reason:
                  result.status === "failed"
                    ? (result.steps.at(-1)?.final_outcome ?? "no_steps")
                    : visible
                      ? null
                      : "goal_not_visible",
              });
          } finally {
            await page.close();
          }
        }
        const fastDecisions = samples.reduce(
          (sum, sample) => sum + sample.fast_decisions,
          0,
        );
        const fallbackCalls = samples.reduce(
          (sum, sample) => sum + sample.fallback_calls,
          0,
        );
        results.push({
          task: task.id,
          mode,
          measured_runs: runs,
          successful_runs: samples.filter(({ success }) => success).length,
          task_success_rate:
            samples.filter(({ success }) => success).length / runs,
          task_duration_ms: {
            p50: percentile(
              samples.map(({ duration_ms }) => duration_ms),
              0.5,
            ),
            p95: percentile(
              samples.map(({ duration_ms }) => duration_ms),
              0.95,
            ),
          },
          fast_path_coverage: fastDecisions
            ? (fastDecisions - fallbackCalls) / fastDecisions
            : null,
          fallback_rate: fastDecisions ? fallbackCalls / fastDecisions : null,
          llm_calls_per_task: fallbackCalls / runs,
          fallback_latency_ms: {
            p50: percentile(
              samples.flatMap(
                ({ fallback_latencies_ms }) => fallback_latencies_ms,
              ),
              0.5,
            ),
            p95: percentile(
              samples.flatMap(
                ({ fallback_latencies_ms }) => fallback_latencies_ms,
              ),
              0.95,
            ),
          },
          fast_decision_latency_ms: {
            p50: percentile(
              samples.flatMap(({ fast_latencies_ms }) => fast_latencies_ms),
              0.5,
            ),
            p95: percentile(
              samples.flatMap(({ fast_latencies_ms }) => fast_latencies_ms),
              0.95,
            ),
          },
          llm_input_tokens_per_task: samples.every(
            ({ input_tokens }) => input_tokens !== null,
          )
            ? samples.reduce(
                (sum, { input_tokens }) => sum + (input_tokens ?? 0),
                0,
              ) / runs
            : null,
          llm_output_tokens_per_task: samples.every(
            ({ output_tokens }) => output_tokens !== null,
          )
            ? samples.reduce(
                (sum, { output_tokens }) => sum + (output_tokens ?? 0),
                0,
              ) / runs
            : null,
          estimated_cost_usd_per_task: null,
          failures: samples.flatMap(({ failure_reason }) =>
            failure_reason ? [failure_reason] : [],
          ),
        });
      }
    }
    console.log(
      JSON.stringify(
        {
          benchmark: "controlled-hybrid-v0",
          node_version: process.version,
          chromium_version: browser.version(),
          hardware: {
            cpu: cpus()[0]?.model,
            logical_cpus: cpus().length,
            total_memory_gb: Math.round(totalmem() / 2 ** 30),
          },
          laya_revision: LAYA_REVISION,
          fallback_model: CODEX_MODEL,
          codex_cli_version: execFileSync("codex", ["--version"], {
            encoding: "utf8",
          }).trim(),
          fallback_authentication: "ChatGPT subscription",
          experimental_confidence_threshold: threshold,
          concurrency: 1,
          warmup_runs_per_task_mode: 1,
          measured_runs_per_task_mode: runs,
          timing_scope:
            "Fixture navigation through final outcome; browser/model startup, page creation, and route installation excluded; Codex CLI startup included in fallback latency",
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
