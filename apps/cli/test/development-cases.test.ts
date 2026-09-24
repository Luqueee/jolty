import { describe, expect, it } from "vitest";
import { researchCasesForVersion } from "../src/research/catalog.ts";
import { selectDevelopmentCases } from "../src/research/development-cases.ts";

describe("development collection selection", () => {
  const catalog = researchCasesForVersion("9");

  it("selects only requested training cases", () => {
    expect(
      selectDevelopmentCases(catalog, [
        "playqa-login-email",
        "upex-basic-input",
      ]).map((entry) => entry.id),
    ).toEqual(["playqa-login-email", "upex-basic-input"]);
  });

  it("rejects unknown, duplicate, and reserved cases", () => {
    expect(() => selectDevelopmentCases(catalog, [])).toThrow();
    expect(() =>
      selectDevelopmentCases(catalog, [
        "playqa-login-email",
        "playqa-login-email",
      ]),
    ).toThrow();
    expect(() => selectDevelopmentCases(catalog, ["unknown-case"])).toThrow();
    const reserved = catalog.find((entry) => entry.split === "test");
    if (!reserved) throw new Error("The v9 catalog has no reserved cases");
    expect(() => selectDevelopmentCases(catalog, [reserved.id])).toThrow();
  });
});
