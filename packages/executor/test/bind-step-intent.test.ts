import type { BrowserState, InteractiveElement } from "@jolty/browser";
import { describe, expect, it } from "vitest";
import { bindStepIntent, type StepIntent } from "../src/bind-step-intent.ts";

const element = (
  id: string,
  role: string,
  name: string,
): InteractiveElement => ({
  id,
  role,
  name,
  text: "",
  visible: true,
  enabled: true,
  editable: role === "textbox",
});

const state: BrowserState = {
  url: "https://example.test/form",
  title: "Form",
  elements: [
    element("e1", "textbox", "Email"),
    element("e2", "textbox", "Password"),
    element("e3", "combobox", "Language"),
  ],
};

const intent: StepIntent = {
  goal: "Complete the form",
  values: [
    {
      action: "type",
      target: { role: "textbox", name: "Email" },
      value: "person@example.test",
    },
    {
      action: "select",
      target: { role: "combobox", name: "Language" },
      value: "es",
    },
  ],
};

describe("step intent binding", () => {
  it("passes only the value planned for the selected action and target", () => {
    expect(
      bindStepIntent(state, { action: "type", targetId: "e1" }, intent),
    ).toEqual({
      status: "ready",
      command: {
        action: "type",
        targetId: "e1",
        value: "person@example.test",
      },
    });
    expect(
      bindStepIntent(state, { action: "select", targetId: "e3" }, intent),
    ).toEqual({
      status: "ready",
      command: { action: "select", targetId: "e3", value: "es" },
    });
    expect(
      bindStepIntent(state, { action: "click", targetId: "e1" }, intent),
    ).toEqual({
      status: "ready",
      command: { action: "click", targetId: "e1" },
    });
    expect(
      bindStepIntent(
        state,
        { action: "type", targetId: "e2" },
        {
          goal: "Clear password",
          values: [
            {
              action: "type",
              target: { role: "textbox", name: "Password" },
              value: "",
            },
          ],
        },
      ),
    ).toEqual({
      status: "ready",
      command: { action: "type", targetId: "e2", value: "" },
    });
  });

  it("never borrows a value from a different target or action", () => {
    expect(
      bindStepIntent(state, { action: "type", targetId: "e2" }, intent),
    ).toMatchObject({ status: "failed", reason: "missing_value" });
    expect(
      bindStepIntent(state, { action: "type", targetId: "e3" }, intent),
    ).toMatchObject({ status: "failed", reason: "missing_value" });
    expect(
      bindStepIntent(state, { action: "type", targetId: "e999" }, intent),
    ).toMatchObject({ status: "failed", reason: "missing_value" });
  });

  it("requires a unique target or an explicit observed ID for duplicate labels", () => {
    const duplicateState = {
      ...state,
      elements: [
        element("e1", "textbox", "Email"),
        element("e4", "textbox", "Email"),
      ],
    };
    expect(
      bindStepIntent(
        duplicateState,
        { action: "type", targetId: "e1" },
        intent,
      ),
    ).toMatchObject({ status: "failed", reason: "ambiguous_target" });
    const explicit: StepIntent = {
      goal: intent.goal,
      values: [
        {
          action: "type",
          target: { role: "textbox", name: "Email", id: "e4" },
          value: "second@example.test",
        },
      ],
    };
    expect(
      bindStepIntent(
        duplicateState,
        { action: "type", targetId: "e1" },
        explicit,
      ),
    ).toMatchObject({ status: "failed", reason: "missing_value" });
    expect(
      bindStepIntent(
        duplicateState,
        { action: "type", targetId: "e4" },
        explicit,
      ),
    ).toEqual({
      status: "ready",
      command: {
        action: "type",
        targetId: "e4",
        value: "second@example.test",
      },
    });
  });

  it("rejects conflicting values without exposing them in a failure", () => {
    const conflict: StepIntent = {
      goal: intent.goal,
      values: [intent.values[0], { ...intent.values[0], value: "other" }],
    };
    const result = bindStepIntent(
      state,
      { action: "type", targetId: "e1" },
      conflict,
    );
    expect(result).toMatchObject({
      status: "failed",
      reason: "ambiguous_value",
    });
    expect(JSON.stringify(result)).not.toContain("person@example.test");
    expect(JSON.stringify(result)).not.toContain("other");
  });
});
