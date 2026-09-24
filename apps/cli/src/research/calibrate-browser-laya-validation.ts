import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  type ChoiceValidationRow,
  calibrateChoices,
} from "./choice-calibration.ts";

const input = await readFile("artifacts/laya-browser-validation-scores.json");
const scores = JSON.parse(input.toString("utf8"));
const projection = await readFile("artifacts/peft-training-input.json");
const projectionHash = createHash("sha256").update(projection).digest("hex");
if (
  scores.input_sha256 !== projectionHash ||
  scores.checkpoint_revision !== "4219958196e2c566c141688c773e08da10c1ff3b" ||
  scores.checkpoint !== "v10s" ||
  scores.format !== "v3" ||
  !Array.isArray(scores.rows) ||
  scores.rows.length !== 76
)
  throw new Error(
    "Browser Laya scores do not match the pinned validation projection",
  );
const rows = scores.rows as (ChoiceValidationRow & {
  decision_ms: number;
  input_tokens: number;
})[];
const policy = calibrateChoices(rows);
const report = {
  model: "browser-laya-v10s",
  checkpoint_revision: scores.checkpoint_revision,
  score_sha256: createHash("sha256").update(input).digest("hex"),
  input_sha256: projectionHash,
  serializer: scores.serializer,
  policy,
  validation_diagnostic: {
    mean_input_tokens:
      rows.reduce((sum, row) => sum + row.input_tokens, 0) / rows.length,
    mean_decision_ms:
      rows.reduce((sum, row) => sum + row.decision_ms, 0) / rows.length,
  },
};
await writeFile(
  "artifacts/laya-browser-validation-policy.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report));
