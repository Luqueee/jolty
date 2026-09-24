import { readFile, writeFile } from "node:fs/promises";
import { verifyBlindComparisonPlan } from "./blind-comparison-plan.ts";
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
  decision_ms: number;
  failure?: string;
}

const plan = await verifyBlindComparisonPlan();
const labels = JSON.parse(
  await readFile("artifacts/blind-once/labels.json", "utf8"),
) as Label[];
if (plan.status !== "calibration-frozen" || labels.length !== 72)
  throw new Error("Comparison plan or blind labels changed");
const percentile = (values: number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? 0;
};
const results = [];
for (const model of plan.models) {
  const scores = JSON.parse(
    await readFile(`artifacts/blind-once/${model.id}.json`, "utf8"),
  ) as Score[];
  if (
    scores.length !== labels.length ||
    new Set(scores.map((row) => row.id)).size !== labels.length ||
    scores.some((row, index) => row.id !== labels[index]?.id)
  )
    throw new Error(`${model.id}: missing or reordered blind scores`);
  const decisions = labels.map((label, index) => {
    const row = scores[index];
    if (!row || !Number.isFinite(row.decision_ms))
      throw new Error(`${model.id}: invalid score for ${label.id}`);
    let choice = -1;
    let confidence = 0;
    if (model.id === "heuristic") {
      if (!Number.isFinite(row.margin))
        throw new Error(`${model.id}: missing margin for ${label.id}`);
      choice = 0;
      confidence = row.margin as number;
    } else if (!row.failure) {
      if (
        !Array.isArray(row.probabilities) ||
        row.probabilities.length !== label.candidate_count
      )
        throw new Error(`${model.id}: invalid options for ${label.id}`);
      const probabilities =
        model.probability_stage === "raw"
          ? scaledProbabilities(row.probabilities, model.policy.temperature)
          : row.probabilities;
      if (
        probabilities.some(
          (value: number) => !Number.isFinite(value) || value < 0,
        )
      )
        throw new Error(`${model.id}: invalid probability for ${label.id}`);
      confidence = Math.max(...probabilities);
      choice = probabilities.indexOf(confidence);
    }
    const correct = choice === label.target_index;
    const accepted = !row.failure && confidence >= model.policy.threshold;
    return {
      id: label.id,
      flow_id: label.flow_id,
      site: label.site,
      action: label.action,
      correct,
      accepted,
      confidence,
      selected_index: choice,
      expected_index: label.target_index,
      failure: row.failure ?? null,
      decision_ms: row.decision_ms,
    };
  });
  const flows = new Set(labels.map((label) => label.flow_id));
  results.push({
    model: model.id,
    decisions: decisions.length,
    exact: decisions.filter((row) => row.correct).length,
    accepted: decisions.filter((row) => row.accepted).length,
    accepted_correct: decisions.filter((row) => row.accepted && row.correct)
      .length,
    accepted_wrong: decisions.filter((row) => row.accepted && !row.correct)
      .length,
    high_confidence_wrong:
      model.id === "heuristic"
        ? null
        : decisions.filter((row) => row.confidence >= 0.9 && !row.correct)
            .length,
    reference_flows_completed: [...flows].filter((flow) =>
      decisions
        .filter((row) => row.flow_id === flow)
        .every((row) => row.accepted && row.correct),
    ).length,
    model_process_ms: {
      p50: percentile(
        decisions.map((row) => row.decision_ms),
        0.5,
      ),
      p95: percentile(
        decisions.map((row) => row.decision_ms),
        0.95,
      ),
      p99: percentile(
        decisions.map((row) => row.decision_ms),
        0.99,
      ),
    },
    by_site: Object.fromEntries(
      [...new Set(labels.map((label) => label.site))].map((site) => {
        const siteRows = decisions.filter((row) => row.site === site);
        return [
          site,
          {
            total: siteRows.length,
            exact: siteRows.filter((row) => row.correct).length,
            accepted: siteRows.filter((row) => row.accepted).length,
            accepted_wrong: siteRows.filter(
              (row) => row.accepted && !row.correct,
            ).length,
          },
        ];
      }),
    ),
    details: decisions,
  });
}
const teacherRows = JSON.parse(
  await readFile("artifacts/blind-once/teacher.json", "utf8"),
) as {
  id: string;
  selected_index: number;
  action: string | null;
  decision_ms: number;
  failure: string | null;
}[];
if (
  teacherRows.length !== labels.length ||
  teacherRows.some((row, index) => row.id !== labels[index]?.id)
)
  throw new Error("Teacher scores are missing or reordered");
const teacherCorrect = teacherRows.map(
  (row, index) =>
    row.selected_index === labels[index]?.target_index &&
    row.action === labels[index]?.action &&
    row.failure === null,
);
const report = {
  blind_manifest_sha256: plan.blind_manifest_sha256,
  decision_count: labels.length,
  reference_flow_count: new Set(labels.map((label) => label.flow_id)).size,
  target_recall_at_10:
    "72/72 by blind-case admission; not a population retrieval estimate",
  task_metric:
    "All decisions accepted and exactly correct on a validated reference trajectory; no model-driven live recovery",
  latency_limit:
    "Model-process timing only; full paired pipeline, RSS, and VRAM still required",
  models: results,
  teacher: {
    model: plan.teacher.model,
    role: plan.teacher.role,
    exact: teacherCorrect.filter(Boolean).length,
    failures: teacherRows.filter((row) => row.failure !== null).length,
    reference_flows_completed: [
      ...new Set(labels.map((label) => label.flow_id)),
    ].filter((flow) =>
      labels.every(
        (label, index) => label.flow_id !== flow || teacherCorrect[index],
      ),
    ).length,
    decision_ms: {
      p50: percentile(
        teacherRows.map((row) => row.decision_ms),
        0.5,
      ),
      p95: percentile(
        teacherRows.map((row) => row.decision_ms),
        0.95,
      ),
    },
  },
};
await writeFile(
  "artifacts/blind-once/report.json",
  `${JSON.stringify(report, null, 2)}\n`,
  {
    flag: "wx",
  },
);
console.log(
  JSON.stringify(
    results.map(
      ({
        model,
        exact,
        accepted,
        accepted_wrong,
        reference_flows_completed,
      }) => ({
        model,
        exact,
        accepted,
        accepted_wrong,
        reference_flows_completed,
      }),
    ),
  ),
);
