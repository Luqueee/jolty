import { INTERACTIVE_SELECTOR, type InteractiveElement } from "@jolty/browser";
import type { Page } from "playwright";
import { scenarios } from "../../browser/fixtures/scenarios.ts";

export interface RetrievalCase {
  fixture: string;
  goal: string;
  targetRole: string;
  targetName: string;
  occurrence?: number;
  targetSelector?: string;
}

function initialTargetSelector(fixture: string): string {
  const label = scenarios.find(({ id }) => id === fixture)?.decisionLabels?.[0];
  if (label?.action !== "click" || !label.targetSelector)
    throw new Error(`Missing initial click label for ${fixture}`);
  return label.targetSelector;
}

export const retrievalCases: readonly RetrievalCase[] = [
  {
    fixture: "login",
    goal: "Enter email address",
    targetRole: "textbox",
    targetName: "Email",
  },
  {
    fixture: "login",
    goal: "Enter password",
    targetRole: "textbox",
    targetName: "Password",
  },
  {
    fixture: "login",
    goal: "Sign in",
    targetRole: "button",
    targetName: "Sign in",
  },
  {
    fixture: "logout",
    goal: "Log out of account",
    targetRole: "button",
    targetName: "Log out",
  },
  {
    fixture: "settings",
    goal: "Change display name",
    targetRole: "textbox",
    targetName: "Display name",
  },
  {
    fixture: "form",
    goal: "Write message",
    targetRole: "textbox",
    targetName: "Message",
  },
  {
    fixture: "validation",
    goal: "Enter invalid email",
    targetRole: "textbox",
    targetName: "Email",
  },
  {
    fixture: "modal",
    goal: "Open confirmation dialog",
    targetRole: "button",
    targetName: "Open dialog",
  },
  {
    fixture: "select",
    goal: "Select Spanish as language",
    targetRole: "combobox",
    targetName: "Language",
  },
  {
    fixture: "tabs",
    goal: "Open Security tab",
    targetRole: "tab",
    targetName: "Security",
  },
  {
    fixture: "redirect",
    goal: "Continue to destination",
    targetRole: "button",
    targetName: "Continue",
  },
  {
    fixture: "delayed",
    goal: "Load result",
    targetRole: "button",
    targetName: "Load result",
  },
  {
    fixture: "duplicate",
    goal: "Choose Pro plan",
    targetRole: "button",
    targetName: "Continue",
    occurrence: 2,
  },
  {
    fixture: "scroll",
    goal: "Reach target below fold",
    targetRole: "button",
    targetName: "Reach target",
  },
  {
    fixture: "cookie-overlay",
    goal: "Dismiss the cookie notice before checkout",
    targetRole: "button",
    targetName: "Accept cookies",
    targetSelector: initialTargetSelector("cookie-overlay"),
  },
  {
    fixture: "dynamic-results",
    goal: "Load the report",
    targetRole: "button",
    targetName: "Load report",
    targetSelector: initialTargetSelector("dynamic-results"),
  },
  {
    fixture: "ambiguous-row",
    goal: "Open the approved request",
    targetRole: "button",
    targetName: "Open",
    targetSelector: initialTargetSelector("ambiguous-row"),
  },
];

export function targetIdFor(
  candidates: readonly InteractiveElement[],
  testCase: RetrievalCase,
  targetDomIndex?: number,
): string | undefined {
  if (testCase.targetSelector)
    return candidates.find(
      ({ domIndex, role, name }) =>
        domIndex === targetDomIndex &&
        role === testCase.targetRole &&
        name === testCase.targetName,
    )?.id;
  return candidates.filter(
    ({ role, name }) =>
      role === testCase.targetRole && name === testCase.targetName,
  )[testCase.occurrence ? testCase.occurrence - 1 : 0]?.id;
}

export async function targetDomIndexFor(
  page: Page,
  testCase: RetrievalCase,
): Promise<number | undefined> {
  if (!testCase.targetSelector) return undefined;
  const index = await page
    .locator(testCase.targetSelector)
    .evaluate(
      (element, selector) =>
        Array.from(document.querySelectorAll(selector)).indexOf(element),
      INTERACTIVE_SELECTOR,
    );
  if (index < 0) throw new Error(`Unindexed target for ${testCase.fixture}`);
  return index;
}
