import type { BrowserState, InteractiveElement } from "@jolty/browser";
import { extractBrowserState } from "@jolty/browser";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.js";
import { scenarios } from "../../browser/fixtures/scenarios.js";
import { filterCandidates } from "../src/candidate-filter.js";

const element = (
  id: string,
  overrides: Partial<InteractiveElement> = {},
): InteractiveElement => ({
  id,
  role: "button",
  name: id,
  text: id,
  visible: true,
  enabled: true,
  editable: false,
  ...overrides,
});

test("filters hidden, disabled, and non-actionable elements without changing IDs", () => {
  const state: BrowserState = {
    url: "http://fixture.test/",
    title: "Filter test",
    elements: [
      element("hidden", { visible: false }),
      element("disabled", { enabled: false }),
      element("heading", { role: "heading" }),
      element("editable", { role: "textbox", editable: true }),
      element("aria", { role: "switch", selected: false }),
      element("focusable", { role: "generic" }),
      element("scroll-target"),
    ],
  };

  const first = filterCandidates(state);
  const second = filterCandidates(state);
  expect(first.candidates.map(({ id }) => id)).toEqual([
    "editable",
    "aria",
    "focusable",
    "scroll-target",
  ]);
  expect(second.candidates).toEqual(first.candidates);
  expect(state.elements).toHaveLength(7);
  expect(first.metrics).toMatchObject({
    input_element_count: 7,
    output_element_count: 4,
  });
  expect(first.metrics.candidate_filter_ms).toBeGreaterThanOrEqual(0);
});

const initialTargets: Record<
  string,
  readonly [role: string, name: string, count?: number][]
> = {
  login: [
    ["textbox", "Email"],
    ["textbox", "Password"],
    ["button", "Sign in"],
  ],
  logout: [["button", "Log out"]],
  settings: [
    ["textbox", "Display name"],
    ["button", "Save profile"],
  ],
  form: [
    ["textbox", "Message"],
    ["button", "Send"],
  ],
  validation: [
    ["textbox", "Email"],
    ["button", "Submit"],
  ],
  modal: [["button", "Open dialog"]],
  select: [["combobox", "Language"]],
  tabs: [["tab", "Security"]],
  redirect: [["button", "Continue"]],
  delayed: [["button", "Load result"]],
  duplicate: [["button", "Continue", 2]],
  scroll: [["button", "Reach target"]],
};

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

test.each(scenarios)(
  "$id fixture targets survive filtering",
  async ({ id }) => {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(id));
      const { state } = await extractBrowserState(page);
      const { candidates, metrics } = filterCandidates(state);
      for (const [role, name, count = 1] of initialTargets[id]) {
        expect(
          candidates.filter((item) => item.role === role && item.name === name),
        ).toHaveLength(count);
      }
      expect(metrics.input_element_count).toBe(state.elements.length);
      expect(metrics.output_element_count).toBe(candidates.length);
    } finally {
      await page.close();
    }
  },
);

test("newly opened modal controls survive filtering", async () => {
  const page = await browser.newPage();
  try {
    await installFixtureRoutes(page);
    await page.goto(fixtureUrl("modal"));
    await page.getByRole("button", { name: "Open dialog" }).click();
    const { candidates } = filterCandidates(
      (await extractBrowserState(page)).state,
    );
    expect(
      candidates.some(
        ({ role, name }) => role === "button" && name === "Confirm",
      ),
    ).toBe(true);
  } finally {
    await page.close();
  }
});

test("noisy page reduces 82 observed elements to one candidate", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <button type="button">Target</button>
      ${Array.from({ length: 40 }, (_, i) => `<button hidden type="button">Hidden ${i}</button>`).join("")}
      ${Array.from({ length: 40 }, (_, i) => `<button disabled type="button">Disabled ${i}</button>`).join("")}
      <h2 role="heading" tabindex="0">Heading</h2>
    `);
    const { state } = await extractBrowserState(page);
    const { candidates, metrics } = filterCandidates(state);
    expect(metrics.input_element_count).toBe(82);
    expect(metrics.output_element_count).toBe(1);
    expect(candidates[0]).toMatchObject({ role: "button", name: "Target" });
  } finally {
    await page.close();
  }
});
