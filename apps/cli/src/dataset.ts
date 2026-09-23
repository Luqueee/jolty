import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskRunResult } from "@jolty/core";
import type { DecisionInput } from "@jolty/decision/contract";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { parquetWriteFile } from "hyparquet-writer";
import type { FixtureDecisionLabel } from "../../../packages/browser/fixtures/scenarios.ts";

export const DATASET_SCHEMA_VERSION = 1;
export const SPLITS = {
  modal: "train",
  settings: "validation",
  "cookie-overlay": "train",
  "dynamic-results": "test",
  "ambiguous-row": "train",
} as const;

const sensitive =
  /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:password|secret|token|api[_ -]?key|authorization|bearer)\s*[:=]\s*\S+|\b(?:sk-[A-Za-z0-9_-]{12,}|[A-Fa-f0-9]{32,})\b)/i;
function safeText(value: string): string {
  if (sensitive.test(value))
    throw new Error("Dataset text may contain sensitive data");
  return value;
}

export type DatasetRow = ReturnType<typeof makeDatasetRow>;

export function makeDatasetRow(args: {
  fixtureId: keyof typeof SPLITS;
  stepIndex: number;
  input: DecisionInput;
  trace: TaskRunResult["steps"][number];
  label: FixtureDecisionLabel;
  expectedTargetId: string | null;
}) {
  const { fixtureId, stepIndex, input, trace, label, expectedTargetId } = args;
  if (input.goal !== label.goal || trace.goal_summary !== input.goal)
    throw new Error("Dataset goal and fixture label disagree");
  const url = new URL(input.state.url);
  if (
    url.origin !== "http://fixtures.jolty.test" ||
    url.pathname !== `/${fixtureId}` ||
    url.search ||
    url.hash
  )
    throw new Error("Dataset accepts only exact local fixture URLs");
  const browserState = {
    origin: url.origin,
    pathname: url.pathname,
    title: safeText(input.state.title),
    elements: input.state.elements.map((element) => ({
      id: element.id,
      role: element.role,
      name: safeText(element.name),
      text: safeText(element.text),
      visible: element.visible,
      enabled: element.enabled,
      editable: element.editable,
      has_value: element.hasValue ?? false,
      selected: element.selected ?? false,
    })),
  };
  const candidates = input.candidates.map(({ element, score, signals }) => ({
    id: element.id,
    score,
    signals: { ...signals },
  }));
  const fastDecision = trace.fast_decision ?? trace.decision;
  const validated =
    trace.final_outcome === "passed" &&
    trace.decision.status === "selected" &&
    trace.decision.action === label.action &&
    trace.decision.target_id === expectedTargetId;
  const selected = trace.decision.status === "selected" ? trace.decision : null;
  return {
    schema_version: DATASET_SCHEMA_VERSION,
    sample_id: `${fixtureId}:${stepIndex}`,
    fixture_id: fixtureId,
    split_group: fixtureId,
    split: SPLITS[fixtureId],
    goal: safeText(input.goal),
    fast_model: { ...trace.model },
    browser_state: browserState,
    candidates,
    fast_decision: fastDecision,
    fast_confidence:
      fastDecision.status === "selected" ? fastDecision.confidence : null,
    fallback_reason: trace.fallback_reason,
    teacher_decision: trace.fallback?.decision ?? null,
    teacher_model: trace.fallback?.model ?? null,
    executed_decision: trace.decision,
    validation_outcome: trace.validation_outcome,
    final_outcome: trace.final_outcome,
    label_status: validated ? ("validated" as const) : ("unvalidated" as const),
    label_source: validated
      ? ("fixture_action_and_deterministic_outcome" as const)
      : ("none" as const),
    training_action: validated
      ? { action: label.action, target_id: expectedTargetId }
      : null,
    proposed_action: selected
      ? { action: selected.action, target_id: selected.target_id }
      : null,
  };
}

export function validateDataset(rows: readonly DatasetRow[]): void {
  if (rows.length === 0) throw new Error("Dataset has no rows");
  const ids = new Set<string>();
  const splitGroups = new Map<string, string>();
  for (const row of rows) {
    if (row.schema_version !== DATASET_SCHEMA_VERSION)
      throw new Error("Unsupported dataset schema");
    if (ids.has(row.sample_id)) throw new Error("Duplicate dataset sample ID");
    ids.add(row.sample_id);
    if (
      row.split_group !== row.fixture_id ||
      row.split !== SPLITS[row.fixture_id]
    )
      throw new Error("Fixture split mismatch");
    if (
      splitGroups.has(row.split_group) &&
      splitGroups.get(row.split_group) !== row.split
    )
      throw new Error("Fixture leaked across splits");
    splitGroups.set(row.split_group, row.split);
    if (
      row.browser_state.origin !== "http://fixtures.jolty.test" ||
      row.browser_state.pathname !== `/${row.fixture_id}`
    )
      throw new Error("Non-fixture browser state");
    safeText(row.goal);
    safeText(row.browser_state.title);
    const elements = new Set<string>();
    for (const element of row.browser_state.elements) {
      if (!element.id || elements.has(element.id))
        throw new Error("Duplicate or empty browser element ID");
      elements.add(element.id);
      safeText(element.name);
      safeText(element.text);
    }
    const candidateIds = new Set<string>();
    for (const candidate of row.candidates) {
      if (!elements.has(candidate.id) || candidateIds.has(candidate.id))
        throw new Error("Invalid candidate ID");
      candidateIds.add(candidate.id);
      if (
        !Number.isFinite(candidate.score) ||
        Object.values(candidate.signals).some(
          (score) => !Number.isFinite(score),
        )
      )
        throw new Error("Invalid retrieval score");
    }
    for (const decision of [
      row.fast_decision,
      row.teacher_decision,
      row.executed_decision,
    ]) {
      if (
        decision?.status === "selected" &&
        decision.target_id !== null &&
        !candidateIds.has(decision.target_id)
      )
        throw new Error("Decision target is not a candidate");
    }
    if (
      row.fast_confidence !== null &&
      (!Number.isFinite(row.fast_confidence) ||
        row.fast_confidence < 0 ||
        row.fast_confidence > 1)
    )
      throw new Error("Invalid fast confidence");
    if (
      (row.label_status === "validated") !== (row.training_action !== null) ||
      (row.label_status === "validated") !==
        (row.label_source === "fixture_action_and_deterministic_outcome") ||
      (row.training_action !== null && row.final_outcome !== "passed")
    )
      throw new Error("Invalid label provenance");
  }
}

const columns = [
  "schema_version",
  "sample_id",
  "fixture_id",
  "split_group",
  "split",
  "goal",
  "fast_model",
  "browser_state",
  "candidates",
  "fast_decision",
  "fast_confidence",
  "fallback_reason",
  "teacher_decision",
  "teacher_model",
  "executed_decision",
  "validation_outcome",
  "final_outcome",
  "label_status",
  "label_source",
  "training_action",
  "proposed_action",
] as const;

export async function writeDataset(
  rows: readonly DatasetRow[],
  directory: string,
) {
  validateDataset(rows);
  const ordered = [...rows].sort((a, b) =>
    a.sample_id.localeCompare(b.sample_id),
  );
  const checksum = createHash("sha256")
    .update(ordered.map((row) => JSON.stringify(row)).join("\n"))
    .digest("hex");
  await mkdir(directory, { recursive: true });
  const parquetPath = join(directory, "traces.parquet");
  const temporary = `${parquetPath}.tmp`;
  try {
    const encode = (row: DatasetRow, name: (typeof columns)[number]) => {
      const value = row[name];
      return value === null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : value;
    };
    parquetWriteFile({
      filename: temporary,
      columnData: columns.map((name) =>
        name === "schema_version"
          ? {
              name,
              type: "INT32" as const,
              data: ordered.map((row) => row.schema_version),
            }
          : {
              name,
              type: "STRING" as const,
              data: ordered.map((row) => String(encode(row, name))),
            },
      ),
      kvMetadata: [
        { key: "jolty_schema_version", value: String(DATASET_SCHEMA_VERSION) },
      ],
    });
    const readback = await parquetReadObjects({
      file: await asyncBufferFromFile(temporary),
    });
    if (readback.length !== ordered.length)
      throw new Error("Parquet readback row count failed");
    for (const [index, row] of readback.entries()) {
      const expected = ordered[index];
      if (!expected) throw new Error("Parquet readback missing row");
      for (const name of columns) {
        const encoded = encode(expected, name);
        if (
          row[name] !== (name === "schema_version" ? encoded : String(encoded))
        )
          throw new Error(`Parquet readback failed for ${name}`);
      }
    }
    await rename(temporary, parquetPath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  const manifest = {
    schema_version: DATASET_SCHEMA_VERSION,
    row_count: ordered.length,
    validated_labels: ordered.filter((row) => row.label_status === "validated")
      .length,
    splits: Object.fromEntries(
      Object.entries(SPLITS).map(([id, split]) => [id, split]),
    ),
    content_sha256: checksum,
    parquet_file: "traces.parquet",
  };
  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}
