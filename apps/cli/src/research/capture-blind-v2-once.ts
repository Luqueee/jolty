import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extractBrowserState } from "@jolty/browser";
import { chromium } from "playwright";
import { executeAction } from "../../../../packages/executor/src/execute-action.ts";
import { filterCandidates } from "../../../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../../../packages/retrieval/src/candidate-retrieval.ts";
import { targetId } from "../../benchmarks/public-site-flows.ts";
import { blindV2Cases } from "./blind-v2-cases.ts";
import { projectBrowserLayaV2State } from "./browser-laya-v2-projection.ts";

const hash = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const manifest = JSON.parse(
  await readFile("research/blind_sites_v2/manifest.json", "utf8"),
);
const plan = JSON.parse(
  await readFile("research/blind_sites_v2/comparison-plan.json", "utf8"),
);
if (
  manifest.status !== "frozen-unscored" ||
  plan.status !== "calibration-frozen" ||
  plan.manifest_sha256 !==
    (await hash("research/blind_sites_v2/manifest.json")) ||
  plan.calibration_freeze_sha256 !== manifest.calibration_freeze_sha256 ||
  plan.source_sha256["apps/cli/src/research/capture-blind-v2-once.ts"] !==
    (await hash("apps/cli/src/research/capture-blind-v2-once.ts"))
)
  throw new Error("Second blind manifest or comparison plan changed");
for (const site of manifest.sites)
  if (
    site.source_sha256 !==
    (await hash(`research/blind_sites_v2/${site.source}`))
  )
    throw new Error(`Frozen site source changed: ${site.id}`);

const observations = [];
const labels = [];
const browser = await chromium.launch();
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
        const expectedId = await targetId(page, step.target, state);
        const retrieved = retrieveCandidates(
          step.goal,
          filterCandidates(state).candidates,
        );
        const rank = retrieved.topCandidates.findIndex(
          ({ element }) => element.id === expectedId,
        );
        if (rank < 0)
          throw new Error(`${flow.id}:${step.id}: target absent from Top 10`);
        const projected = projectBrowserLayaV2State(state);
        const element = projected.elements.find(
          (item) => item.id === expectedId,
        );
        if (!element) throw new Error("Expected element is missing");
        const inferred = element.editable
          ? "type"
          : element.native_select
            ? "select"
            : "click";
        if (inferred !== step.action)
          throw new Error(`${flow.id}:${step.id}: action contract changed`);
        const id = `${flow.id}:${step.id}`;
        observations.push({
          sample_id: id,
          split: "blind",
          split_group: projected.origin,
          goal: step.goal,
          browser_state: projected,
          candidates: retrieved.topCandidates.map(
            ({ element, score, signals }) => ({
              id: element.id,
              score,
              signals,
            }),
          ),
          training_action: null,
        });
        labels.push({
          id,
          flow_id: flow.id,
          site: flow.id,
          family: flow.family,
          action: step.action,
          target_id: expectedId,
          target_index: rank,
          candidate_count: retrieved.topCandidates.length,
        });
        const executed = await executeAction(page, state, {
          action: step.action,
          targetId: expectedId,
          value: step.value,
        });
        if (executed.status !== "executed")
          throw new Error(`${id}: reference action failed`);
        const check = step.check;
        if (check.kind === "path" || check.kind === "hash")
          throw new Error(`${id}: unsupported validator`);
        const locator = page.locator(check.selector);
        const passed =
          check.kind === "value"
            ? (await locator.inputValue()) === check.expected
            : check.kind === "text"
              ? (await locator.textContent())?.trim() === check.expected
              : check.kind === "visible"
                ? await locator.isVisible()
                : check.kind === "hidden"
                  ? !(await locator.isVisible())
                  : false;
        if (!passed) throw new Error(`${id}: reference outcome failed`);
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (observations.length !== 17 || labels.length !== 17)
  throw new Error("Second blind decision count changed");
await mkdir("artifacts/blind-v2-once", { recursive: true });
await writeFile(
  "artifacts/blind-v2-once/observations.json",
  `${JSON.stringify(observations, null, 2)}\n`,
  { flag: "wx" },
);
await writeFile(
  "artifacts/blind-v2-once/labels.json",
  `${JSON.stringify(labels, null, 2)}\n`,
  { flag: "wx" },
);
console.log(
  JSON.stringify({ flows: blindV2Cases.length, decisions: labels.length }),
);
