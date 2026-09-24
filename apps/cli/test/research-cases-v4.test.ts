import { expect, test } from "vitest";
import { researchCasesV4 } from "../src/research/cases/research-cases-v4.ts";

test("keeps the fifth corpus test origins disjoint from earlier splits", () => {
  const ids = researchCasesV4.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  const origins = new Map<string, Set<string>>();
  for (const entry of researchCasesV4) {
    const url = new URL(entry.url);
    expect(url.protocol).toBe("https:");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    const splits = origins.get(url.origin) ?? new Set<string>();
    splits.add(entry.split);
    origins.set(url.origin, splits);
  }
  expect([...origins.values()].every((splits) => splits.size === 1)).toBe(true);
  expect(origins.get("https://testing.qaautomationlabs.com")).toEqual(
    new Set(["test"]),
  );
  expect(origins.get("https://practicetestautomation.com")).toEqual(
    new Set(["test"]),
  );
  for (const oldTest of [
    "https://the-internet.herokuapp.com",
    "https://todomvc.com",
    "https://www.saucedemo.com",
    "https://www.selenium.dev",
    "https://www.qa-practice.com",
    "https://playground.go-bigger.de",
    "https://www.testtrack.org",
    "https://webdriveruniversity.com",
    "https://lastest.cloud",
    "https://qaplayground.com",
  ])
    expect(origins.has(oldTest)).toBe(false);
});
