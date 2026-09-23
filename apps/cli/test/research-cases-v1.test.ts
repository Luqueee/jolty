import { expect, test } from "vitest";
import { researchCasesV1 } from "../src/research-cases-v1.ts";

test("keeps the revised corpus and fresh test origins separate", () => {
  const ids = researchCasesV1.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  const origins = new Map<string, Set<string>>();
  for (const entry of researchCasesV1) {
    const url = new URL(entry.url);
    expect(url.protocol).toBe("https:");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    const splits = origins.get(url.origin) ?? new Set<string>();
    splits.add(entry.split);
    origins.set(url.origin, splits);
  }
  expect([...origins.values()].every((splits) => splits.size === 1)).toBe(true);
  expect(origins.get("https://qapracticehub.com")).toEqual(new Set(["train"]));
  expect(origins.get("https://practice-automation.com")).toEqual(
    new Set(["validation"]),
  );
  expect(origins.get("https://www.qa-practice.com")).toEqual(new Set(["test"]));
  expect(origins.get("https://playground.go-bigger.de")).toEqual(
    new Set(["test"]),
  );
  for (const legacyOrigin of [
    "https://the-internet.herokuapp.com",
    "https://todomvc.com",
    "https://www.saucedemo.com",
    "https://www.selenium.dev",
  ])
    expect(origins.has(legacyOrigin)).toBe(false);
});
