import type { ControlledTask } from "@jolty/core";

export const controlledTasks: Record<string, ControlledTask> = {
  modal: {
    id: "modal",
    steps: [
      {
        goal: "Open confirmation dialog",
        checks: [
          { kind: "element_appeared", role: "dialog", name: "Confirmation" },
        ],
      },
      {
        goal: "Confirm action",
        checks: [
          {
            kind: "element_disappeared",
            role: "dialog",
            name: "Confirmation",
          },
          { kind: "text_visible", text: "Confirmed" },
        ],
      },
    ],
  },
  settings: {
    id: "settings",
    steps: [
      {
        goal: "Change display name",
        values: [
          {
            action: "type",
            target: { role: "textbox", name: "Display name" },
            value: "New name",
          },
        ],
        checks: [
          {
            kind: "input_value_changed",
            targetId: "e1",
            expectedValue: "New name",
          },
        ],
      },
      {
        goal: "Save profile",
        checks: [{ kind: "text_visible", text: "Updated: New name" }],
      },
    ],
  },
  "cookie-overlay": {
    id: "cookie-overlay",
    steps: [
      {
        goal: "Dismiss the cookie notice before checkout",
        checks: [
          {
            kind: "element_disappeared",
            role: "dialog",
            name: "Cookie notice",
          },
        ],
      },
      {
        goal: "Continue to checkout",
        checks: [{ kind: "text_visible", text: "Checkout ready" }],
      },
    ],
  },
  "dynamic-results": {
    id: "dynamic-results",
    steps: [
      {
        goal: "Load the report",
        checks: [{ kind: "text_visible", text: "Loading report" }],
      },
      {
        goal: "Wait for the report to become available",
        checks: [{ kind: "text_visible", text: "Report ready" }],
      },
      {
        goal: "Open the report",
        checks: [{ kind: "text_visible", text: "Report opened" }],
      },
    ],
  },
  "ambiguous-row": {
    id: "ambiguous-row",
    steps: [
      {
        goal: "Open the approved request",
        checks: [{ kind: "text_visible", text: "Approved request opened" }],
      },
    ],
  },
};
