import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseResearchCommand, researchHelp } from "./command.ts";

if (process.argv.length === 2 || process.argv[2] === "--help") {
  console.log(researchHelp);
} else {
  const command = parseResearchCommand(process.argv.slice(2));
  const script = fileURLToPath(new URL(command.script, import.meta.url));
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", script, ...command.args],
    {
      env: { ...process.env, ...command.env },
      stdio: "inherit",
    },
  );
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
