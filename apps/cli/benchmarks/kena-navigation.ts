import { cpus } from "node:os";
import { type DecisionProvider, runControlledTask } from "@jolty/core";
import { LAYA_REVISION, LayaDecisionModel } from "@jolty/decision";
import { chromium } from "playwright";
import { codexFallback } from "../src/codex-fallback.ts";
import { heuristicDecision } from "./heuristic.ts";
import { expectedTargetId, matchesDecisionLabel } from "./step-accuracy.ts";

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
const includeCodex = process.env.JOLTY_INCLUDE_CODEX === "1";
const guildId = "222222222222222222"; // Kena's published fake-adapter guild slot.
const userId = "111111111111111111"; // Accepted only in KENA_TEST_MODE.
const startPath = `/en/guilds/${guildId}`;
const flows = [
  {
    id: "configuration",
    goal: "Open server configuration",
    path: `${startPath}/settings`,
  },
  {
    id: "moderation",
    goal: "Open moderation settings",
    path: `${startPath}/moderation`,
  },
  { id: "levels", goal: "Open levels settings", path: `${startPath}/leveling` },
  {
    id: "automations",
    goal: "Open server automations",
    path: `${startPath}/automations`,
  },
  { id: "staff", goal: "Open server staff", path: `${startPath}/staff` },
] as const;

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
    }[] = [
      { name: "heuristic", version: "v0", provider: heuristicDecision },
      { name: "Laya", version: LAYA_REVISION, provider: laya },
      ...(teacher
        ? [
            {
              name: "Codex ChatGPT subscription",
              version: teacher.model.version,
              provider: teacher.provider,
            },
          ]
        : []),
    ];
    const results = [];
    for (const flow of flows) {
      for (const policy of policies) {
        const samples = [];
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
            await page.goto(new URL(startPath, base).href, {
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
              action: "click" as const,
              targetSelector: `a[href="${flow.path}"]`,
              expectedAfterAction: {
                kind: "visible_text" as const,
                text: "unused",
              },
            };
            let expectedId: string | null = null;
            let candidateRank = -1;
            let correct = false;
            const provider: DecisionProvider = {
              async decide(input) {
                expectedId = await expectedTargetId(page, input.state, label);
                candidateRank = input.candidates.findIndex(
                  ({ element }) => element.id === expectedId,
                );
                const decision = await policy.provider.decide(input);
                correct = matchesDecisionLabel(decision, label, expectedId);
                return decision;
              },
            };
            const task = {
              id: flow.id,
              steps: [
                {
                  goal: flow.goal,
                  checks: [
                    {
                      kind: "url_changed" as const,
                      to: new URL(flow.path, base).href,
                    },
                  ],
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
          policy: policy.name,
          successful_tasks: samples.filter(({ completed }) => completed).length,
          correct_decisions: samples.filter(({ correct }) => correct).length,
          candidate_recall_at_10: samples.filter(
            ({ candidate_rank }) => candidate_rank !== null,
          ).length,
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
          benchmark: "kena-local-navigation-v0",
          target: "Kena local fake-adapter dashboard",
          browser_version: browser.version(),
          node_version: process.version,
          cpu: cpus()[0]?.model ?? null,
          warmup_runs_per_flow_policy: 1,
          measured_runs_per_flow_policy: runs,
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
