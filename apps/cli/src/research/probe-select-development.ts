import { writeFile } from "node:fs/promises";
import { extractBrowserState } from "@jolty/browser";
import { chromium } from "playwright";
import { filterCandidates } from "../../../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../../../packages/retrieval/src/candidate-retrieval.ts";
import { projectBrowserLayaV2State } from "./browser-laya-v2-projection.ts";

const url = "https://select-development.jolty.invalid/inventory";
const html = `<!doctype html><title>Inventory development</title>
  <label>Color <select id="color"><option>Amber</option><option>Indigo</option></select></label>
  <button id="save">Save color</button><p id="status"></p>
  <script>document.querySelector('#save').onclick = () => {
    document.querySelector('#status').textContent =
      'Saved ' + document.querySelector('#color').selectedOptions[0].textContent;
  };</script>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route(url, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await page.goto(url);
  await page.locator("#color").selectOption({ label: "Indigo" });
  const state = (await extractBrowserState(page)).state;
  const goal = "Save the selected indigo color";
  const retrieved = retrieveCandidates(
    goal,
    filterCandidates(state).candidates,
  );
  const projected = projectBrowserLayaV2State(state);
  const selected = projected.elements.find(
    (element) => element.name === "Color",
  );
  if (selected?.current_value !== "Indigo")
    throw new Error("Selected option was lost before model serialization");
  const candidates = retrieved.topCandidates.map(({ element }) => ({
    id: element.id,
  }));
  if (!candidates.some((candidate) => candidate.id === selected.id))
    throw new Error("Development select is missing from Top 10");
  const sample = {
    goal,
    browser_state: projected,
    candidates,
  };
  const output = "artifacts/laya-select-development-v2.json";
  await writeFile(output, `${JSON.stringify(sample, null, 2)}\n`);
  await page.locator("#save").click();
  if ((await page.locator("#status").textContent()) !== "Saved Indigo")
    throw new Error("Development validator failed");
  console.log(
    JSON.stringify({
      output,
      top10: candidates.length,
      selected_value: selected.current_value,
      reference_validated: true,
    }),
  );
} finally {
  await browser.close();
}
