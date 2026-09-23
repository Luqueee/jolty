import { expect, test } from "vitest";
import {
  type BenchmarkSample,
  summarizeBenchmarkSamples,
} from "./compare-summary.ts";

test("includes failed runs in duration and success statistics", () => {
  const samples: BenchmarkSample[] = [
    {
      status: "completed",
      failure_reason: null,
      duration_ms: 100,
      attempted_steps: 2,
      validated_steps: 2,
      decision_latencies_ms: [10, 20],
      model_calls: 2,
      input_tokens: 30,
      output_tokens: 4,
      estimated_cost_usd: 0.0001,
    },
    {
      status: "failed",
      failure_reason: "validation_failed",
      duration_ms: 200,
      attempted_steps: 1,
      validated_steps: 0,
      decision_latencies_ms: [30],
      model_calls: 1,
      input_tokens: 12,
      output_tokens: 2,
      estimated_cost_usd: 0.0002,
    },
  ];
  expect(summarizeBenchmarkSamples(samples)).toMatchObject({
    task_success_rate: 0.5,
    validated_step_rate: 2 / 3,
    task_duration_ms: { p50: 100, p95: 200, p99: 200 },
    decision_latency_ms: { p50: 20, p95: 30, p99: 30 },
    model_calls_per_task: 1.5,
    input_tokens_per_task: 21,
    output_tokens_per_task: 3,
    failures: ["validation_failed"],
  });
  expect(
    summarizeBenchmarkSamples(samples).estimated_cost_usd_per_task,
  ).toBeCloseTo(0.00015);
});

test("marks unavailable model and step metrics as null", () => {
  expect(
    summarizeBenchmarkSamples([
      {
        status: "completed",
        failure_reason: null,
        duration_ms: 40,
        attempted_steps: null,
        validated_steps: null,
        decision_latencies_ms: [],
        model_calls: 0,
        input_tokens: null,
        output_tokens: null,
        estimated_cost_usd: null,
      },
    ]),
  ).toMatchObject({
    validated_step_rate: null,
    decision_latency_ms: { p50: null },
    model_calls_per_task: 0,
    input_tokens_per_task: null,
    output_tokens_per_task: null,
    estimated_cost_usd_per_task: null,
  });
});
