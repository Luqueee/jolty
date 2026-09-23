import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { fixtureUrl, installFixtureRoutes } from "../fixtures/routes.js";
import { scenarios } from "../fixtures/scenarios.js";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const exercise: Record<string, (page: Page) => Promise<void>> = {
  async login(page) {
    await page
      .getByRole("textbox", { name: "Email" })
      .fill("person@example.test");
    await page
      .getByRole("textbox", { name: "Password" })
      .fill("correct-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    expect(await page.getByRole("status").textContent()).toBe("Signed in");
  },
  async logout(page) {
    await page.getByRole("button", { name: "Log out" }).click();
    expect(await page.getByRole("status").textContent()).toBe("Signed out");
  },
  async settings(page) {
    await page.getByRole("textbox", { name: "Display name" }).fill("New name");
    await page.getByRole("button", { name: "Save profile" }).click();
    expect(await page.getByRole("status").textContent()).toBe(
      "Updated: New name",
    );
  },
  async form(page) {
    await page.getByRole("textbox", { name: "Message" }).fill("Hello");
    await page.getByRole("button", { name: "Send" }).click();
    expect(await page.getByRole("status").textContent()).toBe("Message sent");
  },
  async validation(page) {
    await page.getByRole("textbox", { name: "Email" }).fill("invalid");
    await page.getByRole("button", { name: "Submit" }).click();
    expect(await page.getByRole("status").textContent()).toBe(
      "Enter a valid email",
    );
  },
  async modal(page) {
    await page.getByRole("button", { name: "Open dialog" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirmation" });
    expect(await dialog.isVisible()).toBe(true);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    expect(await page.getByRole("status").textContent()).toBe("Confirmed");
  },
  async select(page) {
    await page.getByRole("combobox", { name: "Language" }).selectOption("es");
    expect(await page.getByRole("status").textContent()).toBe(
      "Language: Spanish",
    );
  },
  async tabs(page) {
    await page.getByRole("tab", { name: "Security" }).click();
    expect(
      await page
        .getByRole("tabpanel")
        .filter({ hasText: "Security panel" })
        .isVisible(),
    ).toBe(true);
    expect(
      await page
        .getByRole("tab", { name: "Security" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  },
  async redirect(page) {
    await Promise.all([
      page.waitForURL(fixtureUrl("redirected")),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    expect(page.url()).toBe(fixtureUrl("redirected"));
    expect(
      await page
        .getByRole("heading", { name: "Destination reached" })
        .isVisible(),
    ).toBe(true);
  },
  async delayed(page) {
    await page.getByRole("button", { name: "Load result" }).click();
    expect(await page.getByRole("status").textContent()).toBe("Loading");
    await page.getByRole("status").filter({ hasText: "Loaded" }).waitFor();
    expect(await page.getByRole("status").textContent()).toBe("Loaded");
  },
  async duplicate(page) {
    expect(await page.getByRole("button", { name: "Continue" }).count()).toBe(
      2,
    );
    await page
      .getByRole("region", { name: "Pro plan" })
      .getByRole("button", { name: "Continue" })
      .click();
    expect(await page.getByRole("status").textContent()).toBe(
      "Pro plan chosen",
    );
  },
  async scroll(page) {
    const target = page.getByRole("button", { name: "Reach target" });
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("Target or viewport is missing");
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await target.click();
    expect(await page.getByRole("status").textContent()).toBe("Target reached");
  },
  async "cookie-overlay"(page) {
    const notice = page.getByRole("dialog", { name: "Cookie notice" });
    expect(await notice.isVisible()).toBe(true);
    await expectDecisionLabel(page, "cookie-overlay", "initial");
    await notice.getByRole("button", { name: "Accept cookies" }).click();
    expect(await notice.isVisible()).toBe(false);
    await expectDecisionLabel(page, "cookie-overlay", "notice-dismissed");
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    expect(await page.getByRole("status").textContent()).toBe("Checkout ready");
  },
  async "dynamic-results"(page) {
    await page.clock.install();
    await expectDecisionLabel(page, "dynamic-results", "initial");
    await page.getByRole("button", { name: "Load report" }).click();
    expect(await page.getByRole("status").textContent()).toBe("Loading report");
    expect(
      await page.getByRole("button", { name: "Open report" }).count(),
    ).toBe(0);
    await expectDecisionLabel(page, "dynamic-results", "loading");
    await page.clock.fastForward(80);
    await expectDecisionLabel(page, "dynamic-results", "report-ready");
    await page.getByRole("button", { name: "Open report" }).click();
    expect(await page.getByRole("status").textContent()).toBe("Report opened");
  },
  async "ambiguous-row"(page) {
    expect(await page.getByRole("button", { name: "Open" }).count()).toBe(2);
    await expectDecisionLabel(page, "ambiguous-row", "initial");
    await page
      .getByRole("row")
      .filter({ hasText: "Approved" })
      .getByRole("button", { name: "Open" })
      .click();
    expect(await page.getByRole("status").textContent()).toBe(
      "Approved request opened",
    );
  },
};

async function expectDecisionLabel(
  page: Page,
  scenarioId: string,
  phase: string,
): Promise<void> {
  const scenario = scenarios.find(({ id }) => id === scenarioId);
  const label = scenario?.decisionLabels?.find((item) => item.phase === phase);
  expect(label).toBeDefined();
  if (!label) return;
  if (label.action === "wait") {
    expect(label.targetSelector).toBeUndefined();
    return;
  }
  expect(label.targetSelector).toBeDefined();
  if (!label.targetSelector) return;
  const target = page.locator(label.targetSelector);
  expect(await target.count()).toBe(1);
  expect(await target.isVisible()).toBe(true);
  expect(await target.isEnabled()).toBe(true);
}

test.each(scenarios)(
  "$id fixture reaches its expected outcome",
  async (scenario) => {
    expect(scenario.goal.length).toBeGreaterThan(0);
    expect(scenario.validActions.length).toBeGreaterThan(0);
    expect(scenario.expectedOutcome.length).toBeGreaterThan(0);
    expect(exercise[scenario.id]).toBeDefined();

    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(scenario.id));
      await exercise[scenario.id](page);
      expect(
        await page
          .getByText(scenario.expectedOutcome, { exact: true })
          .isVisible(),
      ).toBe(true);
    } finally {
      await page.close();
    }
  },
);
