export interface FixtureScenario {
  id: string;
  goal: string;
  validActions: readonly string[];
  expectedOutcome: string;
}

export const scenarios: readonly FixtureScenario[] = [
  {
    id: "login",
    goal: "Sign in with valid credentials",
    validActions: ["Fill Email", "Fill Password", "Click Sign in"],
    expectedOutcome: "Signed in",
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
];
