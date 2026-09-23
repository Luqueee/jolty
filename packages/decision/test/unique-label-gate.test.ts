import type { BrowserState, InteractiveElement } from "@jolty/browser";
import { retrieveCandidates } from "@jolty/retrieval";
import { describe, expect, it } from "vitest";
import { uniqueLabelDecision } from "../src/unique-label-gate.ts";

const element = (
  id: string,
  name: string,
  editable = false,
): InteractiveElement => ({
  id,
  role: editable ? "textbox" : "link",
  name,
  text: editable ? "" : name,
  visible: true,
  enabled: true,
  editable,
});

function input(goal: string, elements: InteractiveElement[]) {
  const state: BrowserState = {
    url: "https://example.test/",
    title: "Test",
    elements,
  };
  return {
    goal,
    state,
    candidates: retrieveCandidates(goal, elements).topCandidates,
  };
}

describe("unique label gate", () => {
  it("chooses a unique editable phrase match", () => {
    expect(
      uniqueLabelDecision(
        input("Change the prefix", [
          element("prefix", "Prefix", true),
          element("music", "Music"),
        ]),
      ),
    ).toEqual({ action: "type", targetId: "prefix" });
  });

  it("defers on duplicate labels, weak margins, and unrelated names", () => {
    expect(
      uniqueLabelDecision(
        input("Open server staff", [
          element("staff", "Staff"),
          element("music", "Music"),
        ]),
      ),
    ).toBeNull();
    expect(
      uniqueLabelDecision(
        input("Change staff", [
          element("a", "Staff", true),
          element("b", "Staff", true),
        ]),
      ),
    ).toBeNull();
    expect(
      uniqueLabelDecision(
        input("Change staff page", [
          element("a", "Staff", true),
          element("b", "Staff page", true),
        ]),
      ),
    ).toBeNull();
    expect(
      uniqueLabelDecision(
        input("Change language choices", [element("a", "Spanish", true)]),
      ),
    ).toBeNull();
  });
});
