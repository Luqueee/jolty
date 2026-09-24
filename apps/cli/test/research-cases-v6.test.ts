import { expect, test } from "vitest";
import { researchCasesV6 } from "../src/research-cases-v6.ts";

test("reserves two new test origins without split overlap", () => {
  const ids = researchCasesV6.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  const origins = new Map<string, Set<string>>();
  for (const entry of researchCasesV6) {
    const url = new URL(entry.url);
    expect(url.protocol).toBe("https:");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    const splits = origins.get(url.origin) ?? new Set<string>();
    splits.add(entry.split);
    origins.set(url.origin, splits);
  }
  expect([...origins.values()].every((splits) => splits.size === 1)).toBe(true);
  expect(origins.get("https://www.stepcampus.in")).toEqual(new Set(["test"]));
  expect(origins.get("https://www.sreenidhirajakrishnan.com")).toEqual(
    new Set(["test"]),
  );
  expect(
    researchCasesV6.filter((entry) => entry.split === "test"),
  ).toHaveLength(20);
});
