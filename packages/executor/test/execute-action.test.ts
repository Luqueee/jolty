import { extractBrowserState, INTERACTIVE_SELECTOR } from "@jolty/browser";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
import { executeAction } from "../src/execute-action.ts";

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

test("resolves observed DOM indices without piercing shadow roots", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <div id="host"></div>
      <button id="target">Target</button>
      <script>
        const shadow = document.querySelector('#host').attachShadow({ mode: 'open' });
        shadow.innerHTML = '<button id="shadow-button">Shadow</button>';
        document.querySelector('#target').addEventListener('click', () => {
          document.querySelector('#target').textContent = 'Clicked';
        });
      </script>
    `);
    const state = (await extractBrowserState(page)).state;
    const target = state.elements.find((element) => element.name === "Target");
    expect(target?.domIndex).toBe(0);
    expect(
      await page.locator(INTERACTIVE_SELECTOR).first().getAttribute("id"),
    ).toBe("shadow-button");
    expect(
      await executeAction(page, state, {
        action: "click",
        targetId: target?.id,
      }),
    ).toMatchObject({ status: "executed" });
    expect(await page.locator("#target").textContent()).toBe("Clicked");
  } finally {
    await page.close();
  }
});

test("executes typed, selected, and clicked model targets", async () => {
  const login = await fixture("login");
  const select = await fixture("select");
  const duplicate = await fixture("duplicate");
  try {
    const loginState = (await extractBrowserState(login)).state;
    const email = loginState.elements.find(
      (element) => element.name === "Email",
    );
    expect(email).toBeDefined();
    const typed = await executeAction(login, loginState, {
      action: "type",
      targetId: email?.id,
      value: "person@example.test",
    });
    expect(typed.status).toBe("executed");
    expect(typed.action_ms).toBeGreaterThanOrEqual(0);
    expect(
      await login.getByRole("textbox", { name: "Email" }).inputValue(),
    ).toBe("person@example.test");

    const selectState = (await extractBrowserState(select)).state;
    const language = selectState.elements.find(
      (element) => element.name === "Language",
    );
    const selected = await executeAction(select, selectState, {
      action: "select",
      targetId: language?.id,
      value: "es",
    });
    expect(selected.status).toBe("executed");
    expect(await select.getByRole("status").textContent()).toBe(
      "Language: Spanish",
    );

    const duplicateState = (await extractBrowserState(duplicate)).state;
    const buttons = duplicateState.elements.filter(
      (element) => element.name === "Continue",
    );
    expect(buttons).toHaveLength(2);
    const clicked = await executeAction(duplicate, duplicateState, {
      action: "click",
      targetId: buttons[1].id,
    });
    expect(clicked.status).toBe("executed");
    expect(await duplicate.getByRole("status").textContent()).toBe(
      "Pro plan chosen",
    );
  } finally {
    await Promise.all([login.close(), select.close(), duplicate.close()]);
  }
});

test("executes bounded targetless actions", async () => {
  const scroll = await fixture("scroll");
  const delayed = await fixture("delayed");
  const redirect = await fixture("redirect");
  try {
    const scrollState = (await extractBrowserState(scroll)).state;
    const scrolled = await executeAction(scroll, scrollState, {
      action: "scroll",
    });
    expect(scrolled.status).toBe("executed");
    await expect
      .poll(() => scroll.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);

    await delayed.getByRole("button", { name: "Load result" }).click();
    const delayedState = (await extractBrowserState(delayed)).state;
    const waited = await executeAction(delayed, delayedState, {
      action: "wait",
    });
    expect(waited.status).toBe("executed");
    expect(await delayed.getByRole("status").textContent()).toBe("Loaded");

    await redirect.getByRole("button", { name: "Continue" }).click();
    await redirect.waitForURL(fixtureUrl("redirected"));
    const redirectedState = (await extractBrowserState(redirect)).state;
    const back = await executeAction(redirect, redirectedState, {
      action: "back",
    });
    expect(back.status).toBe("executed");
    expect(redirect.url()).toBe(fixtureUrl("redirect"));

    const doneState = (await extractBrowserState(redirect)).state;
    const done = await executeAction(redirect, doneState, { action: "done" });
    expect(done.status).toBe("executed");
    expect(redirect.url()).toBe(doneState.url);
  } finally {
    await Promise.all([scroll.close(), delayed.close(), redirect.close()]);
  }
});

test("rejects unsupported, invalid, and stale actions without acting", async () => {
  const page = await fixture("duplicate");
  try {
    const state = (await extractBrowserState(page)).state;
    const button = state.elements.find(
      (element) => element.name === "Continue",
    );
    expect(
      (
        await executeAction(page, state, {
          action: "evaluate",
          targetId: button?.id,
        })
      ).status,
    ).toBe("failed");
    expect(
      await executeAction(page, state, { action: "click", targetId: "e999" }),
    ).toMatchObject({ status: "failed", reason: "invalid_target" });
    expect(
      await executeAction(page, state, {
        action: "type",
        targetId: button?.id,
      }),
    ).toMatchObject({ status: "failed", reason: "missing_value" });
    expect(
      await executeAction(page, state, {
        action: "type",
        targetId: button?.id,
        value: "text",
      }),
    ).toMatchObject({ status: "failed", reason: "invalid_target" });
    expect(
      await executeAction(page, state, {
        action: "select",
        targetId: button?.id,
        value: "es",
      }),
    ).toMatchObject({ status: "failed", reason: "invalid_target" });
    expect(
      await executeAction(page, state, {
        action: "done",
        targetId: button?.id,
      }),
    ).toMatchObject({ status: "failed", reason: "invalid_target" });
    await page
      .getByRole("button", { name: "Continue" })
      .first()
      .evaluate((element) => {
        element.textContent = "Changed";
      });
    expect(
      await executeAction(page, state, {
        action: "click",
        targetId: button?.id,
      }),
    ).toMatchObject({ status: "failed", reason: "stale_state" });
    expect(await page.getByRole("status").textContent()).toBe("");
  } finally {
    await page.close();
  }
});
