import type { Page } from "playwright";
import {
  type Flow,
  flows as heldOutFlows,
} from "../benchmarks/public-site-flows.ts";

export type ResearchSplit = "train" | "validation" | "test";
export type ResearchCase = Flow & { split: ResearchSplit };

const evil = "https://testpages.eviltester.com";
const qa = "https://qa-automation-practice.netlify.app";
const expand = "https://practice.expandtesting.com";

export function fieldCase(args: {
  id: string;
  site: string;
  split: ResearchSplit;
  url: string;
  target: string;
  goal: string;
  role: string;
  name: string;
  value: string;
  prepare?: (page: Page) => Promise<void>;
}): ResearchCase {
  return {
    ...args,
    action: "type",
    step: (targetId) => ({
      goal: args.goal,
      checks: [
        {
          kind: "input_value_changed",
          targetId,
          expectedValue: args.value,
        },
      ],
      values: [
        {
          action: "type",
          target: { role: args.role, name: args.name },
          value: args.value,
        },
      ],
    }),
  };
}

export function selectCase(args: {
  id: string;
  site: string;
  split: ResearchSplit;
  url: string;
  target: string;
  goal: string;
  name: string;
  value: string;
  prepare?: (page: Page) => Promise<void>;
}): ResearchCase {
  return {
    ...args,
    action: "select",
    step: (targetId) => ({
      goal: args.goal,
      checks: [
        {
          kind: "input_value_changed",
          targetId,
          expectedValue: args.value,
        },
      ],
      values: [
        {
          action: "select",
          target: { role: "combobox", name: args.name },
          value: args.value,
        },
      ],
    }),
  };
}

export function navigationCase(args: {
  id: string;
  site: string;
  split: ResearchSplit;
  url: string;
  target: string;
  goal: string;
  destination: string;
  prepare?: (page: Page) => Promise<void>;
}): ResearchCase {
  return {
    ...args,
    action: "click",
    step: () => ({
      goal: args.goal,
      checks: [{ kind: "url_changed", to: args.destination }],
    }),
  };
}

async function dismissExpandConsent(page: Page): Promise<void> {
  const consent = page.getByRole("button", { name: "Consent", exact: true });
  try {
    await consent.waitFor({ state: "visible", timeout: 800 });
    await consent.click();
  } catch {
    // The consent dialog is not shown on every fresh context.
  }
}

const evilText = `${evil}/pages/input-elements/text-inputs/`;
const evilPages = `${evil}/pages/`;
const qaRegister = `${qa}/register`;
const expandInputs = `${expand}/inputs`;

export const researchCases: ResearchCase[] = [
  fieldCase({
    id: "evil-text",
    site: "eviltester",
    split: "train",
    url: evilText,
    target: "#text-input",
    goal: "Enter text in the Text field",
    role: "textbox",
    name: "Text",
    value: "Jolty",
  }),
  fieldCase({
    id: "evil-search",
    site: "eviltester",
    split: "train",
    url: evilText,
    target: "#search-input",
    goal: "Enter a search query",
    role: "searchbox",
    name: "Search",
    value: "browser",
  }),
  fieldCase({
    id: "evil-telephone",
    site: "eviltester",
    split: "train",
    url: evilText,
    target: "#tel-input",
    goal: "Enter a telephone number",
    role: "textbox",
    name: "tel",
    value: "1234567890",
  }),
  selectCase({
    id: "evil-html-dropdown",
    site: "eviltester",
    split: "train",
    url: `${evil}/pages/forms/html-form/`,
    target: 'select[name="dropdown"]',
    goal: "Select Drop Down Item 2",
    name: "Drop Down Item 1 Drop Down Item 2 Drop Down Item 3 Drop Down Item 4 Drop Down Item 5 Drop Down Item 6",
    value: "dd2",
  }),
  ...[
    [
      "email",
      "#email-input",
      "Enter an email address",
      "email url",
      "jolty@example.test",
    ],
    ["url", "#url-input", "Enter a URL", "", "https://example.test"],
    [
      "default-text",
      "#text-default-input",
      "Enter text in the default input",
      "None (text)",
      "Jolty",
    ],
    [
      "max-text",
      "#text-max-input",
      "Enter text in the limited input",
      "text (max len 20)",
      "Jolty",
    ],
  ].map(([id, target, goal, name, value]) =>
    fieldCase({
      id: `evil-${id}`,
      site: "eviltester",
      split: "train",
      url: evilText,
      target,
      goal,
      role: "textbox",
      name,
      value,
    }),
  ),
  fieldCase({
    id: "evil-form-username",
    site: "eviltester",
    split: "train",
    url: `${evil}/pages/forms/html-form/`,
    target: 'input[name="username"]',
    goal: "Enter a username in the HTML form",
    role: "textbox",
    name: "",
    value: "Jolty",
  }),
  fieldCase({
    id: "evil-form-comment",
    site: "eviltester",
    split: "train",
    url: `${evil}/pages/forms/html-form/`,
    target: 'textarea[name="comments"]',
    goal: "Enter a comment in the HTML form",
    role: "textbox",
    name: "",
    value: "Test comment",
  }),
  fieldCase({
    id: "evil-number",
    site: "eviltester",
    split: "train",
    url: `${evil}/pages/input-elements/number-inputs/`,
    target: "#number-input",
    goal: "Enter a number with defaults",
    role: "spinbutton",
    name: "number with defaults",
    value: "42",
  }),
  fieldCase({
    id: "evil-number-step",
    site: "eviltester",
    split: "train",
    url: `${evil}/pages/input-elements/number-inputs/`,
    target: "#number-input-val",
    goal: "Enter a number with min max and step",
    role: "spinbutton",
    name: "number with min, max and step",
    value: "6",
  }),
  ...[
    ["apps", "/apps/", "Apps"],
    ["tools", "/tools/", "Tools"],
    ["challenges", "/challenges/", "Challenges"],
  ].map(([id, path, name]) =>
    navigationCase({
      id: `evil-open-${id}`,
      site: "eviltester",
      split: "train",
      url: evilPages,
      target: `a.nav-link[href="${path}"]`,
      goal: `Open ${name}`,
      destination: `${evil}${path}`,
    }),
  ),
  fieldCase({
    id: "qa-first-name",
    site: "qa-practice",
    split: "train",
    url: qaRegister,
    target: "#firstName",
    goal: "Enter a first name",
    role: "textbox",
    name: "First Name",
    value: "Jolty",
  }),
  fieldCase({
    id: "qa-last-name",
    site: "qa-practice",
    split: "train",
    url: qaRegister,
    target: "#lastName",
    goal: "Enter a last name",
    role: "textbox",
    name: "Last Name Phone number Country",
    value: "Test",
  }),
  fieldCase({
    id: "qa-phone",
    site: "qa-practice",
    split: "train",
    url: qaRegister,
    target: "#phone",
    goal: "Enter a phone number",
    role: "textbox",
    name: "Enter phone number",
    value: "1234567890",
  }),
  fieldCase({
    id: "qa-email",
    site: "qa-practice",
    split: "train",
    url: qaRegister,
    target: "#emailAddress",
    goal: "Enter an email address",
    role: "textbox",
    name: "Enter email",
    value: "jolty@example.test",
  }),
  selectCase({
    id: "qa-country",
    site: "qa-practice",
    split: "train",
    url: `${qa}/dropdowns`,
    target: "#dropdown-menu",
    goal: "Select Albania from the country dropdown",
    name: "Select a country...",
    value: "Albania",
  }),
  navigationCase({
    id: "qa-open-products",
    site: "qa-practice",
    split: "train",
    url: `${qa}/`,
    target: 'a[href="/products_list"]',
    goal: "Open the products list",
    destination: `${qa}/products_list`,
  }),
  navigationCase({
    id: "qa-open-bugs-form",
    site: "qa-practice",
    split: "train",
    url: `${qa}/`,
    target: 'a[href="/bugs-form"]',
    goal: "Open the bugs challenge form",
    destination: `${qa}/bugs-form`,
  }),
  {
    id: "qa-hide-element",
    site: "qa-practice",
    split: "train",
    url: `${qa}/show-hide-element`,
    goal: "Hide the message",
    action: "click",
    target: "#showHideBtn",
    step: () => ({
      goal: "Hide the message",
      checks: [{ kind: "element_disappeared", role: "alert", name: "" }],
    }),
    postcondition: (page) => page.locator("#hiddenText").isHidden(),
  },
  fieldCase({
    id: "qa-register-password",
    site: "qa-practice",
    split: "train",
    url: qaRegister,
    target: "#password",
    goal: "Enter a password in the registration form",
    role: "textbox",
    name: "Password",
    value: "Demo1234!",
  }),
  selectCase({
    id: "qa-register-country",
    site: "qa-practice",
    split: "train",
    url: qaRegister,
    target: "#countries_dropdown_menu",
    goal: "Select Albania in the registration country field",
    name: "Select a country...",
    value: "Albania",
  }),
  fieldCase({
    id: "qa-login-email",
    site: "qa-practice",
    split: "train",
    url: `${qa}/auth_ecommerce`,
    target: "#email",
    goal: "Enter the login email",
    role: "textbox",
    name: "Email",
    value: "jolty@example.test",
  }),
  fieldCase({
    id: "qa-login-password",
    site: "qa-practice",
    split: "train",
    url: `${qa}/auth_ecommerce`,
    target: "#password",
    goal: "Enter the login password",
    role: "textbox",
    name: "Password",
    value: "Demo1234!",
  }),
  fieldCase({
    id: "qa-recovery-email",
    site: "qa-practice",
    split: "train",
    url: `${qa}/recover-password`,
    target: "#email",
    goal: "Enter the recovery email",
    role: "textbox",
    name: "Please enter your email address, to recover the password",
    value: "jolty@example.test",
  }),
  fieldCase({
    id: "expand-text",
    site: "expandtesting",
    split: "validation",
    url: expandInputs,
    target: "#input-text",
    goal: "Enter text in Input: Text",
    role: "textbox",
    name: "Input: Text",
    value: "Jolty",
    prepare: dismissExpandConsent,
  }),
  fieldCase({
    id: "expand-number",
    site: "expandtesting",
    split: "validation",
    url: expandInputs,
    target: "#input-number",
    goal: "Enter a number in Input: Number",
    role: "spinbutton",
    name: "Input: Number",
    value: "42",
    prepare: dismissExpandConsent,
  }),
  fieldCase({
    id: "expand-contact-name",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/form-validation`,
    target: 'input[name="ContactName"]',
    goal: "Enter a contact name",
    role: "textbox",
    name: "Contact Name",
    value: "Jolty",
    prepare: dismissExpandConsent,
  }),
  selectCase({
    id: "expand-payment",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/form-validation`,
    target: 'select[name="payment"]',
    goal: "Select card as the payment method",
    name: "Payment Method",
    value: "card",
    prepare: dismissExpandConsent,
  }),
  fieldCase({
    id: "expand-password",
    site: "expandtesting",
    split: "validation",
    url: expandInputs,
    target: "#input-password",
    goal: "Enter a value in Input: Password",
    role: "textbox",
    name: "Input: Password",
    value: "Demo1234!",
    prepare: dismissExpandConsent,
  }),
  fieldCase({
    id: "expand-date",
    site: "expandtesting",
    split: "validation",
    url: expandInputs,
    target: "#input-date",
    goal: "Enter a date in Input: Date",
    role: "textbox",
    name: "Input: Date",
    value: "2026-09-23",
    prepare: dismissExpandConsent,
  }),
  fieldCase({
    id: "expand-login-username",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/login`,
    target: "#username",
    goal: "Enter the login username",
    role: "textbox",
    name: "Username",
    value: "practice",
    prepare: dismissExpandConsent,
  }),
  fieldCase({
    id: "expand-login-password",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/login`,
    target: "#password",
    goal: "Enter the login password",
    role: "textbox",
    name: "Password",
    value: "Demo1234!",
    prepare: dismissExpandConsent,
  }),
  fieldCase({
    id: "expand-recovery-email",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/forgot-password`,
    target: "#email",
    goal: "Enter a recovery email",
    role: "textbox",
    name: "E-mail",
    value: "jolty@example.test",
    prepare: dismissExpandConsent,
  }),
  fieldCase({
    id: "expand-contact-number",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/form-validation`,
    target: 'input[name="contactnumber"]',
    goal: "Enter a contact number",
    role: "textbox",
    name: "Contact number PickUp Date",
    value: "1234567890",
    prepare: dismissExpandConsent,
  }),
  selectCase({
    id: "expand-page-size",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/dropdown`,
    target: "#elementsPerPageSelect",
    goal: "Select 20 elements per page",
    name: "Elements per Page:",
    value: "20",
    prepare: dismissExpandConsent,
  }),
  selectCase({
    id: "expand-country",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/dropdown`,
    target: "#country",
    goal: "Select Albania as the country",
    name: "Select country",
    value: "AL",
    prepare: dismissExpandConsent,
  }),
  navigationCase({
    id: "expand-open-tips",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/`,
    target: 'a[href="/tips"]',
    goal: "Open Tips",
    destination: `${expand}/tips`,
    prepare: dismissExpandConsent,
  }),
  navigationCase({
    id: "expand-open-about",
    site: "expandtesting",
    split: "validation",
    url: `${expand}/`,
    target: 'a.nav-link[href="/about"]',
    goal: "Open About",
    destination: `${expand}/about`,
    prepare: dismissExpandConsent,
  }),
  ...heldOutFlows.map((flow): ResearchCase => ({ ...flow, split: "test" })),
];
