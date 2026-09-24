import type { Page } from "playwright";
import {
  fieldCase,
  navigationCase,
  type ResearchCase,
  researchCases,
  selectCase,
} from "./research-cases.ts";

const hub = "https://qapracticehub.com";
const automation = "https://practice-automation.com";
const qa = "https://www.qa-practice.com";
const playground = "https://playground.go-bigger.de";

async function prepareHub(page: Page, section: "Buttons" | "Dynamic") {
  const consent = page.getByRole("button", { name: "Accept", exact: true });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("link", { name: section, exact: true }).first().click();
  await page.evaluate(() => history.replaceState(null, "", location.pathname));
}

function hubButton(
  id: string,
  target: string,
  goal: string,
  result: string,
): ResearchCase {
  return {
    id: `hub-${id}`,
    site: "qa-practice-hub",
    split: "train",
    url: `${hub}/`,
    target,
    goal,
    action: "click",
    prepare: (page) => prepareHub(page, "Buttons"),
    step: () => ({ goal, checks: [{ kind: "text_visible", text: result }] }),
    postcondition: async (page) =>
      (await page.locator("#button-output").textContent())?.trim() === result,
  };
}

function animalButton(animal: string, sound: string): ResearchCase {
  return {
    id: `automation-${animal.toLowerCase()}`,
    site: "practice-automation",
    split: "validation",
    url: `${automation}/click-events/`,
    target: `button.custom_btn:has-text("${animal}")`,
    goal: `Click ${animal} to show its sound`,
    action: "click",
    step: () => ({
      goal: `Click ${animal} to show its sound`,
      checks: [{ kind: "text_visible", text: sound }],
    }),
    postcondition: async (page) =>
      (await page.locator("#demo").textContent())?.trim() === sound,
  };
}

function selectionClick(
  id: string,
  target: string,
  name: string,
): ResearchCase {
  return {
    id: `automation-${id}`,
    site: "practice-automation",
    split: "validation",
    url: `${automation}/form-fields/`,
    target,
    goal: `Select ${name}`,
    action: "click",
    step: () => ({
      goal: `Select ${name}`,
      checks: [{ kind: "no_console_errors" }],
    }),
    postcondition: (page) => page.locator(target).isChecked(),
  };
}

function submitCase(
  id: string,
  url: string,
  goal: string,
  prepare: (page: Page) => Promise<void>,
  result: string,
): ResearchCase {
  return {
    id: `qa-${id}`,
    site: "qa-practice",
    split: "test",
    url,
    target: "#submit-id-submit",
    goal,
    action: "click",
    prepare,
    step: () => ({ goal, checks: [{ kind: "text_visible", text: result }] }),
    postcondition: async (page) =>
      (await page.locator("body").innerText()).includes(result),
  };
}

export const freshTestFlows: ResearchCase[] = [
  submitCase(
    "simple-button",
    `${qa}/elements/button/simple`,
    "Click the simple button",
    async () => {},
    "Submitted",
  ),
  submitCase(
    "checkbox-submit",
    `${qa}/elements/checkbox/single_checkbox`,
    "Submit the selected checkbox",
    (page) => page.locator("#id_checkbox_0").check(),
    "Selected checkboxes:",
  ),
  submitCase(
    "language-submit",
    `${qa}/elements/select/single_select`,
    "Submit the selected Python language",
    async (page) => {
      await page.locator("#id_choose_language").selectOption("1");
    },
    "You selected",
  ),
  selectCase({
    id: "qa-language-select",
    site: "qa-practice",
    split: "test",
    url: `${qa}/elements/select/single_select`,
    target: "#id_choose_language",
    goal: "Select Python as the language",
    name: "Choose language*",
    value: "1",
  }),
  fieldCase({
    id: "qa-text-input",
    site: "qa-practice",
    split: "test",
    url: `${qa}/elements/input/simple`,
    target: "#id_text_string",
    goal: "Enter a text string",
    role: "textbox",
    name: "Text string*",
    value: "Jolty",
  }),
  fieldCase({
    id: "qa-text-area",
    site: "qa-practice",
    split: "test",
    url: `${qa}/elements/textarea/single`,
    target: "#id_text_area",
    goal: "Enter text in the text area",
    role: "textbox",
    name: "Text area*",
    value: "Jolty text",
  }),
  navigationCase({
    id: "qa-open-checkbox",
    site: "qa-practice",
    split: "test",
    url: `${qa}/elements/button/simple`,
    target: 'a[href="/elements/checkbox"]',
    goal: "Open Checkbox examples",
    destination: `${qa}/elements/checkbox/single_checkbox`,
  }),
  navigationCase({
    id: "qa-open-select",
    site: "qa-practice",
    split: "test",
    url: `${qa}/elements/button/simple`,
    target: 'a[href="/elements/select"]',
    goal: "Open Select examples",
    destination: `${qa}/elements/select/single_select`,
  }),
  {
    id: "playground-physical-click",
    site: "ui-playground",
    split: "test",
    url: `${playground}/click`,
    target: "#badButton",
    goal: "Click the button that ignores DOM click events",
    action: "click",
    step: () => ({
      goal: "Click the button that ignores DOM click events",
      checks: [{ kind: "no_console_errors" }],
    }),
    postcondition: (page) => page.locator("#badButton.btn-success").isVisible(),
  },
  fieldCase({
    id: "playground-type-button-name",
    site: "ui-playground",
    split: "test",
    url: `${playground}/textinput`,
    target: "#newButtonName",
    goal: "Enter a new button name",
    role: "textbox",
    name: "Set New Button Name",
    value: "Jolty",
  }),
  {
    id: "playground-change-button-name",
    site: "ui-playground",
    split: "test",
    url: `${playground}/textinput`,
    target: "#updatingButton",
    goal: "Update the button name from the text field",
    action: "click",
    prepare: async (page) => {
      await page.locator("#newButtonName").fill("Jolty");
    },
    step: () => ({
      goal: "Update the button name from the text field",
      checks: [{ kind: "element_appeared", role: "button", name: "Jolty" }],
    }),
    postcondition: async (page) =>
      (await page.locator("#updatingButton").textContent())?.trim() === "Jolty",
  },
];

export const researchCasesV1: ResearchCase[] = [
  ...researchCases.filter((entry) => entry.split !== "test"),
  ...[
    [
      "primary",
      "#btn-primary",
      "Click the Primary Button",
      "Primary button clicked.",
    ],
    [
      "secondary",
      "#btn-secondary",
      "Click the Secondary Button",
      "Secondary button clicked.",
    ],
    ["left", "#btn-left-click", "Click Left Click Me", "Left click detected!"],
    [
      "outline",
      "#btn-outline",
      "Click the Outline Button",
      "Outline button clicked.",
    ],
    [
      "danger",
      "#btn-danger",
      "Click the Danger Button",
      "Danger button clicked.",
    ],
  ].map(([id, target, goal, result]) => hubButton(id, target, goal, result)),
  {
    id: "hub-counter",
    site: "qa-practice-hub",
    split: "train",
    url: `${hub}/`,
    target: "#btn-click-counter",
    goal: "Increment the click counter",
    action: "click",
    prepare: (page) => prepareHub(page, "Buttons"),
    step: () => ({
      goal: "Increment the click counter",
      checks: [
        { kind: "element_appeared", role: "button", name: "Click Me (1)" },
      ],
    }),
    postcondition: async (page) =>
      (await page.locator("#btn-click-counter").textContent())?.trim() ===
      "Click Me (1)",
  },
  {
    id: "hub-add-item",
    site: "qa-practice-hub",
    split: "train",
    url: `${hub}/`,
    target: "#btn-add-element",
    goal: "Add a new item",
    action: "click",
    prepare: (page) => prepareHub(page, "Dynamic"),
    step: () => ({
      goal: "Add a new item",
      checks: [{ kind: "text_visible", text: "Item 3" }],
    }),
    postcondition: (page) =>
      page.getByText("Item 3", { exact: true }).isVisible(),
  },
  ...[
    ["Cat", "Meow!"],
    ["Dog", "Woof!"],
    ["Pig", "Oink!"],
    ["Cow", "Moo!"],
  ].map(([animal, sound]) => animalButton(animal, sound)),
  ...[
    ["water", "#drink1", "Water"],
    ["milk", "#drink2", "Milk"],
    ["red", "#color1", "Red"],
    ["blue", "#color2", "Blue"],
  ].map(([id, target, name]) => selectionClick(id, target, name)),
  ...freshTestFlows,
];
