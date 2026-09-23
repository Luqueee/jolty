import { extractBrowserState } from "@jolty/browser";
import { executeAction } from "@jolty/executor";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
import {
  completeStepTrace,
  createStepTraceDraft,
} from "../../telemetry/src/step-draft.ts";
import { ValidationSession } from "../src/validate-action.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function fixture(id: string): Promise<Page> {
  const page = await browser.newPage();
  await installFixtureRoutes(page);
  await page.goto(fixtureUrl(id));
  return page;
}

function traceDraft(
  pageUrl: string,
  elementCount: number,
  candidates: { id: string; role: string }[],
  selectedTargetId: string,
  execution: Awaited<ReturnType<typeof executeAction>>,
) {
  return createStepTraceDraft({
    runId: "controlled-failures",
    stepId: "step-1",
    goalSummary: "Complete the fixture goal",
    model: { name: "controlled-selection", version: "1" },
    page: { url: pageUrl, elementCount },
    candidates: candidates.map(({ id, role }) => ({ id, role, score: 0 })),
    decision: {
      status: "selected",
      action: "click",
      targetId: selectedTargetId,
      confidence: 1,
    },
    execution,
    timing: {
      state_extraction_ms: 0,
      candidate_filter_ms: 0,
      candidate_retrieval_ms: 0,
      tokenization_ms: null,
      inference_ms: null,
      decision_latency_ms: 0,
    },
  });
}

test("a wrong but actionable target fails its goal check and remains identifiable in the trace", async () => {
  const page = await fixture("duplicate");
  try {
    await page.goto(`${fixtureUrl("duplicate")}?session=private-token`);
    const state = (await extractBrowserState(page)).state;
    const buttons = state.elements.filter(({ name }) => name === "Continue");
    expect(buttons).toHaveLength(2);
    const session = await ValidationSession.start(page, state, [
      { kind: "text_visible", text: "Pro plan chosen" },
    ]);
    const execution = await executeAction(page, state, {
      action: "click",
      targetId: buttons[0].id,
    });
    expect(execution.status).toBe("executed");
    const validation = await session.validate(execution);
    const trace = completeStepTrace(
      traceDraft(
        state.url,
        state.elements.length,
        buttons,
        buttons[0].id,
        execution,
      ),
      validation,
    );
    expect(await page.getByRole("status").textContent()).toBe(
      "Free plan chosen",
    );
    expect(trace).toMatchObject({
      candidates: [
        { id: buttons[0].id, role: "button" },
        { id: buttons[1].id, role: "button" },
      ],
      decision: { target_id: buttons[0].id },
      execution: { status: "executed" },
      validation: {
        status: "validation_failed",
        checks: [{ kind: "text_visible", passed: false }],
      },
      final_outcome: "validation_failed",
    });
    expect(JSON.stringify(trace)).not.toContain("private-token");
    expect(trace.browser_state.pathname).toBe("/duplicate");
  } finally {
    await page.close();
  }
});

test("a stale observation fails before clicking and records action failure", async () => {
  const page = await fixture("modal");
  try {
    const state = (await extractBrowserState(page)).state;
    const open = state.elements.find(({ name }) => name === "Open dialog");
    expect(open).toBeDefined();
    if (!open) throw new Error("Open dialog button is missing");
    const session = await ValidationSession.start(page, state, [
      { kind: "element_appeared", role: "dialog", name: "Confirmation" },
    ]);
    await page
      .getByRole("button", { name: "Open dialog" })
      .evaluate((element) => {
        element.textContent = "Open changed dialog";
      });
    const execution = await executeAction(page, state, {
      action: "click",
      targetId: open.id,
    });
    const validation = await session.validate(execution);
    const trace = completeStepTrace(
      traceDraft(state.url, state.elements.length, [open], open.id, execution),
      validation,
    );
    expect(
      await page.getByRole("dialog", { name: "Confirmation" }).isVisible(),
    ).toBe(false);
    expect(trace).toMatchObject({
      execution: { status: "failed", reason: "stale_state" },
      validation: { status: "action_failed", checks: [] },
      final_outcome: "action_failed",
    });
  } finally {
    await page.close();
  }
});

test("an executed expected action with an unmet assertion records validation failure", async () => {
  const page = await fixture("modal");
  try {
    const state = (await extractBrowserState(page)).state;
    const open = state.elements.find(({ name }) => name === "Open dialog");
    expect(open).toBeDefined();
    if (!open) throw new Error("Open dialog button is missing");
    const session = await ValidationSession.start(page, state, [
      { kind: "element_appeared", role: "dialog", name: "Confirmation" },
      { kind: "text_visible", text: "Confirmed" },
    ]);
    const execution = await executeAction(page, state, {
      action: "click",
      targetId: open.id,
    });
    const validation = await session.validate(execution);
    const trace = completeStepTrace(
      traceDraft(state.url, state.elements.length, [open], open.id, execution),
      validation,
    );
    expect(
      await page.getByRole("dialog", { name: "Confirmation" }).isVisible(),
    ).toBe(true);
    expect(trace).toMatchObject({
      execution: { status: "executed" },
      validation: {
        status: "validation_failed",
        checks: [
          { kind: "element_appeared", passed: true },
          { kind: "text_visible", passed: false },
        ],
      },
      final_outcome: "validation_failed",
    });
  } finally {
    await page.close();
  }
});
