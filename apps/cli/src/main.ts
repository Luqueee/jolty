import { formatTaskResult, runControlledTask } from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../packages/browser/fixtures/routes.ts";
import { codexFallback } from "./codex-fallback.ts";
import { controlledTasks } from "./controlled-tasks.ts";

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const flags = args.slice(2);
if (
  args[0] !== "run" ||
  !controlledTasks[args[1]] ||
  flags.some((flag) => !["--trace", "--fallback"].includes(flag)) ||
  new Set(flags).size !== flags.length
) {
  console.error(
    `Usage: pnpm run jolty -- run <${Object.keys(controlledTasks).join("|")}> [--fallback] [--trace]`,
  );
  process.exitCode = 2;
} else {
  const fallback = flags.includes("--fallback")
    ? codexFallback(Number(process.env.JOLTY_FALLBACK_THRESHOLD ?? 0.2))
    : undefined;
  const browser = await chromium.launch();
  try {
    const model = await LayaDecisionModel.load();
    try {
      const page = await browser.newPage();
      try {
        await installFixtureRoutes(page);
        const start = performance.now();
        await page.goto(fixtureUrl(args[1]));
        const result = await runControlledTask(
          page,
          model,
          controlledTasks[args[1]],
          {
            name: "Laya",
            version: LAYA_REVISION,
          },
          undefined,
          fallback,
        );
        console.log(formatTaskResult(result));
        console.log(
          `Task duration: ${(performance.now() - start).toFixed(1)} ms`,
        );
        if (flags.includes("--trace") || result.status === "failed")
          console.log(JSON.stringify(result.steps, null, 2));
        if (result.status !== "completed") process.exitCode = 1;
      } finally {
        await page.close();
      }
    } finally {
      await model.close();
    }
  } finally {
    await browser.close();
  }
}
