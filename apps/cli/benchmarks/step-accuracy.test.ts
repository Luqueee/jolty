import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../packages/browser/fixtures/routes.ts";
import { scenarios } from "../../../packages/browser/fixtures/scenarios.ts";
import { extractBrowserState } from "../../../packages/browser/src/index.ts";
import { expectedTargetId, matchesDecisionLabel } from "./step-accuracy.ts";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test("resolves the approved row instead of the duplicate draft button", async () => {
  const page = await browser.newPage();
  try {
    await installFixtureRoutes(page);
    await page.goto(fixtureUrl("ambiguous-row"));
    const state = (await extractBrowserState(page)).state;
    const label = scenarios.find(({ id }) => id === "ambiguous-row")
      ?.decisionLabels?.[0];
    if (!label) throw new Error("Missing label");
    const targetId = await expectedTargetId(page, state, label);
    expect(targetId).toBeDefined();
    expect(
      matchesDecisionLabel(
        {
          status: "selected",
          action: "click",
          targetId: targetId ?? undefined,
        },
        label,
        targetId,
      ),
    ).toBe(true);
    const otherId = state.elements.find(
      ({ name, id }) => name === "Open" && id !== targetId,
    )?.id;
    expect(
      matchesDecisionLabel(
        { status: "selected", action: "click", targetId: otherId },
        label,
        targetId,
      ),
    ).toBe(false);
  } finally {
    await page.close();
  }
});

test("scores target-free wait by action and rejects failed decisions", async () => {
  const page = await browser.newPage();
  try {
    await installFixtureRoutes(page);
    await page.goto(fixtureUrl("dynamic-results"));
    const state = (await extractBrowserState(page)).state;
    const label = scenarios.find(({ id }) => id === "dynamic-results")
      ?.decisionLabels?.[1];
    if (!label) throw new Error("Missing label");
    expect(await expectedTargetId(page, state, label)).toBeNull();
    expect(
      matchesDecisionLabel({ status: "selected", action: "wait" }, label, null),
    ).toBe(true);
    expect(
      matchesDecisionLabel(
        { status: "selected", action: "click" },
        label,
        null,
      ),
    ).toBe(false);
    expect(matchesDecisionLabel({ status: "failed" }, label, null)).toBe(false);
  } finally {
    await page.close();
  }
});
