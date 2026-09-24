import { expect, test } from "vitest";
import { newTrainCasesV7B } from "../src/research/cases/research-cases-v7-train-b.ts";

test("adds distinct training cases on two new HTTPS origins", () => {
  expect(newTrainCasesV7B).toHaveLength(24);
  expect(new Set(newTrainCasesV7B.map((entry) => entry.id)).size).toBe(24);
  const origins = new Set<string>();
  for (const entry of newTrainCasesV7B) {
    const url = new URL(entry.url);
    expect(entry.split).toBe("train");
    expect(url.protocol).toBe("https:");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(
      entry.postcondition ?? entry.step("test-target").checks.length,
    ).toBeTruthy();
    origins.add(url.origin);
  }
  expect(origins).toEqual(
    new Set([
      "https://testautomationpractice.blogspot.com",
      "https://letcode.in",
    ]),
  );
});
