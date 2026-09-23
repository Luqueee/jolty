import { cpus, totalmem } from "node:os";
import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
import { extractBrowserState } from "../../browser/src/index.ts";
import { retrievalCases, targetIdFor } from "../../retrieval/eval/cases.ts";
import { filterCandidates } from "../../retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../retrieval/src/candidate-retrieval.ts";
import type { DecisionInput } from "../src/decision.ts";
import { LAYA_REVISION, LayaDecisionModel } from "../src/laya-decision.ts";

interface MeasuredCase {
  fixture: string;
  goal: string;
  expected_action: string;
  expected_target_id: string;
  selected_action: string | null;
  selected_target_id: string | null;
  correct: boolean;
  confidence: number | null;
  selected_probability: number | null;
  failure_reason: string | null;
  failure_message: string | null;
  fallback_reason: null;
  validation_outcome: "not_executed";
  considered: { action: string; target_id: string | null }[];
  candidate_filter_ms: number;
  candidate_retrieval_ms: number;
  model_call_ms: number;
  tokenization_ms: number | null;
  inference_ms: number | null;
  decision_latency_ms: number;
  input_tokens: number | null;
}

function percentile(samples: readonly number[], p: number): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1];
}

const browser = await chromium.launch();
const inputs: {
  fixture: string;
  goal: string;
  expectedAction: "click" | "type" | "select";
  expectedTargetId: string;
  input: DecisionInput;
  candidateFilterMs: number;
  candidateRetrievalMs: number;
}[] = [];
try {
  for (const testCase of retrievalCases) {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(testCase.fixture));
      const state = (await extractBrowserState(page)).state;
      const filtered = filterCandidates(state);
      const retrieved = retrieveCandidates(testCase.goal, filtered.candidates);
      const expectedTargetId = targetIdFor(filtered.candidates, testCase);
      if (!expectedTargetId)
        throw new Error(`Missing fixture target: ${testCase.fixture}`);
      inputs.push({
        fixture: testCase.fixture,
        goal: testCase.goal,
        expectedAction:
          testCase.targetRole === "combobox"
            ? "select"
            : testCase.targetRole === "textbox"
              ? "type"
              : "click",
        expectedTargetId,
        input: {
          goal: testCase.goal,
          state,
          candidates: retrieved.topCandidates,
        },
        candidateFilterMs: filtered.metrics.candidate_filter_ms,
        candidateRetrievalMs: retrieved.metrics.candidate_retrieval_ms,
      });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const loadStart = performance.now();
const model = await LayaDecisionModel.load();
const modelLoadMs = performance.now() - loadStart;
try {
  await model.decide(inputs[0].input);
  const cases: MeasuredCase[] = [];
  for (const entry of inputs) {
    const result = await model.decide(entry.input);
    cases.push({
      fixture: entry.fixture,
      goal: entry.goal,
      expected_action: entry.expectedAction,
      expected_target_id: entry.expectedTargetId,
      selected_action: result.status === "selected" ? result.action : null,
      selected_target_id:
        result.status === "selected" ? (result.targetId ?? null) : null,
      correct:
        result.status === "selected" &&
        result.action === entry.expectedAction &&
        result.targetId === entry.expectedTargetId,
      confidence: result.status === "selected" ? result.confidence : null,
      selected_probability:
        result.status === "selected" ? result.selected_probability : null,
      failure_reason: result.status === "failed" ? result.reason : null,
      failure_message: result.status === "failed" ? result.message : null,
      fallback_reason: null,
      validation_outcome: "not_executed",
      considered: result.considered.map(({ action, targetId }) => ({
        action,
        target_id: targetId ?? null,
      })),
      candidate_filter_ms: entry.candidateFilterMs,
      candidate_retrieval_ms: entry.candidateRetrievalMs,
      model_call_ms: result.metrics.model_call_ms,
      tokenization_ms: result.metrics.tokenization_ms,
      inference_ms: result.metrics.inference_ms,
      decision_latency_ms: result.metrics.decision_latency_ms,
      input_tokens: result.metrics.input_tokens,
    });
  }
  const percentileReport = (
    field:
      | "candidate_filter_ms"
      | "candidate_retrieval_ms"
      | "model_call_ms"
      | "tokenization_ms"
      | "inference_ms"
      | "decision_latency_ms",
  ) => ({
    p50: percentile(
      cases
        .map((entry) => entry[field])
        .filter((value): value is number => value !== null),
      0.5,
    ),
    p95: percentile(
      cases
        .map((entry) => entry[field])
        .filter((value): value is number => value !== null),
      0.95,
    ),
    p99: percentile(
      cases
        .map((entry) => entry[field])
        .filter((value): value is number => value !== null),
      0.99,
    ),
  });
  const confidenceBuckets = [0, 0.25, 0.5, 0.75].map((lower) => ({
    range: `[${lower}, ${lower + 0.25}${lower === 0.75 ? "]" : ")"}`,
    count: cases.filter(
      ({ confidence }) =>
        confidence !== null &&
        confidence >= lower &&
        (lower === 0.75 ? confidence <= 1 : confidence < lower + 0.25),
    ).length,
  }));
  console.log(
    JSON.stringify(
      {
        benchmark: "laya-decision-baseline-v0",
        model: "convaiinnovations/laya (receptron/laya-onnx)",
        model_revision: LAYA_REVISION,
        wrapper: "@receptron/laya@0.1.2",
        hardware: {
          cpu: cpus()[0]?.model,
          logical_cpus: cpus().length,
          total_memory_gb: Math.round(totalmem() / 2 ** 30),
        },
        execution_provider: "cpu",
        warmup_decisions: 1,
        fixture_cases: cases.length,
        step_accuracy:
          cases.filter(({ correct }) => correct).length / cases.length,
        correct_steps: cases.filter(({ correct }) => correct).length,
        model_failures: cases.filter(({ failure_reason }) => failure_reason)
          .length,
        model_load_ms: modelLoadMs,
        candidate_filter_ms: percentileReport("candidate_filter_ms"),
        candidate_retrieval_ms: percentileReport("candidate_retrieval_ms"),
        model_call_ms: percentileReport("model_call_ms"),
        decision_latency_ms: percentileReport("decision_latency_ms"),
        tokenization_ms: percentileReport("tokenization_ms"),
        inference_ms: percentileReport("inference_ms"),
        confidence_distribution: confidenceBuckets,
        cases,
      },
      null,
      2,
    ),
  );
} finally {
  await model.close();
}
