import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { blindV2Cases } from "../src/research/blind-v2-cases.ts";

const digest = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

test("second blind manifest pins six independent origins and its reference source", async () => {
  const manifest = JSON.parse(
    await readFile("research/blind_sites_v2/manifest.json", "utf8"),
  );
  expect(manifest.status).toBe("frozen-unscored");
  expect(blindV2Cases).toHaveLength(6);
  expect(
    new Set(blindV2Cases.map((flow) => new URL(flow.url).origin)).size,
  ).toBe(6);
  expect(new Set(blindV2Cases.map((flow) => flow.family)).size).toBe(3);
  expect(blindV2Cases.reduce((sum, flow) => sum + flow.steps.length, 0)).toBe(
    17,
  );
  expect(manifest.sites.map((site: { id: string }) => site.id)).toEqual(
    blindV2Cases.map((flow) => flow.id),
  );
  expect(manifest.case_source_sha256).toBe(
    await digest("apps/cli/src/research/blind-v2-cases.ts"),
  );
  expect(manifest.reference_runner_sha256).toBe(
    await digest("apps/cli/src/research/replay-blind-v2-reference.ts"),
  );
  expect(manifest.calibration_freeze_sha256).toBe(
    await digest("research/laya_browser/v2-validation-freeze.json"),
  );
  const calibration = JSON.parse(
    await readFile("research/laya_browser/v2-validation-freeze.json", "utf8"),
  );
  for (const [path, expected] of Object.entries(calibration.source_sha256))
    expect(await digest(path)).toBe(expected);
  for (const site of manifest.sites)
    expect(site.source_sha256).toBe(
      await digest(`research/blind_sites_v2/${site.source}`),
    );
});
