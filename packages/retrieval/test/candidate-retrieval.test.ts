import type { InteractiveElement } from "@jolty/browser";
import { extractBrowserState } from "@jolty/browser";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.js";
import {
  retrievalCases,
  targetDomIndexFor,
  targetIdFor,
} from "../eval/cases.js";
import { filterCandidates } from "../src/candidate-filter.js";
import { retrieveCandidates } from "../src/candidate-retrieval.js";

const element = (
  id: string,
  name: string,
  role = "button",
): InteractiveElement => ({
  id,
  role,
  name,
  text: name,
  visible: true,
  enabled: true,
  editable: role === "textbox",
});

test("scores exact, normalized, label, and role signals", () => {
  const candidates = [
    element("exact", "Save profile"),
    element("normalized", "SAVE PROFILE"),
    element("label", "Profile"),
    element("other", "Cancel"),
  ];
  const result = retrieveCandidates("Save profile", candidates);
  expect(result.ranked.map(({ element }) => element.id)).toEqual([
    "exact",
    "normalized",
    "label",
    "other",
  ]);
  expect(result.ranked[0].signals.exactMatch).toBeGreaterThan(0);
  expect(result.ranked[1].signals.normalizedMatch).toBeGreaterThan(0);
  expect(result.ranked[2].signals.labelMatch).toBeGreaterThan(0);
  expect(result.ranked[0].signals.roleCompatibility).toBeGreaterThan(0);
});

test("uses visible text when the accessible name differs", () => {
  const candidate = { ...element("save", "Accessible save"), text: "Save" };
  const result = retrieveCandidates("Save", [candidate]);
  expect(result.ranked[0].signals.exactMatch).toBe(50);
});

test("uses editable state and stable order for equal scores", () => {
  const candidates = [
    element("one", "Email", "textbox"),
    element("two", "Email", "textbox"),
    element("button", "Email"),
  ];
  const result = retrieveCandidates("Enter email", candidates, 2);
  expect(result.topCandidates.map(({ element }) => element.id)).toEqual([
    "one",
    "two",
  ]);
  expect(result.ranked[0].signals.elementState).toBeGreaterThan(0);
  expect(result.metrics).toMatchObject({
    input_candidate_count: 3,
    output_candidate_count: 2,
  });
  expect(result.metrics.candidate_retrieval_ms).toBeGreaterThanOrEqual(0);
  expect(candidates.map(({ id }) => id)).toEqual(["one", "two", "button"]);
});

test("prefers an unselected option when names match", () => {
  const selected = {
    ...element("selected", "Spanish", "option"),
    selected: true,
  };
  const available = element("available", "Spanish", "option");
  const result = retrieveCandidates("Select Spanish", [selected, available]);
  expect(result.ranked.map(({ element }) => element.id)).toEqual([
    "available",
    "selected",
  ]);
  expect(result.ranked[1].signals.elementState).toBe(-2);
});

test("handles empty candidates and rejects invalid Top-K", () => {
  expect(retrieveCandidates("Anything", []).topCandidates).toEqual([]);
  expect(() => retrieveCandidates("Anything", [], 0)).toThrow(RangeError);
  expect(() => retrieveCandidates("Anything", [], 1.5)).toThrow(RangeError);
});

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

test("controlled fixture retrieval retains ground truth in Top-5", async () => {
  let recall1 = 0;
  let recall5 = 0;
  let recall10 = 0;
  for (const testCase of retrievalCases) {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(testCase.fixture));
      const candidates = filterCandidates(
        (await extractBrowserState(page)).state,
      ).candidates;
      const targetId = targetIdFor(
        candidates,
        testCase,
        await targetDomIndexFor(page, testCase),
      );
      expect(
        targetId,
        `${testCase.fixture}: ground truth target missing`,
      ).toBeDefined();
      const { ranked } = retrieveCandidates(testCase.goal, candidates, 10);
      const rank =
        ranked.findIndex(({ element }) => element.id === targetId) + 1;
      if (rank > 0 && rank <= 1) recall1++;
      if (rank > 0 && rank <= 5) recall5++;
      if (rank > 0 && rank <= 10) recall10++;
    } finally {
      await page.close();
    }
  }
  expect(recall1).toBeGreaterThanOrEqual(10);
  expect(recall5).toBe(retrievalCases.length);
  expect(recall10).toBe(retrievalCases.length);
});
