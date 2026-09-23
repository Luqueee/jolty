import { execFileSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import {
  type DecisionProvider,
  formatTaskResult,
  runControlledTask,
} from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import {
  assertChatGptLogin,
  CODEX_MODEL,
  codexSubscriptionAdapter,
} from "@jolty/decision/codex-subscription";
import { evaluateLargeModelDecision } from "@jolty/decision/large-model";
import { chromium } from "playwright";
import { referenceFlows } from "../../../packages/browser/benchmarks/reference-flows.ts";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../packages/browser/fixtures/routes.ts";
import { scenarios } from "../../../packages/browser/fixtures/scenarios.ts";
import { controlledTasks } from "../src/controlled-tasks.ts";
import {
  type BenchmarkSample,
  summarizeBenchmarkSamples,
} from "./compare-summary.ts";
import { heuristicDecision } from "./heuristic.ts";
import { expectedTargetId, matchesDecisionLabel } from "./step-accuracy.ts";

const measuredRuns = Number(process.env.JOLTY_BENCH_RUNS ?? 20);
if (!Number.isInteger(measuredRuns) || measuredRuns < 1)
  throw new RangeError("JOLTY_BENCH_RUNS must be a positive integer");
const includeCodex = process.env.JOLTY_INCLUDE_CODEX === "1";
const codexVersion = includeCodex
  ? execFileSync("codex", ["--version"], { encoding: "utf8" }).trim()
  : null;
if (includeCodex) assertChatGptLogin();
const codex = includeCodex ? codexSubscriptionAdapter() : null;

const browser = await chromium.launch();
let benchmarkErrors = 0;
try {
  const laya = await LayaDecisionModel.load();
  try {
    const results = [];
    for (const task of Object.values(controlledTasks)) {
      const scenario = scenarios.find(({ id }) => id === task.id);
      const referenceFlow = referenceFlows[task.id];
      if (!scenario || !referenceFlow)
        throw new Error(`Missing reference scenario for ${task.id}`);
      const labels = scenario.decisionLabels;
      if (
        !labels ||
        labels.length !== task.steps.length ||
        labels.some((label, index) => label.goal !== task.steps[index]?.goal)
      )
        throw new Error(`Missing step accuracy labels for ${task.id}`);
      const policies = ["playwright", "heuristic", "laya"] as const;
      for (const policy of [
        ...policies,
        ...(codex ? (["codex"] as const) : []),
      ]) {
        const samples: BenchmarkSample[] = [];
        for (let iteration = 0; iteration <= measuredRuns; iteration++) {
          const page = await browser.newPage();
          try {
            await installFixtureRoutes(page);
            const start = performance.now();
            await page.goto(fixtureUrl(task.id));
            let sample: BenchmarkSample;
            if (policy === "playwright") {
              await referenceFlow(page);
              await page
                .getByText(scenario.expectedOutcome, { exact: true })
                .waitFor({ state: "visible", timeout: 5_000 });
              sample = {
                status: "completed",
                failure_reason: null,
                duration_ms: performance.now() - start,
                attempted_steps: null,
                validated_steps: null,
                labeled_steps: null,
                correct_steps: null,
                decision_latencies_ms: [],
                model_calls: 0,
                input_tokens: null,
                output_tokens: null,
                estimated_cost_usd: null,
              };
            } else {
              let modelCalls = 0;
              let inputTokens: number | null =
                policy === "heuristic" ? null : 0;
              let outputTokens: number | null = policy === "codex" ? 0 : null;
              let oracleMs = 0;
              const correctDecisions: boolean[] = [];
              const provider: DecisionProvider = {
                async decide(input) {
                  const label = labels[correctDecisions.length];
                  if (!label || label.goal !== input.goal)
                    throw new Error(
                      "Decision does not match the labeled task step",
                    );
                  const oracleStart = performance.now();
                  const expectedId = await expectedTargetId(
                    page,
                    input.state,
                    label,
                  );
                  oracleMs += performance.now() - oracleStart;
                  let selected: Awaited<ReturnType<DecisionProvider["decide"]>>;
                  if (policy === "heuristic") {
                    selected = await heuristicDecision.decide(input);
                  } else if (policy === "codex") {
                    modelCalls++;
                    const decision = await evaluateLargeModelDecision(
                      input,
                      codex as NonNullable<typeof codex>,
                    );
                    if (decision.metrics.input_tokens === null)
                      inputTokens = null;
                    else if (inputTokens !== null)
                      inputTokens += decision.metrics.input_tokens;
                    if (decision.metrics.output_tokens === null)
                      outputTokens = null;
                    else if (outputTokens !== null)
                      outputTokens += decision.metrics.output_tokens;
                    const metrics = {
                      decision_latency_ms: decision.metrics.decision_latency_ms,
                      model_call_ms: decision.metrics.decision_latency_ms,
                      tokenization_ms: null,
                      inference_ms: null,
                      input_tokens: decision.metrics.input_tokens,
                    };
                    selected =
                      decision.status === "selected"
                        ? {
                            status: "selected",
                            action: decision.action,
                            targetId: decision.targetId,
                            confidence: null,
                            metrics,
                          }
                        : {
                            status: "failed",
                            reason: decision.reason,
                            metrics,
                          };
                  } else {
                    modelCalls++;
                    selected = await laya.decide(input);
                    if (selected.metrics.input_tokens === null)
                      inputTokens = null;
                    else if (inputTokens !== null)
                      inputTokens += selected.metrics.input_tokens;
                  }
                  correctDecisions.push(
                    matchesDecisionLabel(selected, label, expectedId),
                  );
                  return selected;
                },
              };
              const result = await runControlledTask(page, provider, task, {
                name: policy,
                version:
                  policy === "laya"
                    ? LAYA_REVISION
                    : policy === "codex"
                      ? CODEX_MODEL
                      : "v0",
              });
              const goalVisible = await page
                .getByText(scenario.expectedOutcome, { exact: true })
                .isVisible();
              const completed = result.status === "completed" && goalVisible;
              sample = {
                status: completed ? "completed" : "failed",
                failure_reason: completed
                  ? null
                  : result.status === "failed"
                    ? (result.steps.at(-1)?.final_outcome ?? "no_steps")
                    : "goal_not_visible",
                duration_ms: performance.now() - start - oracleMs,
                attempted_steps: result.steps.length,
                validated_steps: result.steps.filter(
                  ({ final_outcome }) => final_outcome === "passed",
                ).length,
                labeled_steps: correctDecisions.length,
                correct_steps: correctDecisions.filter(Boolean).length,
                decision_latencies_ms: result.steps.map(
                  ({ timing }) => timing.decision_latency_ms,
                ),
                model_calls: modelCalls,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                estimated_cost_usd: null,
              };
              if (!completed && iteration === 1)
                console.error(
                  `${policy}/${task.id}: ${formatTaskResult(result)}`,
                );
            }
            if (iteration > 0) samples.push(sample);
          } catch {
            if (iteration > 0) {
              benchmarkErrors++;
              samples.push({
                status: "failed",
                failure_reason: "benchmark_error",
                duration_ms: 0,
                attempted_steps: null,
                validated_steps: null,
                labeled_steps: null,
                correct_steps: null,
                decision_latencies_ms: [],
                model_calls: 0,
                input_tokens: null,
                output_tokens: null,
                estimated_cost_usd: null,
              });
            }
          } finally {
            await page.close();
          }
        }
        results.push({
          task: task.id,
          policy,
          ...summarizeBenchmarkSamples(samples),
        });
      }
    }
    console.log(
      JSON.stringify(
        {
          benchmark: "controlled-comparison-v0",
          node_version: process.version,
          chromium_version: browser.version(),
          hardware: {
            cpu: cpus()[0]?.model,
            logical_cpus: cpus().length,
            total_memory_gb: Math.round(totalmem() / 2 ** 30),
          },
          laya_revision: LAYA_REVISION,
          codex_model: codex ? CODEX_MODEL : null,
          codex_cli_version: codexVersion,
          codex_authentication: codex ? "ChatGPT subscription" : null,
          concurrency: 1,
          warmup_runs_per_task_policy: 1,
          measured_runs_per_task_policy: measuredRuns,
          timing_scope:
            "Fixture navigation through final outcome; browser/Laya startup, page creation, route installation, and accuracy-oracle reads excluded; per-decision Codex CLI startup included",
          candidate_recall_at_k: null,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await laya.close();
  }
} finally {
  await browser.close();
}
if (benchmarkErrors > 0) process.exitCode = 1;
