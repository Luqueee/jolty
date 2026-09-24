import type { Page } from "playwright";
import { fieldCase, type ResearchCase } from "./research-cases.ts";

const origin = "https://www.play-qa.com";

async function prepare(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 8_000 });
  const reject = page.getByRole("button", { name: "Reject", exact: true });
  if (await reject.isVisible()) await reject.click();
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
      id: `playqa-${id}`,
      site: "playqa",
      split: "train",
      url: `${origin}/${path}`,
      target,
      goal,
      role: "textbox",
      name: "",
      value,
      prepare,
    }),
    postcondition: async (page) =>
      (await page.locator(target).inputValue()) === value,
    failureModes:
      id.includes("search") || id === "autocomplete-country"
        ? ["search_field_button_conflict"]
        : path === "forms"
          ? ["duplicate_nearby_labels"]
          : [],
  };
}

export const freshPlayQaTrainCasesV9: ResearchCase[] = [
  ...(
    [
      [
        "login-email",
        "Enter the email in the login form",
        "jolty@example.test",
      ],
      ["login-password", "Enter the password in the login form", "Demo1234!"],
      ["reg-name", "Enter the name in the registration form", "Jolty Tester"],
      [
        "reg-email",
        "Enter the email in the registration form",
        "jolty@example.test",
      ],
      [
        "reg-password",
        "Enter the password in the registration form",
        "Demo1234!",
      ],
      ["reg-confirm", "Confirm the registration password", "Demo1234!"],
      [
        "forgot-email",
        "Enter an email to recover the password",
        "jolty@example.test",
      ],
      ["wizard-firstname", "Enter the first name in the wizard", "Jolty"],
      ["wizard-lastname", "Enter the last name in the wizard", "Tester"],
      ["wizard-email", "Enter the email in the wizard", "jolty@example.test"],
      ["field-text", "Enter text in the all-fields form", "Jolty"],
      [
        "field-email",
        "Enter email in the all-fields form",
        "jolty@example.test",
      ],
      ["field-password", "Enter password in the all-fields form", "Demo1234!"],
      ["field-number", "Enter a number in the all-fields form", "42"],
      [
        "field-tel",
        "Enter a number in the Phone Input of the all-fields form",
        "1234567890",
      ],
      [
        "field-url",
        "Enter a URL in the all-fields form",
        "https://example.test",
      ],
      [
        "field-textarea",
        "Enter a comment in the Textarea of the all-fields form",
        "Browser testing",
      ],
      [
        "server-email",
        "Enter an email for server-side validation",
        "jolty@example.test",
      ],
      ["captcha-answer", "Enter a number in the CAPTCHA answer field", "12"],
      [
        "autocomplete-country",
        "Enter Canada in the Country autocomplete field",
        "Canada",
      ],
      [
        "search-input",
        "Type a tutorial query in the suggestions search field",
        "Playwright",
      ],
    ] as const
  ).map(([id, goal, value]) => field(id, "forms", `#${id}`, goal, value)),
  ...(
    [
      ["basic-input", "Enter text in the basic text input", "Jolty"],
      ["required-input", "Enter text in the required input", "Required value"],
      ["maxlength-input", "Enter text in the length-limited input", "Test"],
      ["pattern-input", "Enter digits in the patterned input", "1234"],
      [
        "email-input",
        "Enter an email in the basic elements form",
        "jolty@example.test",
      ],
      [
        "password-input",
        "Enter a password in the basic elements form",
        "Demo1234!",
      ],
      [
        "textarea-input",
        "Enter a multiline comment in basic elements",
        "Browser testing",
      ],
    ] as const
  ).map(([id, goal, value]) =>
    field(id, "basic-elements", `#${id}`, goal, value),
  ),
  field(
    "store-search",
    "store",
    "#store-search-input",
    "Type a product query in the store search field",
    "headphones",
  ),
  {
    id: "playqa-wizard-next-after-details",
    site: "playqa",
    split: "train",
    url: `${origin}/forms`,
    target: "#wizard-next",
    goal: "Select Next to open the address step",
    action: "click",
    failureModes: ["post_transition_control"],
    prepare: async (page) => {
      await prepare(page);
      await page.locator("#wizard-firstname").fill("Jolty");
      await page.locator("#wizard-lastname").fill("Tester");
      await page.locator("#wizard-email").fill("jolty@example.test");
    },
    step: () => ({
      goal: "Select Next to open the address step",
      checks: [{ kind: "text_visible", text: "Step 2: Address" }],
    }),
    postcondition: (page) => page.locator("#wizard-street").isVisible(),
  },
  {
    ...field(
      "wizard-street-after-next",
      "forms",
      "#wizard-street",
      "Enter the street on the wizard address step",
      "Test Street",
    ),
    failureModes: ["post_transition_control"],
    prepare: async (page) => {
      await prepare(page);
      await page.locator("#wizard-firstname").fill("Jolty");
      await page.locator("#wizard-lastname").fill("Tester");
      await page.locator("#wizard-email").fill("jolty@example.test");
      await page.locator("#wizard-next").click();
    },
  },
];
