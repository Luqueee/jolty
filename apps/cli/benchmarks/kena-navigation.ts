import { cpus } from "node:os";
import {
  type BrowserState,
  extractBrowserState,
  INTERACTIVE_SELECTOR,
} from "@jolty/browser";
import {
  type ControlledTask,
  type DecisionProvider,
  runControlledTask,
} from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import type { DecisionInput } from "@jolty/decision/contract";
import { uniqueLabelDecision } from "@jolty/decision/unique-label-gate";
import { chromium, type Page } from "playwright";
import { codexFallback } from "../src/codex-fallback.ts";
import { heuristicDecision } from "./heuristic.ts";
import { matchesDecisionLabel } from "./step-accuracy.ts";

const baseUrl = process.env.JOLTY_KENA_TEST_URL ?? "http://localhost:3012";
const base = new URL(baseUrl);
if (
  !["localhost", "127.0.0.1"].includes(base.hostname) ||
  base.protocol !== "http:"
)
  throw new Error("Kena benchmark requires a local fake-adapter test server");
const runs = Number(process.env.JOLTY_KENA_RUNS ?? 2);
if (!Number.isInteger(runs) || runs < 1)
  throw new Error("JOLTY_KENA_RUNS must be a positive integer");
const layaTopK = Number(process.env.JOLTY_KENA_LAYA_TOP_K ?? 10);
if (!Number.isInteger(layaTopK) || layaTopK < 1 || layaTopK > 10)
  throw new Error("JOLTY_KENA_LAYA_TOP_K must be an integer from 1 to 10");
const includeBack = process.env.JOLTY_KENA_INCLUDE_BACK !== "0";
const includeGate = process.env.JOLTY_KENA_INCLUDE_GATE === "1";
const includeCodex = process.env.JOLTY_INCLUDE_CODEX === "1";
const guildId = "222222222222222222"; // Kena's published fake-adapter guild slot.
const userId = "111111111111111111"; // Accepted only in KENA_TEST_MODE.
const startPath = `/en/guilds/${guildId}`;
const settingsPath = `${startPath}/settings`;
const flows = [
  {
    id: "configuration",
    kind: "navigate",
    goal: "Open server configuration",
    path: `${startPath}/settings`,
  },
  {
    id: "moderation",
    kind: "navigate",
    goal: "Open moderation settings",
    path: `${startPath}/moderation`,
  },
  {
    id: "levels",
    kind: "navigate",
    goal: "Open levels settings",
    path: `${startPath}/leveling`,
  },
  {
    id: "automations",
    kind: "navigate",
    goal: "Open server automations",
    path: `${startPath}/automations`,
  },
  {
    id: "staff",
    kind: "navigate",
    goal: "Open server staff",
    path: `${startPath}/staff`,
  },
  {
    id: "settings-prefix",
    kind: "type",
    goal: "Change the command prefix",
    startPath: settingsPath,
    targetName: "Prefix",
    value: "?",
  },
  {
    id: "language-options",
    kind: "reveal",
    goal: "Open the language choices",
    startPath: settingsPath,
    targetSelector: 'button[role="combobox"]:has-text("Spanish")',
    revealedRole: "option",
    revealedName: "English",
  },
] as const;

async function expectedTargetId(
  page: Page,
  state: BrowserState,
  selector: string | null,
  roleName: string | null,
): Promise<string> {
  if (roleName) {
    const targets = state.elements.filter(
      (element) => element.role === "textbox" && element.name === roleName,
    );
    if (targets.length !== 1)
      throw new Error(
        `Expected one Kena textbox named ${roleName}; found ${targets.length}`,
      );
    return targets[0].id;
  }
  const domIndex = await page
    .locator(selector ?? "")
    .evaluate(
      (element, interactiveSelector) =>
        Array.from(document.querySelectorAll(interactiveSelector)).indexOf(
          element,
        ),
      INTERACTIVE_SELECTOR,
    );
  const id = state.elements.find(
    (element) => element.domIndex === domIndex,
  )?.id;
  if (!id)
    throw new Error(
      `Labeled Kena target missing from browser state: ${selector}`,
    );
  return id;
}

function percentile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
}

const browser = await chromium.launch();
try {
  const laya = await LayaDecisionModel.load();
  try {
    const teacher = includeCodex ? codexFallback(0) : null;
    const policies: {
      name: string;
      version: string;
      provider: DecisionProvider;
      candidateLimit: number;
    }[] = [
      {
        name: "heuristic",
        version: "v0",
        provider: heuristicDecision,
        candidateLimit: 1,
      },
      {
        name: "Laya",
        version: LAYA_REVISION,
        candidateLimit: layaTopK,
        provider: {
          decide(input) {
            return laya.decide(
              {
                ...input,
                candidates: input.candidates.slice(0, layaTopK),
              },
              includeBack
                ? undefined
                : { targetFreeActions: ["scroll", "wait", "done"] },
            );
          },
        },
      },
      ...(includeGate
        ? [
            {
              name: "Laya with unique-label gate",
              version: `${LAYA_REVISION}+unique-label-v0`,
              candidateLimit: layaTopK,
              provider: {
                decide(input: DecisionInput) {
                  const start = performance.now();
                  const gate = uniqueLabelDecision(input);
                  if (gate)
                    return Promise.resolve({
                      status: "selected" as const,
                      ...gate,
                      confidence: null,
                      gate: true,
                      metrics: {
                        decision_latency_ms: performance.now() - start,
                        model_call_ms: 0,
                        tokenization_ms: null,
                        inference_ms: null,
                        input_tokens: null,
                      },
                    });
                  return laya.decide(
                    {
                      ...input,
                      candidates: input.candidates.slice(0, layaTopK),
                    },
                    includeBack
                      ? undefined
                      : { targetFreeActions: ["scroll", "wait", "done"] },
                  );
                },
              },
            },
          ]
        : []),
      ...(teacher
        ? [
            {
              name: "Codex ChatGPT subscription",
              version: teacher.model.version,
              provider: teacher.provider,
              candidateLimit: 10,
            },
          ]
        : []),
    ];
    const results = [];
    for (const flow of flows) {
      const initialPath = flow.kind === "navigate" ? startPath : flow.startPath;
      const targetSelector =
        flow.kind === "navigate"
          ? `a[href="${flow.path}"]`
          : flow.kind === "reveal"
            ? flow.targetSelector
            : null;
      const targetName = flow.kind === "type" ? flow.targetName : null;
      const action =
        flow.kind === "type" ? ("type" as const) : ("click" as const);
      for (const policy of policies) {
        const samples: {
          completed: boolean;
          correct: boolean;
          candidate_rank: number | null;
          selected_choice: string;
          decision_latency_ms: number | null;
          failure: string | null;
          observed_path: string;
        }[] = [];
        for (let iteration = 0; iteration <= runs; iteration++) {
          const reset = await fetch(
            new URL(`/api/_test/reset?guild=${guildId}`, base),
            { method: "POST" },
          );
          if (!reset.ok) throw new Error("Kena fake-adapter reset failed");
          const context = await browser.newContext({
            extraHTTPHeaders: { "x-test-discord-id": userId },
            bypassCSP: true,
          });
          try {
            const page = await context.newPage();
            await page.goto(new URL(initialPath, base).href, {
              waitUntil: "domcontentloaded",
              timeout: 60_000,
            });
            await page
              .getByTestId("sidebar-current-guild")
              .waitFor({ state: "visible" });
            await page.waitForFunction(
              () =>
                (window as unknown as { __kenaHydrated?: boolean })
                  .__kenaHydrated === true,
              undefined,
              { timeout: 15_000 },
            );
            const label = {
              phase: "initial",
              goal: flow.goal,
              action,
              targetSelector: targetSelector ?? undefined,
              expectedAfterAction: {
                kind: "visible_text" as const,
                text: "unused",
              },
            };
            let expectedId: string | null = null;
            let candidateRank = -1;
            let correct = false;
            let selectedChoice = "failed";
            if (flow.kind === "type") {
              const state = (await extractBrowserState(page)).state;
              expectedId = await expectedTargetId(
                page,
                state,
                targetSelector,
                targetName,
              );
            }
            const provider: DecisionProvider = {
              async decide(input) {
                expectedId = await expectedTargetId(
                  page,
                  input.state,
                  targetSelector,
                  targetName,
                );
                candidateRank = input.candidates.findIndex(
                  ({ element }) => element.id === expectedId,
                );
                const decision = await policy.provider.decide(input);
                correct = matchesDecisionLabel(decision, label, expectedId);
                if (decision.status === "selected") {
                  const rank = input.candidates.findIndex(
                    ({ element }) => element.id === decision.targetId,
                  );
                  selectedChoice = `${"gate" in decision && decision.gate === true ? "gate:" : ""}${decision.action}@${rank < 0 ? "none" : rank + 1}`;
                }
                return decision;
              },
            };
            const task: ControlledTask = {
              id: flow.id,
              steps: [
                {
                  goal: flow.goal,
                  checks:
                    flow.kind === "navigate"
                      ? [
                          {
                            kind: "url_changed",
                            to: new URL(flow.path, base).href,
                          },
                        ]
                      : flow.kind === "type"
                        ? [
                            {
                              kind: "input_value_changed",
                              targetId: expectedId ?? "",
                              expectedValue: flow.value,
                            },
                          ]
                        : [
                            {
                              kind: "element_appeared",
                              role: flow.revealedRole,
                              name: flow.revealedName,
                            },
                          ],
                  values:
                    flow.kind === "type"
                      ? [
                          {
                            action: "type",
                            target: { role: "textbox", name: flow.targetName },
                            value: flow.value,
                          },
                        ]
                      : undefined,
                },
              ],
            };
            const result = await runControlledTask(page, provider, task, {
              name: policy.name,
              version: policy.version,
            });
            if (iteration > 0)
              samples.push({
                completed: result.status === "completed",
                correct,
                candidate_rank: candidateRank < 0 ? null : candidateRank + 1,
                selected_choice: selectedChoice,
                decision_latency_ms:
                  result.steps[0]?.timing.decision_latency_ms ?? null,
                failure:
                  result.status === "failed"
                    ? (result.steps[0]?.final_outcome ?? "no_step")
                    : null,
                observed_path: new URL(page.url()).pathname,
              });
          } finally {
            await context.close();
          }
        }
        results.push({
          flow: flow.id,
          action,
          policy: policy.name,
          policy_candidate_top_k: policy.candidateLimit,
          successful_tasks: samples.filter(({ completed }) => completed).length,
          correct_decisions: samples.filter(({ correct }) => correct).length,
          candidate_recall_at_10: samples.filter(
            ({ candidate_rank }) => candidate_rank !== null,
          ).length,
          candidate_recall_at_policy_k: samples.filter(
            ({ candidate_rank }) =>
              candidate_rank !== null &&
              candidate_rank <= policy.candidateLimit,
          ).length,
          selected_choices: Object.fromEntries(
            [
              ...new Set(samples.map(({ selected_choice }) => selected_choice)),
            ].map((choice) => [
              choice,
              samples.filter(
                ({ selected_choice }) => selected_choice === choice,
              ).length,
            ]),
          ),
          measured_runs: samples.length,
          decision_latency_ms: {
            p50: percentile(
              samples.flatMap(({ decision_latency_ms }) =>
                decision_latency_ms === null ? [] : [decision_latency_ms],
              ),
              0.5,
            ),
            p95: percentile(
              samples.flatMap(({ decision_latency_ms }) =>
                decision_latency_ms === null ? [] : [decision_latency_ms],
              ),
              0.95,
            ),
          },
          failures: samples
            .filter(({ failure }) => failure !== null)
            .map(({ failure, observed_path }) => ({ failure, observed_path })),
        });
      }
    }
    console.log(
      JSON.stringify(
        {
          benchmark: "kena-local-flows-v1",
          target: "Kena local fake-adapter dashboard",
          browser_version: browser.version(),
          node_version: process.version,
          cpu: cpus()[0]?.model ?? null,
          warmup_runs_per_flow_policy: 1,
          measured_runs_per_flow_policy: runs,
          laya_top_k: layaTopK,
          back_option_included: includeBack,
          unique_label_gate_included: includeGate,
          model_revision: LAYA_REVISION,
          teacher_model: teacher?.model.version ?? null,
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
