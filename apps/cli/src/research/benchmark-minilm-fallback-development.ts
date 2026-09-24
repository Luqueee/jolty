import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import type { BrowserState } from "@jolty/browser";
import { type DecisionProvider, runControlledTask } from "@jolty/core";
import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../../packages/browser/fixtures/routes.ts";
import { scenarios } from "../../../../packages/browser/fixtures/scenarios.ts";
import { codexFallback } from "../codex-fallback.ts";
import { controlledTasks } from "../controlled-tasks.ts";
import { projectBrowserLayaV2State } from "./browser-laya-v2-projection.ts";
import { loadFrozenEncoder, probabilities } from "./frozen-encoder.ts";
import type { ResearchSample } from "./research-corpus-reader.ts";

const runs = Number(process.env.JOLTY_DEVELOPMENT_RUNS ?? 3);
if (!Number.isInteger(runs) || runs < 1)
  throw new Error("JOLTY_DEVELOPMENT_RUNS must be a positive integer");
const headSource = await readFile("artifacts/frozen-encoder-v9.json");
const head = JSON.parse(headSource.toString("utf8"));
const fallback = codexFallback(head.threshold);
const browser = await chromium.launch();
const rssWithoutEncoder = process.memoryUsage().rss;
const encoder = await loadFrozenEncoder();
const rssWithEncoder = process.memoryUsage().rss;
const samples = [];
let sampledPeakRss = rssWithEncoder;
const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1] ?? null;
};
try {
  const model: DecisionProvider = {
    async decide(input) {
      const started = performance.now();
      const state = projectBrowserLayaV2State(input.state as BrowserState);
      const sample: ResearchSample = {
        sample_id: "development-live",
        split: "validation",
        split_group: state.origin,
        goal: input.goal,
        browser_state: state,
        candidates: input.candidates.map(({ element, score, signals }) => ({
          id: element.id,
          score,
          signals,
        })),
        training_action: null,
      };
      try {
        const encoded = (await encoder.encode([sample])).encoded[0];
        if (!encoded) throw new Error("No encoded decision");
        const distribution = probabilities(
          head.weights,
          encoded.options,
          head.temperature,
        );
        const confidence = Math.max(...distribution);
        const choice = encoded.options[distribution.indexOf(confidence)];
        if (!choice) throw new Error("No selected candidate");
        const elapsed = performance.now() - started;
        return {
          status: "selected",
          action: choice.action,
          targetId: choice.id,
          confidence,
          metrics: {
            decision_latency_ms: elapsed,
            model_call_ms: elapsed,
            tokenization_ms: null,
            inference_ms: null,
            input_tokens: null,
          },
        };
      } catch {
        const elapsed = performance.now() - started;
        return {
          status: "failed",
          reason: "development_encoder_failure",
          metrics: {
            decision_latency_ms: elapsed,
            model_call_ms: elapsed,
            tokenization_ms: null,
            inference_ms: null,
            input_tokens: null,
          },
        };
      }
    },
  };
  for (const task of Object.values(controlledTasks)) {
    const scenario = scenarios.find((item) => item.id === task.id);
    if (!scenario) throw new Error(`Missing scenario: ${task.id}`);
    for (let iteration = 0; iteration <= runs; iteration++) {
      const page = await browser.newPage();
      try {
        await installFixtureRoutes(page);
        const started = performance.now();
        await page.goto(fixtureUrl(task.id));
        const result = await runControlledTask(
          page,
          model,
          task,
          { name: "MiniLM frozen", version: "v9" },
          undefined,
          fallback,
        );
        const success =
          result.status === "completed" &&
          (await page
            .getByText(scenario.expectedOutcome, { exact: true })
            .isVisible());
        sampledPeakRss = Math.max(sampledPeakRss, process.memoryUsage().rss);
        if (iteration > 0)
          samples.push({
            task: task.id,
            success,
            duration_ms: performance.now() - started,
            steps: result.steps.length,
            fallback_calls: result.steps.filter((step) => step.fallback).length,
            fast_decision_ms: result.steps.map(
              (step) => step.timing.decision_latency_ms,
            ),
            state_extraction_ms: result.steps.map(
              (step) => step.timing.state_extraction_ms,
            ),
            retrieval_ms: result.steps.map(
              (step) => step.timing.candidate_retrieval_ms,
            ),
            fallback_ms: result.steps.flatMap((step) =>
              step.fallback ? [step.fallback.latency_ms] : [],
            ),
            failure: success ? null : result.steps.at(-1)?.final_outcome,
          });
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await encoder.close();
  await browser.close();
}
const fastTimes = samples.flatMap((sample) => sample.fast_decision_ms);
const report = {
  scope: "development fixtures only; live controlled fallback pilot",
  model: "MiniLM frozen v9",
  head_sha256: createHash("sha256").update(headSource).digest("hex"),
  threshold: head.threshold,
  fallback_model: fallback.model,
  hardware: {
    cpu: cpus()[0]?.model,
    logical_cpus: cpus().length,
    total_memory_bytes: totalmem(),
    browser: browser.version(),
    node: process.version,
  },
  concurrency: 1,
  batch_size: 1,
  warmup_runs_per_task: 1,
  measured_runs_per_task: runs,
  measured_tasks: samples.length,
  successful_tasks: samples.filter((sample) => sample.success).length,
  fallback_calls: samples.reduce(
    (sum, sample) => sum + sample.fallback_calls,
    0,
  ),
  attempted_steps: samples.reduce((sum, sample) => sum + sample.steps, 0),
  task_ms: {
    p50: percentile(
      samples.map((sample) => sample.duration_ms),
      0.5,
    ),
    p95: percentile(
      samples.map((sample) => sample.duration_ms),
      0.95,
    ),
    p99: percentile(
      samples.map((sample) => sample.duration_ms),
      0.99,
    ),
  },
  fast_decision_ms: {
    p50: percentile(fastTimes, 0.5),
    p95: percentile(fastTimes, 0.95),
    p99: percentile(fastTimes, 0.99),
  },
  rss: {
    before_encoder_bytes: rssWithoutEncoder,
    after_encoder_bytes: rssWithEncoder,
    sampled_peak_bytes: sampledPeakRss,
    sampling_limit:
      "sampled after tasks, not true process peak; includes browser connection and fallback adapter",
  },
  timing_limit:
    "fast decision combines serialization, tokenization, inference, and postprocessing; fallback latency is separate",
  samples,
};
await writeFile(
  "artifacts/minilm-live-fallback-development.json",
  `${JSON.stringify(report, null, 2)}\n`,
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    output: "artifacts/minilm-live-fallback-development.json",
    successful_tasks: report.successful_tasks,
    measured_tasks: report.measured_tasks,
    fallback_calls: report.fallback_calls,
  }),
);
