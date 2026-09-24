import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskRunResult } from "@jolty/core";
import type { DecisionInput } from "@jolty/decision/contract";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { afterEach, expect, test } from "vitest";
import {
  makeDatasetRow,
  validateDataset,
  writeDataset,
} from "../src/dataset.ts";
import { readDataset } from "../src/dataset-reader.ts";
import { assessResearchReadiness } from "../src/dataset-readiness.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories)
    await rm(directory, { recursive: true, force: true });
  directories.length = 0;
});

function sample(overrides?: {
  goal?: string;
  name?: string;
  value?: string;
  action?: string;
  outcome?: string;
}) {
  const input = {
    goal: overrides?.goal ?? "Open confirmation dialog",
    state: {
      url: "http://fixtures.jolty.test/modal",
      title: "Modal",
      elements: [
        {
          id: "e1",
          role: "button",
          name: overrides?.name ?? "Open",
          text: "Open",
          visible: true,
          enabled: true,
          editable: false,
          value: overrides?.value,
        },
      ],
    },
    candidates: [
      {
        element: {
          id: "e1",
          role: "button",
          name: "Open",
          text: "Open",
          visible: true,
          enabled: true,
          editable: false,
        },
        score: 1,
        signals: {
          exactMatch: 1,
          normalizedMatch: 0,
          labelMatch: 0,
          textMatch: 0,
          keywordOverlap: 0,
          roleCompatibility: 1,
          elementState: 1,
        },
        sourceIndex: 0,
      },
    ],
  } satisfies DecisionInput;
  const trace = {
    goal_summary: input.goal,
    model: { name: "Laya", version: "test-revision" },
    decision: {
      status: "selected",
      action: overrides?.action ?? "click",
      target_id: "e1",
      confidence: 0.8,
    },
    fast_decision: null,
    fallback: null,
    fallback_reason: null,
    final_outcome: overrides?.outcome ?? "passed",
    validation_outcome: "passed",
  } as TaskRunResult["steps"][number];
  return makeDatasetRow({
    fixtureId: "modal",
    stepIndex: 1,
    input,
    trace,
    label: {
      phase: "initial",
      goal: input.goal,
      action: "click",
      targetSelector: "#open",
      expectedAfterAction: { kind: "element_visible", selector: "dialog" },
    },
    expectedTargetId: "e1",
  });
}

test("exports Parquet with validated provenance and no form values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jolty-dataset-"));
  directories.push(directory);
  const row = sample({ value: "private field contents" });
  const manifest = await writeDataset([row], directory);
  expect(manifest.validated_labels).toBe(1);
  const parquet = await parquetReadObjects({
    file: await asyncBufferFromFile(join(directory, "traces.parquet")),
  });
  expect(parquet).toHaveLength(1);
  expect(parquet[0]?.label_status).toBe("validated");
  expect(parquet[0]?.schema_version).toBe(1);
  expect(parquet[0]?.teacher_decision).toBe("");
  expect(JSON.parse(String(parquet[0]?.browser_state)).elements[0].name).toBe(
    "Open",
  );
  expect(
    (await readFile(join(directory, "traces.parquet"))).includes(
      Buffer.from("private field contents"),
    ),
  ).toBe(false);
  expect(await readDataset(directory)).toEqual([row]);
});

test("rejects a dataset with a changed manifest digest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jolty-dataset-"));
  directories.push(directory);
  await writeDataset([sample()], directory);
  const path = join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.content_sha256 = "invalid";
  await writeFile(path, JSON.stringify(manifest));
  await expect(readDataset(directory)).rejects.toThrow(/checksum/);
});

test("does not train on a passing but incorrectly selected action", () => {
  const row = sample({ action: "wait" });
  expect(row.label_status).toBe("unvalidated");
  expect(row.training_action).toBeNull();
  validateDataset([row]);
});

test("rejects sensitive text, duplicates, and invalid candidates", () => {
  expect(() => sample({ name: "person@example.test" })).toThrow(/sensitive/);
  const row = sample();
  expect(() => validateDataset([row, row])).toThrow(/Duplicate/);
  const invalid = {
    ...row,
    candidates: row.candidates.map((candidate) => ({
      ...candidate,
      id: "missing",
    })),
  };
  expect(() => validateDataset([invalid])).toThrow(/candidate/);
});

test("blocks encoder evaluation when labels, action coverage, and sites are missing", () => {
  const train = sample();
  const validation = {
    ...sample(),
    sample_id: "settings:1",
    split_group: "settings" as const,
    fixture_id: "settings" as const,
    split: "validation" as const,
    training_action: { action: "type" as const, target_id: "e1" },
  };
  const result = assessResearchReadiness([train, validation]);
  expect(result.ready_for_encoder_experiment).toBe(false);
  expect(result.unseen_evaluation_actions).toEqual(["type"]);
  expect(result.reasons).toContain("Test split has no unseen site origin");
  const repeated = assessResearchReadiness([
    train,
    { ...train, sample_id: "modal:repeated" },
  ]);
  expect(repeated.summary.train.validated_labels).toBe(2);
  expect(repeated.summary.train.distinct_validated_decisions).toBe(1);
  const paraphrased = assessResearchReadiness([
    train,
    {
      ...train,
      sample_id: "modal:paraphrased",
      goal: "Show the confirmation dialog",
    },
  ]);
  expect(paraphrased.summary.train.distinct_validated_decisions).toBe(1);
  expect(result.reasons).toContain("Calibration site origin overlaps training");
  const overlappingTest = assessResearchReadiness([
    train,
    {
      ...train,
      sample_id: "dynamic-results:1",
      split: "test",
    },
  ]);
  expect(overlappingTest.reasons).toContain(
    "Held-out site origin overlaps training or calibration",
  );
  for (const origin of [
    "https://www.saucedemo.com",
    "https://www.qa-practice.com",
    "https://playground.go-bigger.de",
    "https://www.testtrack.org",
    "https://webdriveruniversity.com",
    "https://lastest.cloud",
    "https://qaplayground.com",
    "https://testing.qaautomationlabs.com",
    "https://practicetestautomation.com",
  ]) {
    const reservedTest = assessResearchReadiness([
      {
        ...train,
        browser_state: { ...train.browser_state, origin },
      },
    ]);
    expect(reservedTest.reasons).toContain(
      "Reserved public test origin appears outside test split",
    );
  }
});

test("requires repeated evidence for every evaluated action", () => {
  const base = sample();
  const train = ["one", "two"].map((name) => ({
    ...base,
    browser_state: {
      ...base.browser_state,
      elements: [{ id: name }],
    },
  }));
  const validation = {
    ...base,
    split: "validation" as const,
    browser_state: { ...base.browser_state, origin: "https://validation.test" },
  };
  const result = assessResearchReadiness([base, ...train, validation]);
  expect(result.reasons).toContain(
    "Fewer than 2 calibration decisions for click",
  );
  const weakTrain = assessResearchReadiness([base, validation]);
  expect(weakTrain.reasons).toContain(
    "Fewer than 3 training decisions for click",
  );
});
