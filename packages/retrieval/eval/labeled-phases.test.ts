import { extractBrowserState } from "@jolty/browser";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
import { scenarios } from "../../browser/fixtures/scenarios.ts";
import { filterCandidates } from "../src/candidate-filter.ts";
import { retrieveCandidates } from "../src/candidate-retrieval.ts";
import {
  laterPhaseCases,
  modalProbeCase,
  prepareEvaluationCase,
  prepareModalProbeCase,
  prepareTargetlessDecisionCase,
  targetDomIndexFor,
  targetIdFor,
  targetlessDecisionCases,
} from "./cases.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

test("modal probe prepares a uniquely targeted Confirm action", async () => {
  const page = await browser.newPage();
  try {
    await installFixtureRoutes(page);
    await page.goto(fixtureUrl(modalProbeCase.fixture));
    await prepareModalProbeCase(page);
    const candidates = filterCandidates(
      (await extractBrowserState(page)).state,
    ).candidates;
    const targetId = targetIdFor(candidates, modalProbeCase);
    expect(targetId).toBeDefined();
    expect(
      retrieveCandidates(modalProbeCase.goal, candidates).topCandidates[0]
        ?.element.id,
    ).toBe(targetId);
  } finally {
    await page.close();
  }
});

test("target-free wait and done cases prepare labeled browser states", async () => {
  for (const testCase of targetlessDecisionCases) {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(testCase.fixture));
      await prepareTargetlessDecisionCase(page, testCase);
      const state = (await extractBrowserState(page)).state;
      expect(state.url, `${testCase.fixture}/${testCase.phase}`).toContain(
        testCase.fixture,
      );
      if (testCase.expectedAction === "wait") {
        expect(await page.locator("#status").textContent()).toBe(
          "Loading report",
        );
        expect(await page.locator("#open-report").count()).toBe(0);
      } else {
        const scenario = scenarios.find(({ id }) => id === testCase.fixture);
        expect(scenario).toBeDefined();
        if (!scenario) throw new Error(`Missing scenario ${testCase.fixture}`);
        expect(
          await page
            .getByText(scenario.expectedOutcome, { exact: true })
            .count(),
        ).toBeGreaterThan(0);
      }
    } finally {
      await page.close();
    }
  }
});

afterAll(async () => {
  await browser?.close();
});

test("labeled later phases prepare distinct target-bearing browser states", async () => {
  for (const testCase of laterPhaseCases) {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(testCase.fixture));
      await prepareEvaluationCase(page, testCase);
      const candidates = filterCandidates(
        (await extractBrowserState(page)).state,
      ).candidates;
      const targetId = targetIdFor(
        candidates,
        testCase,
        await targetDomIndexFor(page, testCase),
      );
      expect(targetId, `${testCase.fixture}/${testCase.phase}`).toBeDefined();
      const result = retrieveCandidates(testCase.goal, candidates);
      expect(
        result.topCandidates.some(({ element }) => element.id === targetId),
        `${testCase.fixture}/${testCase.phase}`,
      ).toBe(true);
    } finally {
      await page.close();
    }
  }
});
