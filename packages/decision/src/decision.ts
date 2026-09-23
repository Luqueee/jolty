import type { BrowserState, InteractiveElement } from "@jolty/browser";
import type { RankedCandidate } from "@jolty/retrieval";

export const ACTIONS = [
  "click",
  "type",
  "select",
  "scroll",
  "wait",
  "back",
  "done",
] as const;

export type Action = (typeof ACTIONS)[number];
export type TargetFreeAction = "scroll" | "wait" | "back" | "done";

export interface DecisionQuestionOptions {
  targetFreeActions?: readonly TargetFreeAction[];
}

export interface DecisionOption {
  key: string;
  action: Action;
  targetId?: string;
  description: string;
}

export interface DecisionInput {
  goal: string;
  state: BrowserState;
  candidates: readonly RankedCandidate[];
}

export interface ModelQuestion {
  state: { goal: string; url: string; title: string };
  questions: {
    next_action: {
      type: "choice";
      instructions: string;
      criteria: Record<string, string>;
    };
  };
  options: DecisionOption[];
}

export function actionFor(element: InteractiveElement): Action {
  if (element.editable) return "type";
  if (element.role === "combobox" && element.value !== undefined)
    return "select";
  return "click";
}

export function buildModelQuestion(
  input: DecisionInput,
  config: DecisionQuestionOptions = {},
): ModelQuestion {
  if (!input.goal.trim()) throw new Error("Decision goal must not be empty");
  const seenIds = new Set<string>();
  const options: DecisionOption[] = input.candidates.map(
    ({ element }, index) => {
      if (!element.id || seenIds.has(element.id))
        throw new Error(`Duplicate or empty candidate ID: ${element.id}`);
      seenIds.add(element.id);
      const action = actionFor(element);
      const label = (element.name || element.text || element.role).slice(0, 80);
      const state = element.hasValue ? ", has value" : "";
      return {
        key: `c${index + 1}`,
        action,
        targetId: element.id,
        description: `${action} ${element.role} "${label}" (id ${element.id}${state})`,
      };
    },
  );
  for (const action of config.targetFreeActions ?? [
    "scroll",
    "wait",
    "back",
    "done",
  ]) {
    options.push({
      key: action,
      action,
      description: {
        scroll: "scroll the page to find the target",
        wait: "wait for the page to change",
        back: "go back to the previous page",
        done: "the current goal is complete",
      }[action],
    });
  }
  return {
    state: {
      goal: input.goal,
      url: input.state.url,
      title: input.state.title,
    },
    questions: {
      next_action: {
        type: "choice",
        instructions:
          "Choose the single next browser action that best advances the goal. Use only the listed options.",
        criteria: Object.fromEntries(
          options.map(({ key, description }) => [key, description]),
        ),
      },
    },
    options,
  };
}

export function selectedOption(
  options: readonly DecisionOption[],
  key: string,
): DecisionOption {
  const option = options.find((candidate) => candidate.key === key);
  if (!option) throw new Error(`Model selected unknown option: ${key}`);
  return option;
}
