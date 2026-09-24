import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  calibrateTemperature,
  type EncodedSample,
  probabilities,
  selectThreshold,
  trainHead,
} from "../src/frozen-encoder.ts";
import { readResearchCorpus } from "../src/research-corpus-reader.ts";

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
