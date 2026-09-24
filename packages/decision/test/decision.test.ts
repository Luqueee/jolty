import type { BrowserState, InteractiveElement } from "@jolty/browser";
import type { RankedCandidate } from "@jolty/retrieval";
import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  actionFor,
  buildModelQuestion,
  selectedOption,
} from "../src/decision.ts";

const element = (
  id: string,
  role: string,
  editable = false,
): InteractiveElement => ({
  id,
  role,
  name: id,
  text: "",
  visible: true,
  enabled: true,
  editable,
});
const ranked = (value: InteractiveElement): RankedCandidate => ({
  element: value,
  score: 0,
  sourceIndex: 0,
  signals: {
    exactMatch: 0,
    normalizedMatch: 0,
    labelMatch: 0,
    textMatch: 0,
    keywordOverlap: 0,
    roleCompatibility: 0,
    elementState: 0,
  },
});
const state: BrowserState = {
  url: "https://example.test/",
  title: "Test",
  elements: [],
};

describe("decision question", () => {
  it("maps candidates to constrained actions and retains candidate IDs", () => {
    const question = buildModelQuestion({
      goal: "Choose a language",
      state,
      candidates: [
        ranked(element("e1", "textbox", true)),
        ranked({ ...element("e2", "combobox"), value: "Spanish" }),
        ranked(element("e3", "button")),
      ],
    });
    expect(
      question.options.map(({ action, targetId }) => [action, targetId]),
    ).toEqual([
      ["type", "e1"],
      ["select", "e2"],
      ["click", "e3"],
      ["scroll", undefined],
      ["wait", undefined],
      ["back", undefined],
      ["done", undefined],
    ]);
    expect(new Set(question.options.map(({ action }) => action))).toEqual(
      new Set(ACTIONS),
    );
    expect(selectedOption(question.options, "c2").targetId).toBe("e2");
  });

  it("clicks custom list controls and selects only native selects", () => {
    expect(actionFor(element("e1", "combobox"))).toBe("click");
    expect(actionFor(element("e2", "listbox"))).toBe("click");
    expect(actionFor({ ...element("e5", "listbox"), value: "Orange" })).toBe(
      "select",
    );
    expect(actionFor(element("e3", "option"))).toBe("click");
    expect(actionFor({ ...element("e4", "combobox"), value: "" })).toBe(
      "select",
    );
  });

  it("can omit unavailable target-free actions", () => {
    const question = buildModelQuestion(
      {
        goal: "Open settings",
        state,
        candidates: [ranked(element("e1", "link"))],
      },
      { targetFreeActions: ["scroll", "wait", "done"] },
    );
    expect(question.options.map(({ action }) => action)).toEqual([
      "click",
      "scroll",
      "wait",
      "done",
    ]);
  });

  it("keeps candidate keys and targets stable across presentation variants", () => {
    const input = {
      goal: "Open settings",
      state,
      candidates: [
        ranked(element("e1", "link")),
        ranked(element("e2", "button")),
      ],
    };
    const compact = buildModelQuestion(input, {
      descriptionStyle: "compact",
      candidateOrder: "reversed",
    });
    expect(compact.options.slice(0, 2)).toMatchObject([
      { key: "c2", targetId: "e2", description: "click button: e2" },
      { key: "c1", targetId: "e1", description: "click link: e1" },
    ]);
    expect(selectedOption(compact.options, "c1").targetId).toBe("e1");
  });

  it("rejects duplicate IDs and unknown model output", () => {
    expect(() =>
      buildModelQuestion({
        goal: "Open",
        state,
        candidates: [
          ranked(element("e1", "button")),
          ranked(element("e1", "link")),
        ],
      }),
    ).toThrow(/Duplicate/);
    expect(() => selectedOption([], "unknown")).toThrow(/unknown option/);
  });
});
