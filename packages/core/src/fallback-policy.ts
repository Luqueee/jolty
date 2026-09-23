import type { DecisionProvider } from "./run-task.ts";

export type FallbackReason = "model_failure" | "low_confidence";

export interface FallbackPolicy {
  minConfidence: number;
  onModelFailure: boolean;
}

export function fallbackReason(
  decision: Awaited<ReturnType<DecisionProvider["decide"]>>,
  policy: FallbackPolicy,
): FallbackReason | null {
  if (
    !Number.isFinite(policy.minConfidence) ||
    policy.minConfidence < 0 ||
    policy.minConfidence > 1
  )
    throw new RangeError(
      "Fallback confidence threshold must be between 0 and 1",
    );
  if (decision.status === "failed")
    return policy.onModelFailure ? "model_failure" : null;
  if (decision.confidence === null || !Number.isFinite(decision.confidence))
    return null;
  return decision.confidence < policy.minConfidence ? "low_confidence" : null;
}
