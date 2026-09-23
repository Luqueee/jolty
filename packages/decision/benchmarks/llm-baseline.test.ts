import type { BrowserState } from "@jolty/browser";
import type { RankedCandidate } from "@jolty/retrieval";
import { describe, expect, it, vi } from "vitest";
import type { ModelQuestion } from "../src/decision.ts";
import {
  evaluateLargeModelDecision,
  type LargeModelAdapter,
} from "../src/large-model-decision.ts";

const state: BrowserState = {
  url: "https://example.test/form?token=secret#private",
  title: "Form",
  elements: [],
};
const candidate: RankedCandidate = {
  element: {
    id: "e1",
    role: "button",
    name: "Save",
    text: "Save",
    visible: true,
    enabled: true,
    editable: false,
  },
  score: 10,
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
};
const input = { goal: "Save changes", state, candidates: [candidate] };

describe("large-model decision baseline", () => {
  it("sends compact choices and accounts for reported tokens and supplied prices", async () => {
    const choose = vi.fn(async (_question: ModelQuestion) => ({
      choice: "c1",
      usage: { input_tokens: 100, output_tokens: 20 },
    }));
    const adapter: LargeModelAdapter = {
      provider: "mock",
      model: "test-model",
      choose,
    };
    const result = await evaluateLargeModelDecision(input, adapter, {
      input_usd_per_million: 1,
      output_usd_per_million: 2,
    });
    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;
    expect([result.action, result.targetId]).toEqual(["click", "e1"]);
    expect(result.metrics).toMatchObject({
      model_calls: 1,
      input_tokens: 100,
      output_tokens: 20,
      estimated_cost_usd: 0.00014,
    });
    expect(choose.mock.calls[0]?.[0]).toMatchObject({
      state: { goal: "Save changes", url: "https://example.test/form" },
    });
    expect(JSON.stringify(choose.mock.calls[0]?.[0])).not.toContain("secret");
    expect(JSON.stringify(choose.mock.calls[0]?.[0])).not.toContain("elements");
  });

  it("rejects unknown choices and malformed usage without action execution", async () => {
    const result = await evaluateLargeModelDecision(input, {
      provider: "mock",
      model: "test-model",
      choose: async () => ({
        choice: "not-an-option",
        usage: { input_tokens: -1, output_tokens: 2 },
      }),
    });
    expect(result).toMatchObject({
      status: "failed",
      reason: "invalid_output",
      metrics: {
        model_calls: 1,
        input_tokens: null,
        estimated_cost_usd: null,
      },
    });
  });

  it("reports provider failures without logging provider error text", async () => {
    const result = await evaluateLargeModelDecision(input, {
      provider: "mock",
      model: "test-model",
      choose: async () => {
        throw new Error("sensitive provider error");
      },
    });
    expect(result).toMatchObject({
      status: "failed",
      reason: "provider_error",
      metrics: { model_calls: 1, estimated_cost_usd: null },
    });
    expect(JSON.stringify(result)).not.toContain("sensitive provider error");
  });

  it("does not estimate cost without prices and validates prices before a call", async () => {
    const choose = vi.fn(async (_question: ModelQuestion) => ({
      choice: "done",
      usage: { input_tokens: 10, output_tokens: 1 },
    }));
    const adapter = { provider: "mock", model: "test-model", choose };
    const result = await evaluateLargeModelDecision(input, adapter);
    expect(result.metrics.estimated_cost_usd).toBeNull();
    await expect(
      evaluateLargeModelDecision(input, adapter, {
        input_usd_per_million: -1,
        output_usd_per_million: 1,
      }),
    ).rejects.toThrow(/prices/);
    expect(choose).toHaveBeenCalledTimes(1);
  });
});
