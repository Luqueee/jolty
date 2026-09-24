import { extractBrowserState } from "@jolty/browser";
import { chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { executeAction } from "../../../packages/executor/src/execute-action.ts";
import { filterCandidates } from "../../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../../packages/retrieval/src/candidate-retrieval.ts";
import { ValidationSession } from "../../../packages/validator/src/validate-action.ts";
import { targetId } from "../benchmarks/public-site-flows.ts";
import { safeText } from "../src/dataset.ts";
import { freshValidationFlowsV7 } from "../src/research/cases/research-cases-v7-validation.ts";

test("keeps validation cases distinct on two new HTTPS origins", () => {
  expect(freshValidationFlowsV7).toHaveLength(20);
  expect(new Set(freshValidationFlowsV7.map((entry) => entry.id)).size).toBe(
    freshValidationFlowsV7.length,
  );
  expect(
    new Set(freshValidationFlowsV7.map((entry) => new URL(entry.url).origin)),
  ).toEqual(new Set(["https://www.qapractice.com", "https://apptesting.pl"]));
  for (const entry of freshValidationFlowsV7) {
    const url = new URL(entry.url);
    expect(entry.split).toBe("validation");
    expect(url.protocol).toBe("https:");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(entry.postcondition !== undefined || entry.action !== "click").toBe(
      true,
    );
  }
});

const live = process.env.JOLTY_LIVE_RESEARCH_TESTS === "1";
let browser: Awaited<ReturnType<typeof chromium.launch>>;

beforeAll(async () => {
  if (live) browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

test.skipIf(!live).each(freshValidationFlowsV7)(
  "$id executes and validates on the public site",
  async (entry) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const response = await page.goto(entry.url, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      expect(response?.status()).toBe(200);
      await entry.prepare?.(page);
      expect(new URL(page.url()).origin).toBe(new URL(entry.url).origin);
      const state = (await extractBrowserState(page)).state;
      safeText(state.title);
      for (const element of state.elements) {
        safeText(element.name);
        safeText(element.text);
      }
      const expectedId = await targetId(page, entry.target, state);
      const retrieved = retrieveCandidates(
        entry.goal,
        filterCandidates(state).candidates,
      );
      expect(
        retrieved.topCandidates.some(
          ({ element }) => element.id === expectedId,
        ),
      ).toBe(true);
      const step = entry.step(expectedId);
      const value = step.values?.find(
        (item) => item.action === entry.action,
      )?.value;
      const session = await ValidationSession.start(page, state, step.checks);
      try {
        const result = await executeAction(page, state, {
          action: entry.action,
          targetId: expectedId,
          value,
        });
        expect(result.status).toBe("executed");
        expect((await session.validate(result)).status).toBe("passed");
        if (entry.postcondition)
          expect(await entry.postcondition(page)).toBe(true);
      } finally {
        session.close();
      }
    } finally {
      await context.close();
    }
  },
  30_000,
);
