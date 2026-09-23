import { chromium } from "playwright";
import {
  extractBrowserState,
  type StateExtractionMetrics,
} from "../src/index.ts";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(`
    <title>Browser state benchmark</title>
    ${Array.from({ length: 200 }, (_, i) => `<div>Noninteractive content ${i}</div>`).join("")}
    ${Array.from({ length: 30 }, (_, i) => `<button>Action ${i}</button>`).join("")}
  `);

  for (let i = 0; i < 10; i++) await extractBrowserState(page);
  const samples: number[] = [];
  let metrics: StateExtractionMetrics | undefined;
  for (let i = 0; i < 100; i++) {
    metrics = (await extractBrowserState(page)).metrics;
    samples.push(metrics.state_extraction_ms);
  }
  samples.sort((a, b) => a - b);
  const percentile = (p: number) => samples[Math.ceil(samples.length * p) - 1];
  console.log(
    JSON.stringify(
      {
        benchmark: "browser-state-v0",
        warmup_iterations: 10,
        measured_iterations: samples.length,
        state_extraction_ms: {
          p50: percentile(0.5),
          p95: percentile(0.95),
          p99: percentile(0.99),
        },
        total_dom_nodes: metrics?.total_dom_nodes,
        extracted_interactive_elements: metrics?.extracted_interactive_elements,
        serialized_state_bytes: metrics?.serialized_state_bytes,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
