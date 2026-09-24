import type { Page } from "playwright";
import {
  fieldCase,
  navigationCase,
  type ResearchCase,
  selectCase,
} from "./research-cases.ts";
import { researchCasesV7 } from "./research-cases-v7.ts";

const lab = "https://playwrightlab.github.io/index.html";
const xqa = "https://www.xqa.io/practice";
const gaurav = "https://gauravkhurana.com/test-automation-play/";
const process = "https://process-practice.dev/tasks/excel-input-forms/";
const snippy = "https://snippylab.com/Tools/test-playground/";

async function dismissConsent(page: Page): Promise<void> {
  const consent = page.getByRole("button", { name: "Consent", exact: true });
  if (await consent.isVisible()) await consent.click();
}

async function showBasic(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Basic" }).click();
}

async function showSnippyForm(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 8_000 });
  await page.getByRole("button", { name: "Forms", exact: true }).click();
}

function clickCase(args: {
  id: string;
  site: string;
  split: "train" | "validation" | "test";
  url: string;
  target: string;
  goal: string;
  postcondition: NonNullable<ResearchCase["postcondition"]>;
  prepare?: (page: Page) => Promise<void>;
}): ResearchCase {
  return {
    ...args,
    action: "click",
    step: () => ({ goal: args.goal, checks: [{ kind: "no_console_errors" }] }),
  };
}

const labFields = [
  ["name", "#fullName", "Full Name *", "Enter the full name", "Jolty Tester"],
  [
    "email",
    "#email",
    "Email Address *",
    "Enter the email address",
    "jolty@example.test",
  ],
  ["phone", "#phone", "Phone Number", "Enter the phone number", "1234567890"],
  ["bio", "#bio", "Bio", "Enter a short bio", "Browser tester"],
  [
    "language-search",
    "#searchInput",
    "Search Programming Languages",
    "Search programming languages",
    "Python",
  ],
  [
    "table-search",
    "#tableSearch",
    "Search users...",
    "Search the user table",
    "Alice",
  ],
] as const;

const xqaFields = [
  ["name", "#userName", "Full Name", "Enter a full name", "Jolty Tester"],
  ["email", "#userEmail", "Email", "Enter an email", "jolty@example.test"],
  [
    "current-address",
    "#currentAddress",
    "Current Address",
    "Enter the current address",
    "Test Street",
  ],
  [
    "permanent-address",
    "#permanentAddress",
    "Permanent Address",
    "Enter the permanent address",
    "Main Street",
  ],
] as const;

const basicFields = [
  ["first", "#first-name", "First Name", "Enter the first name", "Jolty"],
  ["last", "#last-name", "Last Name", "Enter the last name", "Tester"],
  ["email", "#email-field", "Email", "Enter the email", "jolty@example.test"],
  [
    "bio",
    "#bio-textarea",
    "Bio (Multi-line)",
    "Enter a short bio",
    "Testing browser flows",
  ],
] as const;

export const freshTestCasesV8: ResearchCase[] = [
  ...(["medium", "hard"] as const).map((difficulty) =>
    clickCase({
      id: `process-${difficulty}`,
      site: "process-practice",
      split: "test",
      url: process,
      target: `#difficulty-${difficulty}`,
      goal: `Choose ${difficulty} difficulty for the Excel input forms challenge`,
      postcondition: (page) =>
        page.locator(`#difficulty-${difficulty}`).isChecked(),
    }),
  ),
  clickCase({
    id: "process-start",
    site: "process-practice",
    split: "test",
    url: process,
    target: 'button:has-text("Start")',
    goal: "Start the Excel input forms challenge",
    postcondition: (page) => page.locator("#download-btn").isVisible(),
  }),
  ...(["about.html", "bug-report.html"] as const).map((path) =>
    navigationCase({
      id: `process-open-${path.replace(".html", "")}`,
      site: "process-practice",
      split: "test",
      url: process,
      target: `a.nav-link[href="/${path}"]`,
      goal: `Open the ${path === "about.html" ? "About" : "Bug Report"} page from the challenge`,
      destination: `https://process-practice.dev/${path.replace(".html", "")}`,
    }),
  ),
  fieldCase({
    id: "snippy-login-email",
    site: "snippylab",
    split: "test",
    url: snippy,
    target: 'input[type="email"]',
    goal: "Enter the login email",
    role: "textbox",
    name: "Email",
    value: "jolty@example.test",
    prepare: showSnippyForm,
  }),
  fieldCase({
    id: "snippy-login-password",
    site: "snippylab",
    split: "test",
    url: snippy,
    target: 'input[type="password"]',
    goal: "Enter the login password",
    role: "textbox",
    name: "Password",
    value: "TestPassword123",
    prepare: showSnippyForm,
  }),
  clickCase({
    id: "snippy-signup-tab",
    site: "snippylab",
    split: "test",
    url: snippy,
    target: 'button[role="tab"]:has-text("Sign up")',
    goal: "Open the Sign Up form",
    prepare: showSnippyForm,
    postcondition: (page) =>
      page
        .getByRole("tab", { name: "SIGN UP" })
        .getAttribute("aria-selected")
        .then((value) => value === "true"),
  }),
  clickCase({
    id: "snippy-address-tab",
    site: "snippylab",
    split: "test",
    url: snippy,
    target: 'button[role="tab"]:has-text("Address")',
    goal: "Open the Address form",
    prepare: showSnippyForm,
    postcondition: (page) =>
      page
        .getByRole("tab", { name: "ADDRESS" })
        .getAttribute("aria-selected")
        .then((value) => value === "true"),
  }),
  clickCase({
    id: "snippy-alerts",
    site: "snippylab",
    split: "test",
    url: snippy,
    target: '[role="button"]:has-text("Alerts")',
    goal: "Open the Alerts practice page",
    prepare: async (page) => {
      await page.waitForLoadState("networkidle", { timeout: 8_000 });
    },
    postcondition: (page) =>
      page.getByRole("button", { name: "OPEN DIALOG" }).isVisible(),
  }),
];

export const researchCasesV8: ResearchCase[] = [
  ...researchCasesV7.filter((entry) => entry.split !== "test"),
  ...labFields.map(([id, target, name, goal, value]) =>
    fieldCase({
      id: `playlab-${id}`,
      site: "playlab",
      split: "train",
      url: lab,
      target,
      goal,
      role: "textbox",
      name,
      value,
    }),
  ),
  selectCase({
    id: "playlab-country",
    site: "playlab",
    split: "train",
    url: lab,
    target: "#country",
    goal: "Select Canada as the country",
    name: "Country",
    value: "ca",
  }),
  selectCase({
    id: "playlab-frameworks",
    site: "playlab",
    split: "train",
    url: lab,
    target: "#multiSelect",
    goal: "Select React in the frameworks list",
    name: "Select Frameworks",
    value: "react",
  }),
  ...xqaFields.map(([id, target, name, goal, value]) =>
    fieldCase({
      id: `xqa-${id}`,
      site: "xqa",
      split: "train",
      url: `${xqa}/text-box`,
      target,
      goal,
      role: "textbox",
      name,
      value,
      prepare: dismissConsent,
    }),
  ),
  selectCase({
    id: "xqa-standard-select",
    site: "xqa",
    split: "train",
    url: `${xqa}/select-menu`,
    target: "#oldSelectMenu",
    goal: "Select Blue in the standard HTML select",
    name: "Standard HTML Select",
    value: "blue",
    prepare: dismissConsent,
  }),
  selectCase({
    id: "xqa-multiple-select",
    site: "xqa",
    split: "train",
    url: `${xqa}/select-menu`,
    target: "#standardMultiSelect",
    goal: "Select Volvo in the standard multi-select",
    name: "Standard Multi-Select",
    value: "volvo",
    prepare: dismissConsent,
  }),
  ...basicFields.map(([id, target, name, goal, value]) =>
    fieldCase({
      id: `gaurav-${id}`,
      site: "gaurav-practice",
      split: "validation",
      url: gaurav,
      target,
      goal,
      role: "textbox",
      name,
      value,
      prepare: showBasic,
    }),
  ),
  clickCase({
    id: "gaurav-basic-tab",
    site: "gaurav-practice",
    split: "validation",
    url: gaurav,
    target: '[role="tab"]:has-text("Basic")',
    goal: "Open the Basic tab",
    postcondition: (page) =>
      page
        .getByRole("tab", { name: "Basic" })
        .getAttribute("aria-selected")
        .then((value) => value === "true"),
  }),
  ...freshTestCasesV8,
];
