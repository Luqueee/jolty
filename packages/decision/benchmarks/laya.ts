import { cpus, totalmem } from "node:os";
import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
import { extractBrowserState } from "../../browser/src/index.ts";
import {
  evaluationCases,
  modalProbeCase,
  prepareEvaluationCase,
  prepareModalProbeCase,
  prepareTargetlessDecisionCase,
  targetDomIndexFor,
  targetIdFor,
  targetlessDecisionCases,
} from "../../retrieval/eval/cases.ts";
import { filterCandidates } from "../../retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../retrieval/src/candidate-retrieval.ts";
import {
  actionFor,
  type DecisionInput,
  type DecisionQuestionOptions,
} from "../src/decision.ts";
import { LAYA_REVISION, LayaDecisionModel } from "../src/laya-decision.ts";
import { uniqueLabelDecision } from "../src/unique-label-gate.ts";
import { summarizeSteps } from "./step-summary.ts";

const topK = Number(process.env.JOLTY_DECISION_TOP_K ?? 10);
if (!Number.isInteger(topK) || topK < 1 || topK > 10)
  throw new Error("JOLTY_DECISION_TOP_K must be an integer from 1 to 10");
const includeBack = process.env.JOLTY_DECISION_INCLUDE_BACK !== "0";
const descriptionStyle = process.env.JOLTY_DECISION_DESCRIPTION ?? "verbose";
const candidateOrder = process.env.JOLTY_DECISION_ORDER ?? "ranked";
if (!["verbose", "compact"].includes(descriptionStyle))
  throw new Error("JOLTY_DECISION_DESCRIPTION must be verbose or compact");
if (!["ranked", "reversed"].includes(candidateOrder))
  throw new Error("JOLTY_DECISION_ORDER must be ranked or reversed");

interface MeasuredCase {
  fixture: string;
  phase: string;
  goal: string;
  expected_action: string;
  expected_target_id: string | null;
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
  option_tokens_dropped: number | null;
  state_tokens_dropped: number | null;
  retrieval_rank: number;
  retrieval_top_k: number;
  heuristic_action: string | null;
  heuristic_target_id: string | null;
  unique_label_gate_selected: boolean;
  unique_label_gate_correct: boolean;
  gated_correct: boolean;
}

function percentile(samples: readonly number[], p: number): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1];
}

const browser = await chromium.launch();
const chromiumVersion = browser.version();
const inputs: {
  fixture: string;
  phase: string;
  goal: string;
  expectedAction: "click" | "type" | "select" | "wait" | "done";
  expectedTargetId: string | null;
  input: DecisionInput;
  candidateFilterMs: number;
  candidateRetrievalMs: number;
  retrievalRank: number;
  retrievalTopK: number;
  heuristicAction: string | null;
  heuristicTargetId: string | null;
}[] = [];
function addInput(
  fixture: string,
  phase: string,
  goal: string,
  expectedAction: "click" | "type" | "select" | "wait" | "done",
  expectedTargetId: string | null,
  state: DecisionInput["state"],
  filtered: ReturnType<typeof filterCandidates>,
  retrieved: ReturnType<typeof retrieveCandidates>,
) {
  inputs.push({
    fixture,
    phase,
    goal,
    expectedAction,
    expectedTargetId,
    input: { goal, state, candidates: retrieved.topCandidates },
    candidateFilterMs: filtered.metrics.candidate_filter_ms,
    candidateRetrievalMs: retrieved.metrics.candidate_retrieval_ms,
    retrievalRank: expectedTargetId
      ? retrieved.ranked.findIndex(
          ({ element }) => element.id === expectedTargetId,
        ) + 1
      : 0,
    retrievalTopK: retrieved.topCandidates.length,
    heuristicAction: retrieved.topCandidates[0]
      ? actionFor(retrieved.topCandidates[0].element)
      : null,
    heuristicTargetId: retrieved.topCandidates[0]?.element.id ?? null,
  });
}
try {
  for (const testCase of evaluationCases) {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(testCase.fixture));
      await prepareEvaluationCase(page, testCase);
      const state = (await extractBrowserState(page)).state;
      const filtered = filterCandidates(state);
      const retrieved = retrieveCandidates(
        testCase.goal,
        filtered.candidates,
        topK,
      );
      const expectedTargetId = targetIdFor(
        filtered.candidates,
        testCase,
        await targetDomIndexFor(page, testCase),
      );
      if (!expectedTargetId)
        throw new Error(`Missing fixture target: ${testCase.fixture}`);
      addInput(
        testCase.fixture,
        testCase.phase ?? "initial",
        testCase.goal,
        testCase.targetRole === "combobox"
          ? "select"
          : testCase.targetRole === "textbox"
            ? "type"
            : "click",
        expectedTargetId,
        state,
        filtered,
        retrieved,
      );
    } finally {
      await page.close();
    }
  }
  for (const testCase of targetlessDecisionCases) {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(testCase.fixture));
      await prepareTargetlessDecisionCase(page, testCase);
      const state = (await extractBrowserState(page)).state;
      const filtered = filterCandidates(state);
      const retrieved = retrieveCandidates(
        testCase.goal,
        filtered.candidates,
        topK,
      );
      addInput(
        testCase.fixture,
        testCase.phase,
        testCase.goal,
        testCase.expectedAction,
        null,
        state,
        filtered,
        retrieved,
      );
    } finally {
      await page.close();
    }
  }
  {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(modalProbeCase.fixture));
      await prepareModalProbeCase(page);
      const state = (await extractBrowserState(page)).state;
      const filtered = filterCandidates(state);
      const retrieved = retrieveCandidates(
        modalProbeCase.goal,
        filtered.candidates,
        topK,
      );
      const expectedTargetId = targetIdFor(filtered.candidates, modalProbeCase);
      if (!expectedTargetId) throw new Error("Missing modal confirm target");
      addInput(
        modalProbeCase.fixture,
        modalProbeCase.phase ?? "initial",
        modalProbeCase.goal,
        "click",
        expectedTargetId,
        state,
        filtered,
        retrieved,
      );
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
  const questionConfig: DecisionQuestionOptions = {
    descriptionStyle: descriptionStyle as "verbose" | "compact",
    candidateOrder: candidateOrder as "ranked" | "reversed",
    ...(includeBack
      ? {}
      : { targetFreeActions: ["scroll", "wait", "done"] as const }),
  };
  await model.decide(inputs[0].input, questionConfig);
  const cases: MeasuredCase[] = [];
  for (const entry of inputs) {
    const gate = uniqueLabelDecision(entry.input);
    const result = await model.decide(entry.input, questionConfig);
    const modelCorrect =
      result.status === "selected" &&
      result.action === entry.expectedAction &&
      (result.targetId ?? null) === entry.expectedTargetId;
    const gateCorrect =
      gate !== null &&
      gate.action === entry.expectedAction &&
      gate.targetId === entry.expectedTargetId;
    cases.push({
      fixture: entry.fixture,
      phase: entry.phase,
      goal: entry.goal,
      expected_action: entry.expectedAction,
      expected_target_id: entry.expectedTargetId,
      selected_action: result.status === "selected" ? result.action : null,
      selected_target_id:
        result.status === "selected" ? (result.targetId ?? null) : null,
      correct: modelCorrect,
      unique_label_gate_selected: gate !== null,
      unique_label_gate_correct: gateCorrect,
      gated_correct: gate ? gateCorrect : modelCorrect,
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
      option_tokens_dropped: result.metrics.option_tokens_dropped ?? null,
      state_tokens_dropped: result.metrics.state_tokens_dropped ?? null,
      retrieval_rank: entry.retrievalRank,
      retrieval_top_k: entry.retrievalTopK,
      heuristic_action: entry.heuristicAction,
      heuristic_target_id: entry.heuristicTargetId,
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
  const stepSummary = summarizeSteps(cases);
  const initialSummary = summarizeSteps(
    cases.filter(({ phase }) => phase === "initial"),
  );
  const laterPhaseSummary = summarizeSteps(
    cases.filter(({ phase }) => phase !== "initial"),
  );
  const targetlessSummary = summarizeSteps(
    cases.filter(({ expected_target_id }) => expected_target_id === null),
  );
  console.log(
    JSON.stringify(
      {
        benchmark: "laya-decision-baseline-v0",
        candidate_top_k: topK,
        back_option_included: includeBack,
        description_style: descriptionStyle,
        candidate_order: candidateOrder,
        unique_label_gate: {
          selected_cases: cases.filter(
            ({ unique_label_gate_selected }) => unique_label_gate_selected,
          ).length,
          incorrect_selections: cases.filter(
            ({ unique_label_gate_selected, unique_label_gate_correct }) =>
              unique_label_gate_selected && !unique_label_gate_correct,
          ).length,
          gated_correct_steps: cases.filter(
            ({ gated_correct }) => gated_correct,
          ).length,
        },
        model: "convaiinnovations/laya (receptron/laya-onnx)",
        model_revision: LAYA_REVISION,
        wrapper: "@receptron/laya@0.1.2",
        node_version: process.version,
        chromium_version: chromiumVersion,
        concurrency: 1,
        hardware: {
          cpu: cpus()[0]?.model,
          logical_cpus: cpus().length,
          total_memory_gb: Math.round(totalmem() / 2 ** 30),
        },
        execution_provider: "cpu",
        warmup_decisions: 1,
        initial_cases: cases.filter(({ phase }) => phase === "initial").length,
        later_phase_cases: cases.filter(({ phase }) => phase !== "initial")
          .length,
        ...stepSummary,
        initial_summary: initialSummary,
        later_phase_summary: laterPhaseSummary,
        targetless_summary: targetlessSummary,
        modal_probe: cases.find(
          ({ fixture, phase }) =>
            fixture === "modal" && phase === "dialog-open",
        ),
        step_accuracy: stepSummary.model_step_accuracy,
        correct_steps: stepSummary.model_correct_steps,
        model_failures: cases.filter(({ failure_reason }) => failure_reason)
          .length,
        model_load_ms: modelLoadMs,
        candidate_filter_ms: percentileReport("candidate_filter_ms"),
        candidate_retrieval_ms: percentileReport("candidate_retrieval_ms"),
        model_call_ms: percentileReport("model_call_ms"),
        decision_latency_ms: percentileReport("decision_latency_ms"),
        tokenization_ms: percentileReport("tokenization_ms"),
        inference_ms: percentileReport("inference_ms"),
        cases,
      },
      null,
      2,
    ),
  );
} finally {
  await model.close();
}
