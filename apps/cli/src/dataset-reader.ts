import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import {
  DATASET_COLUMNS,
  DATASET_SCHEMA_VERSION,
  type DatasetRow,
  validateDataset,
} from "./dataset.ts";

export async function readDataset(directory: string): Promise<DatasetRow[]> {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  ) as { schema_version: number; row_count: number; content_sha256: string };
  if (manifest.schema_version !== DATASET_SCHEMA_VERSION)
    throw new Error("Unsupported dataset manifest version");
  const parquet = await parquetReadObjects({
    file: await asyncBufferFromFile(join(directory, "traces.parquet")),
  });
  const structured = new Set([
    "fast_model",
    "browser_state",
    "candidates",
    "fast_decision",
    "teacher_decision",
    "teacher_model",
    "executed_decision",
    "training_action",
    "proposed_action",
  ]);
  const rows = parquet.map((source) => {
    const row = {} as Record<(typeof DATASET_COLUMNS)[number], unknown>;
    for (const name of DATASET_COLUMNS) {
      const value = source[name];
      if (name === "schema_version") row[name] = value;
      else if (name === "fast_confidence")
        row[name] = value === "" ? null : Number(value);
      else if (structured.has(name))
        row[name] = value === "" ? null : JSON.parse(String(value));
      else
        row[name] = value === "" && name === "fallback_reason" ? null : value;
    }
    return row as DatasetRow;
  });
  validateDataset(rows);
  const checksum = createHash("sha256")
    .update(
      [...rows]
        .sort((a, b) => a.sample_id.localeCompare(b.sample_id))
        .map((row) => JSON.stringify(row))
        .join("\n"),
    )
    .digest("hex");
  if (
    manifest.row_count !== rows.length ||
    manifest.content_sha256 !== checksum
  )
    throw new Error("Dataset manifest checksum mismatch");
  return rows;
}
