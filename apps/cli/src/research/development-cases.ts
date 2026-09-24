import type { ResearchCase } from "./cases/research-cases.ts";

export function selectDevelopmentCases(
  catalog: readonly ResearchCase[],
  requestedIds: readonly string[],
): ResearchCase[] {
  if (
    requestedIds.length === 0 ||
    new Set(requestedIds).size !== requestedIds.length
  )
    throw new Error("Development case IDs must be nonempty and unique");
  const cases = catalog.filter((entry) => requestedIds.includes(entry.id));
  if (
    cases.length !== requestedIds.length ||
    cases.some((entry) => entry.split !== "train")
  )
    throw new Error("Development case IDs must be existing train cases");
  return cases;
}
