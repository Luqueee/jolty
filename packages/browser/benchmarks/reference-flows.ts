import type { Page } from "playwright";
import { fixtureUrl } from "../fixtures/routes.ts";

// Human-written actions provide an execution-time reference for each fixture.
export const referenceFlows: Record<string, (page: Page) => Promise<void>> = {
  async login(page) {
    await page
      .getByRole("textbox", { name: "Email" })
      .fill("person@example.test");
    await page
      .getByRole("textbox", { name: "Password" })
      .fill("correct-password");
    await page.getByRole("button", { name: "Sign in" }).click();
  },
  async logout(page) {
    await page.getByRole("button", { name: "Log out" }).click();
  },
  async settings(page) {
    await page.getByRole("textbox", { name: "Display name" }).fill("New name");
    await page.getByRole("button", { name: "Save profile" }).click();
  },
  async form(page) {
    await page.getByRole("textbox", { name: "Message" }).fill("Hello");
    await page.getByRole("button", { name: "Send" }).click();
  },
  async validation(page) {
    await page.getByRole("textbox", { name: "Email" }).fill("invalid");
    await page.getByRole("button", { name: "Submit" }).click();
  },
  async modal(page) {
    await page.getByRole("button", { name: "Open dialog" }).click();
    await page
      .getByRole("dialog", { name: "Confirmation" })
      .getByRole("button", { name: "Confirm" })
      .click();
  },
  async select(page) {
    await page.getByRole("combobox", { name: "Language" }).selectOption("es");
  },
  async tabs(page) {
    await page.getByRole("tab", { name: "Security" }).click();
  },
  async redirect(page) {
    await Promise.all([
      page.waitForURL(fixtureUrl("redirected")),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
  },
  async delayed(page) {
    await page.getByRole("button", { name: "Load result" }).click();
  },
  async duplicate(page) {
    await page
      .getByRole("region", { name: "Pro plan" })
      .getByRole("button", { name: "Continue" })
      .click();
  },
  async scroll(page) {
    const target = page.getByRole("button", { name: "Reach target" });
    await target.scrollIntoViewIfNeeded();
    await target.click();
  },
  async "cookie-overlay"(page) {
    await page
      .getByRole("dialog", { name: "Cookie notice" })
      .getByRole("button", { name: "Accept cookies" })
      .click();
    await page.getByRole("button", { name: "Continue to checkout" }).click();
  },
  async "dynamic-results"(page) {
    await page.getByRole("button", { name: "Load report" }).click();
    await page.getByRole("button", { name: "Open report" }).click();
  },
  async "ambiguous-row"(page) {
    await page
      .getByRole("row")
      .filter({ hasText: "Approved" })
      .getByRole("button", { name: "Open" })
      .click();
  },
};
