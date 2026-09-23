import { chromium } from "playwright";
import { expect, it } from "vitest";
import { flows } from "./public-site-flows.ts";

it("requires the intended product in the cart postcondition", async () => {
  const flow = flows.find((candidate) => candidate.id === "sauce-add-backpack");
  expect(flow?.postcondition).toBeDefined();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<button id="remove-sauce-labs-bike-light">Remove</button>',
    );
    expect(await flow?.postcondition?.(page)).toBe(false);
    await page.setContent(
      '<button id="remove-sauce-labs-backpack">Remove</button>',
    );
    expect(await flow?.postcondition?.(page)).toBe(true);
  } finally {
    await browser.close();
  }
});
