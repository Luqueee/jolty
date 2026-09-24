import { extractBrowserState } from "@jolty/browser";
import { chromium } from "playwright";
import { expect, test } from "vitest";
import { projectBrowserLayaV2State } from "../src/research/browser-laya-v2-projection.ts";

test("preserves the selected native option through the v2 projection", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <title>Inventory development</title>
      <label>Color <select><option>Amber</option><option>Indigo</option></select></label>
      <label>Note <input value="private text"></label>
      <button>Save color</button>
    `);
    const before = projectBrowserLayaV2State(
      (await extractBrowserState(page)).state,
    );
    expect(
      before.elements.find((element) => element.name === "Color"),
    ).toMatchObject({
      native_select: true,
      current_value: "Amber",
    });
    await page.getByRole("combobox", { name: "Color" }).selectOption({
      label: "Indigo",
    });
    const after = projectBrowserLayaV2State(
      (await extractBrowserState(page)).state,
    );
    expect(
      after.elements.find((element) => element.name === "Color"),
    ).toMatchObject({
      native_select: true,
      current_value: "Indigo",
    });
    expect(JSON.stringify(after)).not.toContain("private text");
  } finally {
    await browser.close();
  }
});
