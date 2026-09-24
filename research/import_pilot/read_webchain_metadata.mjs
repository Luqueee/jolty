import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const requireFromCli = createRequire(
  new URL("../../apps/cli/package.json", import.meta.url),
);
const parquet = await import(pathToFileURL(requireFromCli.resolve("hyparquet")));
const [actionsPath, tracesPath] = process.argv.slice(2);
if (!actionsPath || !tracesPath) {
  throw new Error("Usage: node read_webchain_metadata.mjs actions.parquet traces.parquet");
}

const readRows = async (path, columns) => {
  const file = await parquet.asyncBufferFromFile(path);
  return parquet.parquetReadObjects({ file, columns });
};

const actions = await readRows(actionsPath, [
  "trace_uid",
  "source_step_id",
  "source_step_index",
  "action_type",
  "included_in_sft",
  "exclude_reason",
  "input_text",
  "title",
  "value",
  "href",
  "html_dom_url",
  "ax_tree_url",
  "selector",
  "dom_path",
  "host",
  "host_title",
  "attributes",
]);
const traces = await readRows(tracesPath, [
  "uid",
  "user_query",
]);

const json = JSON.stringify({ actions, traces }, (_key, value) =>
  typeof value === "bigint" ? value.toString() : value,
);
process.stdout.write(`${json}\n`);
