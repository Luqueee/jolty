import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const digest = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const manifestPath = "research/blind_sites_v2/manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.status !== "frozen-unscored")
  throw new Error("Second blind manifest is not frozen and unscored");
const oldPlan = JSON.parse(
  await readFile("research/blind_sites/comparison-plan.json", "utf8"),
);
const v2PolicyPath = "artifacts/laya-browser-validation-policy-v2.json";
const v2Policy = JSON.parse(await readFile(v2PolicyPath, "utf8"));
if (
  v2Policy.status !== "validation-frozen" ||
  v2Policy.score_sha256 !==
    (await digest("artifacts/laya-browser-validation-scores-v2.json")) ||
  manifest.calibration_freeze_sha256 !==
    (await digest("research/laya_browser/v2-validation-freeze.json"))
)
  throw new Error("Browser Laya v2 validation policy changed");

const sourcePaths = [
  "apps/cli/src/research/freeze-blind-v2-plan.ts",
  "apps/cli/src/research/capture-blind-v2-once.ts",
  "apps/cli/src/research/score-blind-v2-models.ts",
  "apps/cli/src/research/score-blind-v2-teacher.ts",
  "apps/cli/src/research/choice-calibration.ts",
  "research/laya_browser/serialize_v2.py",
  "research/laya_browser/score_observations_v2.py",
  "research/peft/score_observations.py",
] as const;
const sourceSha256 = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (path) => [path, await digest(path)]),
  ),
);
const models = await Promise.all(
  oldPlan.models.map(
    async (model: {
      id: string;
      artifact: { path: string; sha256: string };
      [key: string]: unknown;
    }) => {
      if (model.id !== "laya-browser-v10s") return model;
      return {
        ...model,
        artifact: { path: v2PolicyPath, sha256: await digest(v2PolicyPath) },
        policy: v2Policy.policy,
        serializer: v2Policy.serializer,
      };
    },
  ),
);
for (const model of models)
  if (model.artifact.sha256 !== (await digest(model.artifact.path)))
    throw new Error(`Model policy changed: ${model.id}`);
const plan = {
  schema: 1,
  status: "calibration-frozen",
  purpose: "one-time comparison on the second independent blind set",
  manifest_sha256: await digest(manifestPath),
  calibration_freeze_sha256: manifest.calibration_freeze_sha256,
  decision_contract: oldPlan.decision_contract,
  test_capture_policy:
    "Fresh Chromium context per flow; one unlabeled Top 10 observation per validated reference step; abort before writing on retrieval or validator failure",
  models,
  teacher: {
    ...oldPlan.teacher,
    scorer: "apps/cli/src/research/score-blind-v2-teacher.ts",
  },
  resource_targets: oldPlan.resource_targets,
  source_sha256: sourceSha256,
};
await writeFile(
  "research/blind_sites_v2/comparison-plan.json",
  `${JSON.stringify(plan, null, 2)}\n`,
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    output: "research/blind_sites_v2/comparison-plan.json",
    models: models.map((model) => model.id),
  }),
);
