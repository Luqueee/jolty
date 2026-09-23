import { INTERACTIVE_SELECTOR, type InteractiveElement } from "@jolty/browser";
import type { Page } from "playwright";
import { scenarios } from "../../browser/fixtures/scenarios.ts";

export interface RetrievalCase {
  fixture: string;
  phase?: string;
  goal: string;
  targetRole: string;
  targetName: string;
  occurrence?: number;
  targetSelector?: string;
}

export interface TargetlessDecisionCase {
  fixture: string;
  phase: string;
  goal: string;
  expectedAction: "wait" | "done";
}

export const targetlessDecisionCases: readonly TargetlessDecisionCase[] = [
  {
    fixture: "dynamic-results",
    phase: "loading",
    goal: "Wait for the report to become available",
    expectedAction: "wait",
  },
  {
    fixture: "login",
    phase: "complete",
    goal: "Sign in with valid credentials",
    expectedAction: "done",
  },
  {
    fixture: "cookie-overlay",
    phase: "complete",
    goal: "Continue to checkout after dismissing the cookie notice",
    expectedAction: "done",
  },
  {
    fixture: "dynamic-results",
    phase: "complete",
    goal: "Open the report after it loads",
    expectedAction: "done",
  },
];

export const modalProbeCase: RetrievalCase = {
  fixture: "modal",
  phase: "dialog-open",
  goal: "Confirm the action in the dialog",
  targetRole: "button",
  targetName: "Confirm",
};

export async function prepareModalProbeCase(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open dialog" }).click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
}

interface LabeledPhaseCase extends RetrievalCase {
  phase: string;
  targetSelector: string;
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

const laterPhaseTargets = [
  {
    fixture: "login",
    phase: "email-filled",
    targetRole: "textbox",
    targetName: "Password",
  },
  {
    fixture: "login",
    phase: "password-filled",
    targetRole: "button",
    targetName: "Sign in",
  },
  {
    fixture: "cookie-overlay",
    phase: "notice-dismissed",
    targetRole: "button",
    targetName: "Continue to checkout",
  },
  {
    fixture: "dynamic-results",
    phase: "report-ready",
    targetRole: "button",
    targetName: "Open report",
  },
] as const;

export const laterPhaseCases: readonly LabeledPhaseCase[] =
  laterPhaseTargets.map(({ fixture, phase, targetRole, targetName }) => {
    const label = scenarios
      .find(({ id }) => id === fixture)
      ?.decisionLabels?.find((entry) => entry.phase === phase);
    if (!label?.targetSelector || label.action === "wait")
      throw new Error(
        `Missing targeted decision label for ${fixture}/${phase}`,
      );
    return {
      fixture,
      phase,
      goal: label.goal,
      targetRole,
      targetName,
      targetSelector: label.targetSelector,
    };
  });

export const evaluationCases: readonly RetrievalCase[] = [
  ...retrievalCases,
  ...laterPhaseCases,
];

export async function prepareEvaluationCase(
  page: Page,
  testCase: RetrievalCase,
): Promise<void> {
  if (!testCase.phase) return;
  await prepareLabeledPhase(page, testCase.fixture, testCase.phase);
}

export async function prepareTargetlessDecisionCase(
  page: Page,
  testCase: TargetlessDecisionCase,
): Promise<void> {
  await prepareLabeledPhase(page, testCase.fixture, testCase.phase);
}

async function prepareLabeledPhase(
  page: Page,
  fixture: string,
  phase: string,
): Promise<void> {
  const labels = scenarios.find(({ id }) => id === fixture)?.decisionLabels;
  const phaseIndex =
    phase === "complete"
      ? (labels?.length ?? -1)
      : (labels?.findIndex((label) => label.phase === phase) ?? -1);
  if (!labels || phaseIndex < 1)
    throw new Error(`Missing prior labels for ${fixture}/${phase}`);

  if (fixture === "dynamic-results") {
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1_000));
  }

  for (const label of labels.slice(0, phaseIndex)) {
    if (label.action === "type") {
      if (
        !label.targetSelector ||
        label.expectedAfterAction.kind !== "input_value"
      )
        throw new Error(`Invalid type label for ${fixture}/${label.phase}`);
      await page
        .locator(label.targetSelector)
        .fill(label.expectedAfterAction.value);
    } else if (label.action === "click") {
      if (!label.targetSelector)
        throw new Error(`Missing click target for ${fixture}/${label.phase}`);
      await page.locator(label.targetSelector).click();
    } else if (label.action === "wait") {
      await page.clock.runFor(80);
    }
    const condition = label.expectedAfterAction;
    switch (condition.kind) {
      case "input_value":
        if (
          (await page.locator(condition.selector).inputValue()) !==
          condition.value
        )
          throw new Error("Fixture input did not reach labeled value");
        break;
      case "visible_text":
        await page
          .getByText(condition.text, { exact: true })
          .waitFor({ state: "visible" });
        break;
      case "element_hidden":
        await page.locator(condition.selector).waitFor({ state: "hidden" });
        break;
      case "element_visible":
        await page.locator(condition.selector).waitFor({ state: "visible" });
        break;
    }
  }
}

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
