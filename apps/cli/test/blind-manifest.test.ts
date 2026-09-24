import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localBlindFlows } from "../src/research/blind-cases.ts";
import { publicBlindFlows } from "../src/research/blind-public-cases.ts";

const flows = [...localBlindFlows, ...publicBlindFlows];
const manifest = JSON.parse(
  readFileSync(
    new URL("../../../research/blind_sites/manifest.json", import.meta.url),
    "utf8",
  ),
);

describe("frozen blind manifest", () => {
  it("has six sites, three or more families, and two substantial flows per site", () => {
    expect(manifest.status).toBe("frozen");
    expect(new Set(flows.map((flow) => flow.site)).size).toBe(6);
    expect(
      new Set(flows.map((flow) => flow.family)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(flows).toHaveLength(12);
    for (const site of new Set(flows.map((flow) => flow.site))) {
      expect(flows.filter((flow) => flow.site === site)).toHaveLength(2);
    }
    expect(flows.every((flow) => flow.steps.length >= 3)).toBe(true);
    expect(flows.reduce((count, flow) => count + flow.steps.length, 0)).toBe(
      72,
    );
  });

  it("binds every case to an independent declared postcondition", () => {
    expect(
      manifest.sites.map((site: { id: string }) => site.id).sort(),
    ).toEqual([...new Set(flows.map((flow) => flow.site))].sort());
    for (const flow of flows) {
      const recorded = manifest.sites
        .find((site: { id: string }) => site.id === flow.site)
        ?.flows.find((item: { id: string }) => item.id === flow.id);
      expect(
        recorded?.steps.map(
          (step: { id: string; action: string; check: unknown }) => ({
            id: step.id,
            action: step.action,
            check: step.check,
          }),
        ),
      ).toEqual(
        flow.steps.map((step) => ({
          id: `${flow.id}:${step.id}`,
          action: step.action,
          check: step.check,
        })),
      );
    }
    const referenceStates = manifest.sites.flatMap(
      (site: {
        flows: {
          steps: {
            state_sha256: string;
            browser_state_sha256: string;
            reference_candidate_rank: number;
          }[];
        }[];
      }) => site.flows.flatMap((flow) => flow.steps),
    );
    expect(
      new Set(
        referenceStates.map(
          (step: { state_sha256: string }) => step.state_sha256,
        ),
      ).size,
    ).toBe(72);
    expect(
      new Set(
        referenceStates.map(
          (step: { browser_state_sha256: string }) => step.browser_state_sha256,
        ),
      ).size,
    ).toBe(56);
    expect(
      referenceStates.every(
        (step: { reference_candidate_rank: number }) =>
          step.reference_candidate_rank >= 1 &&
          step.reference_candidate_rank <= 10,
      ),
    ).toBe(true);
    expect(
      manifest.sites
        .filter((site: { provenance: string }) =>
          site.provenance.startsWith("public"),
        )
        .every((site: { exposure: string }) => site.exposure === "unknown"),
    ).toBe(true);
  });
});
