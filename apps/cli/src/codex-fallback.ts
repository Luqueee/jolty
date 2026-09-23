import type { DecisionProvider, FallbackConfig } from "@jolty/core";
import {
  assertChatGptLogin,
  CODEX_MODEL,
  codexSubscriptionAdapter,
} from "@jolty/decision/codex-subscription";
import { evaluateLargeModelDecision } from "@jolty/decision/large-model";

export function codexFallback(minConfidence: number): FallbackConfig {
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1)
    throw new RangeError(
      "Fallback confidence threshold must be between 0 and 1",
    );
  assertChatGptLogin();
  const adapter = codexSubscriptionAdapter();
  const provider: DecisionProvider = {
    async decide(input) {
      const decision = await evaluateLargeModelDecision(input, adapter);
      const metrics = {
        decision_latency_ms: decision.metrics.decision_latency_ms,
        model_call_ms: decision.metrics.decision_latency_ms,
        tokenization_ms: null,
        inference_ms: null,
        input_tokens: decision.metrics.input_tokens,
        output_tokens: decision.metrics.output_tokens,
        estimated_cost_usd: decision.metrics.estimated_cost_usd,
      };
      return decision.status === "selected"
        ? {
            status: "selected",
            action: decision.action,
            targetId: decision.targetId,
            confidence: null,
            metrics,
          }
        : { status: "failed", reason: decision.reason, metrics };
    },
  };
  return {
    provider,
    model: { name: "Codex ChatGPT subscription", version: CODEX_MODEL },
    policy: { minConfidence, onModelFailure: true },
  };
}
