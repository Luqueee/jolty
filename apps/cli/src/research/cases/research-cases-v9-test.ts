import type { Page } from "playwright";
import { fieldCase, type ResearchCase } from "./research-cases.ts";

const exercise = "https://automationexercise.com";
const blaze = "https://www.demoblaze.com";
const bank = "https://parabank.parasoft.com/parabank";

async function dismissExerciseConsent(page: Page): Promise<void> {
  const consent = page.getByRole("button", { name: "Consent", exact: true });
  if (await consent.isVisible()) await consent.click();
}

function field(args: {
  id: string;
  site: string;
  url: string;
  target: string;
  goal: string;
  value: string;
  prepare?: (page: Page) => Promise<void>;
}): ResearchCase {
  return {
    ...fieldCase({
      ...args,
      split: "test",
      role: "textbox",
      name: "",
      prepare: async (page) => {
        if (args.site === "automationexercise")
          await dismissExerciseConsent(page);
        await args.prepare?.(page);
      },
    }),
    postcondition: async (page) =>
      (await page.locator(args.target).inputValue()) === args.value,
    failureModes:
      args.site === "automationexercise"
        ? args.id.includes("search")
          ? ["search_field_button_conflict", "dense_page"]
          : ["dense_page"]
        : args.site === "demoblaze"
          ? ["modal_control", "duplicate_nearby_labels"]
          : ["duplicate_nearby_labels"],
  };
}

function click(args: {
  id: string;
  site: string;
  url: string;
  target: string;
  goal: string;
  prepare?: (page: Page) => Promise<void>;
  postcondition: (page: Page) => Promise<boolean>;
}): ResearchCase {
  return {
    ...args,
    split: "test",
    action: "click",
    failureModes:
      args.site === "automationexercise"
        ? ["dense_page"]
        : args.site === "demoblaze"
          ? args.id.includes("close")
            ? ["modal_control", "post_transition_control"]
            : ["modal_control"]
          : [],
    prepare: async (page) => {
      if (args.site === "automationexercise")
        await dismissExerciseConsent(page);
      await args.prepare?.(page);
    },
    step: () => ({ goal: args.goal, checks: [{ kind: "no_console_errors" }] }),
  };
}

async function openBlaze(
  page: Page,
  label: string,
  modal: string,
): Promise<void> {
  await page
    .locator('a[href="prod.html?idp_=1"]')
    .first()
    .waitFor({ state: "visible", timeout: 8_000 });
  await page.getByRole("link", { name: label, exact: true }).click();
  await page.locator(modal).waitFor({ state: "visible" });
}

export const freshTestCasesV9: ResearchCase[] = [
  field({
    id: "exercise-search-product",
    site: "automationexercise",
    url: `${exercise}/products`,
    target: "#search_product",
    goal: "Enter Blue Top in the product search field",
    value: "Blue Top",
  }),
  field({
    id: "exercise-quantity",
    site: "automationexercise",
    url: `${exercise}/product_details/1`,
    target: "#quantity",
    goal: "Set the Blue Top quantity to two",
    value: "2",
  }),
  click({
    id: "exercise-add-cart",
    site: "automationexercise",
    url: `${exercise}/product_details/1`,
    target: 'button:has-text("Add to cart")',
    goal: "Add Blue Top to the cart",
    postcondition: async (page) => {
      await page
        .getByText("Added!")
        .waitFor({ state: "visible", timeout: 1_500 });
      return true;
    },
  }),
  field({
    id: "exercise-review-name",
    site: "automationexercise",
    url: `${exercise}/product_details/1`,
    target: "#name",
    goal: "Enter a name for the product review",
    value: "Jolty",
  }),
  field({
    id: "exercise-review-email",
    site: "automationexercise",
    url: `${exercise}/product_details/1`,
    target: "#email",
    goal: "Enter an email for the product review",
    value: "jolty@example.test",
  }),
  field({
    id: "exercise-review-text",
    site: "automationexercise",
    url: `${exercise}/product_details/1`,
    target: "#review",
    goal: "Enter a review for Blue Top",
    value: "Comfortable blue top",
  }),
  field({
    id: "exercise-login-email",
    site: "automationexercise",
    url: `${exercise}/login`,
    target: '[data-qa="login-email"]',
    goal: "Enter the login email",
    value: "jolty@example.test",
  }),
  field({
    id: "exercise-login-password",
    site: "automationexercise",
    url: `${exercise}/login`,
    target: '[data-qa="login-password"]',
    goal: "Enter the login password",
    value: "Demo1234!",
  }),
  field({
    id: "exercise-signup-name",
    site: "automationexercise",
    url: `${exercise}/login`,
    target: '[data-qa="signup-name"]',
    goal: "Enter the signup name",
    value: "Jolty",
  }),
  field({
    id: "exercise-signup-email",
    site: "automationexercise",
    url: `${exercise}/login`,
    target: '[data-qa="signup-email"]',
    goal: "Enter the signup email",
    value: "jolty@example.test",
  }),
  click({
    id: "exercise-begin-signup",
    site: "automationexercise",
    url: `${exercise}/login`,
    target: '[data-qa="signup-button"]',
    goal: "Continue to account information after entering signup details",
    prepare: async (page) => {
      await page.locator('[data-qa="signup-name"]').fill("Jolty");
      await page.locator('[data-qa="signup-email"]').fill("jolty@example.test");
    },
    postcondition: async (page) => new URL(page.url()).pathname === "/signup",
  }),
  ...(
    [
      ["name", '[data-qa="name"]', "Enter a contact name", "Jolty"],
      [
        "email",
        '[data-qa="email"]',
        "Enter a contact email",
        "jolty@example.test",
      ],
      [
        "subject",
        '[data-qa="subject"]',
        "Enter a contact subject",
        "Browser test",
      ],
      [
        "message",
        '[data-qa="message"]',
        "Enter a contact message",
        "Testing the contact form",
      ],
    ] as const
  ).map(([id, target, goal, value]) =>
    field({
      id: `exercise-contact-${id}`,
      site: "automationexercise",
      url: `${exercise}/contact_us`,
      target,
      goal,
      value,
    }),
  ),
  ...(
    [
      ["contact", "Contact", "#exampleModal"],
      ["login", "Log in", "#logInModal"],
      ["signup", "Sign up", "#signInModal"],
      ["about", "About us", "#videoModal"],
    ] as const
  ).map(([id, label, modal]) =>
    click({
      id: `blaze-open-${id}`,
      site: "demoblaze",
      url: `${blaze}/`,
      target: `a:has-text("${label}")`,
      goal: `Open the ${label} dialog`,
      prepare: (page) =>
        page
          .locator('a[href="prod.html?idp_=1"]')
          .first()
          .waitFor({ state: "visible", timeout: 8_000 }),
      postcondition: async (page) => {
        await page.locator(modal).waitFor({ state: "visible", timeout: 1_500 });
        return true;
      },
    }),
  ),
  ...(
    [
      [
        "contact-email",
        "Contact",
        "#exampleModal",
        "#recipient-email",
        "Enter an email in the contact dialog",
        "jolty@example.test",
      ],
      [
        "contact-name",
        "Contact",
        "#exampleModal",
        "#recipient-name",
        "Enter a name in the contact dialog",
        "Jolty",
      ],
      [
        "contact-message",
        "Contact",
        "#exampleModal",
        "#message-text",
        "Enter a message in the contact dialog",
        "Browser test",
      ],
      [
        "login-username",
        "Log in",
        "#logInModal",
        "#loginusername",
        "Enter the login username",
        "jolty-user",
      ],
      [
        "login-password",
        "Log in",
        "#logInModal",
        "#loginpassword",
        "Enter the login password",
        "Demo1234!",
      ],
      [
        "signup-username",
        "Sign up",
        "#signInModal",
        "#sign-username",
        "Enter the signup username",
        "jolty-user",
      ],
      [
        "signup-password",
        "Sign up",
        "#signInModal",
        "#sign-password",
        "Enter the signup password",
        "Demo1234!",
      ],
    ] as const
  ).map(([id, label, modal, target, goal, value]) =>
    field({
      id: `blaze-${id}`,
      site: "demoblaze",
      url: `${blaze}/`,
      target,
      goal,
      value,
      prepare: (page) => openBlaze(page, label, modal),
    }),
  ),
  click({
    id: "blaze-close-login",
    site: "demoblaze",
    url: `${blaze}/`,
    target: '#logInModal .modal-footer button:has-text("Close")',
    goal: "Close the Log in dialog",
    prepare: (page) => openBlaze(page, "Log in", "#logInModal"),
    postcondition: async (page) => {
      await page
        .locator("#logInModal")
        .waitFor({ state: "hidden", timeout: 1_500 });
      return true;
    },
  }),
  click({
    id: "blaze-close-signup",
    site: "demoblaze",
    url: `${blaze}/`,
    target: '#signInModal .modal-footer button:has-text("Close")',
    goal: "Close the Sign up dialog",
    prepare: (page) => openBlaze(page, "Sign up", "#signInModal"),
    postcondition: async (page) => {
      await page
        .locator("#signInModal")
        .waitFor({ state: "hidden", timeout: 1_500 });
      return true;
    },
  }),
  ...(
    [
      [
        "home-username",
        "index.htm",
        'input[name="username"]',
        "Enter the banking login username",
        "jolty-user",
      ],
      [
        "home-password",
        "index.htm",
        'input[name="password"]',
        "Enter the banking login password",
        "Demo1234!",
      ],
      [
        "lookup-first",
        "lookup.htm",
        "#firstName",
        "Enter the first name for login recovery",
        "Jolty",
      ],
      [
        "lookup-last",
        "lookup.htm",
        "#lastName",
        "Enter the last name for login recovery",
        "Tester",
      ],
      [
        "lookup-ssn",
        "lookup.htm",
        "#ssn",
        "Enter a demo SSN for login recovery",
        "123-45-6789",
      ],
      [
        "register-first",
        "register.htm",
        'input[name="customer.firstName"]',
        "Enter the first name on the registration form",
        "Jolty",
      ],
      [
        "register-last",
        "register.htm",
        'input[name="customer.lastName"]',
        "Enter the last name on the registration form",
        "Tester",
      ],
      [
        "register-address",
        "register.htm",
        'input[name="customer.address.street"]',
        "Enter the street address on the registration form",
        "Test Street",
      ],
      [
        "register-city",
        "register.htm",
        'input[name="customer.address.city"]',
        "Enter the city on the registration form",
        "Madrid",
      ],
      [
        "contact-name",
        "contact.htm",
        "#name",
        "Enter a name on the customer care form",
        "Jolty",
      ],
      [
        "contact-email",
        "contact.htm",
        "#email",
        "Enter an email on the customer care form",
        "jolty@example.test",
      ],
      [
        "contact-message",
        "contact.htm",
        "#message",
        "Enter a message on the customer care form",
        "Browser test",
      ],
    ] as const
  ).map(([id, path, target, goal, value]) =>
    field({
      id: `bank-${id}`,
      site: "parabank",
      url: `${bank}/${path}`,
      target,
      goal,
      value,
    }),
  ),
];
