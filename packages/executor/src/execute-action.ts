import {
  type BrowserState,
  extractBrowserState,
  INTERACTIVE_SELECTOR,
  type InteractiveElement,
} from "@jolty/browser";
import type { ElementHandle, Page } from "playwright";

export interface BrowserAction {
  action: string;
  targetId?: string;
  value?: string;
}

export type ExecutionFailureReason =
  | "unsupported_action"
  | "invalid_target"
  | "stale_state"
  | "missing_value"
  | "no_history"
  | "playwright_error";

export type ExecutionResult =
  | {
      status: "executed";
      action: string;
      targetId?: string;
      action_ms: number;
    }
  | {
      status: "failed";
      action: string;
      targetId?: string;
      reason: ExecutionFailureReason;
      message: string;
      action_ms: number;
    };

const targetActions = new Set(["click", "type", "select"]);
const noTargetActions = new Set(["scroll", "wait", "back", "done"]);

async function resolveTarget(
  page: Page,
  state: BrowserState,
  targetId: string,
): Promise<{
  handle?: ElementHandle;
  reason?: ExecutionFailureReason;
  message?: string;
}> {
  const observed = state.elements.find((element) => element.id === targetId);
  if (
    !observed ||
    typeof observed.domIndex !== "number" ||
    !Number.isInteger(observed.domIndex) ||
    observed.domIndex < 0 ||
    !observed.visible ||
    !observed.enabled
  )
    return {
      reason: "invalid_target",
      message: `Target ${targetId} is not an actionable observed element`,
    };
  const current = (await extractBrowserState(page)).state;
  if (current.url !== state.url || current.title !== state.title)
    return {
      reason: "stale_state",
      message: "Page context changed since observation",
    };
  const refreshed = current.elements.find((element) => element.id === targetId);
  if (!refreshed || JSON.stringify(refreshed) !== JSON.stringify(observed))
    return {
      reason: "stale_state",
      message: `Target ${targetId} changed since observation`,
    };
  let handle: ElementHandle | null;
  try {
    handle = await page
      .locator(INTERACTIVE_SELECTOR)
      .nth(observed.domIndex)
      .elementHandle({ timeout: 1_000 });
  } catch {
    return {
      reason: "stale_state",
      message: `Target ${targetId} detached before execution`,
    };
  }
  if (!handle)
    return {
      reason: "stale_state",
      message: `Target ${targetId} detached before execution`,
    };
  return { handle };
}

export async function executeAction(
  page: Page,
  state: BrowserState,
  command: BrowserAction,
): Promise<ExecutionResult> {
  const start = performance.now();
  const fail = (
    reason: ExecutionFailureReason,
    message: string,
  ): ExecutionResult => ({
    status: "failed",
    action: command.action,
    targetId: command.targetId,
    reason,
    message,
    action_ms: performance.now() - start,
  });
  if (
    !targetActions.has(command.action) &&
    !noTargetActions.has(command.action)
  )
    return fail("unsupported_action", `Unsupported action: ${command.action}`);
  if (targetActions.has(command.action) && !command.targetId)
    return fail("invalid_target", `${command.action} requires a target ID`);
  if (noTargetActions.has(command.action) && command.targetId)
    return fail(
      "invalid_target",
      `${command.action} does not accept a target ID`,
    );
  if (
    (command.action === "type" || command.action === "select") &&
    typeof command.value !== "string"
  )
    return fail("missing_value", `${command.action} requires a string value`);
  if (page.url() !== state.url)
    return fail("stale_state", "Page URL changed since observation");

  let handle: ElementHandle | undefined;
  try {
    if (targetActions.has(command.action)) {
      const target = await resolveTarget(
        page,
        state,
        command.targetId as string,
      );
      if (!target.handle)
        return fail(
          target.reason ?? "invalid_target",
          target.message ?? "Target could not be resolved",
        );
      handle = target.handle;
      const observed = state.elements.find(
        (element) => element.id === command.targetId,
      ) as InteractiveElement;
      if (command.action === "type" && !observed.editable)
        return fail(
          "invalid_target",
          `Target ${command.targetId} is not editable`,
        );
      if (command.action === "select") {
        const tagName = await handle.evaluate(
          (element) => (element as Element).tagName,
        );
        if (tagName !== "SELECT")
          return fail(
            "invalid_target",
            `Target ${command.targetId} is not a native select`,
          );
      }
      if (command.action === "click") await handle.click({ timeout: 3_000 });
      else if (command.action === "type")
        await handle.fill(command.value as string, { timeout: 3_000 });
      else
        await handle.selectOption(command.value as string, { timeout: 3_000 });
    } else if (command.action === "scroll") {
      await page.mouse.wheel(
        0,
        Math.round((page.viewportSize()?.height ?? 750) * 0.8),
      );
    } else if (command.action === "wait") {
      await page.waitForTimeout(100);
    } else if (command.action === "back") {
      if (
        !(await page.goBack({ waitUntil: "domcontentloaded", timeout: 3_000 }))
      )
        return fail("no_history", "No previous page in history");
    }
    return {
      status: "executed",
      action: command.action,
      targetId: command.targetId,
      action_ms: performance.now() - start,
    };
  } catch (error) {
    return fail(
      "playwright_error",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await handle?.dispose();
  }
}
