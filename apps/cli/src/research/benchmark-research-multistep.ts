import { readFile, writeFile } from "node:fs/promises";
import { type DecisionProvider, runControlledTask } from "@jolty/core";
import { chromium } from "playwright";
import { targetId } from "../../benchmarks/public-site-flows.ts";
import { researchMultistepFlowsV6 } from "./cases/research-multistep-v6.ts";
import {
  type ResearchSample,
  readResearchCorpus,
} from "./research-corpus-reader.ts";

const policy = process.env.JOLTY_RESEARCH_MULTI_POLICY ?? "reference";
if (!["reference", "laya", "zero", "biased"].includes(policy))
  throw new Error("Unknown research multistep policy");
const runs = Number(process.env.JOLTY_RESEARCH_MULTI_RUNS ?? 3);
if (!Number.isInteger(runs) || runs < 1)
  throw new Error("JOLTY_RESEARCH_MULTI_RUNS must be a positive integer");
const outputPath =
  process.argv[2] ?? `artifacts/research-multistep-v6-${policy}.json`;

type DecisionInput = Parameters<DecisionProvider["decide"]>[0];
type LoadedPolicy = {
  name: string;
  version: string;
  decide(input: DecisionInput): ReturnType<DecisionProvider["decide"]>;
  close(): Promise<void>;
};

async function loadPolicy(): Promise<LoadedPolicy | null> {
  if (policy === "reference") return null;
  if (policy === "laya") {
    const { LAYA_REVISION, LayaDecisionModel } = await import(
      "@jolty/decision"
    );
    const model = await LayaDecisionModel.load();
    return {
      name: "Laya verbose/ranked",
      version: LAYA_REVISION,
      decide: (input) => model.decide(input),
      close: () => model.close(),
    };
  }
  const {
    ENCODER_MODEL,
    ENCODER_REVISION,
    FEATURE_VERSION,
    loadFrozenEncoder,
    probabilities,
  } = await import("./frozen-encoder.ts");
  const headPath =
    policy === "zero"
      ? "artifacts/frozen-encoder-v5.json"
      : "artifacts/frozen-encoder-v5-biased.json";
  const head = JSON.parse(await readFile(headPath, "utf8"));
  const { digest } = await readResearchCorpus(
    "artifacts/research-corpus-v5.json",
  );
  if (
    head.schema_version !== 0 ||
    head.corpus_sha256 !== digest ||
    head.encoder_model !== ENCODER_MODEL ||
    head.encoder_revision !== ENCODER_REVISION ||
    head.feature_version !== FEATURE_VERSION ||
    head.fit_action_bias !== (policy === "biased") ||
    !Array.isArray(head.weights) ||
    head.weights.length !== 388 ||
    !head.weights.every(
      (weight: unknown) =>
        typeof weight === "number" && Number.isFinite(weight),
    ) ||
    typeof head.temperature !== "number" ||
    !(head.temperature > 0)
  )
    throw new Error("Invalid frozen research head artifact");
  const encoder = await loadFrozenEncoder();
  return {
    name:
      policy === "zero"
        ? "Frozen zero-intercept head"
        : "Frozen fitted-intercept head",
    version: ENCODER_REVISION,
    async decide(input) {
      const url = new URL(input.state.url);
      const sample: ResearchSample = {
        sample_id: "multistep-decision",
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
      const start = performance.now();
      const encoded = (await encoder.encode([sample])).encoded[0];
      if (!encoded) throw new Error("Encoder returned no decision");
      const p = probabilities(head.weights, encoded.options, head.temperature);
      const index = p.indexOf(Math.max(...p));
      const selected = encoded.options[index];
      if (!selected) throw new Error("Encoder returned no candidate");
      const latency = performance.now() - start;
      return {
        status: "selected",
        action: selected.action,
        targetId: selected.id,
        confidence: p[index] ?? null,
        metrics: {
          decision_latency_ms: latency,
          model_call_ms: latency,
          tokenization_ms: null,
          inference_ms: null,
          input_tokens: null,
        },
      };
    },
    close: () => encoder.close(),
  };
}

const loaded = await loadPolicy();
const browser = await chromium.launch();
const chromiumVersion = browser.version();
const results = [];
let peakRss = process.memoryUsage().rss;
try {
  for (const flow of researchMultistepFlowsV6) {
    for (let iteration = 0; iteration <= runs; iteration++) {
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
        const task = await flow.buildTask(page);
        if (
          task.steps.length !== flow.labels.length ||
          task.steps.some(
            (step, index) => step.goal !== flow.labels[index]?.goal,
          )
        )
          throw new Error(`Multistep labels disagree for ${flow.id}`);
        const choices: {
          goal: string;
          correct: boolean;
          target_recalled: boolean;
          selected: string;
          confidence: number | null;
          decision_latency_ms: number | null;
        }[] = [];
        const provider: DecisionProvider = {
          async decide(input) {
            const label = flow.labels[choices.length];
            if (!label || label.goal !== input.goal)
              throw new Error(`Unexpected decision step for ${flow.id}`);
            const expected = await targetId(page, label.target, input.state);
            const start = performance.now();
            const decision = loaded
              ? await loaded.decide(input)
              : {
                  status: "selected" as const,
                  action: label.action,
                  targetId: expected,
                  confidence: null,
                  metrics: {
                    decision_latency_ms: performance.now() - start,
                    model_call_ms: 0,
                    tokenization_ms: null,
                    inference_ms: null,
                    input_tokens: null,
                  },
                };
            choices.push({
              goal: input.goal,
              correct:
                decision.status === "selected" &&
                decision.action === label.action &&
                decision.targetId === expected,
              target_recalled: input.candidates.some(
                ({ element }) => element.id === expected,
              ),
              selected:
                decision.status === "selected"
                  ? `${decision.action}@${decision.targetId}`
                  : "failed",
              confidence:
                decision.status === "selected" ? decision.confidence : null,
              decision_latency_ms: decision.metrics.decision_latency_ms,
            });
            peakRss = Math.max(peakRss, process.memoryUsage().rss);
            return decision;
          },
        };
        const result = await runControlledTask(page, provider, task, {
          name: loaded?.name ?? "Playwright oracle",
          version: loaded?.version ?? "v0",
        });
        const completed =
          result.status === "completed" && (await flow.postcondition(page));
        if (iteration > 0)
          results.push({
            flow: flow.id,
            site: flow.site,
            completed,
            attempted_steps: choices.length,
            correct_steps: choices.filter((choice) => choice.correct).length,
            validated_steps: result.steps.filter(
              (step) => step.final_outcome === "passed",
            ).length,
            choices,
            failure:
              result.status === "failed"
                ? result.steps.at(-1)?.final_outcome
                : completed
                  ? null
                  : "postcondition_failed",
          });
        console.error(
          `${flow.id} ${policy} ${iteration}: ${completed ? "completed" : "failed"}`,
        );
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await loaded?.close();
}

const report = {
  benchmark: "public-site-multistep-v6",
  policy,
  model_revision: loaded?.version ?? "curated-reference-v0",
  node_version: process.version,
  chromium_version: chromiumVersion,
  warmup_runs_per_flow: 1,
  measured_runs_per_flow: runs,
  timing_scope: "Model decision only; page setup and model loading excluded",
  flows: researchMultistepFlowsV6.map(({ id, site }) => ({ id, site })),
  completed_tasks: results.filter((result) => result.completed).length,
  attempted_steps: results.reduce(
    (sum, result) => sum + result.attempted_steps,
    0,
  ),
  correct_steps: results.reduce((sum, result) => sum + result.correct_steps, 0),
  validated_steps: results.reduce(
    (sum, result) => sum + result.validated_steps,
    0,
  ),
  peak_rss_bytes: peakRss,
  results,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
