import { readFile } from "node:fs/promises";
import type { Page } from "playwright";
import { scenarios } from "./scenarios.ts";

const origin = "http://fixtures.jolty.test";
const pageNames = new Set([...scenarios.map(({ id }) => id), "redirected"]);

export function fixtureUrl(id: string): string {
  if (!pageNames.has(id)) throw new Error(`Unknown fixture: ${id}`);
  return `${origin}/${id}`;
}

export async function installFixtureRoutes(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.slice(1);
    if (url.origin !== origin || !pageNames.has(name)) {
      await route.abort();
      return;
    }
    const body = await readFile(
      new URL(`./pages/${name}.html`, import.meta.url),
    );
    await route.fulfill({ status: 200, contentType: "text/html", body });
  });
}
