import { randomUUID } from "node:crypto";
import { extractBrowserState } from "@jolty/browser";
import type { DecisionMetrics } from "@jolty/decision";
import type { Action, DecisionInput } from "@jolty/decision/contract";
import { executeAction } from "@jolty/executor";
import {
  bindStepIntent,
  type StepValue,
} from "@jolty/executor/bind-step-intent";
import { retrieveCandidates } from "@jolty/retrieval";
import { filterCandidates } from "@jolty/retrieval/candidate-filter";
import {
  completeStepTrace,
  createStepTraceDraft,
  type StepTrace,
  type StepTraceDraftInput,
} from "@jolty/telemetry";
import { type ValidationCheck, ValidationSession } from "@jolty/validator";
import type { Page } from "playwright";
import { type FallbackPolicy, fallbackReason } from "./fallback-policy.ts";

export interface ControlledStep {
  goal: string;
  checks: readonly ValidationCheck[];
  values?: readonly StepValue[];
}

export interface ControlledTask {
  id: string;
  steps: readonly ControlledStep[];
}

export interface DecisionProvider {
  decide(input: DecisionInput): Promise<
    | {
        status: "selected";
        action: Action;
        targetId?: string;
        confidence: number | null;
        metrics: DecisionMetrics & {
          output_tokens?: number | null;
          estimated_cost_usd?: number | null;
        };
      }
    | {
        status: "failed";
        reason: string;
        metrics: DecisionMetrics & {
          output_tokens?: number | null;
          estimated_cost_usd?: number | null;
        };
      }
  >;
}

export interface FallbackConfig {
  provider: DecisionProvider;
  model: { name: string; version: string };
  policy: FallbackPolicy;
}

export interface TaskRunResult {
  run_id: string;
  task_id: string;
  status: "completed" | "failed";
  task_duration_ms: number;
  steps: StepTrace[];
}

export async function runControlledTask(
  page: Page,
  model: DecisionProvider,
  task: ControlledTask,
  modelIdentity: { name: string; version: string },
  runId: string = randomUUID(),
  fallback?: FallbackConfig,
): Promise<TaskRunResult> {
  if (!task.id || task.steps.length === 0)
    throw new Error("A controlled task needs an ID and at least one step");
  const start = performance.now();
  const traces: StepTrace[] = [];
  for (const [index, step] of task.steps.entries()) {
    if (!step.goal.trim() || step.checks.length === 0)
      throw new Error(
        "Each controlled step needs a goal and validation checks",
      );
    const observation = await extractBrowserState(page);
    const filtered = filterCandidates(observation.state);
    const retrieved = retrieveCandidates(step.goal, filtered.candidates);
    const input = {
      goal: step.goal,
      state: observation.state,
      candidates: retrieved.topCandidates,
    };
    const fastDecision = await model.decide(input);
    const reason = fallback
      ? fallbackReason(fastDecision, fallback.policy)
      : null;
    let decision = fastDecision;
    let fallbackEvidence: StepTraceDraftInput["fallback"];
    if (reason && fallback) {
      const fallbackStart = performance.now();
      try {
        decision = await fallback.provider.decide(input);
      } catch {
        decision = {
          status: "failed",
          reason: "provider_error",
          metrics: {
            decision_latency_ms: performance.now() - fallbackStart,
            model_call_ms: performance.now() - fallbackStart,
            tokenization_ms: null,
            inference_ms: null,
            input_tokens: null,
          },
        };
      }
      fallbackEvidence = {
        reason,
        model: fallback.model,
        decision,
        latency_ms: performance.now() - fallbackStart,
        input_tokens: decision.metrics.input_tokens,
        output_tokens: decision.metrics.output_tokens ?? null,
        estimated_cost_usd: decision.metrics.estimated_cost_usd ?? null,
      };
    }
    const evidence = {
      runId,
      stepId: String(index + 1),
      goalSummary: step.goal,
      model: modelIdentity,
      page: {
        url: observation.state.url,
        elementCount: observation.state.elements.length,
      },
      candidates: retrieved.topCandidates.map(({ element, score }) => ({
        id: element.id,
        role: element.role,
        score,
      })),
      fastDecision: reason ? fastDecision : undefined,
      fallback: fallbackEvidence,
      timing: {
        state_extraction_ms: observation.metrics.state_extraction_ms,
        candidate_filter_ms: filtered.metrics.candidate_filter_ms,
        candidate_retrieval_ms: retrieved.metrics.candidate_retrieval_ms,
        tokenization_ms: fastDecision.metrics.tokenization_ms,
        inference_ms: fastDecision.metrics.inference_ms,
        decision_latency_ms: fastDecision.metrics.decision_latency_ms,
      },
    };
    if (decision.status === "failed") {
      const draft = createStepTraceDraft({
        ...evidence,
        decision: { status: "failed", reason: decision.reason },
        execution: { status: "skipped" },
      });
      traces.push(completeStepTrace(draft, { status: "skipped" }));
      break;
    }

    const selected = {
      status: "selected" as const,
      action: decision.action,
      targetId: decision.targetId,
      confidence: decision.confidence,
    };
    const binding = bindStepIntent(observation.state, decision, {
      goal: step.goal,
      values: step.values ?? [],
    });
    if (binding.status === "failed") {
      const draft = createStepTraceDraft({
        ...evidence,
        decision: selected,
        execution: {
          status: "failed",
          action_ms: 0,
          reason: binding.reason,
        },
      });
      traces.push(
        completeStepTrace(draft, {
          status: "action_failed",
          action_reason: binding.reason,
          checks: [],
          validation_ms: 0,
        }),
      );
      break;
    }

    const session = await ValidationSession.start(
      page,
      observation.state,
      step.checks,
    );
    try {
      const execution = await executeAction(
        page,
        observation.state,
        binding.command,
      );
      const validation = await session.validate(execution);
      const draft = createStepTraceDraft({
        ...evidence,
        decision: selected,
        execution:
          execution.status === "executed"
            ? { status: "executed", action_ms: execution.action_ms }
            : {
                status: "failed",
                action_ms: execution.action_ms,
                reason: execution.reason,
              },
      });
      const trace = completeStepTrace(draft, validation);
      traces.push(trace);
      if (trace.final_outcome !== "passed") break;
    } finally {
      session.close();
    }
  }
  return {
    run_id: runId,
    task_id: task.id,
    status:
      traces.length === task.steps.length &&
      traces.every(({ final_outcome }) => final_outcome === "passed")
        ? "completed"
        : "failed",
    task_duration_ms: performance.now() - start,
    steps: traces,
  };
}

export function formatTaskResult(result: TaskRunResult): string {
  const lines = result.steps.map((step) => {
    const action =
      step.decision.status === "selected" ? step.decision.action : "decide";
    const outcome = step.final_outcome === "passed" ? "PASS" : "FAIL";
    return `${step.step_id.padStart(2, "0")}  ${action}  ${step.goal_summary}  ${outcome}`;
  });
  lines.push(
    result.status === "completed"
      ? "Task completed."
      : `Task failed: ${result.steps.at(-1)?.final_outcome ?? "no_steps"}.`,
  );
  return lines.join("\n");
}
