import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { fixtureUrl, installFixtureRoutes } from "../fixtures/routes.ts";
import { scenarios } from "../fixtures/scenarios.ts";
import { referenceFlows } from "./reference-flows.ts";

function percentile(samples: readonly number[], quantile: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? 0;
}

const warmupIterations = 1;
const measuredIterations = 20;
const browser = await chromium.launch();
const results: {
  scenario: string;
  successful_runs: number;
  failed_runs: number;
  task_duration_ms: { p50: number; p95: number; p99: number };
  failures: string[];
}[] = [];

try {
  for (const scenario of scenarios) {
    const flow = referenceFlows[scenario.id];
    if (!flow) throw new Error(`Missing reference flow: ${scenario.id}`);
    const samples: number[] = [];
    const failures: string[] = [];

    for (
      let iteration = 0;
      iteration < warmupIterations + measuredIterations;
      iteration++
    ) {
      const page = await browser.newPage();
      try {
        await installFixtureRoutes(page);
        const start = performance.now();
        await page.goto(fixtureUrl(scenario.id));
        await flow(page);
        await page
          .getByText(scenario.expectedOutcome, { exact: true })
          .waitFor({ state: "visible", timeout: 5_000 });
        const duration = performance.now() - start;
        if (iteration >= warmupIterations) samples.push(duration);
      } catch (error) {
        if (iteration >= warmupIterations) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      } finally {
        await page.close();
      }
    }

    results.push({
      scenario: scenario.id,
      successful_runs: samples.length,
      failed_runs: failures.length,
      task_duration_ms: {
        p50: percentile(samples, 0.5),
        p95: percentile(samples, 0.95),
        p99: percentile(samples, 0.99),
      },
      failures,
    });
  }

  console.log(
    JSON.stringify(
      {
        benchmark: "playwright-reference-v0",
        node_version: process.version,
        chromium_version: browser.version(),
        concurrency: 1,
        warmup_iterations_per_scenario: warmupIterations,
        measured_iterations_per_scenario: measuredIterations,
        timing_scope:
          "Navigation through expected visible outcome; browser launch, page creation, and route installation excluded",
        results,
      },
      null,
      2,
    ),
  );
  if (results.some((result) => result.failed_runs > 0)) process.exitCode = 1;
} finally {
  await browser.close();
}
