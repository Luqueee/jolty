import {
  type BrowserState,
  extractBrowserState,
  INTERACTIVE_SELECTOR,
} from "@jolty/browser";
import type { ExecutionResult } from "@jolty/executor";
import type { ConsoleMessage, Page, Request, Response } from "playwright";

type Role = Parameters<Page["getByRole"]>[0];

export type ValidationCheck =
  | { kind: "url_changed"; to?: string }
  | { kind: "element_appeared"; role: Role; name: string }
  | { kind: "element_disappeared"; role: Role; name: string }
  | { kind: "input_value_changed"; targetId: string; expectedValue?: string }
  | { kind: "text_visible"; text: string }
  | { kind: "request_succeeded"; url: string }
  | { kind: "authenticated"; cookieName: string }
  | { kind: "no_console_errors" }
  | { kind: "no_http_failures" };

export interface CheckOutcome {
  kind: ValidationCheck["kind"];
  passed: boolean;
  message: string;
}

export type ValidationResult =
  | {
      status: "passed" | "validation_failed";
      checks: CheckOutcome[];
      validation_ms: number;
    }
  | {
      status: "action_failed";
      action_reason: string;
      checks: [];
      validation_ms: number;
    };

interface Baseline {
  inputValues: Map<string, string | null>;
  visibleElements: Map<number, boolean>;
  authCookies: Map<string, boolean>;
}

async function inputValue(
  page: Page,
  state: BrowserState,
  targetId: string,
): Promise<string | null> {
  const target = state.elements.find((element) => element.id === targetId);
  if (typeof target?.domIndex !== "number") return null;
  const locator = page.locator(INTERACTIVE_SELECTOR).nth(target.domIndex);
  return locator
    .evaluate(
      (element) => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        )
          return element.value;
        if (element instanceof HTMLElement && element.isContentEditable)
          return element.textContent ?? "";
        return null;
      },
      undefined,
      { timeout: 1_000 },
    )
    .catch(() => null);
}

export class ValidationSession {
  private readonly page: Page;
  private readonly before: BrowserState;
  private readonly checks: readonly ValidationCheck[];
  private readonly baseline: Baseline;
  private readonly preparationMs: number;
  private readonly requests: Request[] = [];
  private readonly failedRequests: Request[] = [];
  private readonly failedResponses: Response[] = [];
  private readonly consoleErrors: ConsoleMessage[] = [];
  private stopped = false;

  private constructor(
    page: Page,
    before: BrowserState,
    checks: readonly ValidationCheck[],
    baseline: Baseline,
    preparationMs: number,
  ) {
    this.page = page;
    this.before = before;
    this.checks = checks;
    this.baseline = baseline;
    this.preparationMs = preparationMs;
    page.on("requestfinished", this.onRequestFinished);
    page.on("requestfailed", this.onRequestFailed);
    page.on("response", this.onResponse);
    page.on("console", this.onConsole);
  }

  private readonly onRequestFinished = (request: Request): void => {
    this.requests.push(request);
  };
  private readonly onRequestFailed = (request: Request): void => {
    this.failedRequests.push(request);
  };
  private readonly onResponse = (response: Response): void => {
    if (response.status() >= 400) this.failedResponses.push(response);
  };
  private readonly onConsole = (message: ConsoleMessage): void => {
    if (message.type() === "error") this.consoleErrors.push(message);
  };

  static async start(
    page: Page,
    before: BrowserState,
    checks: readonly ValidationCheck[],
  ): Promise<ValidationSession> {
    const start = performance.now();
    if (checks.length === 0)
      throw new Error("At least one validation check is required");
    const baseline: Baseline = {
      inputValues: new Map(),
      visibleElements: new Map(),
      authCookies: new Map(),
    };
    for (const [index, check] of checks.entries()) {
      if (check.kind === "input_value_changed")
        baseline.inputValues.set(
          check.targetId,
          await inputValue(page, before, check.targetId),
        );
      else if (
        check.kind === "element_appeared" ||
        check.kind === "element_disappeared"
      )
        baseline.visibleElements.set(
          index,
          await page
            .getByRole(check.role, { name: check.name, exact: true })
            .isVisible(),
        );
      else if (check.kind === "authenticated")
        baseline.authCookies.set(
          check.cookieName,
          (await page.context().cookies(before.url)).some(
            ({ name }) => name === check.cookieName,
          ),
        );
    }
    return new ValidationSession(
      page,
      before,
      checks,
      baseline,
      performance.now() - start,
    );
  }

  private async evaluate(
    check: ValidationCheck,
    index: number,
  ): Promise<CheckOutcome> {
    const outcome = (passed: boolean, message: string): CheckOutcome => ({
      kind: check.kind,
      passed,
      message,
    });
    if (check.kind === "url_changed") {
      const matches = (url: string) =>
        url !== this.before.url && (check.to === undefined || url === check.to);
      if (!matches(this.page.url())) {
        try {
          await this.page.waitForURL((url) => matches(url.href), {
            timeout: 1_500,
            waitUntil: "commit",
          });
        } catch {
          // A missing or wrong navigation is reported as a failed check.
        }
      }
      const passed = matches(this.page.url());
      return outcome(
        passed,
        passed ? "URL changed as expected" : "URL did not change as expected",
      );
    }
    if (
      check.kind === "element_appeared" ||
      check.kind === "element_disappeared"
    ) {
      const wasVisible = this.baseline.visibleElements.get(index) ?? false;
      const isVisible = await this.page
        .getByRole(check.role, { name: check.name, exact: true })
        .isVisible();
      const passed =
        check.kind === "element_appeared"
          ? !wasVisible && isVisible
          : wasVisible && !isVisible;
      return outcome(
        passed,
        passed
          ? "Element visibility changed as expected"
          : "Element visibility did not change as expected",
      );
    }
    if (check.kind === "input_value_changed") {
      const observed = this.before.elements.find(
        (element) => element.id === check.targetId,
      );
      const currentState = (await extractBrowserState(this.page)).state;
      const currentElement = currentState.elements.find(
        (element) => element.id === check.targetId,
      );
      if (
        !observed ||
        !currentElement ||
        observed.domIndex !== currentElement.domIndex ||
        observed.role !== currentElement.role ||
        observed.name !== currentElement.name
      )
        return outcome(false, "Input target changed since observation");
      const previous = this.baseline.inputValues.get(check.targetId) ?? null;
      const current = await inputValue(this.page, this.before, check.targetId);
      const passed =
        previous !== null &&
        current !== null &&
        current !== previous &&
        (check.expectedValue === undefined || current === check.expectedValue);
      return outcome(
        passed,
        passed
          ? "Input value changed as expected"
          : "Input value did not change as expected",
      );
    }
    if (check.kind === "text_visible") {
      const visible = await this.page
        .getByText(check.text, { exact: true })
        .isVisible();
      return outcome(
        visible,
        visible ? "Expected text is visible" : "Expected text is not visible",
      );
    }
    if (check.kind === "request_succeeded") {
      if (!this.requests.some((request) => request.url() === check.url)) {
        try {
          await this.page.waitForEvent("requestfinished", {
            predicate: (request) => request.url() === check.url,
            timeout: 500,
          });
        } catch {
          // A missing request is reported as a failed check below.
        }
      }
      const matching = this.requests.filter(
        (request) => request.url() === check.url,
      );
      const responses = await Promise.all(
        matching.map((request) => request.response()),
      );
      const passed = responses.some(
        (response) =>
          response && response.status() >= 200 && response.status() < 300,
      );
      return outcome(
        passed,
        passed
          ? "Request completed successfully"
          : "No successful completed request was observed",
      );
    }
    if (check.kind === "authenticated") {
      const existed = this.baseline.authCookies.get(check.cookieName) ?? false;
      const exists = (await this.page.context().cookies(this.page.url())).some(
        ({ name }) => name === check.cookieName,
      );
      const passed = !existed && exists;
      return outcome(
        passed,
        passed
          ? "Authentication cookie appeared"
          : "Authentication cookie did not appear",
      );
    }
    if (check.kind === "no_console_errors")
      return outcome(
        this.consoleErrors.length === 0,
        this.consoleErrors.length === 0
          ? "No console errors observed"
          : `${this.consoleErrors.length} console error(s) observed`,
      );
    const failures = this.failedRequests.length + this.failedResponses.length;
    return outcome(
      failures === 0,
      failures === 0
        ? "No HTTP failures observed"
        : `${failures} HTTP failure(s) observed`,
    );
  }

  async validate(action: ExecutionResult): Promise<ValidationResult> {
    const start = performance.now();
    if (this.stopped) throw new Error("Validation session already closed");
    try {
      if (action.status === "failed")
        return {
          status: "action_failed",
          action_reason: action.reason,
          checks: [],
          validation_ms: this.preparationMs + performance.now() - start,
        };
      const outcomes: CheckOutcome[] = [];
      for (const [index, check] of this.checks.entries())
        outcomes.push(await this.evaluate(check, index));
      return {
        status: outcomes.every(({ passed }) => passed)
          ? "passed"
          : "validation_failed",
        checks: outcomes,
        validation_ms: this.preparationMs + performance.now() - start,
      };
    } finally {
      this.close();
    }
  }

  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.page.off("requestfinished", this.onRequestFinished);
    this.page.off("requestfailed", this.onRequestFailed);
    this.page.off("response", this.onResponse);
    this.page.off("console", this.onConsole);
  }
}
