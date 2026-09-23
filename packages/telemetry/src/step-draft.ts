import type { ValidationResult } from "@jolty/validator";

const safeReasons = new Set([
  "model_error",
  "provider_error",
  "invalid_output",
  "unsupported_action",
  "invalid_target",
  "stale_state",
  "missing_value",
  "ambiguous_target",
  "ambiguous_value",
  "no_history",
  "playwright_error",
]);

function safeReason(reason: string): string {
  return safeReasons.has(reason) ? reason : "unknown";
}

export interface StepTraceDraftInput {
  runId: string;
  stepId: string;
  goalSummary: string;
  model: { name: string; version: string };
  page: { url: string; elementCount: number };
  candidates: readonly { id: string; role: string; score: number }[];
  decision:
    | {
        status: "selected";
        action: string;
        targetId?: string;
        confidence: number | null;
      }
    | { status: "failed"; reason: string };
  fastDecision?: StepTraceDraftInput["decision"];
  fallback?: {
    reason: "low_confidence" | "model_failure";
    model: { name: string; version: string };
    decision: StepTraceDraftInput["decision"];
    latency_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
    estimated_cost_usd: number | null;
  };
  execution:
    | { status: "executed"; action_ms: number }
    | { status: "failed"; action_ms: number; reason: string }
    | { status: "skipped" };
  timing: {
    state_extraction_ms: number;
    candidate_filter_ms: number;
    candidate_retrieval_ms: number;
    tokenization_ms: number | null;
    inference_ms: number | null;
    decision_latency_ms: number;
  };
}

function traceDecision(decision: StepTraceDraftInput["decision"]) {
  return decision.status === "selected"
    ? {
        status: "selected" as const,
        action: decision.action,
        target_id: decision.targetId ?? null,
        confidence: decision.confidence,
      }
    : { status: "failed" as const, reason: safeReason(decision.reason) };
}

export function createStepTraceDraft(input: StepTraceDraftInput) {
  if (!input.runId || !input.stepId || !input.goalSummary.trim())
    throw new Error("Trace draft requires run ID, step ID, and goal summary");
  if (!input.model.name || !input.model.version)
    throw new Error("Trace draft requires model name and version");
  if (
    (input.decision.status === "failed") !==
    (input.execution.status === "skipped")
  )
    throw new Error("Failed decisions must skip execution");
  const url = new URL(input.page.url);
  return {
    run_id: input.runId,
    step_id: input.stepId,
    goal_summary: input.goalSummary,
    model: { ...input.model },
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
    decision: traceDecision(input.decision),
    fast_decision: input.fastDecision
      ? traceDecision(input.fastDecision)
      : null,
    fallback: input.fallback
      ? {
          reason: input.fallback.reason,
          model: { ...input.fallback.model },
          decision: traceDecision(input.fallback.decision),
          latency_ms: input.fallback.latency_ms,
          input_tokens: input.fallback.input_tokens,
          output_tokens: input.fallback.output_tokens,
          estimated_cost_usd: input.fallback.estimated_cost_usd,
        }
      : null,
    execution:
      input.execution.status === "skipped"
        ? { status: "skipped" as const }
        : input.execution.status === "executed"
          ? {
              status: "executed" as const,
              action_ms: input.execution.action_ms,
            }
          : {
              status: "failed" as const,
              reason: safeReason(input.execution.reason),
              action_ms: input.execution.action_ms,
            },
    timing: {
      ...input.timing,
      fallback_ms: input.fallback?.latency_ms ?? null,
      total_decision_ms:
        input.timing.decision_latency_ms + (input.fallback?.latency_ms ?? 0),
      action_ms:
        input.execution.status === "skipped" ? null : input.execution.action_ms,
    },
    fallback_reason: input.fallback?.reason ?? null,
    validation_outcome: "pending" as const,
  };
}

export type StepTraceDraft = ReturnType<typeof createStepTraceDraft>;

export function completeStepTrace(
  draft: StepTraceDraft,
  validation: ValidationResult | { status: "skipped" },
) {
  if (draft.decision.status === "failed") {
    if (validation.status !== "skipped")
      throw new Error("Failed decisions must skip validation");
    return {
      ...draft,
      validation_outcome: "skipped" as const,
      validation: { status: "skipped" as const, checks: [] },
      timing: { ...draft.timing, validation_ms: null },
      final_outcome: "decision_failed" as const,
    };
  }
  if (draft.execution.status === "failed") {
    if (validation.status !== "action_failed")
      throw new Error("Failed actions require an action failure result");
  } else if (
    validation.status === "skipped" ||
    validation.status === "action_failed"
  )
    throw new Error("Executed actions require a validation result");

  return {
    ...draft,
    validation_outcome: validation.status,
    validation: {
      status: validation.status,
      checks: validation.checks.map(({ kind, passed }) => ({ kind, passed })),
    },
    timing: { ...draft.timing, validation_ms: validation.validation_ms },
    final_outcome:
      validation.status === "passed"
        ? ("passed" as const)
        : validation.status === "action_failed"
          ? ("action_failed" as const)
          : ("validation_failed" as const),
  };
}

export type StepTrace = ReturnType<typeof completeStepTrace>;
