import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extractBrowserState } from "@jolty/browser";
import { chromium } from "playwright";
import { executeAction } from "../../../../packages/executor/src/execute-action.ts";
import { filterCandidates } from "../../../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../../../packages/retrieval/src/candidate-retrieval.ts";
import { targetId } from "../../benchmarks/public-site-flows.ts";
import { blindV2Cases } from "./blind-v2-cases.ts";

const browser = await chromium.launch();
const results = [];
try {
  for (const flow of blindV2Cases) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const body = await readFile(`research/blind_sites_v2/${flow.file}`);
      await page.route(flow.url, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body }),
      );
      const response = await page.goto(flow.url);
      if (response?.status() !== 200)
        throw new Error(`${flow.id}: reset failed`);
      for (const step of flow.steps) {
        const state = (await extractBrowserState(page)).state;
        const id = await targetId(page, step.target, state);
        const retrieved = retrieveCandidates(
          step.goal,
          filterCandidates(state).candidates,
        );
        const rank = retrieved.topCandidates.findIndex(
          ({ element }) => element.id === id,
        );
        if (rank < 0)
          throw new Error(`${flow.id}:${step.id}: target absent from Top 10`);
        const execution = await executeAction(page, state, {
          action: step.action,
          targetId: id,
          value: step.value,
        });
        if (execution.status !== "executed")
          throw new Error(`${flow.id}:${step.id}: action failed`);
        const check = step.check;
        if (check.kind === "path" || check.kind === "hash")
          throw new Error(`${flow.id}:${step.id}: unsupported local validator`);
        const element = page.locator(check.selector);
        const passed =
          check.kind === "value"
            ? (await element.inputValue()) === check.expected
            : check.kind === "text"
              ? (await element.textContent())?.trim() === check.expected
              : check.kind === "visible"
                ? await element.isVisible()
                : check.kind === "hidden"
                  ? !(await element.isVisible())
                  : false;
        if (!passed)
          throw new Error(`${flow.id}:${step.id}: outcome validator failed`);
        results.push({ flow: flow.id, step: step.id, target_rank: rank + 1 });
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const source = await Promise.all(
  blindV2Cases.map(async (flow) => ({
    file: flow.file,
    sha256: createHash("sha256")
      .update(await readFile(`research/blind_sites_v2/${flow.file}`))
      .digest("hex"),
  })),
);
console.log(
  JSON.stringify({
    sites: blindV2Cases.length,
    families: [...new Set(blindV2Cases.map((flow) => flow.family))],
    reference_steps: results.length,
    top10: results.filter((row) => row.target_rank <= 10).length,
    source,
  }),
);
