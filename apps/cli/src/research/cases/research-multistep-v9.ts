import { extractBrowserState } from "@jolty/browser";
import type { Page } from "playwright";
import type { ValidationCheck } from "../../../../../packages/validator/src/validate-action.ts";
import { targetId } from "../../../benchmarks/public-site-flows.ts";
import type { ResearchMultistepFlow } from "./research-multistep-flow.ts";

const exercise = "https://automationexercise.com";
const blaze = "https://www.demoblaze.com/";
const bank = "https://parabank.parasoft.com/parabank";

type Step = {
  goal: string;
  action: "click" | "type";
  target: string;
  value?: string;
  check?: ValidationCheck;
};

function flow(args: {
  id: string;
  site: string;
  url: string;
  steps: readonly Step[];
  prepare?: (page: Page) => Promise<void>;
  postcondition: (page: Page) => Promise<boolean>;
}): ResearchMultistepFlow {
  return {
    id: args.id,
    site: args.site,
    url: args.url,
    labels: args.steps.map(({ goal, action, target }) => ({
      goal,
      action,
      target,
    })),
    prepare: args.prepare,
    async buildTask(page) {
      const initial = (await extractBrowserState(page)).state;
      return {
        id: args.id,
        steps: await Promise.all(
          args.steps.map(async (step) => {
            if (step.value === undefined)
              return {
                goal: step.goal,
                checks: [step.check ?? { kind: "no_console_errors" as const }],
              };
            const initialId = await targetId(page, step.target, initial);
            const initialElement = initial.elements.find(
              (element) => element.id === initialId,
            );
            return {
              goal: step.goal,
              values: [
                {
                  action: "type" as const,
                  target: {
                    role: initialElement?.role ?? "textbox",
                    name: initialElement?.name ?? "",
                    id: initialId,
                  },
                  value: step.value,
                },
              ],
              checks: [
                step.check ?? {
                  kind: "input_value_changed" as const,
                  targetId: initialId,
                  expectedValue: step.value,
                },
              ],
            };
          }),
        ),
      };
    },
    postcondition: args.postcondition,
  };
}

async function dismissExerciseConsent(page: Page): Promise<void> {
  const consent = page.getByRole("button", { name: "Consent", exact: true });
  if (await consent.isVisible()) await consent.click();
}

async function prepareBlaze(page: Page): Promise<void> {
  await page
    .locator('a[href="prod.html?idp_=1"]')
    .first()
    .waitFor({ state: "visible", timeout: 8_000 });
}

const typed = (goal: string, target: string, value: string): Step => ({
  goal,
  action: "type",
  target,
  value,
});
const clicked = (
  goal: string,
  target: string,
  check?: ValidationCheck,
): Step => ({
  goal,
  action: "click",
  target,
  check,
});

export const researchMultistepFlowsV9: ResearchMultistepFlow[] = [
  flow({
    id: "exercise-begin-signup",
    site: "automationexercise",
    url: `${exercise}/login`,
    prepare: dismissExerciseConsent,
    steps: [
      typed("Enter the signup name", '[data-qa="signup-name"]', "Jolty"),
      typed(
        "Enter the signup email",
        '[data-qa="signup-email"]',
        "jolty@example.test",
      ),
      clicked(
        "Continue to account information after entering signup details",
        '[data-qa="signup-button"]',
        { kind: "url_changed", to: `${exercise}/signup` },
      ),
    ],
    postcondition: async (page) =>
      new URL(page.url()).pathname === "/signup" &&
      (await page.getByText("ENTER ACCOUNT INFORMATION").isVisible()),
  }),
  flow({
    id: "exercise-review-draft",
    site: "automationexercise",
    url: `${exercise}/product_details/1`,
    prepare: dismissExerciseConsent,
    steps: [
      typed("Enter a name for the product review", "#name", "Jolty"),
      typed(
        "Enter an email for the product review",
        "#email",
        "jolty@example.test",
      ),
      typed("Enter a review for Blue Top", "#review", "Comfortable blue top"),
    ],
    postcondition: async (page) =>
      (await page.locator("#name").inputValue()) === "Jolty" &&
      (await page.locator("#email").inputValue()) === "jolty@example.test" &&
      (await page.locator("#review").inputValue()) === "Comfortable blue top",
  }),
  flow({
    id: "exercise-contact-draft",
    site: "automationexercise",
    url: `${exercise}/contact_us`,
    prepare: dismissExerciseConsent,
    steps: [
      typed("Enter a contact name", '[data-qa="name"]', "Jolty"),
      typed("Enter a contact email", '[data-qa="email"]', "jolty@example.test"),
      typed(
        "Enter a contact message",
        '[data-qa="message"]',
        "Testing the contact form",
      ),
    ],
    postcondition: async (page) =>
      (await page.locator('[data-qa="name"]').inputValue()) === "Jolty" &&
      (await page.locator('[data-qa="email"]').inputValue()) ===
        "jolty@example.test" &&
      (await page.locator('[data-qa="message"]').inputValue()) ===
        "Testing the contact form",
  }),
  flow({
    id: "blaze-contact-draft",
    site: "demoblaze",
    url: blaze,
    prepare: async (page) => {
      await prepareBlaze(page);
      await page.getByRole("link", { name: "Contact", exact: true }).click();
      await page.locator("#exampleModal").waitFor({ state: "visible" });
    },
    steps: [
      typed(
        "Enter an email in the contact dialog",
        "#recipient-email",
        "jolty@example.test",
      ),
      typed("Enter a name in the contact dialog", "#recipient-name", "Jolty"),
      typed(
        "Enter a message in the contact dialog",
        "#message-text",
        "Browser test",
      ),
    ],
    postcondition: async (page) =>
      (await page.locator("#recipient-email").inputValue()) ===
        "jolty@example.test" &&
      (await page.locator("#recipient-name").inputValue()) === "Jolty" &&
      (await page.locator("#message-text").inputValue()) === "Browser test",
  }),
  flow({
    id: "blaze-login-draft",
    site: "demoblaze",
    url: blaze,
    prepare: async (page) => {
      await prepareBlaze(page);
      await page.locator("#login2").click();
      await page.locator("#logInModal").waitFor({ state: "visible" });
    },
    steps: [
      typed("Enter the login username", "#loginusername", "jolty-user"),
      typed("Enter the login password", "#loginpassword", "Demo1234!"),
      clicked(
        "Close the Log in dialog",
        '#logInModal .modal-footer button:has-text("Close")',
      ),
    ],
    postcondition: async (page) =>
      (await page
        .locator("#logInModal")
        .waitFor({ state: "hidden", timeout: 1_500 })
        .then(() => true)) &&
      (await page.locator("#loginusername").inputValue()) === "jolty-user" &&
      (await page.locator("#loginpassword").inputValue()) === "Demo1234!",
  }),
  flow({
    id: "blaze-signup-draft",
    site: "demoblaze",
    url: blaze,
    prepare: async (page) => {
      await prepareBlaze(page);
      await page.locator("#signin2").click();
      await page.locator("#signInModal").waitFor({ state: "visible" });
    },
    steps: [
      typed("Enter the signup username", "#sign-username", "jolty-user"),
      typed("Enter the signup password", "#sign-password", "Demo1234!"),
      clicked(
        "Close the Sign up dialog",
        '#signInModal .modal-footer button:has-text("Close")',
      ),
    ],
    postcondition: async (page) =>
      (await page
        .locator("#signInModal")
        .waitFor({ state: "hidden", timeout: 1_500 })
        .then(() => true)) &&
      (await page.locator("#sign-username").inputValue()) === "jolty-user" &&
      (await page.locator("#sign-password").inputValue()) === "Demo1234!",
  }),
  flow({
    id: "bank-lookup-draft",
    site: "parabank",
    url: `${bank}/lookup.htm`,
    steps: [
      typed("Enter the first name for login recovery", "#firstName", "Jolty"),
      typed("Enter the last name for login recovery", "#lastName", "Tester"),
      typed("Enter a demo SSN for login recovery", "#ssn", "123-45-6789"),
    ],
    postcondition: async (page) =>
      (await page.locator("#firstName").inputValue()) === "Jolty" &&
      (await page.locator("#lastName").inputValue()) === "Tester" &&
      (await page.locator("#ssn").inputValue()) === "123-45-6789",
  }),
  flow({
    id: "bank-register-draft",
    site: "parabank",
    url: `${bank}/register.htm`,
    steps: [
      typed(
        "Enter the first name on the registration form",
        'input[name="customer.firstName"]',
        "Jolty",
      ),
      typed(
        "Enter the last name on the registration form",
        'input[name="customer.lastName"]',
        "Tester",
      ),
      typed(
        "Enter the street address on the registration form",
        'input[name="customer.address.street"]',
        "Test Street",
      ),
    ],
    postcondition: async (page) =>
      (await page.locator('input[name="customer.firstName"]').inputValue()) ===
        "Jolty" &&
      (await page.locator('input[name="customer.lastName"]').inputValue()) ===
        "Tester" &&
      (await page
        .locator('input[name="customer.address.street"]')
        .inputValue()) === "Test Street",
  }),
  flow({
    id: "bank-contact-draft",
    site: "parabank",
    url: `${bank}/contact.htm`,
    steps: [
      typed("Enter a name on the customer care form", "#name", "Jolty"),
      typed(
        "Enter an email on the customer care form",
        "#email",
        "jolty@example.test",
      ),
      typed(
        "Enter a message on the customer care form",
        "#message",
        "Browser test",
      ),
    ],
    postcondition: async (page) =>
      (await page.locator("#name").inputValue()) === "Jolty" &&
      (await page.locator("#email").inputValue()) === "jolty@example.test" &&
      (await page.locator("#message").inputValue()) === "Browser test",
  }),
];
