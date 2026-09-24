import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { scaledProbabilities } from "./choice-calibration.ts";

interface Label {
  id: string;
  flow_id: string;
  site: string;
  family: string;
  action: string;
  target_index: number;
  candidate_count: number;
}
interface Score {
  id: string;
  probabilities?: number[];
  margin?: number;
  decision_ms: number | null;
  failure?: string;
}
const digest = (source: Buffer) =>
  createHash("sha256").update(source).digest("hex");
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const manifestSource = await readFile("research/blind_sites_v2/manifest.json");
const plan = await read("research/blind_sites_v2/comparison-plan.json");
if (
  plan.status !== "calibration-frozen" ||
  plan.manifest_sha256 !== digest(manifestSource)
)
  throw new Error("Second blind plan changed");
const labels = (await read("artifacts/blind-v2-once/labels.json")) as Label[];
const observations = await read("artifacts/blind-v2-once/observations.json");
if (
  labels.length !== 17 ||
  observations.length !== labels.length ||
  labels.some(
    (label, index) =>
      label.id !== observations[index]?.sample_id ||
      observations[index]?.training_action !== null ||
      label.target_index < 0 ||
      label.target_index >= label.candidate_count,
  )
)
  throw new Error("Second blind observations or labels changed");
const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1] ?? null;
};
const modelResults = [];
for (const model of plan.models) {
  const rows = (await read(
    `artifacts/blind-v2-once/${model.id}.json`,
  )) as Score[];
  if (
    rows.length !== labels.length ||
    rows.some((row, index) => row.id !== labels[index]?.id)
  )
    throw new Error(`${model.id}: missing or reordered scores`);
  const decisions = labels.map((label, index) => {
    const row = rows[index];
    if (!row) throw new Error("Missing score row");
    let choice = -1;
    let confidence = 0;
    if (model.id === "heuristic") {
      if (!Number.isFinite(row.margin))
        throw new Error(`${label.id}: missing heuristic margin`);
      choice = 0;
      confidence = row.margin as number;
    } else if (!row.failure) {
      if (
        !Array.isArray(row.probabilities) ||
        row.probabilities.length !== label.candidate_count
      )
        throw new Error(`${model.id}:${label.id}: invalid probabilities`);
      const probabilities =
        model.probability_stage === "raw"
          ? scaledProbabilities(row.probabilities, model.policy.temperature)
          : row.probabilities;
      if (
        probabilities.some(
          (value: number) => !Number.isFinite(value) || value < 0,
        )
      )
        throw new Error(`${model.id}:${label.id}: invalid probability`);
      confidence = Math.max(...probabilities);
      choice = probabilities.indexOf(confidence);
    }
    return {
      id: label.id,
      site: label.site,
      family: label.family,
      flow_id: label.flow_id,
      selected_index: choice,
      expected_index: label.target_index,
      exact: choice === label.target_index,
      accepted: !row.failure && confidence >= model.policy.threshold,
      confidence,
      failure: row.failure ?? null,
      decision_ms: row.decision_ms,
    };
  });
  const timing = decisions.flatMap((row) =>
    row.decision_ms !== null && Number.isFinite(row.decision_ms)
      ? [row.decision_ms]
      : [],
  );
  modelResults.push({
    model: model.id,
    decisions: decisions.length,
    exact: decisions.filter((row) => row.exact).length,
    accepted_correct: decisions.filter((row) => row.accepted && row.exact)
      .length,
    accepted_wrong: decisions.filter((row) => row.accepted && !row.exact)
      .length,
    unscorable: decisions.filter((row) => row.failure).length,
    reference_flows_completed:
      new Set(labels.map((row) => row.flow_id)).size === 0
        ? 0
        : [...new Set(labels.map((row) => row.flow_id))].filter((flow) =>
            decisions
              .filter((row) => row.flow_id === flow)
              .every((row) => row.accepted && row.exact),
          ).length,
    process_ms: {
      p50: percentile(timing, 0.5),
      p95: percentile(timing, 0.95),
      p99: percentile(timing, 0.99),
    },
    by_site: Object.fromEntries(
      [...new Set(labels.map((row) => row.site))].map((site) => {
        const subset = decisions.filter((row) => row.site === site);
        return [
          site,
          {
            decisions: subset.length,
            exact: subset.filter((row) => row.exact).length,
            accepted_wrong: subset.filter((row) => row.accepted && !row.exact)
              .length,
          },
        ];
      }),
    ),
    details: decisions,
  });
}
const teacher = await read("artifacts/blind-v2-once/teacher.json");
if (
  teacher.length !== labels.length ||
  teacher.some(
    (row: { id: string }, index: number) => row.id !== labels[index]?.id,
  )
)
  throw new Error("Teacher rows changed");
const teacherExact = teacher.filter(
  (
    row: { selected_index: number; action: string; failure: string | null },
    index: number,
  ) =>
    row.failure === null &&
    row.selected_index === labels[index]?.target_index &&
    row.action === labels[index]?.action,
).length;
const report = {
  manifest_sha256: plan.manifest_sha256,
  plan_sha256: digest(
    await readFile("research/blind_sites_v2/comparison-plan.json"),
  ),
  observations_sha256: digest(
    await readFile("artifacts/blind-v2-once/observations.json"),
  ),
  labels_sha256: digest(await readFile("artifacts/blind-v2-once/labels.json")),
  target_recall_at_10: "17/17 by case admission; not a population estimate",
  metric_scope:
    "saved reference states; no model-driven browser run or recovery",
  incident:
    "Frozen v10s scorer raised RuntimeError on a singleton choice before output; all 17 rows contain a singleton question and are recorded unscorable without label-based adjustment",
  models: modelResults,
  teacher: {
    model: plan.teacher.model,
    exact: teacherExact,
    decisions: labels.length,
  },
};
await writeFile(
  "artifacts/blind-v2-once/comparison.json",
  `${JSON.stringify(report, null, 2)}\n`,
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    models: modelResults.map(
      ({
        model,
        exact,
        accepted_correct,
        accepted_wrong,
        unscorable,
        reference_flows_completed,
      }) => ({
        model,
        exact,
        accepted_correct,
        accepted_wrong,
        unscorable,
        reference_flows_completed,
      }),
    ),
    teacher_exact: teacherExact,
  }),
);
