import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type BrowserState, extractBrowserState } from "@jolty/browser";
import { chromium } from "playwright";
import { executeAction } from "../../../packages/executor/src/execute-action.ts";
import { filterCandidates } from "../../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../../packages/retrieval/src/candidate-retrieval.ts";
import { ValidationSession } from "../../../packages/validator/src/validate-action.ts";
import { targetId } from "../benchmarks/public-site-flows.ts";
import { safeText } from "./dataset.ts";
import { assessResearchReadiness } from "./dataset-readiness.ts";
import { type ResearchSplit, researchCases } from "./research-cases.ts";
import { researchCasesV1 } from "./research-cases-v1.ts";
import { researchCasesV2 } from "./research-cases-v2.ts";
import { researchCasesV3 } from "./research-cases-v3.ts";
import { researchCasesV4 } from "./research-cases-v4.ts";

const corpusVersion = process.env.JOLTY_RESEARCH_CORPUS_VERSION ?? "0";
if (!["0", "1", "2", "3", "4"].includes(corpusVersion))
  throw new Error("JOLTY_RESEARCH_CORPUS_VERSION must be 0, 1, 2, 3, or 4");
const cases =
  corpusVersion === "4"
    ? researchCasesV4
    : corpusVersion === "3"
      ? researchCasesV3
      : corpusVersion === "2"
        ? researchCasesV2
        : corpusVersion === "1"
          ? researchCasesV1
          : researchCases;
const output =
  process.argv[2] ?? `artifacts/research-corpus-v${corpusVersion}.json`;
const splitByOrigin = new Map<string, ResearchSplit>([
  ["https://testpages.eviltester.com", "train"],
  ["https://qa-automation-practice.netlify.app", "train"],
  ["https://practice.expandtesting.com", "validation"],
  ["https://the-internet.herokuapp.com", "test"],
  ["https://todomvc.com", "test"],
  ["https://www.saucedemo.com", "test"],
  ["https://www.selenium.dev", "test"],
  ["https://qapracticehub.com", "train"],
  ["https://practice-automation.com", "validation"],
  ["https://www.qa-practice.com", "test"],
  ["https://playground.go-bigger.de", "test"],
  ["https://www.testtrack.org", "test"],
  ["https://webdriveruniversity.com", "test"],
  ["https://lastest.cloud", "test"],
  ["https://qaplayground.com", "test"],
  ["https://testing.qaautomationlabs.com", "test"],
  ["https://practicetestautomation.com", "test"],
]);

function projectState(state: BrowserState) {
  const url = new URL(state.url);
  if (url.search || url.hash)
    throw new Error("Research collection requires a query-free observation");
  return {
    origin: url.origin,
    pathname: url.pathname,
    title: safeText(state.title),
    elements: state.elements.map((element) => ({
      id: element.id,
      role: element.role,
      name: safeText(element.name),
      text: safeText(element.text),
      visible: element.visible,
      enabled: element.enabled,
      editable: element.editable,
      has_value: element.hasValue ?? false,
      selected: element.selected ?? false,
    })),
  };
}

function validateCaseSources(): void {
  const ids = new Set<string>();
  for (const entry of cases) {
    if (ids.has(entry.id))
      throw new Error(`Duplicate research case: ${entry.id}`);
    ids.add(entry.id);
    const url = new URL(entry.url);
    if (
      url.protocol !== "https:" ||
      url.search ||
      url.hash ||
      splitByOrigin.get(url.origin) !== entry.split
    )
      throw new Error(`Research case has an unapproved source: ${entry.id}`);
  }
}

validateCaseSources();
const browser = await chromium.launch();
try {
  const samples = [];
  for (const entry of cases) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const response = await page.goto(entry.url, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      if (response?.status() !== 200)
        throw new Error(`Research site returned HTTP ${response?.status()}`);
      await entry.prepare?.(page);
      if (entry.site === "qa-practice")
        await page.waitForLoadState("networkidle", { timeout: 5_000 });
      const observation = await extractBrowserState(page);
      const state = observation.state;
      const expectedId = await targetId(page, entry.target, state);
      const projected = projectState(state);
      if (splitByOrigin.get(projected.origin) !== entry.split)
        throw new Error(`Research case changed site origin: ${entry.id}`);
      const filtered = filterCandidates(state);
      const retrieved = retrieveCandidates(entry.goal, filtered.candidates);
      const rank = retrieved.topCandidates.findIndex(
        ({ element }) => element.id === expectedId,
      );
      const step = entry.step(expectedId);
      const value = step.values?.find(
        (item) => item.action === entry.action,
      )?.value;
      if (entry.action !== "click" && value === undefined)
        throw new Error(`Research case needs a planned value: ${entry.id}`);
      const session = await ValidationSession.start(page, state, step.checks);
      let executed: Awaited<ReturnType<typeof executeAction>>;
      let validation: Awaited<ReturnType<ValidationSession["validate"]>>;
      try {
        executed = await executeAction(page, state, {
          action: entry.action,
          targetId: expectedId,
          value,
        });
        if (executed.status === "executed")
          for (const check of step.checks)
            if (check.kind === "text_visible")
              await page
                .getByText(check.text, { exact: true })
                .waitFor({ state: "visible", timeout: 1_500 })
                .catch(() => {});
        validation = await session.validate(executed);
      } finally {
        session.close();
      }
      const postcondition =
        validation.status === "passed" &&
        (entry.postcondition === undefined ||
          (await entry.postcondition(page)));
      const labelValid =
        executed.status === "executed" && postcondition && rank >= 0;
      samples.push({
        sample_id: entry.id,
        split: entry.split,
        split_group: projected.origin,
        goal: safeText(entry.goal),
        browser_state: projected,
        candidates: retrieved.topCandidates.map(
          ({ element, score, signals }) => ({
            id: element.id,
            score,
            signals: { ...signals },
          }),
        ),
        training_action: labelValid
          ? { action: entry.action, target_id: expectedId }
          : null,
        label_source: labelValid
          ? "curated_action_and_deterministic_outcome"
          : "none",
        candidate_rank: rank < 0 ? null : rank + 1,
        execution_status: executed.status,
        execution_reason: executed.status === "failed" ? executed.reason : null,
        validation_status: validation.status,
        postcondition_passed: postcondition,
      });
      console.error(`${entry.id}: ${labelValid ? "validated" : "unvalidated"}`);
    } finally {
      await context.close();
    }
  }
  const ordered = samples.sort((a, b) =>
    a.sample_id.localeCompare(b.sample_id),
  );
  const contentSha256 = createHash("sha256")
    .update(ordered.map((sample) => JSON.stringify(sample)).join("\n"))
    .digest("hex");
  const assessment = assessResearchReadiness(ordered);
  const artifact = {
    schema_version: 0,
    source: "curated-public-practice-cases",
    corpus_version: Number(corpusVersion),
    content_sha256: contentSha256,
    samples: ordered,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        output,
        row_count: ordered.length,
        validated_labels: ordered.filter(
          (sample) => sample.training_action !== null,
        ).length,
        content_sha256: contentSha256,
        assessment,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
