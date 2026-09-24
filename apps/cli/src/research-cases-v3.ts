import { fieldCase, type ResearchCase, selectCase } from "./research-cases.ts";
import { researchCasesV2 } from "./research-cases-v2.ts";

const lastest = "https://lastest.cloud";
const playground = "https://qaplayground.com";

function clickCase(args: {
  id: string;
  site: string;
  url: string;
  target: string;
  goal: string;
  text?: string;
  postcondition: NonNullable<ResearchCase["postcondition"]>;
}): ResearchCase {
  return {
    ...args,
    split: "test",
    action: "click",
    step: () => ({
      goal: args.goal,
      checks: args.text
        ? [{ kind: "text_visible", text: args.text }]
        : [{ kind: "no_console_errors" }],
    }),
  };
}

export const freshTestFlowsV3: ResearchCase[] = [
  clickCase({
    id: "lastest-click",
    site: "lastest-playground",
    url: `${lastest}/playground/buttons`,
    target: '[data-testid="click-btn"]',
    goal: "Register a single button click",
    text: "Single click registered",
    postcondition: async (page) =>
      (await page.getByTestId("click-status").innerText()) ===
      "Single click registered",
  }),
  clickCase({
    id: "lastest-dismiss-overlay",
    site: "lastest-playground",
    url: `${lastest}/playground/buttons`,
    target: '[data-testid="dismiss-overlay-btn"]',
    goal: "Dismiss the overlay covering the button",
    postcondition: async (page) =>
      (await page.getByTestId("overlay").count()) === 0,
  }),
  fieldCase({
    id: "lastest-first-name",
    site: "lastest-playground",
    split: "test",
    url: `${lastest}/playground/forms`,
    target: "#pg-first-name",
    goal: "Enter a first name for the new account",
    role: "textbox",
    name: "First name",
    value: "Jolty",
  }),
  fieldCase({
    id: "lastest-email",
    site: "lastest-playground",
    split: "test",
    url: `${lastest}/playground/forms`,
    target: "#pg-email",
    goal: "Enter an email for the new account",
    role: "textbox",
    name: "Email",
    value: "jolty@example.test",
  }),
  selectCase({
    id: "lastest-role",
    site: "lastest-playground",
    split: "test",
    url: `${lastest}/playground/forms`,
    target: "#pg-role",
    goal: "Select QA Engineer as the role",
    name: "Role",
    value: "qa-engineer",
  }),
  clickCase({
    id: "playground-simple-modal",
    site: "qa-playground",
    url: `${playground}/practice/modals`,
    target: '[data-testid="btn-open-simple-modal"]',
    goal: "Open the simple modal",
    text: "This is a beginner-friendly modal with stable locators.",
    postcondition: (page) => page.getByRole("dialog").isVisible(),
  }),
  clickCase({
    id: "playground-dynamic-modal",
    site: "qa-playground",
    url: `${playground}/practice/modals`,
    target: '[data-testid="btn-open-dynamic-modal"]',
    goal: "Open the dynamic modal",
    text: "The button below has a dynamic ID. Find it using a partial match!",
    postcondition: (page) => page.getByRole("dialog").isVisible(),
  }),
  fieldCase({
    id: "playground-movie-name",
    site: "qa-playground",
    split: "test",
    url: `${playground}/practice/input-fields`,
    target: "#movieNameInput",
    goal: "Type a movie name",
    role: "textbox",
    name: "Movie name",
    value: "Arrival",
  }),
  clickCase({
    id: "playground-read-value",
    site: "qa-playground",
    url: `${playground}/practice/input-fields`,
    target: "#readValueBtn",
    goal: "Read the existing field value",
    text: "Value: The Matrix",
    postcondition: async (page) =>
      (await page.locator("body").innerText()).includes("Value: The Matrix"),
  }),
  clickCase({
    id: "playground-clear-field",
    site: "qa-playground",
    url: `${playground}/practice/input-fields`,
    target: "#clearFieldBtn",
    goal: "Clear the field containing Inception",
    postcondition: async (page) =>
      (await page.locator("#clearInput").inputValue()) === "",
  }),
];

export const researchCasesV3: ResearchCase[] = [
  ...researchCasesV2.filter((entry) => entry.split !== "test"),
  ...freshTestFlowsV3,
];
