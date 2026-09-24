import { expect, test } from "vitest";
import { researchCasesV7 } from "../src/research/cases/research-cases-v7.ts";

test("keeps v7 origins disjoint across splits", () => {
  expect(researchCasesV7).toHaveLength(158);
  expect(new Set(researchCasesV7.map(({ id }) => id)).size).toBe(158);
  const byOrigin = new Map<string, Set<string>>();
  for (const entry of researchCasesV7) {
    const url = new URL(entry.url);
    expect(url.protocol).toBe("https:");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    const splits = byOrigin.get(url.origin) ?? new Set<string>();
    splits.add(entry.split);
    byOrigin.set(url.origin, splits);
  }
  expect([...byOrigin.values()].every((splits) => splits.size === 1)).toBe(
    true,
  );
  expect(researchCasesV7.filter(({ split }) => split === "train")).toHaveLength(
    90,
  );
  expect(
    researchCasesV7.filter(({ split }) => split === "validation"),
  ).toHaveLength(47);
  expect(researchCasesV7.filter(({ split }) => split === "test")).toHaveLength(
    21,
  );
});
