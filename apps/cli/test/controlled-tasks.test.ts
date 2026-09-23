import type { DecisionProvider } from "@jolty/core";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../packages/browser/fixtures/routes.ts";
import { runControlledTask } from "../../../packages/core/src/run-task.ts";
import { controlledTasks } from "../src/controlled-tasks.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const metrics = {
  decision_latency_ms: 0,
  model_call_ms: 0,
  tokenization_ms: 0,
  inference_ms: 0,
  input_tokens: 0,
};

function scriptedModel(
  targetNames: readonly (string | null)[],
): DecisionProvider {
  let step = 0;
  return {
    async decide({ candidates }) {
      const name = targetNames[step++];
      const target =
        name === null
          ? undefined
          : candidates.filter(({ element }) => element.name === name).at(-1);
      return {
        status: "selected",
        action: name === null ? "wait" : "click",
        targetId: target?.element.id,
        confidence: 1,
        metrics,
      };
    },
  };
}

test.each([
  ["cookie-overlay", ["Accept cookies", "Continue to checkout"]],
  ["dynamic-results", ["Load report", null, "Open report"]],
  ["ambiguous-row", ["Open"]],
] as const)("%s task checks its complete fixture flow", async (id, targets) => {
  const page = await browser.newPage();
  try {
    await installFixtureRoutes(page);
    await page.goto(fixtureUrl(id));
    const result = await runControlledTask(
      page,
      scriptedModel(targets),
      controlledTasks[id],
      { name: "scripted-test", version: "1" },
    );
    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(targets.length);
    expect(
      result.steps.every(({ final_outcome }) => final_outcome === "passed"),
    ).toBe(true);
  } finally {
    await page.close();
  }
});

test("ambiguous task rejects the draft row even though both actions share a name", async () => {
  const page = await browser.newPage();
  try {
    await installFixtureRoutes(page);
    await page.goto(fixtureUrl("ambiguous-row"));
    const model: DecisionProvider = {
      async decide({ candidates }) {
        return {
          status: "selected",
          action: "click",
          targetId: candidates.find(({ element }) => element.name === "Open")
            ?.element.id,
          confidence: 1,
          metrics,
        };
      },
    };
    const result = await runControlledTask(
      page,
      model,
      controlledTasks["ambiguous-row"],
      { name: "scripted-test", version: "1" },
    );
    expect(result.status).toBe("failed");
    expect(result.steps[0]?.final_outcome).toBe("validation_failed");
    expect(await page.getByText("Draft request opened").isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});
