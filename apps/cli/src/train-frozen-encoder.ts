import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  calibrateTemperature,
  ENCODER_MODEL,
  ENCODER_REVISION,
  encodeSamples,
  FEATURE_VERSION,
  selectThreshold,
  summarize,
  trainHead,
} from "./frozen-encoder.ts";
import { readResearchCorpus } from "./research-corpus-reader.ts";

const corpusPath = process.argv[2] ?? "artifacts/research-corpus-v0.json";
const outputPath = process.argv[3] ?? "artifacts/frozen-encoder-v0.json";
const fitActionBias = process.env.JOLTY_FROZEN_ACTION_BIAS !== "0";
const { digest, samples } = await readResearchCorpus(corpusPath);
const start = performance.now();
const { encoded, uniqueTexts } = await encodeSamples(samples);
const encodingMs = performance.now() - start;
const train = encoded.filter((row) => row.split === "train");
const validation = encoded.filter((row) => row.split === "validation");
const test = encoded.filter((row) => row.split === "test");
const fitStart = performance.now();
const weights = trainHead(train, fitActionBias);
const fitMs = performance.now() - fitStart;
const temperature = calibrateTemperature(validation, weights);
const threshold = selectThreshold(validation, weights, temperature);
const head = {
  schema_version: 0,
  encoder_model: ENCODER_MODEL,
  encoder_revision: ENCODER_REVISION,
  encoder_dtype: "fp32",
  feature_version: FEATURE_VERSION,
  corpus_sha256: digest,
  train_ids_sha256: createHash("sha256")
    .update(train.map((row) => row.sample_id).join("\n"))
    .digest("hex"),
  epochs: 400,
  learning_rate: 0.5,
  l2: 0.01,
  fit_action_bias: fitActionBias,
  temperature,
  threshold,
  weights,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(head, null, 2)}\n`);

const report = {
  corpus_sha256: digest,
  head: outputPath,
  encoder_model: ENCODER_MODEL,
  encoder_revision: ENCODER_REVISION,
  unique_texts: uniqueTexts,
  encoding_ms: encodingMs,
  fit_ms: fitMs,
  fit_action_bias: fitActionBias,
  temperature,
  threshold,
  train: summarize(train, weights),
  validation: summarize(validation, weights, threshold, temperature),
  test: summarize(test, weights, threshold, temperature),
};
const reportPath = outputPath.replace(/\.json$/, "-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
