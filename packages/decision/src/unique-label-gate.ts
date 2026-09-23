import type { DecisionInput } from "./decision.ts";

const normalize = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function uniqueLabelDecision(
  input: DecisionInput,
): { action: "type"; targetId: string } | null {
  const [first, second] = input.candidates;
  if (!first || (second && first.score - second.score < 16)) return null;
  if (!first.element.editable) return null;
  const label = normalize(first.element.name);
  const goal = normalize(input.goal);
  if (
    label.length < 4 ||
    !/\b(enter|change|write|type|fill)\b/.test(goal) ||
    !` ${goal} `.includes(` ${label} `) ||
    !(
      first.signals.exactMatch ||
      first.signals.normalizedMatch ||
      first.signals.labelMatch
    )
  )
    return null;
  const matches = input.state.elements.filter(
    (element) =>
      element.visible && element.enabled && normalize(element.name) === label,
  );
  if (matches.length !== 1 || matches[0].id !== first.element.id) return null;
  return { action: "type", targetId: first.element.id };
}
