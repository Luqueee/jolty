import type { ControlledTask } from "@jolty/core";
import type { Page } from "playwright";
import { targetId } from "../../../benchmarks/public-site-flows.ts";

export interface ResearchMultistepFlow {
  id: string;
  site: string;
  url: string;
  labels: readonly {
    goal: string;
    action: "click" | "type";
    target: string;
  }[];
  prepare?(page: Page): Promise<void>;
  buildTask(page: Page): Promise<ControlledTask>;
  postcondition(page: Page): Promise<boolean>;
}

export const researchMultistepFlowsV6: ResearchMultistepFlow[] = [
  {
    id: "campus-tabs-and-keyboard",
    site: "stepcampus",
    url: "https://www.stepcampus.in/playground",
    prepare: (page) => page.waitForLoadState("networkidle", { timeout: 5_000 }),
    labels: [
      {
        goal: "Open the Password tab",
        action: "click",
        target: '[role="tab"]:text-is("Password")',
      },
      {
        goal: "Open the Account tab",
        action: "click",
        target: '[role="tab"]:text-is("Account")',
      },
      {
        goal: "Enter text in Keyboard Actions",
        action: "type",
        target: "#keyboard-input",
      },
    ],
    async buildTask(page) {
      const keyboardId = await targetId(page, "#keyboard-input");
      return {
        id: "campus-tabs-and-keyboard",
        steps: [
          {
            goal: "Open the Password tab",
            checks: [
              { kind: "text_visible", text: "This is the password tab." },
            ],
          },
          {
            goal: "Open the Account tab",
            checks: [
              { kind: "text_visible", text: "This is the account tab." },
            ],
          },
          {
            goal: "Enter text in Keyboard Actions",
            values: [
              {
                action: "type",
                target: { role: "textbox", name: "Keyboard Actions" },
                value: "Jolty flow",
              },
            ],
            checks: [
              {
                kind: "input_value_changed",
                targetId: keyboardId,
                expectedValue: "Jolty flow",
              },
            ],
          },
        ],
      };
    },
    async postcondition(page) {
      return (
        (await page
          .getByRole("tab", { name: "Account" })
          .getAttribute("aria-selected")) === "true" &&
        (await page.locator("#keyboard-input").inputValue()) === "Jolty flow"
      );
    },
  },
  {
    id: "sreenidhi-submit-basic-form",
    site: "sreenidhi-practice",
    url: "https://www.sreenidhirajakrishnan.com/practice",
    prepare: (page) => page.waitForLoadState("networkidle", { timeout: 5_000 }),
    labels: [
      { goal: "Enter your name", action: "type", target: "#text-input" },
      { goal: "Enter your email", action: "type", target: "#email-input" },
      { goal: "Submit the form", action: "click", target: "#form-submit" },
    ],
    async buildTask(page) {
      const nameId = await targetId(page, "#text-input");
      const emailId = await targetId(page, "#email-input");
      return {
        id: "sreenidhi-submit-basic-form",
        steps: [
          {
            goal: "Enter your name",
            values: [
              {
                action: "type",
                target: { role: "textbox", name: "Text input" },
                value: "Jolty",
              },
            ],
            checks: [
              {
                kind: "input_value_changed",
                targetId: nameId,
                expectedValue: "Jolty",
              },
            ],
          },
          {
            goal: "Enter your email",
            values: [
              {
                action: "type",
                target: { role: "textbox", name: "Email input" },
                value: "jolty@example.test",
              },
            ],
            checks: [
              {
                kind: "input_value_changed",
                targetId: emailId,
                expectedValue: "jolty@example.test",
              },
            ],
          },
          {
            goal: "Submit the form",
            checks: [
              { kind: "text_visible", text: "Form submitted successfully" },
            ],
          },
        ],
      };
    },
    postcondition: (page) =>
      page
        .getByText("Form submitted successfully", { exact: true })
        .isVisible(),
  },
];
