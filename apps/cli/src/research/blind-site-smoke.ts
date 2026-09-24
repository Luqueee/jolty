import { readFile, writeFile } from "node:fs/promises";
import { extractBrowserState } from "@jolty/browser";
import { chromium } from "playwright";

const sites = [
  { id: "testmuai", url: "https://www.testmuai.com/selenium-playground/" },
  { id: "hyr", url: "https://www.hyrtutorials.com/p/basic-controls.html" },
  { id: "automationuk", url: "https://www.automationtesting.co.uk/" },
  { id: "scrapingcourse", url: "https://www.scrapingcourse.com/ecommerce/" },
  {
    id: "dispatch",
    url: "http://dispatch.blind.jolty.test/",
    file: "dispatch.html",
  },
  { id: "ledger", url: "http://ledger.blind.jolty.test/", file: "ledger.html" },
] as const;

const browser = await chromium.launch();
const results = [];
try {
  for (const site of sites) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    try {
      const page = await context.newPage();
      if ("file" in site) {
        const body = await readFile(
          new URL(
            `../../../../research/blind_sites/${site.file}`,
            import.meta.url,
          ),
        );
        await page.route(site.url, (route) =>
          route.fulfill({ status: 200, contentType: "text/html", body }),
        );
      }
      const response = await page.goto(site.url, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      const observation = await extractBrowserState(page);
      results.push({
        id: site.id,
        requested_url: site.url,
        final_url: page.url(),
        status: response?.status() ?? null,
        title: observation.state.title,
        interactive_count: observation.state.elements.length,
        visible_count: observation.state.elements.filter(
          (element) => element.visible,
        ).length,
        editable_count: observation.state.elements.filter(
          (element) => element.editable,
        ).length,
        enabled_count: observation.state.elements.filter(
          (element) => element.enabled,
        ).length,
        state_bytes: observation.metrics.serialized_state_bytes,
      });
    } catch (error) {
      results.push({
        id: site.id,
        requested_url: site.url,
        error: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const output = process.argv[2] ?? "artifacts/blind-site-smoke.json";
await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
