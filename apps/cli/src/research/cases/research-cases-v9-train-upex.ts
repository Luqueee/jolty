import type { Page } from "playwright";
import { fieldCase, type ResearchCase } from "./research-cases.ts";

const origin = "https://dojo.upexgalaxy.com";

async function prepare(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 8_000 });
}

function field(
  id: string,
  path: string,
  target: string,
  goal: string,
  value: string,
): ResearchCase {
  return {
    ...fieldCase({
      id: `upex-${id}`,
      site: "upex",
      split: "train",
      url: `${origin}${path}`,
      target,
      goal,
      role: "textbox",
      name: "",
      value,
      prepare,
    }),
    postcondition: async (page) =>
      (await page.locator(target).inputValue()) === value,
    failureModes: id.includes("search")
      ? ["search_field_button_conflict"]
      : id.startsWith("shipping-") || id.startsWith("dynamic-")
        ? ["duplicate_nearby_labels"]
        : [],
  };
}

function click(
  id: string,
  path: string,
  target: string,
  goal: string,
  postcondition: (page: Page) => Promise<boolean>,
): ResearchCase {
  return {
    id: `upex-${id}`,
    site: "upex",
    split: "train",
    url: `${origin}${path}`,
    target,
    goal,
    action: "click",
    prepare,
    step: () => ({ goal, checks: [{ kind: "no_console_errors" }] }),
    postcondition,
    failureModes: id.includes("modal") ? ["modal_control"] : [],
  };
}

export const freshUpexTrainCasesV9: ResearchCase[] = [
  field(
    "basic-input",
    "/components/input/text-fields",
    "#basic-input",
    "Enter text in the basic input",
    "Jolty",
  ),
  field(
    "email-input",
    "/components/input/text-fields",
    "#email-input",
    "Enter an email in the email input",
    "jolty@example.test",
  ),
  ...(
    [
      [
        "username",
        'input[name="username"]',
        "Enter a username in the dynamic profile form",
        "Jolty",
      ],
      [
        "email",
        'input[name="email"]',
        "Enter an email in the dynamic profile form",
        "jolty@example.test",
      ],
      [
        "bio",
        'textarea[name="bio"]',
        "Enter a biography in the dynamic profile form",
        "Browser tester",
      ],
      [
        "url",
        'input[name="urls.0.value"]',
        "Enter a URL in the dynamic profile form",
        "https://example.test",
      ],
    ] as const
  ).map(([id, target, goal, value]) =>
    field(
      `dynamic-${id}`,
      "/components/input/dynamic-forms",
      target,
      goal,
      value,
    ),
  ),
  ...(
    [
      ["firstName", "Enter the first name for shipping", "Jolty"],
      ["lastName", "Enter the last name for shipping", "Tester"],
      ["email", "Enter the email for shipping", "jolty@example.test"],
      ["phone", "Enter the phone number for shipping", "1234567890"],
      ["address", "Enter the street address for shipping", "Test Street"],
      ["city", "Enter the city for shipping", "Madrid"],
      ["zipCode", "Enter the ZIP code for shipping", "28001"],
    ] as const
  ).map(([name, goal, value]) =>
    field(
      `shipping-${name}`,
      "/components/forms/shipping-information",
      `input[name="${name}"]`,
      goal,
      value,
    ),
  ),
  field(
    "invoice-search",
    "/components/data/tables",
    'input[placeholder="Search invoices..."]',
    "Search invoices by status",
    "paid",
  ),
  click(
    "basic-button",
    "/components/input/buttons",
    '[data-testid="click-button"]',
    "Click the basic button",
    (page) => page.getByText("Clicked: 1 times").isVisible(),
  ),
  ...(["option1", "option2", "option3"] as const).map((option) =>
    click(
      `checkbox-${option}`,
      "/components/input/checkboxes",
      `button#${option}`,
      `Check ${option} in the checkbox group`,
      async (page) =>
        (await page
          .locator(`button#${option}`)
          .getAttribute("aria-checked")) === "true",
    ),
  ),
  ...(["option1", "option2", "option3"] as const).map((option) =>
    click(
      `radio-${option}`,
      "/components/input/radio-buttons",
      `button#${option}`,
      `Select ${option} in the radio group`,
      async (page) =>
        (await page
          .locator(`button#${option}`)
          .getAttribute("aria-checked")) === "true",
    ),
  ),
  ...(
    [
      ["accessible", "Is it accessible?"],
      ["styled", "Is it styled?"],
      ["animated", "Is it animated?"],
    ] as const
  ).map(([id, label]) =>
    click(
      `accordion-${id}`,
      "/components/layout/accordions",
      `button:has-text("${label}")`,
      `Expand the ${label} accordion`,
      async (page) =>
        (await page
          .getByRole("button", { name: label })
          .getAttribute("aria-expanded")) === "true",
    ),
  ),
  ...(
    [
      ["success", "Show Success Toast"],
      ["error", "Show Error Toast"],
      ["custom", "Show Custom Toast"],
    ] as const
  ).map(([id, label]) =>
    click(
      `toast-${id}`,
      "/components/feedback/toast-notifications",
      `button:has-text("${label}")`,
      label,
      (page) =>
        page
          .locator('li[role="status"][data-state="open"]')
          .first()
          .isVisible(),
    ),
  ),
  click(
    "open-modal",
    "/components/feedback/modals",
    'button:has-text("Open Modal")',
    "Open the profile modal",
    (page) => page.getByRole("dialog").isVisible(),
  ),
  click(
    "add-url",
    "/components/input/dynamic-forms",
    'button:has-text("Add URL")',
    "Add another URL field to the profile form",
    (page) => page.locator('input[name="urls.1.value"]').isVisible(),
  ),
  click(
    "last-page",
    "/components/navigation/pagination",
    'button:has-text("Last Page")',
    "Go to the last pagination page",
    (page) => page.getByText("Current Page: 10").isVisible(),
  ),
  click(
    "fruit-menu",
    "/components/input/dropdown-menus",
    "#fruit-select",
    "Open the fruit selection menu",
    async (page) =>
      (await page.locator("#fruit-select").getAttribute("aria-expanded")) ===
      "true",
  ),
  click(
    "framework-menu",
    "/components/input/multi-select-dropdowns",
    'button:has-text("Select frameworks")',
    "Open the framework multi-select menu",
    (page) => page.getByRole("option", { name: "Next.js" }).isVisible(),
  ),
  click(
    "autocomplete-menu",
    "/components/input/autocomplete-fields",
    'button:has-text("Select framework")',
    "Open the framework autocomplete menu",
    (page) => page.getByText("Dropdown Open: Yes").isVisible(),
  ),
  {
    ...click(
      "clear-after-entry",
      "/components/input/text-fields",
      'button:has-text("Clear")',
      "Clear the populated basic input",
      async (page) => (await page.locator("#basic-input").inputValue()) === "",
    ),
    failureModes: ["post_transition_control"],
    prepare: async (page) => {
      await prepare(page);
      await page.locator("#basic-input").fill("Jolty");
    },
  },
  {
    ...click(
      "close-modal",
      "/components/feedback/modals",
      'button:has-text("Close")',
      "Close the open profile modal",
      (page) => page.getByText("Modal is closed").isVisible(),
    ),
    failureModes: ["post_transition_control", "modal_control"],
    prepare: async (page) => {
      await prepare(page);
      await page.getByRole("button", { name: "Open Modal" }).click();
      await page.getByRole("dialog").waitFor({ state: "visible" });
    },
  },
  {
    ...field(
      "dynamic-second-url",
      "/components/input/dynamic-forms",
      'input[name="urls.1.value"]',
      "Enter the second URL added to the profile form",
      "https://example.test/second",
    ),
    failureModes: ["post_transition_control"],
    prepare: async (page) => {
      await prepare(page);
      await page.getByRole("button", { name: "Add URL" }).click();
      await page
        .locator('input[name="urls.1.value"]')
        .waitFor({ state: "visible" });
    },
  },
];
