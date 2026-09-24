import type { Page } from "playwright";
import { fieldCase, type ResearchCase, selectCase } from "./research-cases.ts";

const forge = "https://www.velocity-qa-platform.com/playground";
const wizard = `${forge}/wizard-form`;
const modals = `${forge}/modals-toasts`;
const learn = "https://www.learnaqa.info";
const dynamic = `${learn}/dynamic-elements/`;
const keyboard = `${learn}/keyboard-mouse-events/`;

async function ready(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5_000 });
}

async function wizardLocation(page: Page): Promise<void> {
  await ready(page);
  await page.locator("#fullName").fill("Jolty Tester");
  await page.locator("#email").fill("jolty@example.test");
  await page.locator("#country").selectOption("Canada");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText("Step 2: Location", { exact: true }).waitFor();
}

async function wizardCity(page: Page): Promise<void> {
  await wizardLocation(page);
  await page.locator("#state").selectOption("Ontario");
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
    prepare: args.prepare ?? ready,
    step: () => ({
      goal: args.goal,
      checks: [{ kind: "no_console_errors" }],
    }),
  };
}

export const freshTestCasesV7: ResearchCase[] = [
  fieldCase({
    id: "forge-wizard-full-name",
    site: "testforge",
    split: "test",
    url: wizard,
    target: "#fullName",
    goal: "Enter a full name in the wizard",
    role: "textbox",
    name: "Full name",
    value: "Jolty Tester",
    prepare: ready,
  }),
  fieldCase({
    id: "forge-wizard-email",
    site: "testforge",
    split: "test",
    url: wizard,
    target: "#email",
    goal: "Enter an email address in the wizard",
    role: "textbox",
    name: "Email",
    value: "jolty@example.test",
    prepare: ready,
  }),
  selectCase({
    id: "forge-wizard-country",
    site: "testforge",
    split: "test",
    url: wizard,
    target: "#country",
    goal: "Select Canada as the wizard country",
    name: "Country",
    value: "Canada",
    prepare: ready,
  }),
  clickCase({
    id: "forge-wizard-next",
    site: "testforge",
    url: wizard,
    target: 'button:has-text("Next")',
    goal: "Click Next to continue from Personal Info to Location",
    prepare: async (page) => {
      await ready(page);
      await page.locator("#fullName").fill("Jolty Tester");
      await page.locator("#email").fill("jolty@example.test");
      await page.locator("#country").selectOption("Canada");
    },
    postcondition: (page) =>
      page.getByText("Step 2: Location", { exact: true }).isVisible(),
  }),
  selectCase({
    id: "forge-wizard-state",
    site: "testforge",
    split: "test",
    url: wizard,
    target: "#state",
    goal: "Select Ontario as the state or region",
    name: "State / Region",
    value: "Ontario",
    prepare: wizardLocation,
  }),
  selectCase({
    id: "forge-wizard-city",
    site: "testforge",
    split: "test",
    url: wizard,
    target: "#city",
    goal: "Select Toronto as the city",
    name: "City",
    value: "Toronto",
    prepare: wizardCity,
  }),
  clickCase({
    id: "forge-wizard-back",
    site: "testforge",
    url: wizard,
    target: 'button:has-text("Back")',
    goal: "Click Back to return from Location to Personal Info",
    prepare: wizardLocation,
    postcondition: (page) =>
      page.getByText("Step 1: Personal Info", { exact: true }).isVisible(),
  }),
  clickCase({
    id: "forge-modal-open",
    site: "testforge",
    url: modals,
    target: 'button:has-text("Open Modal A")',
    goal: "Open Modal A",
    postcondition: (page) =>
      page.getByRole("button", { name: "Close Modal A" }).isVisible(),
  }),
  clickCase({
    id: "forge-modal-async",
    site: "testforge",
    url: modals,
    target: 'button:has-text("Open async-content modal")',
    goal: "Open the async-content modal",
    postcondition: (page) =>
      page.getByText("Async-loading modal", { exact: true }).isVisible(),
  }),
  clickCase({
    id: "forge-toast-three",
    site: "testforge",
    url: modals,
    target: 'button:has-text("Fire 3 toasts")',
    goal: "Fire three toast notifications",
    postcondition: (page) =>
      page.getByText("Toast #3", { exact: false }).isVisible(),
  }),
  clickCase({
    id: "forge-outer-counter",
    site: "testforge",
    url: `${forge}/iframes`,
    target: 'button:has-text("Increment outer counter")',
    goal: "Increment the outer-page counter",
    postcondition: (page) =>
      page.getByText("Outer click count: 1", { exact: true }).isVisible(),
  }),
  clickCase({
    id: "learn-delayed-element",
    site: "learnaqa",
    url: dynamic,
    target: "#trigger-delayed",
    goal: "Show the delayed element",
    postcondition: async (page) => {
      await page
        .getByText("Element appeared after 5 second delay!", { exact: false })
        .waitFor({ state: "visible", timeout: 7_000 });
      return true;
    },
  }),
  clickCase({
    id: "learn-ajax-data",
    site: "learnaqa",
    url: dynamic,
    target: "#load-ajax-data",
    goal: "Load AJAX data",
    postcondition: async (page) => {
      await page
        .getByText("Dynamic Item 1", { exact: true })
        .waitFor({ state: "visible", timeout: 7_000 });
      return true;
    },
  }),
  clickCase({
    id: "learn-reveal-hidden",
    site: "learnaqa",
    url: dynamic,
    target: "#reveal-hidden",
    goal: "Reveal the hidden elements",
    postcondition: (page) =>
      page.getByText("Hidden element revealed!", { exact: false }).isVisible(),
  }),
  clickCase({
    id: "learn-generate-content",
    site: "learnaqa",
    url: dynamic,
    target: "#generate-content",
    goal: "Generate dynamic content",
    postcondition: (page) => page.locator("#dynamic-content").isVisible(),
  }),
  fieldCase({
    id: "learn-keyboard-search",
    site: "learnaqa",
    split: "test",
    url: keyboard,
    target: "#search-field",
    goal: "Enter a search term in the keyboard scenario field",
    role: "textbox",
    name: "Search Field",
    value: "Jolty",
    prepare: ready,
  }),
  clickCase({
    id: "learn-clear-scenario",
    site: "learnaqa",
    url: keyboard,
    target: "#start-clear-scenario",
    goal: "Start the Backspace clear-field scenario",
    postcondition: (page) =>
      page
        .getByText("Active scenario: Clear Pre-filled Field (Step 1)", {
          exact: true,
        })
        .isVisible(),
  }),
  clickCase({
    id: "learn-dialog-scenario",
    site: "learnaqa",
    url: keyboard,
    target: "#start-dialog-scenario",
    goal: "Start the dialog scenario",
    postcondition: (page) =>
      page.getByText("Delete Confirmation", { exact: true }).isVisible(),
  }),
  clickCase({
    id: "learn-create-shadow",
    site: "learnaqa",
    url: `${learn}/shadow-dom/`,
    target: "#create-basic-shadow",
    goal: "Create the basic Shadow DOM example",
    postcondition: (page) => page.locator("#shadow-host-element").isVisible(),
  }),
  clickCase({
    id: "learn-open-modal",
    site: "learnaqa",
    url: `${learn}/iframe-windows/`,
    target: "#open-modal",
    goal: "Open the custom modal dialog",
    postcondition: (page) =>
      page.getByText("Custom Modal Dialog", { exact: true }).isVisible(),
  }),
  clickCase({
    id: "learn-add-draggable",
    site: "learnaqa",
    url: `${learn}/drag-and-drop/`,
    target: 'button:has-text("Add Item")',
    goal: "Add a draggable item to Source Items",
    postcondition: (page) =>
      page.getByText("Draggable Item 4", { exact: true }).isVisible(),
  }),
];
