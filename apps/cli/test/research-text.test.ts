import { expect, it } from "vitest";
import { safeResearchText } from "../src/research/research-text.ts";

it("redacts public-page email addresses and preserves the credential guard", () => {
  expect(safeResearchText("Contact john@example.com here")).toBe(
    "Contact [email address] here",
  );
  expect(() => safeResearchText("token=unsafe-value")).toThrow(
    /sensitive data/,
  );
});
