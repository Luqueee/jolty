import type { Page } from "playwright";
import { fieldCase, type ResearchCase, selectCase } from "./research-cases.ts";

const automation = "https://testautomationpractice.blogspot.com/";
const letcode = "https://letcode.in";

function checkedCase(args: {
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
    step: () => ({ goal: args.goal, checks: [{ kind: "no_console_errors" }] }),
  };
}

export const newTrainCasesV7B: ResearchCase[] = [
  ...[
    ["name", "#name", "Enter Name", "Enter a name", "Jolty"],
    ["email", "#email", "Enter EMail", "Enter an email", "jolty@example.test"],
    ["phone", "#phone", "Enter Phone", "Enter a phone number", "1234567890"],
    ["address", "#textarea", "Address:", "Enter an address", "Test Street 1"],
  ].map(([id, target, name, goal, value]) =>
    fieldCase({
      id: `automation-${id}`,
      site: "automation-testing-practice",
      split: "train",
      url: automation,
      target,
      goal,
      role: "textbox",
      name,
      value,
    }),
  ),
  ...["male", "female"].map((gender) =>
    checkedCase({
      id: `automation-${gender}`,
      site: "automation-testing-practice",
      url: automation,
      target: `#${gender}`,
      goal: `Select the ${gender} gender option`,
      postcondition: (page) => page.locator(`#${gender}`).isChecked(),
    }),
  ),
  ...["sunday", "wednesday", "saturday"].map((day) =>
    checkedCase({
      id: `automation-${day}`,
      site: "automation-testing-practice",
      url: automation,
      target: `#${day}`,
      goal: `Select ${day} as a day`,
      postcondition: (page) => page.locator(`#${day}`).isChecked(),
    }),
  ),
  selectCase({
    id: "automation-country-canada",
    site: "automation-testing-practice",
    split: "train",
    url: automation,
    target: "#country",
    goal: "Select Canada in the Country dropdown",
    name: "Country:",
    value: "canada",
  }),
  checkedCase({
    id: "automation-start",
    site: "automation-testing-practice",
    url: automation,
    target: 'button[name="start"]',
    goal: "Click START to change the dynamic button to STOP",
    postcondition: (page) =>
      page.locator('button[name="stop"]').getByText("STOP").isVisible(),
  }),
  checkedCase({
    id: "automation-stop",
    site: "automation-testing-practice",
    url: automation,
    target: 'button[name="stop"]',
    goal: "Click STOP to change the dynamic button to START",
    prepare: async (page) => {
      await page.locator('button[name="start"]').click();
    },
    postcondition: (page) =>
      page.locator('button[name="start"]').getByText("START").isVisible(),
  }),
  ...[
    [
      "full-name",
      "#fullName",
      "Enter your full Name",
      "Enter a full name",
      "Jolty Runner",
    ],
    [
      "join",
      "#join",
      "Append a text and press keyboard tab",
      "Write a joining message",
      "Joining Jolty",
    ],
    [
      "get-me",
      "#getMe",
      "What is inside the text box",
      "Replace the existing text",
      "New value",
    ],
    [
      "clear-me",
      "#clearMe",
      "Clear the text",
      "Replace text in the Clear text field",
      "Jolty",
    ],
  ].map(([id, target, name, goal, value]) =>
    fieldCase({
      id: `letcode-${id}`,
      site: "letcode",
      split: "train",
      url: `${letcode}/edit`,
      target,
      goal,
      role: "textbox",
      name,
      value,
      prepare:
        id === "join"
          ? async (page) => {
              await page.waitForLoadState("networkidle", { timeout: 5_000 });
            }
          : undefined,
    }),
  ),
  ...[
    ["no", "#no", "Select No for the first radio question"],
    ["foo", "#foo", "Select Foo in the Foo/Bar group"],
    ["going", "#going", "Select Going for the plan"],
    [
      "remember",
      'main label:has-text("Remember me") input[type="checkbox"]',
      "Check Remember me",
    ],
    [
      "terms",
      'main label:has-text("FAKE terms") input[type="checkbox"]',
      "Agree to the fake terms",
    ],
  ].map(([id, target, goal]) =>
    checkedCase({
      id: `letcode-${id}`,
      site: "letcode",
      url: `${letcode}/radio`,
      target,
      goal,
      prepare:
        id === "remember"
          ? async (page) => {
              await page.locator(target).uncheck();
            }
          : undefined,
      postcondition: (page) => page.locator(target).isChecked(),
    }),
  ),
  ...[
    [
      "apple",
      "#fruits",
      "Select the apple using visible text",
      "Select Apple from the fruit dropdown",
      "0",
    ],
    [
      "python",
      "#lang",
      "Select the last programming language and print all the options",
      "Select Python from the programming language dropdown",
      "py",
    ],
    [
      "india",
      "#country",
      "Select India using value & print the selected value",
      "Select India from the country dropdown",
      "India",
    ],
  ].map(([id, target, name, goal, value]) =>
    selectCase({
      id: `letcode-${id}`,
      site: "letcode",
      split: "train",
      url: `${letcode}/dropdowns`,
      target,
      goal,
      name,
      value,
    }),
  ),
];
