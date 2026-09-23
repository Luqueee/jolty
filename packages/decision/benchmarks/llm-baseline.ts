import {
  buildModelQuestion,
  type DecisionInput,
  type DecisionOption,
  type ModelQuestion,
  selectedOption,
} from "../src/decision.ts";

export interface LargeModelUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface LargeModelResponse {
  choice: string;
  usage?: LargeModelUsage;
}

export interface LargeModelAdapter {
  provider: string;
  model: string;
  choose(question: ModelQuestion): Promise<LargeModelResponse>;
}

export interface TokenPrices {
  input_usd_per_million: number;
  output_usd_per_million: number;
}

export interface LargeModelMetrics {
  model_calls: number;
  decision_latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
}

export type LargeModelDecision =
  | {
      status: "selected";
      action: DecisionOption["action"];
      targetId?: string;
      provider: string;
      model: string;
      considered: DecisionOption[];
      metrics: LargeModelMetrics;
    }
  | {
      status: "failed";
      reason: "provider_error" | "invalid_output";
      provider: string;
      model: string;
      considered: DecisionOption[];
      metrics: LargeModelMetrics;
    };

function validUsage(usage: LargeModelUsage | undefined): boolean {
  return (
    usage === undefined ||
    (Number.isSafeInteger(usage.input_tokens) &&
      usage.input_tokens >= 0 &&
      Number.isSafeInteger(usage.output_tokens) &&
      usage.output_tokens >= 0)
  );
}

function estimateCost(
  usage: LargeModelUsage | undefined,
  prices: TokenPrices | undefined,
): number | null {
  if (!usage || !prices) return null;
  return (
    (usage.input_tokens * prices.input_usd_per_million +
      usage.output_tokens * prices.output_usd_per_million) /
    1_000_000
  );
}

/** Run one benchmark decision. This never executes the selected browser action. */
export async function evaluateLargeModelDecision(
  input: DecisionInput,
  adapter: LargeModelAdapter,
  prices?: TokenPrices,
): Promise<LargeModelDecision> {
  if (
    prices &&
    (!Number.isFinite(prices.input_usd_per_million) ||
      prices.input_usd_per_million < 0 ||
      !Number.isFinite(prices.output_usd_per_million) ||
      prices.output_usd_per_million < 0)
  ) {
    throw new RangeError("Token prices must be nonnegative finite numbers");
  }
  const question = buildModelQuestion(input);
  // Query parameters and fragments are unnecessary for these controlled tasks.
  const url = new URL(question.state.url);
  question.state.url = `${url.origin}${url.pathname}`;
  const start = performance.now();
  let response: LargeModelResponse;
  try {
    response = await adapter.choose(question);
  } catch {
    return {
      status: "failed",
      reason: "provider_error",
      provider: adapter.provider,
      model: adapter.model,
      considered: question.options,
      metrics: {
        model_calls: 1,
        decision_latency_ms: performance.now() - start,
        input_tokens: null,
        output_tokens: null,
        estimated_cost_usd: null,
      },
    };
  }

  const responseValid =
    response !== null &&
    typeof response === "object" &&
    typeof response.choice === "string" &&
    validUsage(response.usage);
  const usage = responseValid ? response.usage : undefined;
  const metrics: LargeModelMetrics = {
    model_calls: 1,
    decision_latency_ms: performance.now() - start,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    estimated_cost_usd: estimateCost(usage, prices),
  };
  try {
    if (!responseValid) throw new Error("Invalid response");
    const selected = selectedOption(question.options, response.choice);
    return {
      status: "selected",
      action: selected.action,
      targetId: selected.targetId,
      provider: adapter.provider,
      model: adapter.model,
      considered: question.options,
      metrics,
    };
  } catch {
    return {
      status: "failed",
      reason: "invalid_output",
      provider: adapter.provider,
      model: adapter.model,
      considered: question.options,
      metrics,
    };
  }
}
