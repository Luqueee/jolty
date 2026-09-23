import { cpus } from "node:os";
import {
  type ControlledTask,
  type DecisionProvider,
  runControlledTask,
} from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import type { DecisionQuestionOptions } from "@jolty/decision/contract";
import { uniqueLabelDecision } from "@jolty/decision/unique-label-gate";
import { chromium } from "playwright";
import { heuristicDecision } from "./heuristic.ts";
import { flows, targetId } from "./public-site-flows.ts";

const runs = Number(process.env.JOLTY_PUBLIC_RUNS ?? 3);
if (!Number.isInteger(runs) || runs < 1)
  throw new Error("JOLTY_PUBLIC_RUNS must be a positive integer");
const requestedFlows = process.env.JOLTY_PUBLIC_FLOWS?.split(",") ?? null;
const requestedPolicies = process.env.JOLTY_PUBLIC_POLICIES?.split(",") ?? null;
const measuredFlows = requestedFlows
  ? flows.filter((flow) => requestedFlows.includes(flow.id))
  : flows;
if (
  measuredFlows.length === 0 ||
  (requestedFlows && measuredFlows.length !== new Set(requestedFlows).size)
)
  throw new Error("JOLTY_PUBLIC_FLOWS must name known, unique flow IDs");

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
}

const browser = await chromium.launch();
try {
  const laya = await LayaDecisionModel.load();
  try {
    const layaProvider = (
      options: DecisionQuestionOptions,
      gate = false,
    ): DecisionProvider => ({
      async decide(input) {
        if (gate) {
          const start = performance.now();
          const selected = uniqueLabelDecision(input);
          if (selected)
            return {
              status: "selected",
              ...selected,
              gate: true,
              confidence: null,
              metrics: {
                decision_latency_ms: performance.now() - start,
                model_call_ms: 0,
                tokenization_ms: null,
                inference_ms: null,
                input_tokens: null,
              },
            };
        }
        return laya.decide(input, options);
      },
    });
    const availablePolicies = [
      { name: "heuristic", provider: heuristicDecision, topK: 1 },
      {
        name: "Laya verbose/ranked",
        provider: layaProvider({}),
        topK: 10,
      },
      {
        name: "Laya compact/ranked",
        provider: layaProvider({ descriptionStyle: "compact" }),
        topK: 10,
      },
      {
        name: "Laya verbose/reversed",
        provider: layaProvider({ candidateOrder: "reversed" }),
        topK: 10,
      },
      {
        name: "Laya verbose/reversed with gate",
        provider: layaProvider({ candidateOrder: "reversed" }, true),
        topK: 10,
      },
    ];
    const policies = requestedPolicies
      ? availablePolicies.filter((policy) =>
          requestedPolicies.includes(policy.name),
        )
      : availablePolicies;
    if (
      policies.length === 0 ||
      (requestedPolicies && policies.length !== new Set(requestedPolicies).size)
    )
      throw new Error("JOLTY_PUBLIC_POLICIES must name known, unique policies");
    const results = [];
    for (const flow of measuredFlows) {
      for (const policy of policies) {
        const samples: {
          completed: boolean;
          correct: boolean;
          candidate_rank: number | null;
          selected_choice: string;
          gate_selected: boolean;
          decision_latency_ms: number | null;
          option_tokens_dropped: number | null;
          state_tokens_dropped: number | null;
          failure: string | null;
        }[] = [];
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
            const expectedId = await targetId(page, flow.target);
            let candidateRank: number | null = null;
            let selectedChoice = "failed";
            let gateSelected = false;
            let correct = false;
            let optionTokensDropped: number | null = null;
            let stateTokensDropped: number | null = null;
            const provider: DecisionProvider = {
              async decide(input) {
                const actualId = input.state.elements.find(
                  (element) => element.id === expectedId,
                );
                if (!actualId)
                  throw new Error(`Oracle target missing for ${flow.id}`);
                const rank = input.candidates.findIndex(
                  ({ element }) => element.id === expectedId,
                );
                candidateRank = rank < 0 ? null : rank + 1;
                const decision = await policy.provider.decide(input);
                correct =
                  decision.status === "selected" &&
                  decision.action === flow.action &&
                  decision.targetId === expectedId;
                if (decision.status === "selected")
                  selectedChoice = `${"gate" in decision && decision.gate === true ? "gate:" : ""}${decision.action}@${input.candidates.findIndex(({ element }) => element.id === decision.targetId) + 1}`;
                gateSelected = "gate" in decision && decision.gate === true;
                optionTokensDropped =
                  decision.metrics.option_tokens_dropped ?? null;
                stateTokensDropped =
                  decision.metrics.state_tokens_dropped ?? null;
                return decision;
              },
            };
            const task: ControlledTask = {
              id: flow.id,
              steps: [flow.step(expectedId)],
            };
            const result = await runControlledTask(page, provider, task, {
              name: policy.name,
              version: policy.name === "heuristic" ? "v0" : LAYA_REVISION,
            });
            const postconditionPassed =
              result.status === "completed" &&
              (flow.postcondition === undefined ||
                (await flow.postcondition(page)));
            if (iteration > 0)
              samples.push({
                completed: postconditionPassed,
                correct,
                candidate_rank: candidateRank,
                selected_choice: selectedChoice,
                gate_selected: gateSelected,
                decision_latency_ms:
                  result.steps[0]?.timing.decision_latency_ms ?? null,
                option_tokens_dropped: optionTokensDropped,
                state_tokens_dropped: stateTokensDropped,
                failure:
                  result.status === "failed"
                    ? (result.steps[0]?.final_outcome ?? "no_step")
                    : postconditionPassed
                      ? null
                      : "postcondition_failed",
              });
          } finally {
            await context.close();
          }
        }
        results.push({
          flow: flow.id,
          site: flow.site,
          policy: policy.name,
          measured_runs: samples.length,
          successful_tasks: samples.filter((sample) => sample.completed).length,
          correct_decisions: samples.filter((sample) => sample.correct).length,
          gate_selections: samples.filter((sample) => sample.gate_selected)
            .length,
          target_recall_at_10: samples.filter(
            (sample) => sample.candidate_rank !== null,
          ).length,
          target_recall_at_policy_k: samples.filter(
            (sample) =>
              sample.candidate_rank !== null &&
              sample.candidate_rank <= policy.topK,
          ).length,
          selected_choices: Object.fromEntries(
            [...new Set(samples.map((sample) => sample.selected_choice))].map(
              (choice) => [
                choice,
                samples.filter((sample) => sample.selected_choice === choice)
                  .length,
              ],
            ),
          ),
          option_tokens_dropped: samples.reduce(
            (sum, sample) => sum + (sample.option_tokens_dropped ?? 0),
            0,
          ),
          state_tokens_dropped: samples.reduce(
            (sum, sample) => sum + (sample.state_tokens_dropped ?? 0),
            0,
          ),
          decision_latency_ms: {
            p50: percentile(
              samples.flatMap((sample) =>
                sample.decision_latency_ms === null
                  ? []
                  : [sample.decision_latency_ms],
              ),
              0.5,
            ),
            p95: percentile(
              samples.flatMap((sample) =>
                sample.decision_latency_ms === null
                  ? []
                  : [sample.decision_latency_ms],
              ),
              0.95,
            ),
          },
          failures: samples.flatMap((sample) =>
            sample.failure === null ? [] : [sample.failure],
          ),
        });
        console.error(`${flow.id}: ${policy.name} measured`);
      }
    }
    console.log(
      JSON.stringify(
        {
          benchmark: "public-site-one-step-v0",
          measured_at_utc: new Date().toISOString(),
          measured_runs_per_flow_policy: runs,
          model_revision: LAYA_REVISION,
          node: process.version,
          chromium: browser.version(),
          cpu: cpus()[0]?.model ?? null,
          sites: [...new Set(measuredFlows.map((flow) => flow.site))],
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await laya.close();
  }
} finally {
  await browser.close();
}
