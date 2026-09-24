import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  ENCODER_MODEL,
  ENCODER_REVISION,
  selectTrainableSamples,
} from "./frozen-encoder.ts";
import { readResearchCorpus } from "./research-corpus-reader.ts";

const stage = process.argv[2] ?? "parity";
const python =
  process.env.JOLTY_RESEARCH_PYTHON ?? "artifacts/peft-venv/bin/python";
const parityScript = fileURLToPath(
  new URL("../../../../research/peft/parity.py", import.meta.url),
);
const trainScript = fileURLToPath(
  new URL("../../../../research/peft/train.py", import.meta.url),
);
const requirements = fileURLToPath(
  new URL("../../../../research/peft/requirements.txt", import.meta.url),
);
const run = (binary: string, args: string[]) => {
  const result = spawnSync(binary, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${binary} exited with status ${result.status}`);
};

if (stage === "setup") {
  run("python3", ["-m", "venv", "artifacts/peft-venv"]);
  run(python, ["-m", "pip", "install", "-r", requirements]);
} else {
  const { digest, samples } = await readResearchCorpus(
    "artifacts/research-corpus-v9.json",
  );
  const head = JSON.parse(
    await readFile("artifacts/frozen-encoder-v9.json", "utf8"),
  );
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
  if (
    selected.filter((sample) => sample.split === "train").length !== 168 ||
    selected.filter((sample) => sample.split === "validation").length !== 76
  )
    throw new Error("Unexpected PEFT training or validation count");
  await writeFile(
    "artifacts/peft-training-input.json",
    `${JSON.stringify({
      corpus_sha256: digest,
      encoder_model: ENCODER_MODEL,
      encoder_revision: ENCODER_REVISION,
      frozen_head_weights: head.weights,
      samples: selected,
    })}\n`,
  );
  run(process.execPath, [
    "--experimental-strip-types",
    fileURLToPath(new URL("./peft-parity-reference.ts", import.meta.url)),
  ]);
  run(python, [parityScript]);
  if (stage === "smoke" || stage === "train")
    run(python, [trainScript, "--stage", stage]);
}
