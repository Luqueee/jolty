import type { DecisionProvider } from "@jolty/core";

export const heuristicDecision: DecisionProvider = {
  async decide({ candidates }) {
    const start = performance.now();
    const first = candidates[0]?.element;
    const metrics = () => ({
      decision_latency_ms: performance.now() - start,
      model_call_ms: 0,
      tokenization_ms: null,
      inference_ms: null,
      input_tokens: null,
    });
    if (!first)
      return { status: "failed", reason: "invalid_output", metrics: metrics() };
    return {
      status: "selected",
      action: first.editable
        ? "type"
        : ["combobox", "listbox", "option"].includes(first.role)
          ? "select"
          : "click",
      targetId: first.id,
      confidence: null,
      metrics: metrics(),
    };
  },
};
