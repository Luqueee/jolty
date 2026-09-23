import { extractBrowserState, INTERACTIVE_SELECTOR } from "@jolty/browser";
import type { ControlledTask } from "@jolty/core";
import type { Page } from "playwright";

const internet = "https://the-internet.herokuapp.com";
const todo = "https://todomvc.com/examples/react/dist/";
const sauce = "https://www.saucedemo.com";

export interface Flow {
  id: string;
  site: string;
  url: string;
  goal: string;
  action: "click" | "select" | "type";
  target: string;
  prepare?: (page: Page) => Promise<void>;
  step: (targetId: string) => ControlledTask["steps"][number];
}

export const flows: Flow[] = [
  {
    id: "internet-add-element",
    site: "the-internet",
    url: `${internet}/add_remove_elements/`,
    goal: "Add an element",
    action: "click",
    target: "button:has-text('Add Element')",
    step: () => ({
      goal: "Add an element",
      checks: [{ kind: "element_appeared", role: "button", name: "Delete" }],
    }),
  },
  {
    id: "internet-select-option",
    site: "the-internet",
    url: `${internet}/dropdown`,
    goal: "Select Option 2",
    action: "select",
    target: "select#dropdown",
    step: (targetId) => ({
      goal: "Select Option 2",
      checks: [
        {
          kind: "input_value_changed",
          targetId,
          expectedValue: "2",
        },
      ],
      values: [
        {
          action: "select",
          target: {
            role: "combobox",
            name: "Please select an option Option 1 Option 2",
          },
          value: "2",
        },
      ],
    }),
  },
  {
    id: "todo-completed-filter",
    site: "todomvc-react",
    url: todo,
    goal: "Show completed tasks",
    action: "click",
    target: 'a[href="#/completed"]',
    prepare: prepareTodos,
    step: () => ({
      goal: "Show completed tasks",
      checks: [{ kind: "url_changed", to: `${todo}#/completed` }],
    }),
  },
  {
    id: "todo-active-filter",
    site: "todomvc-react",
    url: todo,
    goal: "Show active tasks",
    action: "click",
    target: 'a[href="#/active"]',
    prepare: prepareTodos,
    step: () => ({
      goal: "Show active tasks",
      checks: [{ kind: "url_changed", to: `${todo}#/active` }],
    }),
  },
  {
    id: "sauce-username",
    site: "saucedemo",
    url: sauce,
    goal: "Enter the username",
    action: "type",
    target: "#user-name",
    step: (targetId) => ({
      goal: "Enter the username",
      checks: [
        {
          kind: "input_value_changed",
          targetId,
          expectedValue: "standard_user",
        },
      ],
      values: [
        {
          action: "type",
          target: { role: "textbox", name: "Username" },
          value: "standard_user",
        },
      ],
    }),
  },
  {
    id: "sauce-backpack-details",
    site: "saucedemo",
    url: sauce,
    goal: "Open Sauce Labs Backpack details",
    action: "click",
    target: "#item_4_title_link",
    prepare: prepareSauce,
    step: () => ({
      goal: "Open Sauce Labs Backpack details",
      checks: [
        { kind: "url_changed", to: `${sauce}/inventory-item.html?id=4` },
      ],
    }),
  },
  {
    id: "sauce-open-cart",
    site: "saucedemo",
    url: sauce,
    goal: "Open the shopping cart",
    action: "click",
    target: "a.shopping_cart_link",
    prepare: prepareSauce,
    step: () => ({
      goal: "Open the shopping cart",
      checks: [{ kind: "url_changed", to: `${sauce}/cart.html` }],
    }),
  },
];

async function prepareTodos(page: Page): Promise<void> {
  for (const title of ["Review docs", "Write tests"]) {
    await page.locator(".new-todo").fill(title);
    await page.locator(".new-todo").press("Enter");
  }
  await page.locator(".todo-list li").first().locator("input.toggle").check();
  if ((await page.locator(".todo-list li").count()) !== 2)
    throw new Error("TodoMVC setup did not create two tasks");
}

async function prepareSauce(page: Page): Promise<void> {
  await page.locator("#user-name").fill("standard_user");
  await page.locator("#password").fill("secret_sauce");
  await page.locator("#login-button").click();
  await page.locator(".inventory_item").first().waitFor();
}

export async function targetId(page: Page, selector: string): Promise<string> {
  const state = (await extractBrowserState(page)).state;
  const target = page.locator(selector);
  if ((await target.count()) !== 1)
    throw new Error(`Expected one target for ${selector}`);
  const domIndex = await target.evaluate(
    (element, interactiveSelector) =>
      Array.from(document.querySelectorAll(interactiveSelector)).indexOf(
        element,
      ),
    INTERACTIVE_SELECTOR,
  );
  const id = state.elements.find(
    (element) => element.domIndex === domIndex,
  )?.id;
  if (!id) throw new Error(`Target missing from browser state: ${selector}`);
  return id;
}
