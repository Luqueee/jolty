import type { Page } from "playwright";
import { fieldCase, type ResearchCase, selectCase } from "./research-cases.ts";

const registration = "https://demo.automationtesting.in/Register.html";
const practice = "https://www.letskodeit.com/practice";

async function prepareRegistration(page: Page): Promise<void> {
  const consent = page.getByRole("button", { name: "Do not consent" });
  try {
    await consent.click({ timeout: 2_000 });
  } catch {
    // The consent dialog is absent when the site reuses a saved choice.
  }
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
    split: "train",
    action: "click",
    step: () => ({
      goal: args.goal,
      checks: [{ kind: "no_console_errors" }],
    }),
  };
}

export const trainCasesV7A: ResearchCase[] = [
  fieldCase({
    id: "auto-register-first-name",
    site: "automation-testing-register",
    split: "train",
    url: registration,
    target: 'input[placeholder="First Name"]',
    goal: "Enter a first name in the registration form",
    role: "textbox",
    name: "First Name",
    value: "Jolty",
    prepare: prepareRegistration,
  }),
  fieldCase({
    id: "auto-register-last-name",
    site: "automation-testing-register",
    split: "train",
    url: registration,
    target: 'input[placeholder="Last Name"]',
    goal: "Enter a last name in the registration form",
    role: "textbox",
    name: "Last Name",
    value: "Tester",
    prepare: prepareRegistration,
  }),
  ...[
    [
      "address",
      'textarea[ng-model="Adress"]',
      "Enter an address",
      "Jolty test address",
    ],
    [
      "email",
      'input[ng-model="EmailAdress"]',
      "Enter an email address",
      "jolty@example.test",
    ],
    ["phone", 'input[ng-model="Phone"]', "Enter a phone number", "1234567890"],
    ["password", "#firstpassword", "Enter a password", "Demo1234!"],
    [
      "confirm-password",
      "#secondpassword",
      "Enter a confirmation password",
      "Demo1234!",
    ],
  ].map(([id, target, goal, value]) =>
    fieldCase({
      id: `auto-register-${id}`,
      site: "automation-testing-register",
      split: "train",
      url: registration,
      target,
      goal: `${goal} in the registration form`,
      role: "textbox",
      name: "",
      value,
      prepare: prepareRegistration,
    }),
  ),
  ...[
    ["male", "Male"],
    ["female", "FeMale"],
  ].map(([id, label]) =>
    clickCase({
      id: `auto-register-${id}`,
      site: "automation-testing-register",
      url: registration,
      target: `input[name="radiooptions"][value="${label}"]`,
      goal: `Choose ${label} in the registration form`,
      prepare: prepareRegistration,
      postcondition: (page) =>
        page
          .locator(`input[name="radiooptions"][value="${label}"]`)
          .isChecked(),
    }),
  ),
  ...[
    ["cricket", "#checkbox1", "Cricket"],
    ["movies", "#checkbox2", "Movies"],
  ].map(([id, target, hobby]) =>
    clickCase({
      id: `auto-register-${id}`,
      site: "automation-testing-register",
      url: registration,
      target,
      goal: `Choose ${hobby} as a hobby in the registration form`,
      prepare: prepareRegistration,
      postcondition: (page) => page.locator(target).isChecked(),
    }),
  ),
  selectCase({
    id: "auto-register-skill",
    site: "automation-testing-register",
    split: "train",
    url: registration,
    target: "#Skills",
    goal: "Select Java in the Skills dropdown",
    name: "Skills",
    value: "Java",
    prepare: prepareRegistration,
  }),
  selectCase({
    id: "auto-register-year",
    site: "automation-testing-register",
    split: "train",
    url: registration,
    target: "#yearbox",
    goal: "Select 1995 in the Year dropdown",
    name: "Year",
    value: "1995",
    prepare: prepareRegistration,
  }),
  selectCase({
    id: "auto-register-month",
    site: "automation-testing-register",
    split: "train",
    url: registration,
    target: 'select[ng-model="monthbox"]',
    goal: "Select June in the Month dropdown",
    name: "Month",
    value: "June",
    prepare: prepareRegistration,
  }),
  selectCase({
    id: "auto-register-day",
    site: "automation-testing-register",
    split: "train",
    url: registration,
    target: "#daybox",
    goal: "Select day 15 in the Day dropdown",
    name: "Day",
    value: "15",
    prepare: prepareRegistration,
  }),
  fieldCase({
    id: "kodeit-autosuggest",
    site: "letskodeit-practice",
    split: "train",
    url: practice,
    target: "#autosuggest",
    goal: "Enter Playwright in the Auto Suggest field",
    role: "textbox",
    name: "Start Typing...",
    value: "Playwright",
  }),
  fieldCase({
    id: "kodeit-enabled-field",
    site: "letskodeit-practice",
    split: "train",
    url: practice,
    target: "#enabled-example-input",
    goal: "Enter text in the Enabled/Disabled Field",
    role: "textbox",
    name: "Enabled/Disabled Field",
    value: "Jolty",
  }),
  fieldCase({
    id: "kodeit-displayed-field",
    site: "letskodeit-practice",
    split: "train",
    url: practice,
    target: "#displayed-text",
    goal: "Enter text in the Hide/Show Example field",
    role: "textbox",
    name: "Hide/Show Example",
    value: "Visible text",
  }),
  fieldCase({
    id: "kodeit-alert-name",
    site: "letskodeit-practice",
    split: "train",
    url: practice,
    target: 'input[name="enter-name"]',
    goal: "Enter a name for the alert example",
    role: "textbox",
    name: "Enter Your Name",
    value: "Jolty",
  }),
  selectCase({
    id: "kodeit-car-benz",
    site: "letskodeit-practice",
    split: "train",
    url: practice,
    target: "#carselect",
    goal: "Select Benz in the car dropdown",
    name: "BMW Benz Honda",
    value: "benz",
  }),
  selectCase({
    id: "kodeit-fruit-orange",
    site: "letskodeit-practice",
    split: "train",
    url: practice,
    target: "#multiple-select-example",
    goal: "Select Orange in the multiple select list",
    name: "Apple Orange Peach",
    value: "orange",
  }),
  clickCase({
    id: "kodeit-disable-field",
    site: "letskodeit-practice",
    url: practice,
    target: "#disabled-button",
    goal: "Disable the Enabled/Disabled Field",
    postcondition: (page) =>
      page.locator("#enabled-example-input").isDisabled(),
  }),
  clickCase({
    id: "kodeit-enable-field",
    site: "letskodeit-practice",
    url: practice,
    target: "#enabled-button",
    goal: "Enable the disabled field",
    prepare: (page) => page.locator("#disabled-button").click(),
    postcondition: (page) => page.locator("#enabled-example-input").isEnabled(),
  }),
  clickCase({
    id: "kodeit-hide-field",
    site: "letskodeit-practice",
    url: practice,
    target: "#hide-textbox",
    goal: "Hide the Hide/Show Example field",
    postcondition: (page) => page.locator("#displayed-text").isHidden(),
  }),
  clickCase({
    id: "kodeit-show-field",
    site: "letskodeit-practice",
    url: practice,
    target: "#show-textbox",
    goal: "Show the hidden Hide/Show Example field",
    prepare: (page) => page.locator("#hide-textbox").click(),
    postcondition: (page) => page.locator("#displayed-text").isVisible(),
  }),
];
