import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extractBrowserState } from "@jolty/browser";
import { chromium, type Page } from "playwright";
import { executeAction } from "../../../../packages/executor/src/execute-action.ts";
import { filterCandidates } from "../../../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../../../packages/retrieval/src/candidate-retrieval.ts";
import { targetId } from "../../benchmarks/public-site-flows.ts";
import { type BlindCheck, localBlindFlows } from "./blind-cases.ts";
import { publicBlindFlows } from "./blind-public-cases.ts";

async function checkOutcome(page: Page, check: BlindCheck): Promise<boolean> {
  if (check.kind === "path") {
    await page.waitForURL((url) => url.pathname === check.expected, {
      timeout: 3_000,
    });
    return new URL(page.url()).pathname === check.expected;
  }
  if (check.kind === "hash") {
    await page.waitForURL((url) => url.hash === check.expected, {
      timeout: 3_000,
    });
    return new URL(page.url()).hash === check.expected;
  }
  const target = page.locator(check.selector);
  if (check.kind === "visible") {
    await target.waitFor({ state: "visible", timeout: 3_000 });
    return target.isVisible();
  }
  if (check.kind === "hidden") {
    await target.waitFor({ state: "hidden", timeout: 3_000 });
    return !(await target.isVisible());
  }
  if (check.kind === "value")
    return (await target.inputValue()) === check.expected;
  if (check.kind === "checked") return target.isChecked();
  return (
    (await target.textContent())?.replace(/\s+/g, " ").trim() === check.expected
  );
}

const runs = Number(process.argv[2] ?? "3");
if (!Number.isSafeInteger(runs) || runs < 1)
  throw new Error("Reference runs must be a positive integer");
const output = process.argv[3] ?? "artifacts/blind-reference.json";
const flows = [...localBlindFlows, ...publicBlindFlows];
const browser = await chromium.launch();
const results = [];
try {
  for (const flow of flows) {
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        javaScriptEnabled: !flow.blockScripts,
      });
      const steps = [];
      let failure: string | null = null;
      try {
        const page = await context.newPage();
        if (flow.blockThirdParty || flow.blockScripts) {
          const hostname = new URL(flow.url).hostname;
          await page.route("**/*", (route) =>
            (!flow.blockThirdParty ||
              new URL(route.request().url()).hostname === hostname) &&
            (!flow.blockScripts || route.request().resourceType() !== "script")
              ? route.continue()
              : route.abort(),
          );
        }
        if (flow.localFile) {
          const body = await readFile(
            new URL(
              `../../../../research/blind_sites/${flow.localFile}`,
              import.meta.url,
            ),
          );
          await page.route(flow.url, (route) =>
            route.fulfill({ status: 200, contentType: "text/html", body }),
          );
        }
        const response = await page.goto(flow.url, {
          waitUntil: flow.settle ?? "domcontentloaded",
          timeout: 20_000,
        });
        if (response?.status() !== 200)
          throw new Error(`Initial HTTP status ${response?.status()}`);
        await page.locator(flow.steps[0].target).waitFor({
          state: "visible",
          timeout: 10_000,
        });
        for (const step of flow.steps) {
          const state = (await extractBrowserState(page)).state;
          const expectedId = await targetId(page, step.target, state);
          const filtered = filterCandidates(state);
          const retrieved = retrieveCandidates(step.goal, filtered.candidates);
          const rank = retrieved.topCandidates.findIndex(
            (candidate) => candidate.element.id === expectedId,
          );
          const execution = await executeAction(page, state, {
            action: step.action,
            targetId: expectedId,
            value: step.value,
          });
          const passed =
            execution.status === "executed" &&
            (await checkOutcome(page, step.check));
          steps.push({
            id: `${flow.id}:${step.id}`,
            goal: step.goal,
            action: step.action,
            target: step.target,
            check: step.check,
            state_sha256: createHash("sha256")
              .update(JSON.stringify({ goal: step.goal, state }))
              .digest("hex"),
            browser_state_sha256: createHash("sha256")
              .update(JSON.stringify(state))
              .digest("hex"),
            candidate_rank: rank < 0 ? null : rank + 1,
            candidate_count: retrieved.topCandidates.length,
            execution_status: execution.status,
            execution_message:
              execution.status === "failed"
                ? execution.message.slice(0, 180)
                : null,
            validator_passed: passed,
          });
          if (!passed || rank < 0) {
            failure = `${step.id}: ${!passed ? "reference or validator failed" : "target outside Top 10"}`;
            break;
          }
        }
      } catch (error) {
        failure =
          error instanceof Error
            ? error.message.slice(0, 180)
            : "Unknown error";
      } finally {
        await context.close();
      }
      results.push({
        flow_id: flow.id,
        site: flow.site,
        family: flow.family,
        run,
        expected_steps: flow.steps.length,
        steps,
        passed: !failure && steps.length === flow.steps.length,
        failure,
      });
      console.error(`${flow.id} run ${run + 1}: ${failure ?? "passed"}`);
    }
  }
} finally {
  await browser.close();
}
await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    flows: flows.length,
    runs: results.length,
    passed: results.filter((result) => result.passed).length,
    targets_in_top10: results
      .flatMap((result) => result.steps)
      .filter((step) => step.candidate_rank !== null).length,
    observed_steps: results.flatMap((result) => result.steps).length,
  }),
);
