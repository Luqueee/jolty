import type { Page } from "playwright";
import { fieldCase, type ResearchCase } from "./research-cases.ts";
import { researchCasesV4 } from "./research-cases-v4.ts";

const hub = "https://qapracticehub.com";
const automation = "https://practice-automation.com";
const demo = "https://demoqa.com";
const bible = "https://www.automation-bible.com";

async function hubSection(page: Page) {
  const consent = page.getByRole("button", { name: "Accept", exact: true });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("link", { name: "Alerts", exact: true }).first().click();
  await page.evaluate(() => history.replaceState(null, "", location.pathname));
}

function clickCase(args: {
  id: string;
  site: string;
  split: ResearchCase["split"];
  url: string;
  target: string;
  goal: string;
  prepare?: (page: Page) => Promise<void>;
  postcondition: NonNullable<ResearchCase["postcondition"]>;
}): ResearchCase {
  return {
    ...args,
    action: "click",
    step: () => ({
      goal: args.goal,
      checks: [{ kind: "no_console_errors" }],
    }),
  };
}

export const freshTestFlowsV5: ResearchCase[] = [
  clickCase({
    id: "demo-click-me",
    site: "demoqa",
    split: "test",
    url: `${demo}/buttons`,
    target: 'button:text-is("Click Me")',
    goal: "Click the Click Me button once",
    postcondition: (page) => page.locator("#dynamicClickMessage").isVisible(),
  }),
  ...[
    ["small", "#showSmallModal", "#example-modal-sizes-title-sm"],
    ["large", "#showLargeModal", "#example-modal-sizes-title-lg"],
  ].map(([id, target, title]) =>
    clickCase({
      id: `demo-${id}-modal`,
      site: "demoqa",
      split: "test",
      url: `${demo}/modal-dialogs`,
      target,
      goal: `Open the ${id} modal`,
      postcondition: (page) => page.locator(title).isVisible(),
    }),
  ),
  clickCase({
    id: "demo-close-small-modal",
    site: "demoqa",
    split: "test",
    url: `${demo}/modal-dialogs`,
    target: "#closeSmallModal",
    goal: "Close the small modal",
    prepare: (page) => page.locator("#showSmallModal").click(),
    postcondition: async (page) => {
      try {
        await page
          .locator("#closeSmallModal")
          .waitFor({ state: "hidden", timeout: 2_000 });
        return true;
      } catch {
        return false;
      }
    },
  }),
  clickCase({
    id: "demo-open-registration",
    site: "demoqa",
    split: "test",
    url: `${demo}/webtables`,
    target: "#addNewRecordButton",
    goal: "Click Add to open the registration form",
    postcondition: (page) => page.getByText("Registration Form").isVisible(),
  }),
  fieldCase({
    id: "bible-text",
    site: "automation-bible",
    split: "test",
    url: `${bible}/forms`,
    target: 'input[placeholder="Regular text"]',
    goal: "Enter regular text",
    role: "textbox",
    name: "Text input",
    value: "jolty",
  }),
  fieldCase({
    id: "bible-password",
    site: "automation-bible",
    split: "test",
    url: `${bible}/forms`,
    target: 'input[placeholder="Password"]',
    goal: "Enter a password",
    role: "textbox",
    name: "Password",
    value: "JoltyPass123",
  }),
  clickCase({
    id: "bible-playwright-radio",
    site: "automation-bible",
    split: "test",
    url: `${bible}/forms`,
    target: 'input[name="tool"][value="playwright"]',
    goal: "Choose Playwright as the preferred tool",
    postcondition: (page) =>
      page.locator('input[name="tool"][value="playwright"]').isChecked(),
  }),
  clickCase({
    id: "bible-open-modal",
    site: "automation-bible",
    split: "test",
    url: `${bible}/alerts`,
    target: '[data-testid="btn-open-modal"]',
    goal: "Open the custom modal",
    postcondition: (page) =>
      page.locator('[data-testid="modal-backdrop"]').isVisible(),
  }),
  clickCase({
    id: "bible-close-modal",
    site: "automation-bible",
    split: "test",
    url: `${bible}/alerts`,
    target: '[data-testid="btn-close-modal"]',
    goal: "Close the custom modal",
    prepare: (page) => page.locator('[data-testid="btn-open-modal"]').click(),
    postcondition: (page) =>
      page.locator('[data-testid="modal-backdrop"]').isHidden(),
  }),
];

export const researchCasesV5: ResearchCase[] = [
  ...researchCasesV4.filter((entry) => entry.split !== "test"),
  clickCase({
    id: "hub-show-toast",
    site: "qa-practice-hub",
    split: "train",
    url: `${hub}/`,
    target: "#btn-show-toast",
    goal: "Show the toast notification",
    prepare: hubSection,
    postcondition: (page) => page.locator(".toast").isVisible(),
  }),
  clickCase({
    id: "automation-open-accordion",
    site: "practice-automation",
    split: "validation",
    url: `${automation}/accordions/`,
    target: "details > summary",
    goal: "Open the accordion",
    postcondition: async (page) =>
      (await page.locator("details").getAttribute("open")) !== null,
  }),
  ...freshTestFlowsV5,
];
