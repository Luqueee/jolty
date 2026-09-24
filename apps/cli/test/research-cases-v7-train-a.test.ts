import { expect, test } from "vitest";
import { trainCasesV7A } from "../src/research-cases-v7-train-a.ts";

test("adds 25 training decisions from two new HTTPS origins", () => {
  expect(trainCasesV7A).toHaveLength(25);
  expect(new Set(trainCasesV7A.map(({ id }) => id)).size).toBe(25);
  expect(new Set(trainCasesV7A.map(({ action }) => action))).toEqual(
    new Set(["click", "type", "select"]),
  );
  expect(
    new Set(
      trainCasesV7A.map(({ url }) => {
        const parsed = new URL(url);
        expect(parsed.protocol).toBe("https:");
        expect(parsed.search).toBe("");
        expect(parsed.hash).toBe("");
        return parsed.origin;
      }),
    ),
  ).toEqual(
    new Set([
      "https://demo.automationtesting.in",
      "https://www.letskodeit.com",
    ]),
  );
  expect(trainCasesV7A.every(({ split }) => split === "train")).toBe(true);
});
