import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const sha256 = (content: Buffer) =>
  createHash("sha256").update(content).digest("hex");

export async function verifyBlindComparisonPlan() {
  const plan = JSON.parse(
    await readFile("research/blind_sites/comparison-plan.json", "utf8"),
  );
  if (plan.status !== "calibration-frozen" || plan.models?.length !== 5)
    throw new Error("The blind comparison plan is not frozen");
  const manifest = await readFile("research/blind_sites/manifest.json");
  if (sha256(manifest) !== plan.blind_manifest_sha256)
    throw new Error("The blind manifest changed after calibration freeze");
  for (const [path, expected] of Object.entries(plan.scoring_source_sha256)) {
    if (sha256(await readFile(path)) !== expected)
      throw new Error(`Frozen scorer source changed: ${path}`);
  }
  for (const model of plan.models) {
    for (const artifact of [model.artifact, model.adapter, model.checkpoint]) {
      if (artifact && sha256(await readFile(artifact.path)) !== artifact.sha256)
        throw new Error(`Frozen model artifact changed: ${model.id}`);
    }
  }
  return plan;
}
