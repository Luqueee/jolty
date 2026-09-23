import { expect, test } from "vitest";
import { researchCasesV2 } from "../src/research-cases-v2.ts";

test("reserves two untouched origins for the third corpus", () => {
  const ids = researchCasesV2.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  const origins = new Map<string, Set<string>>();
  for (const entry of researchCasesV2) {
    const url = new URL(entry.url);
    expect(url.protocol).toBe("https:");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    const splits = origins.get(url.origin) ?? new Set<string>();
    splits.add(entry.split);
    origins.set(url.origin, splits);
  }
  expect([...origins.values()].every((splits) => splits.size === 1)).toBe(true);
  expect(origins.get("https://www.testtrack.org")).toEqual(new Set(["test"]));
  expect(origins.get("https://webdriveruniversity.com")).toEqual(
    new Set(["test"]),
  );
  for (const oldTest of [
    "https://the-internet.herokuapp.com",
    "https://todomvc.com",
    "https://www.saucedemo.com",
    "https://www.selenium.dev",
    "https://www.qa-practice.com",
    "https://playground.go-bigger.de",
  ])
    expect(origins.has(oldTest)).toBe(false);
});
