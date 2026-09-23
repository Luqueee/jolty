import { readFile, writeFile } from "node:fs/promises";
import type { DecisionProvider } from "@jolty/core";
import { runControlledTask } from "@jolty/core";
import { chromium } from "playwright";
import {
  flows as legacyFlows,
  targetId,
} from "../benchmarks/public-site-flows.ts";
import {
  ENCODER_MODEL,
  ENCODER_REVISION,
  FEATURE_VERSION,
  loadFrozenEncoder,
  probabilities,
} from "./frozen-encoder.ts";
import { freshTestFlows } from "./research-cases-v1.ts";
import { freshTestFlowsV2 } from "./research-cases-v2.ts";
import {
  type ResearchSample,
  readResearchCorpus,
} from "./research-corpus-reader.ts";

const headPath = process.argv[2] ?? "artifacts/frozen-encoder-v0.json";
const corpusPath = process.argv[3] ?? "artifacts/research-corpus-v0.json";
const outputPath = process.argv[4] ?? "artifacts/frozen-encoder-live.json";
const corpusVersion = process.env.JOLTY_RESEARCH_CORPUS_VERSION ?? "0";
if (corpusVersion !== "0" && corpusVersion !== "1" && corpusVersion !== "2")
  throw new Error("JOLTY_RESEARCH_CORPUS_VERSION must be 0, 1, or 2");
const flows =
  corpusVersion === "2"
    ? freshTestFlowsV2
    : corpusVersion === "1"
      ? freshTestFlows
      : legacyFlows;
const { digest } = await readResearchCorpus(corpusPath);
const head = JSON.parse(await readFile(headPath, "utf8"));
if (
  head.schema_version !== 0 ||
  head.corpus_sha256 !== digest ||
  head.encoder_model !== ENCODER_MODEL ||
  head.encoder_revision !== ENCODER_REVISION ||
  head.feature_version !== FEATURE_VERSION ||
  !Array.isArray(head.weights) ||
  head.weights.length !== 388 ||
  !head.weights.every(
    (weight: unknown) => typeof weight === "number" && Number.isFinite(weight),
  ) ||
  typeof head.temperature !== "number" ||
  !(head.temperature > 0)
)
  throw new Error("Invalid frozen encoder head artifact");

const encoder = await loadFrozenEncoder();
const browser = await chromium.launch();
const results = [];
let maxRss = process.memoryUsage().rss;
try {
  for (const flow of flows) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const response = await page.goto(flow.url, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      if (response?.status() !== 200)
        throw new Error(`Site returned HTTP ${response?.status()}`);
      await flow.prepare?.(page);
      const expectedId = await targetId(page, flow.target);
      let correct = false;
      let confidence: number | null = null;
      let selected: string | null = null;
      const provider: DecisionProvider = {
        async decide(input) {
          const start = performance.now();
          const url = new URL(input.state.url);
          const sample: ResearchSample = {
            sample_id: flow.id,
            split: "test",
            split_group: url.origin,
            goal: input.goal,
            browser_state: {
              origin: url.origin,
              pathname: url.pathname,
              title: input.state.title,
              elements: input.state.elements.map((element) => ({
                id: element.id,
                role: element.role,
                name: element.name,
                text: element.text,
                editable: element.editable,
                visible: element.visible,
                enabled: element.enabled,
                has_value: element.hasValue ?? false,
                selected: element.selected ?? false,
              })),
            },
            candidates: input.candidates.map((candidate) => ({
              id: candidate.element.id,
              score: candidate.score,
              signals: candidate.signals,
            })),
            training_action: null,
          };
          const encoded = (await encoder.encode([sample])).encoded[0];
          if (!encoded) throw new Error("Encoder returned no decision");
          const p = probabilities(
            head.weights,
            encoded.options,
            head.temperature,
          );
          const index = p.indexOf(Math.max(...p));
          const option = encoded.options[index];
          if (!option) throw new Error("Encoder returned no candidate");
          confidence = p[index] ?? null;
          selected = `${option.action}@${option.id}`;
          correct = option.action === flow.action && option.id === expectedId;
          maxRss = Math.max(maxRss, process.memoryUsage().rss);
          const latency = performance.now() - start;
          return {
            status: "selected",
            action: option.action,
            targetId: option.id,
            confidence,
            metrics: {
              decision_latency_ms: latency,
              model_call_ms: latency,
              tokenization_ms: null,
              inference_ms: null,
              input_tokens: null,
            },
          };
        },
      };
      const task = { id: flow.id, steps: [flow.step(expectedId)] };
      const result = await runControlledTask(page, provider, task, {
        name: "Frozen MiniLM head",
        version: ENCODER_REVISION,
      });
      const completed =
        result.status === "completed" &&
        (flow.postcondition === undefined || (await flow.postcondition(page)));
      results.push({
        flow: flow.id,
        site: flow.site,
        correct,
        completed,
        confidence,
        selected,
        decision_latency_ms:
          result.steps[0]?.timing.decision_latency_ms ?? null,
        failure:
          result.status === "failed" ? result.steps[0]?.final_outcome : null,
      });
      console.error(`${flow.id}: ${completed ? "completed" : "failed"}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await encoder.close();
}
const report = {
  corpus_sha256: digest,
  encoder_revision: ENCODER_REVISION,
  node: process.version,
  total: results.length,
  exact_decisions: results.filter((result) => result.correct).length,
  completed_tasks: results.filter((result) => result.completed).length,
  peak_rss_bytes: maxRss,
  results,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
