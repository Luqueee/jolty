import { chromium } from "playwright";
import {
  fixtureUrl,
  installFixtureRoutes,
} from "../../browser/fixtures/routes.ts";
import { extractBrowserState } from "../../browser/src/index.ts";
import { retrievalCases, targetIdFor } from "../eval/cases.ts";
import { filterCandidates } from "../src/candidate-filter.ts";
import { retrieveCandidates } from "../src/candidate-retrieval.ts";

const browser = await chromium.launch();
try {
  const cases = [];
  for (const testCase of retrievalCases) {
    const page = await browser.newPage();
    try {
      await installFixtureRoutes(page);
      await page.goto(fixtureUrl(testCase.fixture));
      const candidates = filterCandidates(
        (await extractBrowserState(page)).state,
      ).candidates;
      const targetId = targetIdFor(candidates, testCase);
      if (!targetId)
        throw new Error(`Missing ground truth target for ${testCase.fixture}`);
      cases.push({ testCase, candidates, targetId });
    } finally {
      await page.close();
    }
  }

  for (let i = 0; i < 10; i++) {
    for (const entry of cases)
      retrieveCandidates(entry.testCase.goal, entry.candidates);
  }
  const samples: number[] = [];
  const ranks: { fixture: string; goal: string; rank: number }[] = [];
  for (let i = 0; i < 100; i++) {
    for (const entry of cases) {
      const result = retrieveCandidates(entry.testCase.goal, entry.candidates);
      samples.push(result.metrics.candidate_retrieval_ms);
      if (i === 0) {
        ranks.push({
          fixture: entry.testCase.fixture,
          goal: entry.testCase.goal,
          rank:
            result.ranked.findIndex(
              ({ element }) => element.id === entry.targetId,
            ) + 1,
        });
      }
    }
  }
  samples.sort((a, b) => a - b);
  const percentile = (p: number) => samples[Math.ceil(samples.length * p) - 1];
  const recallAt = (k: number) =>
    ranks.filter(({ rank }) => rank > 0 && rank <= k).length / ranks.length;
  console.log(
    JSON.stringify(
      {
        benchmark: "candidate-retrieval-v0",
        fixture_cases: cases.length,
        warmup_cycles: 10,
        measured_decisions: samples.length,
        recall_at_1: recallAt(1),
        recall_at_5: recallAt(5),
        recall_at_10: recallAt(10),
        candidate_retrieval_ms: {
          p50: percentile(0.5),
          p95: percentile(0.95),
          p99: percentile(0.99),
        },
        ranks,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
