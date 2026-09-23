import type { BrowserState } from "@jolty/browser";
import type { BrowserAction } from "./execute-action.ts";

export interface StepValue {
  action: "type" | "select";
  target: {
    role: string;
    name: string;
    id?: string;
  };
  value: string;
}

export interface StepIntent {
  goal: string;
  values: readonly StepValue[];
}

export type BindingResult =
  | { status: "ready"; command: BrowserAction }
  | {
      status: "failed";
      reason: "missing_value" | "ambiguous_target" | "ambiguous_value";
      message: string;
    };

export function bindStepIntent(
  state: BrowserState,
  selection: Pick<BrowserAction, "action" | "targetId">,
  intent: StepIntent,
): BindingResult {
  const { action, targetId } = selection;
  if (action !== "type" && action !== "select")
    return { status: "ready", command: { action, targetId } };

  const target = state.elements.find((element) => element.id === targetId);
  if (!target)
    return {
      status: "failed",
      reason: "missing_value",
      message: `No observed target for ${action}`,
    };

  const matching = intent.values.filter(
    (entry) =>
      entry.action === action &&
      entry.target.role === target.role &&
      entry.target.name === target.name &&
      (entry.target.id === undefined || entry.target.id === targetId),
  );
  if (matching.length === 0)
    return {
      status: "failed",
      reason: "missing_value",
      message: `No planned value for ${action} target ${targetId}`,
    };
  if (matching.length > 1)
    return {
      status: "failed",
      reason: "ambiguous_value",
      message: `Multiple planned values match ${action} target ${targetId}`,
    };
  if (
    matching[0].target.id === undefined &&
    state.elements.filter(
      (element) => element.role === target.role && element.name === target.name,
    ).length > 1
  )
    return {
      status: "failed",
      reason: "ambiguous_target",
      message: `Multiple observed targets match ${action} target ${targetId}`,
    };

  return {
    status: "ready",
    command: { action, targetId, value: matching[0].value },
  };
}
