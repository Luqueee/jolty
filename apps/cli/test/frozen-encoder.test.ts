import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  calibrateTemperature,
  type EncodedSample,
  probabilities,
  selectThreshold,
  selectTrainableSamples,
  trainHead,
} from "../src/research/frozen-encoder.ts";
import {
  type ResearchSample,
  readResearchCorpus,
} from "../src/research/research-corpus-reader.ts";

test("rejects a changed research corpus digest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jolty-research-"));
  try {
    const path = join(directory, "corpus.json");
    await writeFile(
      path,
      JSON.stringify({
        schema_version: 0,
        content_sha256: "wrong",
        samples: [{ sample_id: "changed" }],
      }),
    );
    await expect(readResearchCorpus(path)).rejects.toThrow(/checksum/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fits only training examples and calibrates on validation", () => {
  const train: EncodedSample = {
    sample_id: "train",
    split: "train",
    labelIndex: 1,
    options: [
      { id: "wrong", action: "click", features: [0, 1] },
      { id: "right", action: "click", features: [1, 0] },
    ],
  };
  const validation = {
    ...train,
    sample_id: "validation",
    split: "validation" as const,
  };
  expect(() => trainHead([train, validation])).toThrow(/training samples only/);
  const weights = trainHead([train]);
  expect(probabilities(weights, train.options)[1]).toBeGreaterThan(0.5);
  expect(() => calibrateTemperature([train], weights)).toThrow(
    /validation samples only/,
  );
  const temperature = calibrateTemperature([validation], weights);
  expect(temperature).toBeGreaterThan(0);
  expect(selectThreshold([validation], weights, temperature)).toBe(0);
});

test("can freeze global action intercepts without freezing candidate features", () => {
  const sample: EncodedSample = {
    sample_id: "click-train",
    split: "train",
    labelIndex: 1,
    options: [
      { id: "wrong", action: "type", features: [0, 1, 0, 0, 1] },
      { id: "right", action: "click", features: [1, 0, 1, 0, 0] },
    ],
  };
  const weights = trainHead([sample], false);
  expect(weights[0]).toBeGreaterThan(0);
  expect(weights.slice(-3)).toEqual([0, 0, 0]);
  expect(trainHead([sample]).slice(-3)).not.toEqual([0, 0, 0]);
});

test("excludes unsupported training actions without hiding evaluation mismatches", () => {
  const makeSample = (
    sampleId: string,
    split: ResearchSample["split"],
    role: string,
    action: "select" | "click",
  ): ResearchSample => ({
    sample_id: sampleId,
    split,
    split_group: "example",
    goal: "Select an option",
    browser_state: {
      origin: "https://example.test",
      pathname: "/",
      title: "Example",
      elements: [
        {
          id: "e1",
          role,
          name: "Options",
          text: "",
          editable: false,
          visible: true,
          enabled: true,
          has_value: false,
          selected: false,
        },
      ],
    },
    candidates: [
      {
        id: "e1",
        score: 1,
        signals: {
          exactMatch: 0,
          normalizedMatch: 0,
          labelMatch: 0,
          textMatch: 0,
          keywordOverlap: 0,
          roleCompatibility: 0,
          elementState: 0,
        },
      },
    ],
    training_action: { action, target_id: "e1" },
  });
  const supported = makeSample("native", "train", "combobox", "select");
  const unsupported = makeSample("multiple", "train", "listbox", "select");
  expect(selectTrainableSamples([supported, unsupported])).toEqual({
    selected: [supported],
    excludedTrainIds: ["multiple"],
  });
  expect(() =>
    selectTrainableSamples([
      makeSample("held-out", "test", "listbox", "select"),
    ]),
  ).toThrow(/Unsupported evaluation label for held-out/);
  const nativeMultiple = makeSample(
    "native-multiple",
    "train",
    "listbox",
    "select",
  );
  const nativeElement = nativeMultiple.browser_state.elements[0];
  if (!nativeElement) throw new Error("Missing native select fixture");
  nativeElement.native_select = true;
  expect(selectTrainableSamples([nativeMultiple])).toEqual({
    selected: [nativeMultiple],
    excludedTrainIds: [],
  });
});
