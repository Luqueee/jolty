import { describe, expect, it } from "vitest";
import { researchMultistepHeldout } from "../src/research/cases/research-multistep-heldout.ts";
import { researchMultistepFlowsV9 } from "../src/research/cases/research-multistep-v9.ts";
import {
  researchCasesForVersion,
  testFlowsForVersion,
} from "../src/research/catalog.ts";
import { parseResearchCommand } from "../src/research/command.ts";
import { reservedTestOrigins, splitByOrigin } from "../src/research/sources.ts";

describe("research command", () => {
  it("maps versioned collection to one runner", () => {
    expect(parseResearchCommand(["collect", "--version", "7"])).toEqual({
      script: "collect-research.ts",
      args: ["artifacts/research-corpus-v7.json"],
      env: { JOLTY_RESEARCH_CORPUS_VERSION: "7" },
    });
  });

  it("keeps a held-out probe tied to the earlier frozen head", () => {
    expect(
      parseResearchCommand([
        "benchmark",
        "--version",
        "6",
        "--head-version",
        "5",
        "--bias",
        "fitted",
      ]),
    ).toEqual({
      script: "benchmark-frozen-encoder.ts",
      args: [
        "artifacts/frozen-encoder-v5-biased.json",
        "artifacts/research-corpus-v5.json",
        "artifacts/frozen-encoder-live-v6-biased.json",
      ],
      env: { JOLTY_RESEARCH_CORPUS_VERSION: "6" },
    });
  });

  it("makes zero action bias explicit for the next fit", () => {
    expect(
      parseResearchCommand(["train", "--version", "7", "--bias", "zero"]),
    ).toEqual({
      script: "train-frozen-encoder.ts",
      args: [
        "artifacts/research-corpus-v7.json",
        "artifacts/frozen-encoder-v7.json",
      ],
      env: { JOLTY_FROZEN_ACTION_BIAS: "0" },
    });
  });

  it("keeps v9 test predictions out of matched-head fitting", () => {
    expect(
      parseResearchCommand(["train", "--version", "9", "--bias", "zero"]),
    ).toEqual({
      script: "train-frozen-encoder.ts",
      args: [
        "artifacts/research-corpus-v9.json",
        "artifacts/frozen-encoder-v9.json",
      ],
      env: { JOLTY_FROZEN_ACTION_BIAS: "0", JOLTY_FROZEN_HOLDOUT: "1" },
    });
  });

  it("routes the PEFT experiment through the research command", () => {
    expect(parseResearchCommand(["peft", "--stage", "smoke"])).toEqual({
      script: "peft-experiment.ts",
      args: ["smoke"],
      env: {},
    });
    expect(() => parseResearchCommand(["peft", "--stage", "score"])).toThrow();
  });

  it("rejects invalid versions, options, and measurements", () => {
    expect(() =>
      parseResearchCommand(["collect", "--version", "10"]),
    ).toThrow();
    expect(() =>
      parseResearchCommand(["collect", "--version", "07"]),
    ).toThrow();
    expect(() =>
      parseResearchCommand(["readiness", "--version", "7"]),
    ).toThrow();
    expect(() => parseResearchCommand(["public", "--runs", "0"])).toThrow();
    expect(() => parseResearchCommand(["train", "--bias", "maybe"])).toThrow();
    expect(() =>
      parseResearchCommand([
        "multistep",
        "--suite",
        "heldout",
        "--policy",
        "biased",
      ]),
    ).toThrow();
  });

  it("routes the held-out multistep suite to its own artifact", () => {
    expect(
      parseResearchCommand([
        "multistep",
        "--suite",
        "heldout",
        "--policy",
        "zero",
        "--runs",
        "3",
      ]),
    ).toEqual({
      script: "benchmark-research-multistep.ts",
      args: ["artifacts/research-multistep-heldout-zero.json"],
      env: {
        JOLTY_RESEARCH_MULTI_POLICY: "zero",
        JOLTY_RESEARCH_MULTI_SUITE: "heldout",
        JOLTY_RESEARCH_MULTI_RUNS: "3",
      },
    });
  });

  it("can probe a newer frozen head on the inspected multistep suite", () => {
    expect(
      parseResearchCommand([
        "multistep",
        "--suite",
        "heldout",
        "--policy",
        "zero",
        "--head-version",
        "8",
        "--runs",
        "3",
      ]),
    ).toEqual({
      script: "benchmark-research-multistep.ts",
      args: ["artifacts/research-multistep-heldout-zero-head-v8.json"],
      env: {
        JOLTY_RESEARCH_MULTI_POLICY: "zero",
        JOLTY_RESEARCH_MULTI_SUITE: "heldout",
        JOLTY_RESEARCH_MULTI_HEAD_VERSION: "8",
        JOLTY_RESEARCH_MULTI_RUNS: "3",
      },
    });
    expect(() =>
      parseResearchCommand([
        "multistep",
        "--policy",
        "laya",
        "--head-version",
        "8",
      ]),
    ).toThrow(/requires --policy zero/);
  });
});

describe("research catalog", () => {
  it("keeps every curated case on an approved split origin", () => {
    for (let version = 0; version <= 9; version++) {
      const cases = researchCasesForVersion(String(version));
      const flows = testFlowsForVersion(String(version));
      expect(cases.length).toBeGreaterThan(0);
      expect(flows.length).toBeGreaterThan(0);
      for (const entry of cases)
        expect(splitByOrigin.get(new URL(entry.url).origin)).toBe(entry.split);
      for (const flow of flows)
        expect(reservedTestOrigins.has(new URL(flow.url).origin)).toBe(true);
    }
  });

  it("keeps the held-out multistep origins outside every corpus split", () => {
    expect(researchMultistepHeldout).toHaveLength(2);
    for (const flow of researchMultistepHeldout) {
      expect(splitByOrigin.has(new URL(flow.url).origin)).toBe(false);
      expect(flow.labels.length).toBeGreaterThan(1);
      expect(new Set(flow.labels.map((label) => label.goal)).size).toBe(
        flow.labels.length,
      );
    }
  });

  it("locks the PEFT site allocation before case authoring", () => {
    const allocation = {
      train: ["https://www.play-qa.com", "https://dojo.upexgalaxy.com"],
      validation: ["https://www.syntaxprojects.com"],
      test: [
        "https://automationexercise.com",
        "https://www.demoblaze.com",
        "https://parabank.parasoft.com",
      ],
    } as const;
    const origins = Object.values(allocation).flat();
    expect(new Set(origins).size).toBe(origins.length);
    for (const [split, splitOrigins] of Object.entries(allocation)) {
      for (const origin of splitOrigins) {
        expect(splitByOrigin.get(origin)).toBe(split);
        expect(reservedTestOrigins.has(origin)).toBe(split === "test");
        for (let version = 0; version <= 8; version++) {
          expect(
            researchCasesForVersion(String(version)).some(
              (entry) => new URL(entry.url).origin === origin,
            ),
          ).toBe(false);
        }
      }
    }
  });

  it("keeps the PEFT corpus and reference flows above the pre-registered admission counts", () => {
    const freshOrigins = new Set([
      "https://www.play-qa.com",
      "https://dojo.upexgalaxy.com",
      "https://www.syntaxprojects.com",
      "https://automationexercise.com",
      "https://www.demoblaze.com",
      "https://parabank.parasoft.com",
    ]);
    const fresh = researchCasesForVersion("9").filter((entry) =>
      freshOrigins.has(new URL(entry.url).origin),
    );
    for (const entry of fresh)
      expect(entry.postcondition).toBeTypeOf("function");
    const count = (origin: string) =>
      fresh.filter((entry) => new URL(entry.url).origin === origin).length;
    expect(count("https://www.play-qa.com")).toBeGreaterThanOrEqual(25);
    expect(count("https://dojo.upexgalaxy.com")).toBeGreaterThanOrEqual(25);
    expect(
      fresh.filter((entry) => entry.split === "train").length,
    ).toBeGreaterThanOrEqual(60);
    expect(count("https://www.syntaxprojects.com")).toBeGreaterThanOrEqual(20);
    for (const origin of [
      "https://automationexercise.com",
      "https://www.demoblaze.com",
      "https://parabank.parasoft.com",
    ])
      expect(count(origin)).toBeGreaterThanOrEqual(10);
    expect(
      fresh.filter((entry) => entry.split === "test").length,
    ).toBeGreaterThanOrEqual(30);
    for (const mode of [
      "search_field_button_conflict",
      "duplicate_nearby_labels",
      "post_transition_control",
    ] as const)
      expect(
        fresh.filter(
          (entry) =>
            entry.split !== "test" && entry.failureModes?.includes(mode),
        ).length,
      ).toBeGreaterThanOrEqual(6);
    expect(researchMultistepFlowsV9).toHaveLength(9);
    for (const origin of [
      "https://automationexercise.com",
      "https://www.demoblaze.com",
      "https://parabank.parasoft.com",
    ])
      expect(
        researchMultistepFlowsV9.filter(
          (flow) =>
            new URL(flow.url).origin === origin && flow.labels.length >= 3,
        ),
      ).toHaveLength(3);
    const testLabels = fresh
      .filter((entry) => entry.split === "test")
      .map(
        (entry) =>
          `${entry.site}:${entry.goal}:${entry.action}:${entry.target}`,
      );
    for (const flow of researchMultistepFlowsV9)
      for (const label of flow.labels)
        expect(testLabels).toContain(
          `${flow.site}:${label.goal}:${label.action}:${label.target}`,
        );
  });
});
