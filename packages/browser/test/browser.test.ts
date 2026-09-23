import { type Browser, chromium } from "playwright";
import { afterAll, expect, test } from "vitest";

let browser: Browser | undefined;

afterAll(async () => {
  await browser?.close();
});

test("Chromium can render a local page", async () => {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(
    "<title>Jolty smoke test</title><button>Continue</button>",
  );

  expect(await page.title()).toBe("Jolty smoke test");
  expect(await page.getByRole("button", { name: "Continue" }).count()).toBe(1);
});
