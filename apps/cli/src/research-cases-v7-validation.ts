import type { Page } from "playwright";
import { fieldCase, type ResearchCase, selectCase } from "./research-cases.ts";

const qa = "https://www.qapractice.com";
const ui = `${qa}/practice-different-ui-elements`;
const practice = "https://apptesting.pl/pages";

async function ready(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5_000 });
}

function clickCase(args: {
  id: string;
  site: string;
  url: string;
  target: string;
  goal: string;
  postcondition: NonNullable<ResearchCase["postcondition"]>;
}): ResearchCase {
  return {
    ...args,
    split: "validation",
    action: "click",
    prepare: ready,
    step: () => ({
      goal: args.goal,
      checks: [{ kind: "no_console_errors" }],
    }),
  };
}

export const freshValidationFlowsV7: ResearchCase[] = [
  fieldCase({
    id: "qa-ui-text",
    site: "qapractice-ui",
    split: "validation",
    url: ui,
    target: "#textField",
    goal: "Enter text in the Text Field",
    role: "textbox",
    name: "Text Field (Input Box):",
    value: "Jolty",
    prepare: ready,
  }),
  fieldCase({
    id: "qa-ui-textarea",
    site: "qapractice-ui",
    split: "validation",
    url: ui,
    target: "#textArea",
    goal: "Enter a note in the Text Area",
    role: "textbox",
    name: "Text Area:",
    value: "Browser test note",
    prepare: ready,
  }),
  selectCase({
    id: "qa-ui-country",
    site: "qapractice-ui",
    split: "validation",
    url: ui,
    target: "#singleDropdown",
    goal: "Select Canada in the single dropdown",
    name: "Dropdown (Single Select):",
    value: "Canada",
    prepare: ready,
  }),
  clickCase({
    id: "qa-ui-click",
    site: "qapractice-ui",
    url: ui,
    target: "#ui-click-button",
    goal: "Click the Click Me button",
    postcondition: (page) =>
      page.getByText("Clicked 1 times", { exact: true }).isVisible(),
  }),
  clickCase({
    id: "qa-ui-progress",
    site: "qapractice-ui",
    url: ui,
    target: "#ui-progress-increment",
    goal: "Increment the progress bar",
    postcondition: async (page) =>
      (await page.getByRole("progressbar").getAttribute("aria-valuenow")) ===
      "40",
  }),
  clickCase({
    id: "qa-ui-modal",
    site: "qapractice-ui",
    url: ui,
    target: "#ui-modal-open",
    goal: "Open the modal",
    postcondition: (page) => page.getByRole("dialog").isVisible(),
  }),
  clickCase({
    id: "qa-ui-update",
    site: "qapractice-ui",
    url: ui,
    target: "#ui-update-content",
    goal: "Update the dynamic content",
    postcondition: async (page) =>
      (
        await page.locator("#ui-update-content").locator("..").innerText()
      ).includes("Updated at "),
  }),
  clickCase({
    id: "qa-ui-notification",
    site: "qapractice-ui",
    url: ui,
    target: "#ui-show-notification",
    goal: "Show the notification",
    postcondition: (page) => page.getByRole("alert").isVisible(),
  }),
  clickCase({
    id: "qa-ui-tab-two",
    site: "qapractice-ui",
    url: ui,
    target: 'a[role="button"]:text-is("Tab 2")',
    goal: "Switch to Tab 2",
    postcondition: async (page) =>
      (
        await page
          .locator('a[role="button"]:text-is("Tab 2")')
          .getAttribute("class")
      )?.includes("active") ?? false,
  }),
  clickCase({
    id: "qa-ui-accordion-two",
    site: "qapractice-ui",
    url: ui,
    target: 'button:text-is("Accordion Item #2")',
    goal: "Expand Accordion Item #2",
    postcondition: async (page) =>
      (await page
        .getByRole("button", { name: "Accordion Item #2" })
        .getAttribute("aria-expanded")) === "true",
  }),
  fieldCase({
    id: "apptest-form-text",
    site: "apptesting-forms",
    split: "validation",
    url: `${practice}/forms.html`,
    target: "#text-input",
    goal: "Enter text in Text Input",
    role: "textbox",
    name: "Text Input",
    value: "Jolty",
    prepare: ready,
  }),
  fieldCase({
    id: "apptest-form-phone",
    site: "apptesting-forms",
    split: "validation",
    url: `${practice}/forms.html`,
    target: "#phone-input",
    goal: "Enter a phone number in Phone Input",
    role: "textbox",
    name: "Phone Input",
    value: "1234567890",
    prepare: ready,
  }),
  selectCase({
    id: "apptest-form-option",
    site: "apptesting-forms",
    split: "validation",
    url: `${practice}/forms.html`,
    target: "#dropdown",
    goal: "Select Option 4 in Single Select",
    name: "Single Select",
    value: "option4",
    prepare: ready,
  }),
  clickCase({
    id: "apptest-form-checkbox",
    site: "apptesting-forms",
    url: `${practice}/forms.html`,
    target: "#checkbox-2",
    goal: "Check Option 2",
    postcondition: (page) => page.locator("#checkbox-2").isChecked(),
  }),
  clickCase({
    id: "apptest-widget-accordion",
    site: "apptesting-widgets",
    url: `${practice}/widgets.html`,
    target: "#accordion-header-1",
    goal: "Expand Section 1",
    postcondition: async (page) =>
      (await page.locator("#accordion-item-1").getAttribute("class"))?.includes(
        "active",
      ) ?? false,
  }),
  clickCase({
    id: "apptest-widget-tab",
    site: "apptesting-widgets",
    url: `${practice}/widgets.html`,
    target: "#tab-btn-3",
    goal: "Switch to Tab 3",
    postcondition: async (page) =>
      (await page.locator("#tab-btn-3").getAttribute("class"))?.includes(
        "active",
      ) ?? false,
  }),
  clickCase({
    id: "apptest-widget-modal",
    site: "apptesting-widgets",
    url: `${practice}/widgets.html`,
    target: "#modal-trigger",
    goal: "Open the modal dialog",
    postcondition: async (page) =>
      (await page.locator("#modal-1").getAttribute("class"))?.includes(
        "active",
      ) ?? false,
  }),
  fieldCase({
    id: "apptest-widget-autocomplete",
    site: "apptesting-widgets",
    split: "validation",
    url: `${practice}/widgets.html`,
    target: "#autocomplete",
    goal: "Type a language in the autocomplete field",
    role: "textbox",
    name: "Type a language...",
    value: "TypeScript",
    prepare: ready,
  }),
  clickCase({
    id: "apptest-alert-success-toast",
    site: "apptesting-alerts",
    url: `${practice}/alerts.html`,
    target: "#toast-success-btn",
    goal: "Show the success toast",
    postcondition: (page) =>
      page.locator("#toast-container .toast.success").isVisible(),
  }),
  clickCase({
    id: "apptest-dynamic-reveal",
    site: "apptesting-dynamic",
    url: `${practice}/dynamic.html`,
    target: "#toggle-btn",
    goal: "Show the hidden element",
    postcondition: (page) => page.locator("#hidden-element").isVisible(),
  }),
];
