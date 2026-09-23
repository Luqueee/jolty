import { readDataset } from "./dataset-reader.ts";
import { assessResearchReadiness } from "./dataset-readiness.ts";

const directory = process.argv[2] ?? "artifacts/dataset-v1-fallback";
const rows = await readDataset(directory);
const assessment = assessResearchReadiness(rows);
console.log(JSON.stringify({ directory, ...assessment }, null, 2));
