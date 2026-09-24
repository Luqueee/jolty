import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type BrowserState, extractBrowserState } from "@jolty/browser";
import { chromium } from "playwright";
import { executeAction } from "../../../../packages/executor/src/execute-action.ts";
import { filterCandidates } from "../../../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../../../packages/retrieval/src/candidate-retrieval.ts";
import { ValidationSession } from "../../../../packages/validator/src/validate-action.ts";
import { targetId } from "../../benchmarks/public-site-flows.ts";
import { projectBrowserLayaV2State } from "./browser-laya-v2-projection.ts";
import { researchCasesForVersion } from "./catalog.ts";
import { assessResearchReadiness } from "./dataset-readiness.ts";
import { selectDevelopmentCases } from "./development-cases.ts";
import { safeResearchText } from "./research-text.ts";
import { splitByOrigin } from "./sources.ts";

const corpusVersion = process.env.JOLTY_RESEARCH_CORPUS_VERSION ?? "0";
const developmentIds =
  process.env.JOLTY_RESEARCH_DEV_CASE_IDS?.split(",").filter(Boolean);
const browserLayaV2 = process.env.JOLTY_RESEARCH_BROWSER_LAYA_V2 === "1";
if (browserLayaV2 && !developmentIds)
  throw new Error("Browser Laya v2 projection is development-only");
const catalog = researchCasesForVersion(corpusVersion);
const validationRecapture = browserLayaV2
  ? catalog.filter(
      (entry) =>
        developmentIds?.includes(entry.id) && entry.split === "validation",
    )
  : [];
if (
  browserLayaV2 &&
  (validationRecapture.length !== developmentIds?.length ||
    new Set(developmentIds).size !== developmentIds.length)
)
  throw new Error("Browser Laya v2 recapture needs unique validation case IDs");
const cases = developmentIds
  ? browserLayaV2
    ? validationRecapture
    : selectDevelopmentCases(catalog, developmentIds)
  : catalog;
const output =
  process.argv[2] ?? `artifacts/research-corpus-v${corpusVersion}.json`;

if (developmentIds) {
  if (output === `artifacts/research-corpus-v${corpusVersion}.json`)
    throw new Error("Development collection needs a separate output path");
}

function projectState(state: BrowserState) {
  const url = new URL(state.url);
  if (url.search || url.hash)
    throw new Error("Research collection requires a query-free observation");
  return {
    origin: url.origin,
    pathname: url.pathname,
    title: safeResearchText(state.title),
    elements: state.elements.map((element) => ({
      id: element.id,
      role: element.role,
      name: safeResearchText(element.name),
      text: safeResearchText(element.text),
      visible: element.visible,
      enabled: element.enabled,
      editable: element.editable,
      has_value: element.hasValue ?? false,
      selected: element.selected ?? false,
      ...(element.value !== undefined ? { native_select: true } : {}),
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
  const rejected: { sample_id: string; reason: string }[] = [];
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
      const projected = browserLayaV2
        ? projectBrowserLayaV2State(state)
        : projectState(state);
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
        failure_modes: entry.failureModes ?? [],
        goal: safeResearchText(entry.goal),
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
    } catch (error) {
      if (!developmentIds) throw error;
      const message = error instanceof Error ? error.message : "Unknown error";
      rejected.push({
        sample_id: entry.id,
        reason: /target|locator|strict mode/i.test(message)
          ? "ambiguous_or_unidentifiable_target"
          : "collection_or_validation_error",
      });
      console.error(`${entry.id}: rejected (${rejected.at(-1)?.reason})`);
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
    ...(developmentIds ? { rejected } : {}),
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
        ...(developmentIds ? { rejected } : {}),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
