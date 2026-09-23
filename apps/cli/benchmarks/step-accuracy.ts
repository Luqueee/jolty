import { type BrowserState, INTERACTIVE_SELECTOR } from "@jolty/browser";
import type { Action } from "@jolty/decision/contract";
import type { Page } from "playwright";
import type { FixtureDecisionLabel } from "../../../packages/browser/fixtures/scenarios.ts";

export interface SelectedAction {
  status: "selected" | "failed";
  action?: Action;
  targetId?: string;
}

export function matchesDecisionLabel(
  selected: SelectedAction,
  label: FixtureDecisionLabel,
  expectedTargetId: string | null,
): boolean {
  return (
    selected.status === "selected" &&
    selected.action === label.action &&
    (selected.targetId ?? null) === expectedTargetId
  );
}

export async function expectedTargetId(
  page: Page,
  state: BrowserState,
  label: FixtureDecisionLabel,
): Promise<string | null> {
  if (!label.targetSelector) {
    if (label.action !== "wait")
      throw new Error("Targeted decision label lacks a selector");
    return null;
  }
  const domIndex = await page
    .locator(label.targetSelector)
    .evaluate(
      (element, selector) =>
        Array.from(document.querySelectorAll(selector)).indexOf(element),
      INTERACTIVE_SELECTOR,
    );
  const targetId = state.elements.find(
    ({ domIndex: index }) => index === domIndex,
  )?.id;
  if (!targetId) throw new Error("Labeled target missing from browser state");
  return targetId;
}
