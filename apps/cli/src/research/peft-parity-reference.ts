import { readFile, writeFile } from "node:fs/promises";
import {
  candidateText,
  ENCODER_MODEL,
  ENCODER_REVISION,
  loadFrozenEncoder,
  probabilities,
  selectTrainableSamples,
} from "./frozen-encoder.ts";
import { readResearchCorpus } from "./research-corpus-reader.ts";

const corpusPath = process.argv[2] ?? "artifacts/research-corpus-v9.json";
const headPath = process.argv[3] ?? "artifacts/frozen-encoder-v9.json";
const outputPath = process.argv[4] ?? "artifacts/peft-parity-reference.json";
const { digest, samples } = await readResearchCorpus(corpusPath);
const head = JSON.parse(await readFile(headPath, "utf8"));
if (
  head.corpus_sha256 !== digest ||
  head.encoder_model !== ENCODER_MODEL ||
  head.encoder_revision !== ENCODER_REVISION ||
  head.fit_action_bias !== false ||
  head.weights?.length !== 388
)
  throw new Error("Matched frozen head does not match the PEFT corpus");

const { selected, excludedTrainIds } = selectTrainableSamples(
  samples.filter((sample) => sample.split !== "test"),
);
if (
  JSON.stringify(excludedTrainIds) !== JSON.stringify(head.excluded_train_ids)
)
  throw new Error("Matched training exclusions changed");
const origins = [
  "https://www.play-qa.com",
  "https://dojo.upexgalaxy.com",
  "https://www.syntaxprojects.com",
];
const chosen = [
  ...selected
    .filter(
      (sample) =>
        sample.split === "train" && sample.browser_state.origin === origins[0],
    )
    .slice(0, 5),
  ...selected
    .filter(
      (sample) =>
        sample.split === "train" && sample.browser_state.origin === origins[1],
    )
    .slice(0, 5),
  ...selected
    .filter(
      (sample) =>
        sample.split === "validation" &&
        sample.browser_state.origin === origins[2],
    )
    .slice(0, 10),
];
if (chosen.length !== 20) throw new Error("Need 20 train/validation states");
const encoder = await loadFrozenEncoder();
try {
  const texts = [
    ...new Set(
      chosen.flatMap((sample) => [
        sample.goal,
        ...sample.candidates.map((candidate) => {
          const element = sample.browser_state.elements.find(
            (entry) => entry.id === candidate.id,
          );
          if (!element) throw new Error("Candidate missing from state");
          return candidateText(element);
        }),
      ]),
    ),
  ];
  const embeddings = await encoder.embedTexts(texts);
  const { encoded } = await encoder.encode(chosen);
  const rows = chosen.map((sample, index) => {
    const options = encoded[index]?.options;
    if (!options) throw new Error("Missing encoded options");
    const scores = probabilities(head.weights, options);
    const top = options[scores.indexOf(Math.max(...scores))];
    if (!top) throw new Error("Missing top option");
    return {
      sample_id: sample.sample_id,
      split: sample.split,
      goal: sample.goal,
      candidates: sample.candidates.map((candidate) => ({
        id: candidate.id,
        score: candidate.score,
        element: sample.browser_state.elements.find(
          (entry) => entry.id === candidate.id,
        ),
      })),
      options: options.map(({ id, action }) => ({ id, action })),
      top_choice: { id: top.id, action: top.action },
    };
  });
  await writeFile(
    outputPath,
    `${JSON.stringify({
      corpus_sha256: digest,
      encoder_model: ENCODER_MODEL,
      encoder_revision: ENCODER_REVISION,
      head_weights: head.weights,
      embeddings: Object.fromEntries(
        texts.map((value) => [value, Array.from(embeddings.get(value) ?? [])]),
      ),
      rows,
    })}\n`,
  );
  console.log(
    JSON.stringify({
      output: outputPath,
      rows: rows.length,
      texts: texts.length,
    }),
  );
} finally {
  await encoder.close();
}
