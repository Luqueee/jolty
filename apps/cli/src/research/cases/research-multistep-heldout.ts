import { targetId } from "../../../benchmarks/public-site-flows.ts";
import type { ResearchMultistepFlow } from "./research-multistep-flow.ts";

export const researchMultistepHeldout: ResearchMultistepFlow[] = [
  {
    id: "tv-search-and-cart",
    site: "testautomationtv",
    url: "https://demo.testautomationtv.com/products",
    labels: [
      {
        goal: "Enter Wireless Keyboard in the product search",
        action: "type",
        target: "#product-search",
      },
      {
        goal: "Search for Wireless Keyboard products",
        action: "click",
        target: "#search-btn",
      },
      {
        goal: "Add Wireless Keyboard to the cart",
        action: "click",
        target: '[data-testid="add-to-cart"][data-product-id="1"]',
      },
    ],
    async buildTask(page) {
      const searchId = await targetId(page, "#product-search");
      return {
        id: "tv-search-and-cart",
        steps: [
          {
            goal: "Enter Wireless Keyboard in the product search",
            values: [
              {
                action: "type",
                target: { role: "textbox", name: "Search products by name" },
                value: "Wireless Keyboard",
              },
            ],
            checks: [
              {
                kind: "input_value_changed",
                targetId: searchId,
                expectedValue: "Wireless Keyboard",
              },
            ],
          },
          {
            goal: "Search for Wireless Keyboard products",
            checks: [{ kind: "text_visible", text: "1 of 6 products found" }],
          },
          {
            goal: "Add Wireless Keyboard to the cart",
            checks: [{ kind: "text_visible", text: "Cart: 1" }],
          },
        ],
      };
    },
    postcondition: async (page) =>
      (await page.locator("#cart-count").innerText()) === "1" &&
      (await page.locator("#product-search").inputValue()) ===
        "Wireless Keyboard",
  },
  {
    id: "stm-fill-and-reset",
    site: "softwaretestingmentor",
    url: "https://practice.softwaretestingmentor.com/form-validation",
    labels: [
      {
        goal: "Enter Jolty in the First Name field",
        action: "type",
        target: "#v-firstname",
      },
      {
        goal: "Enter Tester in the Last Name field",
        action: "type",
        target: "#v-lastname",
      },
      { goal: "Select High priority", action: "select", target: "#v-priority" },
      {
        goal: "Reset the contact form",
        action: "click",
        target: "#form-reset-btn",
      },
    ],
    async buildTask(page) {
      const firstId = await targetId(page, "#v-firstname");
      const lastId = await targetId(page, "#v-lastname");
      const priorityId = await targetId(page, "#v-priority");
      return {
        id: "stm-fill-and-reset",
        steps: [
          {
            goal: "Enter Jolty in the First Name field",
            values: [
              {
                action: "type",
                target: { role: "textbox", name: "First Name *" },
                value: "Jolty",
              },
            ],
            checks: [
              {
                kind: "input_value_changed",
                targetId: firstId,
                expectedValue: "Jolty",
              },
            ],
          },
          {
            goal: "Enter Tester in the Last Name field",
            values: [
              {
                action: "type",
                target: { role: "textbox", name: "Last Name *" },
                value: "Tester",
              },
            ],
            checks: [
              {
                kind: "input_value_changed",
                targetId: lastId,
                expectedValue: "Tester",
              },
            ],
          },
          {
            goal: "Select High priority",
            values: [
              {
                action: "select",
                target: { role: "combobox", name: "Priority" },
                value: "high",
              },
            ],
            checks: [
              {
                kind: "input_value_changed",
                targetId: priorityId,
                expectedValue: "high",
              },
            ],
          },
          {
            goal: "Reset the contact form",
            checks: [
              {
                kind: "input_value_changed",
                targetId: firstId,
                expectedValue: "",
              },
            ],
          },
        ],
      };
    },
    postcondition: async (page) =>
      (await page.locator("#v-firstname").inputValue()) === "" &&
      (await page.locator("#v-lastname").inputValue()) === "" &&
      (await page.locator("#v-priority").inputValue()) === "medium",
  },
];
