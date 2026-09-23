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
};
