export interface FixtureScenario {
  id: string;
  goal: string;
  validActions: readonly string[];
  expectedOutcome: string;
  decisionLabels?: readonly FixtureDecisionLabel[];
}

export type FixtureSuccessCondition =
  | { kind: "input_value"; selector: string; value: string }
  | { kind: "visible_text"; text: string }
  | { kind: "element_hidden" | "element_visible"; selector: string };

export interface FixtureDecisionLabel {
  phase: string;
  goal: string;
  action: "click" | "type" | "wait";
  targetSelector?: string;
  expectedAfterAction: FixtureSuccessCondition;
}

export const scenarios: readonly FixtureScenario[] = [
  {
    id: "login",
    goal: "Sign in with valid credentials",
    validActions: ["Fill Email", "Fill Password", "Click Sign in"],
    expectedOutcome: "Signed in",
    decisionLabels: [
      {
        phase: "initial",
        goal: "Enter email address",
        action: "type",
        targetSelector: 'input[name="email"]',
        expectedAfterAction: {
          kind: "input_value",
          selector: 'input[name="email"]',
          value: "person@example.test",
        },
      },
      {
        phase: "email-filled",
        goal: "Enter password",
        action: "type",
        targetSelector: 'input[name="password"]',
        expectedAfterAction: {
          kind: "input_value",
          selector: 'input[name="password"]',
          value: "correct-password",
        },
      },
      {
        phase: "password-filled",
        goal: "Sign in",
        action: "click",
        targetSelector: 'button[type="submit"]',
        expectedAfterAction: { kind: "visible_text", text: "Signed in" },
      },
    ],
  },
  {
    id: "logout",
    goal: "Sign out of the account",
    validActions: ["Click Log out"],
    expectedOutcome: "Signed out",
  },
  {
    id: "settings",
    goal: "Change the display name",
    validActions: ["Fill Display name", "Click Save profile"],
    expectedOutcome: "Updated: New name",
    decisionLabels: [
      {
        phase: "initial",
        goal: "Change display name",
        action: "type",
        targetSelector: 'input[name="displayName"]',
        expectedAfterAction: {
          kind: "input_value",
          selector: 'input[name="displayName"]',
          value: "New name",
        },
      },
      {
        phase: "name-changed",
        goal: "Save profile",
        action: "click",
        targetSelector: 'button[type="submit"]',
        expectedAfterAction: {
          kind: "visible_text",
          text: "Updated: New name",
        },
      },
    ],
  },
  {
    id: "form",
    goal: "Submit a message",
    validActions: ["Fill Message", "Click Send"],
    expectedOutcome: "Message sent",
  },
  {
    id: "validation",
    goal: "Detect an invalid email address",
    validActions: ["Fill Email with an invalid address", "Click Submit"],
    expectedOutcome: "Enter a valid email",
  },
  {
    id: "modal",
    goal: "Confirm an action in a dialog",
    validActions: ["Click Open dialog", "Click Confirm in the dialog"],
    expectedOutcome: "Confirmed",
    decisionLabels: [
      {
        phase: "initial",
        goal: "Open confirmation dialog",
        action: "click",
        targetSelector: "#open",
        expectedAfterAction: {
          kind: "element_visible",
          selector: 'dialog[aria-label="Confirmation"]',
        },
      },
      {
        phase: "dialog-open",
        goal: "Confirm action",
        action: "click",
        targetSelector: "#confirm",
        expectedAfterAction: { kind: "visible_text", text: "Confirmed" },
      },
    ],
  },
  {
    id: "select",
    goal: "Select Spanish as the language",
    validActions: ["Select Spanish in Language"],
    expectedOutcome: "Language: Spanish",
  },
  {
    id: "tabs",
    goal: "Open the Security tab",
    validActions: ["Click Security tab"],
    expectedOutcome: "Security panel",
  },
  {
    id: "redirect",
    goal: "Follow the redirect to the destination page",
    validActions: ["Click Continue"],
    expectedOutcome: "Destination reached",
  },
  {
    id: "delayed",
    goal: "Wait for the delayed result",
    validActions: ["Click Load result", "Wait for Loaded status"],
    expectedOutcome: "Loaded",
  },
  {
    id: "duplicate",
    goal: "Choose the Pro plan",
    validActions: ["Click Continue inside the Pro plan"],
    expectedOutcome: "Pro plan chosen",
  },
  {
    id: "scroll",
    goal: "Reach the target below the fold",
    validActions: ["Scroll to Reach target", "Click Reach target"],
    expectedOutcome: "Target reached",
  },
  {
    id: "cookie-overlay",
    goal: "Continue to checkout after dismissing the cookie notice",
    validActions: ["Click Accept cookies", "Click Continue to checkout"],
    expectedOutcome: "Checkout ready",
    decisionLabels: [
      {
        phase: "initial",
        goal: "Dismiss the cookie notice before checkout",
        action: "click",
        targetSelector: "#accept-cookies",
        expectedAfterAction: {
          kind: "element_hidden",
          selector: 'dialog[aria-label="Cookie notice"]',
        },
      },
      {
        phase: "notice-dismissed",
        goal: "Continue to checkout",
        action: "click",
        targetSelector: "#checkout",
        expectedAfterAction: { kind: "visible_text", text: "Checkout ready" },
      },
    ],
  },
  {
    id: "dynamic-results",
    goal: "Open the report after it loads",
    validActions: [
      "Click Load report",
      "Wait for the report",
      "Click Open report",
    ],
    expectedOutcome: "Report opened",
    decisionLabels: [
      {
        phase: "initial",
        goal: "Load the report",
        action: "click",
        targetSelector: "#load-report",
        expectedAfterAction: {
          kind: "visible_text",
          text: "Loading report",
        },
      },
      {
        phase: "loading",
        goal: "Wait for the report to become available",
        action: "wait",
        expectedAfterAction: {
          kind: "element_visible",
          selector: "#open-report",
        },
      },
      {
        phase: "report-ready",
        goal: "Open the report",
        action: "click",
        targetSelector: "#open-report",
        expectedAfterAction: { kind: "visible_text", text: "Report opened" },
      },
    ],
  },
  {
    id: "ambiguous-row",
    goal: "Open the approved request",
    validActions: ["Click Open in the Approved request row"],
    expectedOutcome: "Approved request opened",
    decisionLabels: [
      {
        phase: "initial",
        goal: "Open the approved request",
        action: "click",
        targetSelector: "#approved-open",
        expectedAfterAction: {
          kind: "visible_text",
          text: "Approved request opened",
        },
      },
    ],
  },
];
