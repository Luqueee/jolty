export interface RetrievalCase {
  fixture: string;
  goal: string;
  targetRole: string;
  targetName: string;
  occurrence?: number;
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
];

export function targetIdFor(
  candidates: readonly InteractiveElement[],
  testCase: RetrievalCase,
): string | undefined {
  return candidates.filter(
    ({ role, name }) =>
      role === testCase.targetRole && name === testCase.targetName,
  )[testCase.occurrence ? testCase.occurrence - 1 : 0]?.id;
}

import type { InteractiveElement } from "@jolty/browser";
