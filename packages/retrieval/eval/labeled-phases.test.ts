import { extractBrowserState } from "@jolty/browser";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
import { filterCandidates } from "../src/candidate-filter.ts";
import { retrieveCandidates } from "../src/candidate-retrieval.ts";
import {
  laterPhaseCases,
  prepareEvaluationCase,
  targetDomIndexFor,
  targetIdFor,
} from "./cases.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
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
