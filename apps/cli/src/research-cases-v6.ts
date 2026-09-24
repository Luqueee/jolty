import type { Page } from "playwright";
import { fieldCase, type ResearchCase, selectCase } from "./research-cases.ts";
import { researchCasesV5 } from "./research-cases-v5.ts";

const campus = "https://www.stepcampus.in/playground";
const sreenidhi = "https://www.sreenidhirajakrishnan.com/practice";

async function siteReady(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 });
}

function clickCase(args: {
  id: string;
  site: string;
  url: string;
  target: string;
  goal: string;
  prepare?: (page: Page) => Promise<void>;
  postcondition: NonNullable<ResearchCase["postcondition"]>;
}): ResearchCase {
  return {
    ...args,
    split: "test",
    action: "click",
    prepare: async (page) => {
      await siteReady(page);
      await args.prepare?.(page);
    },
    step: () => ({
      goal: args.goal,
      checks: [{ kind: "no_console_errors" }],
    }),
  };
}

const campusSectionText = [
  "This is the content of the first section.",
  "This is the content of the second section.",
  "This is the content of the third section.",
];

export const freshTestFlowsV6: ResearchCase[] = [
  clickCase({
    id: "campus-hide-element",
    site: "stepcampus",
    url: campus,
    target: 'button:text-is("Hide Element")',
    goal: "Hide the visible element",
    postcondition: (page) =>
      page.getByText("Voila!", { exact: true }).isHidden(),
  }),
  clickCase({
    id: "campus-single-click",
    site: "stepcampus",
    url: campus,
    target: 'button:text-is("Single Click")',
    goal: "Click the Single Click button",
    postcondition: (page) =>
      page.getByText("Single click triggered.", { exact: true }).isVisible(),
  }),
  clickCase({
    id: "campus-password-tab",
    site: "stepcampus",
    url: campus,
    target: '[role="tab"]:text-is("Password")',
    goal: "Open the Password tab",
    postcondition: (page) =>
      page.getByText("This is the password tab.", { exact: true }).isVisible(),
  }),
  clickCase({
    id: "campus-account-tab",
    site: "stepcampus",
    url: campus,
    target: '[role="tab"]:text-is("Account")',
    goal: "Open the Account tab",
    prepare: (page) => page.getByRole("tab", { name: "Password" }).click(),
    postcondition: (page) =>
      page.getByText("This is the account tab.", { exact: true }).isVisible(),
  }),
  ...campusSectionText.map((result, index) =>
    clickCase({
      id: `campus-section-${index + 1}`,
      site: "stepcampus",
      url: campus,
      target: `button:text-is("Section ${index + 1}")`,
      goal: `Open Section ${index + 1}`,
      postcondition: (page) =>
        page.getByRole("region").getByText(result).isVisible(),
    }),
  ),
  fieldCase({
    id: "campus-keyboard-input",
    site: "stepcampus",
    split: "test",
    url: campus,
    target: "#keyboard-input",
    goal: "Enter text in Keyboard Actions",
    role: "textbox",
    name: "Keyboard Actions",
    value: "Jolty",
    prepare: siteReady,
  }),
  selectCase({
    id: "campus-fruit",
    site: "stepcampus",
    split: "test",
    url: campus,
    target: "#fruit-select",
    goal: "Select Banana in the standard dropdown",
    name: "Standard Dropdown",
    value: "banana",
    prepare: siteReady,
  }),
  clickCase({
    id: "campus-country-dropdown",
    site: "stepcampus",
    url: campus,
    target: 'button:text-is("Select country...")',
    goal: "Open the country dropdown",
    postcondition: (page) => page.getByRole("listbox").isVisible(),
  }),
  ...[
    ["name", "#text-input", "Text input", "Enter a name", "Jolty"],
    [
      "password",
      "#password-input",
      "Password input",
      "Enter a password",
      "JoltyPass123",
    ],
    [
      "email",
      "#email-input",
      "Email input",
      "Enter an email",
      "jolty@example.test",
    ],
    ["phone", "#phone-input", "Phone input", "Enter a phone", "1234567890"],
  ].map(([id, target, name, goal, value]) =>
    fieldCase({
      id: `sreenidhi-${id}`,
      site: "sreenidhi-practice",
      split: "test",
      url: sreenidhi,
      target,
      goal,
      role: "textbox",
      name,
      value,
      prepare: siteReady,
    }),
  ),
  clickCase({
    id: "sreenidhi-single-click",
    site: "sreenidhi-practice",
    url: sreenidhi,
    target: "#single-click-btn",
    goal: "Click the single click button",
    postcondition: (page) => page.getByText("Single clicked!").isVisible(),
  }),
  clickCase({
    id: "sreenidhi-increment",
    site: "sreenidhi-practice",
    url: sreenidhi,
    target: "#increment-btn",
    goal: "Increment the counter",
    postcondition: (page) => page.getByText("Counter: 1").isVisible(),
  }),
  clickCase({
    id: "sreenidhi-change-text",
    site: "sreenidhi-practice",
    url: sreenidhi,
    target: "#change-text-btn",
    goal: "Change the displayed text",
    postcondition: (page) => page.getByText("Text has changed!").isVisible(),
  }),
  clickCase({
    id: "sreenidhi-open-modal",
    site: "sreenidhi-practice",
    url: sreenidhi,
    target: "#open-modal-btn",
    goal: "Open the modal dialog",
    postcondition: (page) => page.getByRole("dialog").isVisible(),
  }),
  clickCase({
    id: "sreenidhi-reveal",
    site: "sreenidhi-practice",
    url: sreenidhi,
    target: "#reveal-btn",
    goal: "Reveal the hidden element",
    postcondition: async (page) => {
      try {
        await page
          .getByText("Previously hidden element is now visible!")
          .waitFor({ state: "visible", timeout: 1_500 });
        return true;
      } catch {
        return false;
      }
    },
  }),
  selectCase({
    id: "sreenidhi-standard-select",
    site: "sreenidhi-practice",
    split: "test",
    url: sreenidhi,
    target: "#standard-select",
    goal: "Select Green in the standard dropdown",
    name: "Standard select",
    value: "green",
    prepare: siteReady,
  }),
];

export const researchCasesV6: ResearchCase[] = [
  ...researchCasesV5.filter((entry) => entry.split !== "test"),
  ...freshTestFlowsV6,
];
