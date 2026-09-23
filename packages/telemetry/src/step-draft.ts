export interface StepTraceDraftInput {
  runId: string;
  stepId: string;
  goalSummary: string;
  page: { url: string; elementCount: number };
  candidates: readonly { id: string; role: string; score: number }[];
  decision:
    | {
        status: "selected";
        action: string;
        targetId?: string;
        confidence: number;
      }
    | { status: "failed"; reason: string };
  execution:
    | { status: "executed"; action_ms: number }
    | { status: "failed"; action_ms: number; reason: string };
  timing: {
    state_extraction_ms: number;
    candidate_filter_ms: number;
    candidate_retrieval_ms: number;
    tokenization_ms: number | null;
    inference_ms: number | null;
    decision_latency_ms: number;
  };
}

export function createStepTraceDraft(input: StepTraceDraftInput) {
  if (!input.runId || !input.stepId)
    throw new Error("Trace draft requires run and step IDs");
  const url = new URL(input.page.url);
  return {
    run_id: input.runId,
    step_id: input.stepId,
    goal_summary: input.goalSummary,
    browser_state: {
      origin: url.origin,
      pathname: url.pathname,
      element_count: input.page.elementCount,
    },
    candidates: input.candidates.map(({ id, role, score }) => ({
      id,
      role,
      score,
    })),
    decision:
      input.decision.status === "selected"
        ? {
            status: "selected" as const,
            action: input.decision.action,
            target_id: input.decision.targetId ?? null,
            confidence: input.decision.confidence,
          }
        : { status: "failed" as const, reason: input.decision.reason },
    execution:
      input.execution.status === "executed"
        ? { status: "executed" as const, action_ms: input.execution.action_ms }
        : {
            status: "failed" as const,
            reason: input.execution.reason,
            action_ms: input.execution.action_ms,
          },
    timing: { ...input.timing, action_ms: input.execution.action_ms },
    fallback_reason: null,
    validation_outcome: "pending" as const,
  };
}
