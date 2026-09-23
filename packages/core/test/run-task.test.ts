import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
import {
  type ControlledTask,
  type DecisionProvider,
  formatTaskResult,
  runControlledTask,
} from "../src/run-task.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const modalTask: ControlledTask = {
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
        { kind: "element_disappeared", role: "dialog", name: "Confirmation" },
        { kind: "text_visible", text: "Confirmed" },
      ],
    },
  ],
};

const metrics = {
  decision_latency_ms: 1,
  model_call_ms: 0.8,
  tokenization_ms: 0.1,
  inference_ms: 0.7,
  input_tokens: 10,
};

const choosingModel: DecisionProvider = {
  async decide({ goal, candidates }) {
    const name = goal.includes("Open") ? "Open dialog" : "Confirm";
    const targetId = candidates.find(({ element }) => element.name === name)
      ?.element.id;
    return {
      status: "selected",
      action: "click",
      targetId,
      confidence: 0.8,
      selected_probability: 0.9,
      probabilities: {},
      considered: [],
      metrics,
    };
  },
};

async function modalPage() {
  const page = await browser.newPage();
  await installFixtureRoutes(page);
  await page.goto(fixtureUrl("modal"));
  return page;
}

test("runs two fast-path steps, validates completion, and records timings", async () => {
  const page = await modalPage();
  try {
    const result = await runControlledTask(
      page,
      choosingModel,
      modalTask,
      { name: "test-model", version: "1" },
      "run-modal",
    );
    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(2);
    expect(result.steps.map(({ final_outcome }) => final_outcome)).toEqual([
      "passed",
      "passed",
    ]);
    expect(result.steps[0]).toMatchObject({
      run_id: "run-modal",
      step_id: "1",
      model: { name: "test-model", version: "1" },
      decision: { action: "click", confidence: 0.8 },
      timing: {
        state_extraction_ms: expect.any(Number),
        candidate_filter_ms: expect.any(Number),
        candidate_retrieval_ms: expect.any(Number),
        tokenization_ms: 0.1,
        inference_ms: 0.7,
        action_ms: expect.any(Number),
        validation_ms: expect.any(Number),
      },
    });
    expect(formatTaskResult(result)).toContain("Task completed.");
    expect(await page.getByText("Confirmed").isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});

test("stops after a wrong decision with a validation failure trace", async () => {
  const page = await modalPage();
  try {
    const result = await runControlledTask(
      page,
      {
        async decide() {
          return {
            status: "selected",
            action: "done",
            confidence: 0.7,
            selected_probability: 0.7,
            probabilities: {},
            considered: [],
            metrics,
          };
        },
      },
      modalTask,
      { name: "test-model", version: "1" },
    );
    expect(result.status).toBe("failed");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      decision: { action: "done" },
      validation: { status: "validation_failed" },
      final_outcome: "validation_failed",
    });
    expect(formatTaskResult(result)).toContain(
      "Task failed: validation_failed.",
    );
  } finally {
    await page.close();
  }
});

test("stops after a model failure without executing an action", async () => {
  const page = await modalPage();
  try {
    const result = await runControlledTask(
      page,
      {
        async decide() {
          return {
            status: "failed",
            reason: "model_error",
            message: "secret error",
            considered: [],
            metrics,
          };
        },
      },
      modalTask,
      { name: "test-model", version: "1" },
    );
    expect(result.status).toBe("failed");
    expect(result.steps[0]).toMatchObject({
      execution: { status: "skipped" },
      final_outcome: "decision_failed",
    });
    expect(JSON.stringify(result)).not.toContain("secret error");
  } finally {
    await page.close();
  }
});

test("binds a planned form value without sending it to the model or trace", async () => {
  const page = await browser.newPage();
  try {
    await installFixtureRoutes(page);
    await page.goto(fixtureUrl("settings"));
    const seenGoals: string[] = [];
    const model: DecisionProvider = {
      async decide({ goal, candidates }) {
        seenGoals.push(goal);
        const target = candidates.find(
          ({ element }) =>
            element.name ===
            (goal === "Change display name" ? "Display name" : "Save profile"),
        );
        return {
          status: "selected",
          action: goal === "Change display name" ? "type" : "click",
          targetId: target?.element.id,
          confidence: 0.8,
          selected_probability: 0.9,
          probabilities: {},
          considered: [],
          metrics,
        };
      },
    };
    const result = await runControlledTask(
      page,
      model,
      {
        id: "settings",
        steps: [
          {
            goal: "Change display name",
            values: [
              {
                action: "type",
                target: { role: "textbox", name: "Display name" },
                value: "New private name",
              },
            ],
            checks: [{ kind: "input_value_changed", targetId: "e1" }],
          },
          {
            goal: "Save profile",
            checks: [
              { kind: "text_visible", text: "Updated: New private name" },
            ],
          },
        ],
      },
      { name: "test-model", version: "1" },
    );
    expect(result.status).toBe("completed");
    expect(seenGoals).toEqual(["Change display name", "Save profile"]);
    expect(JSON.stringify(result)).not.toContain("New private name");
  } finally {
    await page.close();
  }
});

test("stops with a trace when a selected input lacks a planned value", async () => {
  const page = await browser.newPage();
  try {
    await installFixtureRoutes(page);
    await page.goto(fixtureUrl("settings"));
    const result = await runControlledTask(
      page,
      {
        async decide({ candidates }) {
          return {
            status: "selected",
            action: "type",
            targetId: candidates.find(
              ({ element }) => element.name === "Display name",
            )?.element.id,
            confidence: 0.8,
            selected_probability: 0.9,
            probabilities: {},
            considered: [],
            metrics,
          };
        },
      },
      {
        id: "settings",
        steps: [
          {
            goal: "Change display name",
            checks: [{ kind: "input_value_changed", targetId: "e1" }],
          },
        ],
      },
      { name: "test-model", version: "1" },
    );
    expect(result).toMatchObject({
      status: "failed",
      steps: [
        {
          decision: { action: "type" },
          execution: { status: "failed", reason: "missing_value" },
          validation: { status: "action_failed" },
          final_outcome: "action_failed",
        },
      ],
    });
    expect(
      await page.getByRole("textbox", { name: "Display name" }).inputValue(),
    ).toBe("Original name");
  } finally {
    await page.close();
  }
});
