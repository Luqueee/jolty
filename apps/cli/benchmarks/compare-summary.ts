export interface BenchmarkSample {
  status: "completed" | "failed";
  failure_reason: string | null;
  duration_ms: number;
  attempted_steps: number | null;
  validated_steps: number | null;
  decision_latencies_ms: number[];
  model_calls: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1];
}

export function summarizeBenchmarkSamples(samples: readonly BenchmarkSample[]) {
  const completed = samples.filter(({ status }) => status === "completed");
  const decisionTimes = samples.flatMap(
    ({ decision_latencies_ms }) => decision_latencies_ms,
  );
  const attempted = samples.reduce(
    (sum, { attempted_steps }) => sum + (attempted_steps ?? 0),
    0,
  );
  const validated = samples.reduce(
    (sum, { validated_steps }) => sum + (validated_steps ?? 0),
    0,
  );
  const tokenSamples = samples.filter(
    ({ input_tokens }) => input_tokens !== null,
  );
  const outputTokenSamples = samples.filter(
    ({ output_tokens }) => output_tokens !== null,
  );
  const costSamples = samples.filter(
    ({ estimated_cost_usd }) => estimated_cost_usd !== null,
  );
  return {
    measured_runs: samples.length,
    successful_runs: completed.length,
    failed_runs: samples.length - completed.length,
    task_success_rate: samples.length
      ? completed.length / samples.length
      : null,
    validated_step_rate: attempted ? validated / attempted : null,
    task_duration_ms: {
      p50: percentile(
        samples.map(({ duration_ms }) => duration_ms),
        0.5,
      ),
      p95: percentile(
        samples.map(({ duration_ms }) => duration_ms),
        0.95,
      ),
      p99: percentile(
        samples.map(({ duration_ms }) => duration_ms),
        0.99,
      ),
    },
    decision_latency_ms: {
      p50: percentile(decisionTimes, 0.5),
      p95: percentile(decisionTimes, 0.95),
      p99: percentile(decisionTimes, 0.99),
    },
    model_calls_per_task:
      samples.length > 0
        ? samples.reduce((sum, { model_calls }) => sum + model_calls, 0) /
          samples.length
        : null,
    input_tokens_per_task:
      tokenSamples.length === samples.length && samples.length > 0
        ? tokenSamples.reduce(
            (sum, { input_tokens }) => sum + (input_tokens ?? 0),
            0,
          ) / samples.length
        : null,
    output_tokens_per_task:
      outputTokenSamples.length === samples.length && samples.length > 0
        ? outputTokenSamples.reduce(
            (sum, { output_tokens }) => sum + (output_tokens ?? 0),
            0,
          ) / samples.length
        : null,
    estimated_cost_usd_per_task:
      costSamples.length === samples.length && samples.length > 0
        ? costSamples.reduce(
            (sum, { estimated_cost_usd }) => sum + (estimated_cost_usd ?? 0),
            0,
          ) / samples.length
        : null,
    failures: samples.flatMap(({ failure_reason }) =>
      failure_reason ? [failure_reason] : [],
    ),
  };
}
