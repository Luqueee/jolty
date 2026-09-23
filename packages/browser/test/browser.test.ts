import { type Browser, chromium } from "playwright";
import { afterAll, expect, test } from "vitest";
import { extractBrowserState } from "../src/index.js";

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

test("extracts a compact, serializable browser state", async () => {
  browser ??= await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <title>Account settings</title>
    <label>Email <input type="email" value="person@example.com"></label>
    <label>Password <input type="password" value="secret"></label>
    <button aria-labelledby="save-label"></button><span id="save-label">Save changes</span>
    <button disabled>Unavailable</button>
    <a href="/help" style="display:none">Help</a>
    <label><input type="checkbox" checked> Updates</label>
    <label>Language <select><option>English</option><option selected>Spanish</option></select></label>
    <div role="tab" aria-selected="true" tabindex="0">Profile</div>
    <input type="hidden" value="private-token">
  `);

  const first = await extractBrowserState(page);
  const second = await extractBrowserState(page);
  expect(first.state).toEqual(second.state);
  expect(first.state.title).toBe("Account settings");
  expect(first.state.url).toBe(page.url());
  expect(first.state.elements.map(({ id }) => id)).toEqual(
    first.state.elements.map((_, index) => `e${index + 1}`),
  );
  expect(first.state.elements).toHaveLength(8);
  expect(first.state.elements[0]).toMatchObject({
    role: "textbox",
    name: "Email",
    editable: true,
    hasValue: true,
  });
  expect(first.state.elements[1]).toMatchObject({
    role: "textbox",
    name: "Password",
    hasValue: true,
  });
  expect(first.state.elements[2]).toMatchObject({
    role: "button",
    name: "Save changes",
  });
  expect(first.state.elements[3]).toMatchObject({
    enabled: false,
    editable: false,
  });
  expect(first.state.elements[4]).toMatchObject({
    role: "link",
    visible: false,
  });
  expect(first.state.elements[5]).toMatchObject({
    role: "checkbox",
    selected: true,
  });
  expect(first.state.elements[6]).toMatchObject({
    role: "combobox",
    value: "Spanish",
  });
  expect(first.state.elements[7]).toMatchObject({
    role: "tab",
    selected: true,
  });
  expect(JSON.stringify(first.state)).not.toContain("secret");
  expect(JSON.stringify(first.state)).not.toContain("person@example.com");
  expect(JSON.stringify(first.state)).not.toContain("private-token");
  expect(first.metrics).toMatchObject({
    extracted_interactive_elements: 8,
    serialized_state_bytes: Buffer.byteLength(
      JSON.stringify(first.state),
      "utf8",
    ),
  });
  expect(first.metrics.total_dom_nodes).toBeGreaterThan(8);
  expect(first.metrics.state_extraction_ms).toBeGreaterThan(0);
  await page.close();
});

test("omits freeform control contents while retaining their state", async () => {
  browser ??= await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <label>Notes <textarea>private note</textarea></label>
    <div role="textbox" contenteditable="true" aria-label="Editor">private draft</div>
    <input type="submit" value="Save notes">
    <div role="switch" aria-checked="true">Alerts</div>
  `);

  const { state } = await extractBrowserState(page);
  expect(state.elements).toMatchObject([
    { name: "Notes", text: "", hasValue: true, editable: true },
    { name: "Editor", text: "", hasValue: true, editable: true },
    { name: "Save notes", role: "button", editable: false },
    { name: "Alerts", role: "switch", selected: true },
  ]);
  expect(JSON.stringify(state)).not.toContain("private note");
  expect(JSON.stringify(state)).not.toContain("private draft");
  await page.close();
});
