import { formatTaskResult, runControlledTask } from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../../packages/browser/fixtures/routes.ts";
import { controlledTasks } from "./controlled-tasks.ts";

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
if (
  args[0] !== "run" ||
  !controlledTasks[args[1]] ||
  (args[2] !== undefined && args[2] !== "--trace") ||
  args.length > 3
) {
  console.error("Usage: pnpm run jolty -- run <modal|settings> [--trace]");
  process.exitCode = 2;
} else {
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
        );
        console.log(formatTaskResult(result));
        console.log(
          `Task duration: ${(performance.now() - start).toFixed(1)} ms`,
        );
        if (args[2] === "--trace" || result.status === "failed")
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
