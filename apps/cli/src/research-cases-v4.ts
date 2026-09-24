import type { Page } from "playwright";
import { fieldCase, type ResearchCase } from "./research-cases.ts";
import { researchCasesV3 } from "./research-cases-v3.ts";

const hub = "https://qapracticehub.com";
const automation = "https://practice-automation.com";
const labs = "https://testing.qaautomationlabs.com";
const practice = "https://practicetestautomation.com";

async function hubSection(page: Page, section: "Forms" | "Dynamic") {
  const consent = page.getByRole("button", { name: "Accept", exact: true });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("link", { name: section, exact: true }).first().click();
  await page.evaluate(() => history.replaceState(null, "", location.pathname));
}

function hubClick(args: {
  id: string;
  target: string;
  goal: string;
  section: "Forms" | "Dynamic";
  prepare?: (page: Page) => Promise<void>;
  postcondition: NonNullable<ResearchCase["postcondition"]>;
}): ResearchCase {
  return {
    ...args,
    id: `hub-${args.id}`,
    site: "qa-practice-hub",
    split: "train",
    url: `${hub}/`,
    action: "click",
    prepare: async (page) => {
      await hubSection(page, args.section);
      await args.prepare?.(page);
    },
    step: () => ({
      goal: args.goal,
      checks: [{ kind: "no_console_errors" }],
    }),
  };
}

function closeModal(
  id: string,
  dialogId: string,
  triggerId: string,
): ResearchCase {
  const goal = `Close the ${id} modal`;
  return {
    id: `automation-close-${id}-modal`,
    site: "practice-automation",
    split: "validation",
    url: `${automation}/modals/`,
    target: `${dialogId} .pum-close`,
    goal,
    action: "click",
    prepare: (page) => page.locator(triggerId).click(),
    step: () => ({ goal, checks: [{ kind: "no_console_errors" }] }),
    postcondition: async (page) => {
      try {
        await page
          .locator(dialogId)
          .waitFor({ state: "hidden", timeout: 2_000 });
        return true;
      } catch {
        return false;
      }
    },
  };
}

function labsClick(args: {
  id: string;
  url: string;
  target: string;
  goal: string;
  postcondition: NonNullable<ResearchCase["postcondition"]>;
}): ResearchCase {
  return {
    ...args,
    id: `labs-${args.id}`,
    site: "qa-automation-labs",
    split: "test",
    action: "click",
    step: () => ({
      goal: args.goal,
      checks: [{ kind: "no_console_errors" }],
    }),
  };
}

export const freshTestFlowsV4: ResearchCase[] = [
  fieldCase({
    id: "labs-first-name",
    site: "qa-automation-labs",
    split: "test",
    url: `${labs}/form.php`,
    target: "#firstname",
    goal: "Enter the first name",
    role: "textbox",
    name: "First Name:",
    value: "Jolty",
  }),
  fieldCase({
    id: "labs-last-name",
    site: "qa-automation-labs",
    split: "test",
    url: `${labs}/form.php`,
    target: "#lastname",
    goal: "Enter the last name",
    role: "textbox",
    name: "Last Name:",
    value: "Bot",
  }),
  labsClick({
    id: "success-notification",
    url: `${labs}/notifications.php`,
    target: 'button:has-text("Success Message")',
    goal: "Show the success notification",
    postcondition: (page) => page.locator(".toast.bg-success").isVisible(),
  }),
  labsClick({
    id: "error-notification",
    url: `${labs}/notifications.php`,
    target: 'button:has-text("Error Message")',
    goal: "Show the error notification",
    postcondition: (page) => page.locator(".toast.bg-danger").isVisible(),
  }),
  labsClick({
    id: "check-all",
    url: `${labs}/checkbox.php`,
    target: "#toggleBtn",
    goal: "Check all boxes in the multiple checkbox group",
    postcondition: (page) => page.locator("#multichk1").isChecked(),
  }),
  fieldCase({
    id: "practice-username",
    site: "practice-test-automation",
    split: "test",
    url: `${practice}/practice-test-login/`,
    target: "#username",
    goal: "Enter the student username",
    role: "textbox",
    name: "Username",
    value: "student",
  }),
  fieldCase({
    id: "practice-password",
    site: "practice-test-automation",
    split: "test",
    url: `${practice}/practice-test-login/`,
    target: "#password",
    goal: "Enter the student password",
    role: "textbox",
    name: "Password",
    value: "Password123",
  }),
  {
    id: "practice-login-submit",
    site: "practice-test-automation",
    split: "test",
    url: `${practice}/practice-test-login/`,
    target: "#submit",
    goal: "Submit the valid student login",
    action: "click",
    prepare: async (page) => {
      await page.locator("#username").fill("student");
      await page.locator("#password").fill("Password123");
    },
    step: () => ({
      goal: "Submit the valid student login",
      checks: [
        { kind: "url_changed", to: `${practice}/logged-in-successfully/` },
      ],
    }),
  },
  ...[
    ["edit", "#edit_btn", "Edit the first row", "#save_btn"],
    ["save", "#save_btn", "Save the edited first row", "#edit_btn"],
  ].map(
    ([id, target, goal, shown]): ResearchCase => ({
      id: `practice-${id}-row`,
      site: "practice-test-automation",
      split: "test",
      url: `${practice}/practice-test-exceptions/`,
      target,
      goal,
      action: "click",
      prepare:
        id === "save" ? (page) => page.locator("#edit_btn").click() : undefined,
      step: () => ({ goal, checks: [{ kind: "no_console_errors" }] }),
      postcondition: (page) => page.locator(shown).isVisible(),
    }),
  ),
];

export const researchCasesV4: ResearchCase[] = [
  ...researchCasesV3.filter((entry) => entry.split !== "test"),
  hubClick({
    id: "clear-registration",
    section: "Forms",
    target: "#register-clear",
    goal: "Clear the registration form",
    prepare: (page) => page.locator("#reg-firstname").fill("Jolty"),
    postcondition: async (page) =>
      (await page.locator("#reg-firstname").inputValue()) === "",
  }),
  hubClick({
    id: "remove-item",
    section: "Dynamic",
    target: "#btn-remove-element",
    goal: "Remove the last added item",
    prepare: (page) => page.locator("#btn-add-element").click(),
    postcondition: async (page) =>
      !(await page.getByText("Item 3", { exact: true }).isVisible()),
  }),
  hubClick({
    id: "profile-tab",
    section: "Dynamic",
    target: "#tab-btn-profile",
    goal: "Open the Profile tab",
    postcondition: (page) =>
      page
        .getByText("Profile settings and user info go here.", { exact: true })
        .isVisible(),
  }),
  hubClick({
    id: "settings-tab",
    section: "Dynamic",
    target: "#tab-btn-settings",
    goal: "Open the Settings tab",
    postcondition: (page) =>
      page
        .getByText("Application settings and preferences.", { exact: true })
        .isVisible(),
  }),
  closeModal("simple", "#pum-1318", "#simpleModal"),
  closeModal("form", "#pum-674", "#formModal"),
  ...freshTestFlowsV4,
];
