import { pipeline } from "@huggingface/transformers";
import type {
  ResearchElement,
  ResearchSample,
} from "./research-corpus-reader.ts";

export const ENCODER_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
export const ENCODER_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41";
export const FEATURE_VERSION = 1;
const actions = ["click", "select", "type"] as const;
type Action = (typeof actions)[number];

function required<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error("Incomplete encoder feature vector");
  return value;
}

export function actionFor(element: ResearchElement): Action {
  if (element.editable) return "type";
  if (element.role === "combobox" || element.native_select) return "select";
  return "click";
}

export function selectTrainableSamples(samples: readonly ResearchSample[]) {
  const excludedTrainIds: string[] = [];
  const selected = samples.filter((sample) => {
    const label = sample.training_action;
    if (!label) throw new Error(`Missing label for ${sample.sample_id}`);
    const target = sample.browser_state.elements.find(
      (element) => element.id === label.target_id,
    );
    if (!target)
      throw new Error(`Missing label target for ${sample.sample_id}`);
    if (actionFor(target) === label.action) return true;
    if (sample.split !== "train")
      throw new Error(`Unsupported evaluation label for ${sample.sample_id}`);
    excludedTrainIds.push(sample.sample_id);
    return false;
  });
  return { selected, excludedTrainIds };
}

export function candidateText(element: ResearchElement): string {
  return `${actionFor(element)} ${element.role}: ${(element.name || element.text || element.role).slice(0, 160)}`;
}

export interface EncodedOption {
  id: string;
  action: Action;
  features: number[];
}

export interface EncodedSample {
  sample_id: string;
  split: ResearchSample["split"];
  options: EncodedOption[];
  labelIndex: number;
}

export async function loadFrozenEncoder() {
  const embedder = await pipeline("feature-extraction", ENCODER_MODEL, {
    revision: ENCODER_REVISION,
    dtype: "fp32",
    device: "cpu",
  });
  async function embedTexts(texts: readonly string[]) {
    const embeddings = new Map<string, Float32Array>();
    for (let start = 0; start < texts.length; start += 32) {
      const batch = texts.slice(start, start + 32);
      const output = await embedder(batch, {
        pooling: "mean",
        normalize: true,
      });
      const width = output.dims.at(-1);
      if (width !== 384) throw new Error("Unexpected encoder dimension");
      for (let index = 0; index < batch.length; index++)
        embeddings.set(
          batch[index] as string,
          Float32Array.from(
            output.data.slice(index * width, (index + 1) * width),
          ),
        );
    }
    return embeddings;
  }
  return {
    embedTexts,
    async encode(samples: readonly ResearchSample[]) {
      const texts = [
        ...new Set(
          samples.flatMap((sample) => [
            sample.goal,
            ...sample.candidates.map((candidate) => {
              const element = sample.browser_state.elements.find(
                (item) => item.id === candidate.id,
              );
              if (!element) throw new Error("Candidate missing from state");
              return candidateText(element);
            }),
          ]),
        ),
      ];
      const embeddings = await embedTexts(texts);
      const encoded = samples.map((sample): EncodedSample => {
        const goal = embeddings.get(sample.goal);
        if (!goal) throw new Error("Goal embedding missing");
        const options = sample.candidates.map((candidate): EncodedOption => {
          const element = sample.browser_state.elements.find(
            (item) => item.id === candidate.id,
          );
          if (!element) throw new Error("Candidate missing from state");
          const action = actionFor(element);
          const embedding = embeddings.get(candidateText(element));
          if (!embedding) throw new Error("Candidate embedding missing");
          const product = Array.from(
            goal,
            (value, index) => value * required(embedding, index),
          );
          return {
            id: candidate.id,
            action,
            features: [
              ...product,
              Math.min(Math.max(candidate.score / 100, 0), 1),
              ...actions.map((item) => Number(item === action)),
            ],
          };
        });
        const labelIndex = options.findIndex(
          (option) =>
            option.id === sample.training_action?.target_id &&
            option.action === sample.training_action.action,
        );
        if (sample.training_action && labelIndex < 0)
          throw new Error(`Action mismatch for ${sample.sample_id}`);
        return {
          sample_id: sample.sample_id,
          split: sample.split,
          options,
          labelIndex,
        };
      });
      return { encoded, uniqueTexts: texts.length };
    },
    close: () => embedder.dispose(),
  };
}

export async function encodeSamples(samples: readonly ResearchSample[]) {
  const encoder = await loadFrozenEncoder();
  try {
    return await encoder.encode(samples);
  } finally {
    await encoder.close();
  }
}

export function probabilities(
  weights: readonly number[],
  options: readonly EncodedOption[],
  temperature = 1,
) {
  if (options.length === 0) throw new Error("No candidate options");
  if (!(temperature > 0)) throw new Error("Temperature must be positive");
  const scores = options.map(
    (option) =>
      option.features.reduce(
        (sum, value, index) => sum + value * required(weights, index),
        0,
      ) / temperature,
  );
  const largest = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(score - largest));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

export function trainHead(
  samples: readonly EncodedSample[],
  fitActionBias = true,
): number[] {
  const dimension = samples[0]?.options[0]?.features.length;
  if (
    !dimension ||
    samples.length === 0 ||
    samples.some((row) => row.split !== "train")
  )
    throw new Error("Head training requires training samples only");
  const weights = new Array<number>(dimension).fill(0);
  for (let epoch = 0; epoch < 400; epoch++) {
    const gradient = new Array<number>(dimension).fill(0);
    for (const sample of samples) {
      const p = probabilities(weights, sample.options);
      for (let option = 0; option < p.length; option++) {
        const error =
          required(p, option) - Number(option === sample.labelIndex);
        for (let feature = 0; feature < dimension; feature++)
          gradient[feature] =
            required(gradient, feature) +
            error *
              required(required(sample.options, option).features, feature);
      }
    }
    for (let feature = 0; feature < dimension; feature++) {
      if (!fitActionBias && feature >= dimension - actions.length) continue;
      weights[feature] =
        required(weights, feature) -
        0.5 *
          (required(gradient, feature) / samples.length +
            0.01 * required(weights, feature));
    }
  }
  return weights;
}

export function summarize(
  samples: readonly EncodedSample[],
  weights: readonly number[],
  threshold = 0,
  temperature = 1,
) {
  const decisions = samples.map((sample) => {
    const p = probabilities(weights, sample.options, temperature);
    const selectedIndex = p.indexOf(Math.max(...p));
    const selected = required(sample.options, selectedIndex);
    const confidence = required(p, selectedIndex);
    return {
      sample_id: sample.sample_id,
      selected_action: selected.action,
      selected_target_id: selected.id,
      correct: selectedIndex === sample.labelIndex,
      confidence,
      covered: confidence >= threshold,
    };
  });
  const covered = decisions.filter((decision) => decision.covered);
  const bucketEdges = [0, 0.5, 0.75, 0.9, 1];
  return {
    total: decisions.length,
    correct: decisions.filter((decision) => decision.correct).length,
    covered: covered.length,
    covered_correct: covered.filter((decision) => decision.correct).length,
    brier: decisions.length
      ? decisions.reduce(
          (sum, decision) =>
            sum + (decision.confidence - Number(decision.correct)) ** 2,
          0,
        ) / decisions.length
      : null,
    confidence_buckets: bucketEdges.slice(0, -1).map((lower, index) => {
      const upper = required(bucketEdges, index + 1);
      const selected = decisions.filter(
        (decision) =>
          decision.confidence >= lower &&
          (index === bucketEdges.length - 2
            ? decision.confidence <= upper
            : decision.confidence < upper),
      );
      return {
        lower,
        upper,
        count: selected.length,
        accuracy: selected.length
          ? selected.filter((decision) => decision.correct).length /
            selected.length
          : null,
        mean_confidence: selected.length
          ? selected.reduce((sum, decision) => sum + decision.confidence, 0) /
            selected.length
          : null,
      };
    }),
    decisions,
  };
}

export function calibrateTemperature(
  validation: readonly EncodedSample[],
  weights: readonly number[],
) {
  if (validation.some((sample) => sample.split !== "validation"))
    throw new Error("Temperature calibration requires validation samples only");
  const temperatures = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
  return required(
    temperatures
      .map((temperature) => ({
        temperature,
        nll: validation.reduce(
          (sum, sample) =>
            sum -
            Math.log(
              Math.max(
                required(
                  probabilities(weights, sample.options, temperature),
                  sample.labelIndex,
                ),
                Number.MIN_VALUE,
              ),
            ),
          0,
        ),
      }))
      .sort((a, b) => a.nll - b.nll),
    0,
  ).temperature;
}

export function selectThreshold(
  validation: readonly EncodedSample[],
  weights: readonly number[],
  temperature = 1,
) {
  const confidences = summarize(
    validation,
    weights,
    0,
    temperature,
  ).decisions.map((decision) => decision.confidence);
  const thresholds = [0, ...confidences.map((value) => value + Number.EPSILON)];
  const eligible = thresholds
    .map((threshold) => ({
      threshold,
      result: summarize(validation, weights, threshold, temperature),
    }))
    .filter(
      ({ result }) =>
        result.covered > 0 && result.covered === result.covered_correct,
    )
    .sort(
      (a, b) =>
        b.result.covered - a.result.covered || a.threshold - b.threshold,
    );
  return eligible[0]?.threshold ?? 1;
}
