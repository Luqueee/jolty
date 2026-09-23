import {
  buildModelQuestion,
  type DecisionInput,
  type DecisionOption,
  selectedOption,
} from "./decision.ts";
import { LayaRuntime } from "./laya-runtime.ts";

export { LAYA_REVISION } from "./laya-runtime.ts";

export interface DecisionMetrics {
  decision_latency_ms: number;
  model_call_ms: number;
  tokenization_ms: number | null;
  inference_ms: number | null;
  input_tokens: number | null;
}

export type DecisionResult =
  | {
      status: "selected";
      action: DecisionOption["action"];
      targetId?: string;
      confidence: number;
      selected_probability: number;
      probabilities: Record<string, number>;
      considered: DecisionOption[];
      metrics: DecisionMetrics;
    }
  | {
      status: "failed";
      reason: "model_error" | "invalid_output";
      message: string;
      considered: DecisionOption[];
      metrics: DecisionMetrics;
    };

export class LayaDecisionModel {
  private readonly model: LayaRuntime;

  private constructor(model: LayaRuntime) {
    this.model = model;
  }

  static async load(): Promise<LayaDecisionModel> {
    const model = await LayaRuntime.load();
    return new LayaDecisionModel(model);
  }

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const start = performance.now();
    const question = buildModelQuestion(input);
    const modelStart = performance.now();
    let inputTokens: number | null = null;
    let tokenizationMs: number | null = null;
    let inferenceMs: number | null = null;
    try {
      const answer = await this.model.choose(question);
      const model_call_ms = performance.now() - modelStart;
      inputTokens = answer.input_tokens;
      tokenizationMs = answer.tokenization_ms;
      inferenceMs = answer.inference_ms;
      const option = selectedOption(question.options, answer.choice);
      const probability = answer.probabilities[answer.choice];
      if (
        !Number.isFinite(probability) ||
        probability < 0 ||
        probability > 1 ||
        !Number.isFinite(answer.confidence)
      )
        throw new Error("Model returned an invalid probability or confidence");
      return {
        status: "selected",
        action: option.action,
        targetId: option.targetId,
        confidence: answer.confidence,
        selected_probability: probability,
        probabilities: answer.probabilities,
        considered: question.options,
        metrics: {
          decision_latency_ms: performance.now() - start,
          model_call_ms,
          tokenization_ms: tokenizationMs,
          inference_ms: inferenceMs,
          input_tokens: inputTokens,
        },
      };
    } catch (error) {
      return {
        status: "failed",
        reason:
          error instanceof Error &&
          (error.message.startsWith("Model selected unknown option") ||
            error.message.startsWith("Model returned an invalid"))
            ? "invalid_output"
            : "model_error",
        message: error instanceof Error ? error.message : String(error),
        considered: question.options,
        metrics: {
          decision_latency_ms: performance.now() - start,
          model_call_ms: performance.now() - modelStart,
          tokenization_ms: tokenizationMs,
          inference_ms: inferenceMs,
          input_tokens: inputTokens,
        },
      };
    }
  }

  async close(): Promise<void> {
    await this.model.close();
  }
}
