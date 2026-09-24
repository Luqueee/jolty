import type { Page } from "playwright";
import { fieldCase, type ResearchCase } from "./research-cases.ts";
import { researchCasesV1 } from "./research-cases-v1.ts";

const hub = "https://qapracticehub.com";
const automation = "https://practice-automation.com";
const track = "https://www.testtrack.org";
const university = "https://webdriveruniversity.com";

async function prepareHubForm(page: Page): Promise<void> {
  const consent = page.getByRole("button", { name: "Accept", exact: true });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("link", { name: "Forms", exact: true }).first().click();
  await page.evaluate(() => history.replaceState(null, "", location.pathname));
}

function hubSubmit(
  id: string,
  target: string,
  goal: string,
  result: string,
  prepare: (page: Page) => Promise<void>,
): ResearchCase {
  return {
    id: `hub-${id}`,
    site: "qa-practice-hub",
    split: "train",
    url: `${hub}/`,
    target,
    goal,
    action: "click",
    prepare: async (page) => {
      await prepareHubForm(page);
      await prepare(page);
    },
    step: () => ({ goal, checks: [{ kind: "text_visible", text: result }] }),
    postcondition: async (page) =>
      (await page.locator("body").innerText()).includes(result),
  };
}

function modalOpen(
  id: string,
  target: string,
  dialogId: string,
  goal: string,
): ResearchCase {
  return {
    id: `automation-${id}`,
    site: "practice-automation",
    split: "validation",
    url: `${automation}/modals/`,
    target,
    goal,
    action: "click",
    step: () => ({ goal, checks: [{ kind: "no_console_errors" }] }),
    postcondition: (page) => page.locator(dialogId).isVisible(),
  };
}

function trackButton(id: string, label: string): ResearchCase {
  const goal = `Activate the ${label} button`;
  return {
    id: `track-${id}`,
    site: "test-track",
    split: "test",
    url: `${track}/button-demo`,
    target: `#${id}-button`,
    goal,
    action: "click",
    step: () => ({
      goal,
      checks: [
        {
          kind: "element_appeared",
          role: "button",
          name: `${label} Button (ACTIVATED)`,
        },
      ],
    }),
    postcondition: async (page) =>
      (await page.locator(`#${id}-button`).innerText()).includes("(ACTIVATED)"),
  };
}

export const freshTestFlowsV2: ResearchCase[] = [
  ...[
    ["primary", "Primary"],
    ["secondary", "Secondary"],
    ["outline", "Outline"],
    ["destructive", "Destructive"],
  ].map(([id, label]) => trackButton(id, label)),
  fieldCase({
    id: "track-mission-text",
    site: "test-track",
    split: "test",
    url: `${track}/text-input-demo`,
    target: "#text-input",
    goal: "Enter mission text data",
    role: "textbox",
    name: "Text Input",
    value: "Jolty mission",
  }),
  fieldCase({
    id: "track-mission-email",
    site: "test-track",
    split: "test",
    url: `${track}/text-input-demo`,
    target: "#email-input",
    goal: "Enter the mission email address",
    role: "textbox",
    name: "Email Input",
    value: "jolty@example.test",
  }),
  fieldCase({
    id: "track-mission-search",
    site: "test-track",
    split: "test",
    url: `${track}/text-input-demo`,
    target: "#search-input",
    goal: "Search the mission database",
    role: "searchbox",
    name: "Search Input",
    value: "lunar",
  }),
  ...[
    ["first-name", "first_name", "First Name", "Enter a first name", "Jo"],
    ["last-name", "last_name", "Last Name", "Enter a last name", "Lty"],
    [
      "email",
      "email",
      "Email Address",
      "Enter a contact email",
      "jolty@example.test",
    ],
  ].map(([id, name, label, goal, value]) =>
    fieldCase({
      id: `university-${id}`,
      site: "webdriver-university",
      split: "test",
      url: `${university}/Contact-Us/contactus.html`,
      target: `[name="${name}"]`,
      goal,
      role: "textbox",
      name: label,
      value,
    }),
  ),
];

export const researchCasesV2: ResearchCase[] = [
  ...researchCasesV1.filter((entry) => entry.split !== "test"),
  hubSubmit(
    "invalid-login",
    "#login-submit",
    "Submit invalid login credentials",
    "Invalid credentials. Try username: tester, password: password123",
    async (page) => {
      await page.locator("#login-username").fill("jolty");
      await page.locator("#login-password").fill("badpassword");
    },
  ),
  modalOpen(
    "simple-modal",
    "#simpleModal",
    "#pum-1318",
    "Open the simple modal",
  ),
  modalOpen(
    "form-modal",
    "#formModal",
    "#pum-674",
    "Open the contact form modal",
  ),
  ...freshTestFlowsV2,
];
