import { extractBrowserState } from "@jolty/browser";
import { executeAction } from "@jolty/executor";
import { bindStepIntent } from "@jolty/executor/bind-step-intent";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
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

test("validates an input change and distinguishes action from validation failure", async () => {
  const page = await fixture("login");
  try {
    const before = (await extractBrowserState(page)).state;
    const email = before.elements.find(({ name }) => name === "Email");
    expect(email).toBeDefined();
    const failedActionSession = await ValidationSession.start(page, before, [
      { kind: "input_value_changed", targetId: email?.id ?? "" },
    ]);
    const failedAction = await executeAction(page, before, {
      action: "click",
      targetId: "e999",
    });
    expect(await failedActionSession.validate(failedAction)).toMatchObject({
      status: "action_failed",
      action_reason: "invalid_target",
      checks: [],
    });

    const session = await ValidationSession.start(page, before, [
      {
        kind: "input_value_changed",
        targetId: email?.id ?? "",
        expectedValue: "person@example.test",
      },
      { kind: "no_console_errors" },
      { kind: "no_http_failures" },
    ]);
    const binding = bindStepIntent(
      before,
      { action: "type", targetId: email?.id },
      {
        goal: "Enter the email address",
        values: [
          {
            action: "type",
            target: { role: "textbox", name: "Email" },
            value: "person@example.test",
          },
        ],
      },
    );
    expect(binding.status).toBe("ready");
    if (binding.status !== "ready") throw new Error("Expected a bound step");
    const action = await executeAction(page, before, binding.command);
    const result = await session.validate(action);
    expect(result.status).toBe("passed");
    expect(result.checks.map(({ passed }) => passed)).toEqual([
      true,
      true,
      true,
    ]);
    expect(result.validation_ms).toBeGreaterThanOrEqual(0);

    const unchanged = (await extractBrowserState(page)).state;
    const wrongSession = await ValidationSession.start(page, unchanged, [
      {
        kind: "input_value_changed",
        targetId: email?.id ?? "",
        expectedValue: "other@example.test",
      },
    ]);
    const done = await executeAction(page, unchanged, { action: "done" });
    expect(await wrongSession.validate(done)).toMatchObject({
      status: "validation_failed",
      checks: [{ kind: "input_value_changed", passed: false }],
    });
  } finally {
    await page.close();
  }
});

test("validates element appearance, disappearance, and expected text", async () => {
  const page = await fixture("modal");
  try {
    const before = (await extractBrowserState(page)).state;
    const open = before.elements.find(({ name }) => name === "Open dialog");
    const appeared = await ValidationSession.start(page, before, [
      { kind: "element_appeared", role: "dialog", name: "Confirmation" },
    ]);
    const opened = await executeAction(page, before, {
      action: "click",
      targetId: open?.id,
    });
    expect((await appeared.validate(opened)).status).toBe("passed");

    const dialogState = (await extractBrowserState(page)).state;
    const confirm = dialogState.elements.find(({ name }) => name === "Confirm");
    const closed = await ValidationSession.start(page, dialogState, [
      { kind: "element_disappeared", role: "dialog", name: "Confirmation" },
      { kind: "text_visible", text: "Confirmed" },
    ]);
    const confirmed = await executeAction(page, dialogState, {
      action: "click",
      targetId: confirm?.id,
    });
    expect((await closed.validate(confirmed)).status).toBe("passed");
  } finally {
    await page.close();
  }
});

test("validates URL navigation", async () => {
  const page = await fixture("redirect");
  try {
    const before = (await extractBrowserState(page)).state;
    const button = before.elements.find(({ name }) => name === "Continue");
    const session = await ValidationSession.start(page, before, [
      { kind: "url_changed", to: fixtureUrl("redirected") },
      { kind: "text_visible", text: "Destination reached" },
    ]);
    const action = await executeAction(page, before, {
      action: "click",
      targetId: button?.id,
    });
    expect((await session.validate(action)).status).toBe("passed");
  } finally {
    await page.close();
  }
});

test("validates a delayed fixture across click and wait steps", async () => {
  const page = await fixture("dynamic-results");
  try {
    const before = (await extractBrowserState(page)).state;
    const load = before.elements.find(({ name }) => name === "Load report");
    const ready = await ValidationSession.start(page, before, [
      { kind: "element_appeared", role: "button", name: "Open report" },
      { kind: "text_visible", text: "Report ready" },
    ]);
    const clicked = await executeAction(page, before, {
      action: "click",
      targetId: load?.id,
    });
    expect(clicked.status).toBe("executed");

    const waitingState = (await extractBrowserState(page)).state;
    const waited = await executeAction(page, waitingState, { action: "wait" });
    expect((await ready.validate(waited)).status).toBe("passed");
  } finally {
    await page.close();
  }
});

test("captures successful requests, auth cookie, console errors, and HTTP failures", async () => {
  const page = await fixture("logout");
  try {
    const successUrl = "http://fixtures.jolty.test/api/success";
    const failureUrl = "http://fixtures.jolty.test/api/failure";
    await page.route(successUrl, (route) =>
      route.fulfill({ status: 200, body: "ok" }),
    );
    await page.route(failureUrl, (route) =>
      route.fulfill({ status: 500, body: "failed" }),
    );
    await page.setContent(`
      <button id="success">Succeed</button><button id="failure">Fail</button>
      <script>
        document.querySelector('#success').onclick = () => {
          document.cookie = 'session=ready; path=/';
          fetch('/api/success');
        };
        document.querySelector('#failure').onclick = () => {
          console.error('fixture error');
          fetch('/api/failure');
        };
      </script>
    `);
    const before = (await extractBrowserState(page)).state;
    const success = before.elements.find(({ name }) => name === "Succeed");
    const succeeded = await ValidationSession.start(page, before, [
      { kind: "request_succeeded", url: successUrl },
      { kind: "authenticated", cookieName: "session" },
      { kind: "no_console_errors" },
      { kind: "no_http_failures" },
    ]);
    const finished = page.waitForEvent(
      "requestfinished",
      (request) => request.url() === successUrl,
    );
    const successAction = await executeAction(page, before, {
      action: "click",
      targetId: success?.id,
    });
    await finished;
    expect((await succeeded.validate(successAction)).status).toBe("passed");

    const after = (await extractBrowserState(page)).state;
    const failure = after.elements.find(({ name }) => name === "Fail");
    const failing = await ValidationSession.start(page, after, [
      { kind: "no_console_errors" },
      { kind: "no_http_failures" },
    ]);
    const responded = page.waitForResponse(failureUrl);
    const failureAction = await executeAction(page, after, {
      action: "click",
      targetId: failure?.id,
    });
    await responded;
    const failureResult = await failing.validate(failureAction);
    expect(failureResult.status).toBe("validation_failed");
    expect(failureResult.checks.map(({ passed }) => passed)).toEqual([
      false,
      false,
    ]);
  } finally {
    await page.close();
  }
});
