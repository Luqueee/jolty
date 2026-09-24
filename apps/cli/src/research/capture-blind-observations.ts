import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extractBrowserState } from "@jolty/browser";
import { chromium, type Page } from "playwright";
import { executeAction } from "../../../../packages/executor/src/execute-action.ts";
import { filterCandidates } from "../../../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../../../packages/retrieval/src/candidate-retrieval.ts";
import { targetId } from "../../benchmarks/public-site-flows.ts";
import { type BlindCheck, localBlindFlows } from "./blind-cases.ts";
import { verifyBlindComparisonPlan } from "./blind-comparison-plan.ts";
import { publicBlindFlows } from "./blind-public-cases.ts";
import { safeResearchText } from "./research-text.ts";

async function validate(page: Page, check: BlindCheck): Promise<boolean> {
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
  const element = page.locator(check.selector);
  if (check.kind === "visible") {
    await element.waitFor({ state: "visible", timeout: 3_000 });
    return element.isVisible();
  }
  if (check.kind === "hidden") {
    await element.waitFor({ state: "hidden", timeout: 3_000 });
    return !(await element.isVisible());
  }
  if (check.kind === "value")
    return (await element.inputValue()) === check.expected;
  if (check.kind === "checked") return element.isChecked();
  return (
    (await element.textContent())?.replace(/\s+/g, " ").trim() ===
    check.expected
  );
}

const manifest = JSON.parse(
  await readFile("research/blind_sites/manifest.json", "utf8"),
);
const plan = await verifyBlindComparisonPlan();
const manifestHash = createHash("sha256")
  .update(await readFile("research/blind_sites/manifest.json"))
  .digest("hex");
if (
  manifest.status !== "frozen" ||
  plan.status !== "calibration-frozen" ||
  plan.blind_manifest_sha256 !== manifestHash
)
  throw new Error("Blind manifest and calibrated comparison plan do not match");
const flows = [...localBlindFlows, ...publicBlindFlows];
if (flows.length !== manifest.flow_count)
  throw new Error("Blind flow count changed after freeze");
const observations = [];
const labels = [];
const browser = await chromium.launch();
try {
  for (const flow of flows) {
    const context = await browser.newContext({
      viewport: manifest.viewport,
      javaScriptEnabled: !flow.blockScripts,
    });
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
        throw new Error(`${flow.id}: HTTP ${response?.status()}`);
      await page.locator(flow.steps[0]?.target ?? "").waitFor({
        state: "visible",
        timeout: 10_000,
      });
      for (const step of flow.steps) {
        const state = (await extractBrowserState(page)).state;
        const expectedId = await targetId(page, step.target, state);
        const retrieved = retrieveCandidates(
          step.goal,
          filterCandidates(state).candidates,
        );
        const rank = retrieved.topCandidates.findIndex(
          (candidate) => candidate.element.id === expectedId,
        );
        if (rank < 0)
          throw new Error(`${flow.id}:${step.id}: target left Top 10`);
        const id = `${flow.id}:${step.id}`;
        const url = new URL(state.url);
        const elements = state.elements.map((element) => ({
          id: element.id,
          role: element.role,
          name: safeResearchText(element.name),
          text: safeResearchText(element.text),
          editable: element.editable,
          visible: element.visible,
          enabled: element.enabled,
          has_value: element.hasValue ?? false,
          selected: element.selected ?? false,
          ...(element.value !== undefined ? { native_select: true } : {}),
        }));
        const candidates = retrieved.topCandidates.map((candidate) => ({
          id: candidate.element.id,
          score: candidate.score,
          signals: candidate.signals,
        }));
        const selected = elements.find((element) => element.id === expectedId);
        if (!selected) throw new Error(`${id}: selected element missing`);
        const inferred = selected.editable
          ? "type"
          : selected.native_select
            ? "select"
            : "click";
        if (inferred !== step.action)
          throw new Error(`${id}: action contract mismatch (${inferred})`);
        observations.push({
          sample_id: id,
          split: "blind",
          split_group: url.origin,
          goal: step.goal,
          browser_state: {
            origin: url.origin,
            pathname: url.pathname,
            title: safeResearchText(state.title),
            elements,
          },
          candidates,
          training_action: null,
        });
        labels.push({
          id,
          flow_id: flow.id,
          site: flow.site,
          family: flow.family,
          action: step.action,
          target_id: expectedId,
          target_index: rank,
          candidate_count: candidates.length,
        });
        const execution = await executeAction(page, state, {
          action: step.action,
          targetId: expectedId,
          value: step.value,
        });
        if (
          execution.status !== "executed" ||
          !(await validate(page, step.check))
        )
          throw new Error(`${id}: reference replay or validator failed`);
      }
      console.error(`${flow.id}: ${flow.steps.length} captured and validated`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (labels.length !== manifest.decision_count)
  throw new Error("Blind decision count changed after freeze");
await mkdir("artifacts/blind-once", { recursive: true });
await writeFile(
  "artifacts/blind-once/observations.json",
  `${JSON.stringify(observations, null, 2)}\n`,
  { flag: "wx" },
);
await writeFile(
  "artifacts/blind-once/labels.json",
  `${JSON.stringify(labels, null, 2)}\n`,
  { flag: "wx" },
);
console.log(JSON.stringify({ flows: flows.length, decisions: labels.length }));
