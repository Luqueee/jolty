import { writeFile } from "node:fs/promises";
import type { BrowserState } from "@jolty/browser";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import type { DecisionInput } from "@jolty/decision/contract";
import {
  assertChatGptLogin,
  CODEX_MODEL,
  codexSubscriptionAdapter,
} from "../../../packages/decision/src/codex-subscription.ts";
import { evaluateLargeModelDecision } from "../../../packages/decision/src/large-model-decision.ts";
import {
  type ResearchSample,
  readResearchCorpus,
} from "./research-corpus-reader.ts";

const corpusPath = process.argv[2] ?? "artifacts/research-corpus-v0.json";
const outputPath = process.argv[3] ?? "artifacts/laya-research-test.json";
const { digest, samples } = await readResearchCorpus(corpusPath);

function layaInput(sample: ResearchSample): DecisionInput {
  const state: BrowserState = {
    url: `${sample.browser_state.origin}${sample.browser_state.pathname}`,
    title: sample.browser_state.title,
    elements: sample.browser_state.elements.map((element) => ({
      ...element,
      value: element.role === "combobox" ? "" : undefined,
      hasValue: element.has_value,
    })),
  };
  const candidates: DecisionInput["candidates"] = sample.candidates.map(
    (candidate, sourceIndex) => {
      const element = state.elements.find((item) => item.id === candidate.id);
      if (!element) throw new Error("Candidate missing from browser state");
      return {
        element,
        score: candidate.score,
        signals: candidate.signals,
        sourceIndex,
      };
    },
  );
  return { goal: sample.goal, state, candidates };
}

const laya = await LayaDecisionModel.load();
const decisions = [];
try {
  for (const sample of samples.filter((item) => item.split === "test")) {
    const result = await laya.decide(layaInput(sample));
    decisions.push({
      sample_id: sample.sample_id,
      selected_action: result.status === "selected" ? result.action : null,
      selected_target_id:
        result.status === "selected" ? (result.targetId ?? null) : null,
      correct:
        result.status === "selected" &&
        result.action === sample.training_action?.action &&
        result.targetId === sample.training_action.target_id,
      decision_latency_ms: result.metrics.decision_latency_ms,
      failure: result.status === "failed" ? result.reason : null,
    });
  }
} finally {
  await laya.close();
}
const report = {
  corpus_sha256: digest,
  laya_revision: LAYA_REVISION,
  total: decisions.length,
  correct: decisions.filter((decision) => decision.correct).length,
  decisions,
  teacher: null as null | {
    model: string;
    total: number;
    correct: number;
    decisions: {
      sample_id: string;
      correct: boolean;
      decision_latency_ms: number;
      input_tokens: number | null;
      output_tokens: number | null;
      failure: string | null;
    }[];
  },
};
if (process.env.JOLTY_RESEARCH_INCLUDE_CODEX === "1") {
  assertChatGptLogin();
  const adapter = codexSubscriptionAdapter();
  const teacherDecisions = [];
  for (const sample of samples.filter((item) => item.split === "test")) {
    const result = await evaluateLargeModelDecision(layaInput(sample), adapter);
    const correct =
      result.status === "selected" &&
      result.action === sample.training_action?.action &&
      result.targetId === sample.training_action.target_id;
    teacherDecisions.push({
      sample_id: sample.sample_id,
      correct,
      decision_latency_ms: result.metrics.decision_latency_ms,
      input_tokens: result.metrics.input_tokens,
      output_tokens: result.metrics.output_tokens,
      failure: result.status === "failed" ? result.reason : null,
    });
    console.error(`${sample.sample_id}: ${correct ? "correct" : "incorrect"}`);
  }
  report.teacher = {
    model: CODEX_MODEL,
    total: teacherDecisions.length,
    correct: teacherDecisions.filter((decision) => decision.correct).length,
    decisions: teacherDecisions,
  };
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
