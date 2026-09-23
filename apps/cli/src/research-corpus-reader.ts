import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { RankedCandidate } from "../../../packages/retrieval/src/candidate-retrieval.ts";
import { assessResearchReadiness } from "./dataset-readiness.ts";

export interface ResearchElement {
  id: string;
  role: string;
  name: string;
  text: string;
  editable: boolean;
  visible: boolean;
  enabled: boolean;
  has_value: boolean;
  selected: boolean;
}

export interface ResearchSample {
  sample_id: string;
  split: "train" | "validation" | "test";
  split_group: string;
  goal: string;
  browser_state: {
    origin: string;
    pathname: string;
    title: string;
    elements: ResearchElement[];
  };
  candidates: {
    id: string;
    score: number;
    signals: RankedCandidate["signals"];
  }[];
  training_action: {
    action: "click" | "select" | "type";
    target_id: string;
  } | null;
}

export async function readResearchCorpus(path: string): Promise<{
  digest: string;
  samples: ResearchSample[];
}> {
  const artifact = JSON.parse(await readFile(path, "utf8"));
  if (artifact.schema_version !== 0 || !Array.isArray(artifact.samples))
    throw new Error("Unsupported research corpus schema");
  const digest = createHash("sha256")
    .update(
      artifact.samples.map((row: unknown) => JSON.stringify(row)).join("\n"),
    )
    .digest("hex");
  if (digest !== artifact.content_sha256)
    throw new Error("Research corpus checksum mismatch");
  const samples = artifact.samples as ResearchSample[];
  const ids = new Set<string>();
  for (const sample of samples) {
    if (ids.has(sample.sample_id))
      throw new Error(`Duplicate research sample: ${sample.sample_id}`);
    ids.add(sample.sample_id);
    if (!sample.training_action)
      throw new Error(`Unvalidated research sample: ${sample.sample_id}`);
    if (
      !sample.candidates.some(
        (candidate) => candidate.id === sample.training_action?.target_id,
      )
    )
      throw new Error(
        `Label target missing from candidates: ${sample.sample_id}`,
      );
    if (
      !sample.candidates.every((candidate) =>
        sample.browser_state.elements.some(
          (element) => element.id === candidate.id,
        ),
      )
    )
      throw new Error(`Candidate missing from state: ${sample.sample_id}`);
  }
  if (!assessResearchReadiness(samples).ready_for_encoder_experiment)
    throw new Error("Research corpus fails the encoder admission gate");
  return { digest, samples };
}
