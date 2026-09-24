import { latestResearchVersion, parseResearchVersion } from "./catalog.ts";

export interface ResearchCommand {
  script: string;
  args: string[];
  env: Record<string, string>;
}

const scripts = {
  collect: "collect-research.ts",
  readiness: "research-readiness.ts",
  train: "train-frozen-encoder.ts",
  baseline: "evaluate-laya-corpus.ts",
  benchmark: "benchmark-frozen-encoder.ts",
  multistep: "benchmark-research-multistep.ts",
  public: "../../benchmarks/public-sites.ts",
} as const;
type Operation = keyof typeof scripts;
const allowedOptions: Record<Operation, readonly string[]> = {
  collect: ["version", "output"],
  readiness: ["dataset"],
  train: ["version", "corpus", "output", "bias"],
  baseline: ["version", "corpus", "output", "include-codex"],
  benchmark: ["version", "head", "head-version", "corpus", "output", "bias"],
  multistep: ["policy", "suite", "runs", "output"],
  public: ["version", "runs", "flows", "policies"],
};

export const researchHelp = `Usage: pnpm research <command> [options]
Commands: collect, readiness, train, baseline, benchmark, multistep, public
Corpus versions: 0-${latestResearchVersion} (default: 0)
Options: --version N, --output PATH, --corpus PATH, --head PATH,
  --head-version N, --bias zero|fitted, --include-codex,
  --dataset DIR, --policy reference|zero|biased|laya, --suite v6|heldout,
  --runs N, --flows IDS, --policies NAMES`;

export function parseResearchCommand(argv: readonly string[]): ResearchCommand {
  const [operation, ...tokens] = argv;
  if (!operation || !(operation in scripts)) throw new Error(researchHelp);
  const command = operation as Operation;
  const options = new Map<string, string>();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token?.startsWith("--"))
      throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!allowedOptions[command].includes(name))
      throw new Error(`Unknown ${command} option: ${token}`);
    if (options.has(name)) throw new Error(`Duplicate option: ${token}`);
    if (name === "include-codex") {
      options.set(name, "1");
      continue;
    }
    const value = tokens[++index];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${token}`);
    options.set(name, value);
  }
  const get = (name: string) => options.get(name);
  const version = get("version") ?? "0";
  if (get("version")) parseResearchVersion(version);
  const artifact = (name: string, versionNumber = version) =>
    `artifacts/${name}-v${versionNumber}.json`;
  const runs = get("runs");
  if (
    runs &&
    (!Number.isSafeInteger(Number(runs)) ||
      Number(runs) < 1 ||
      String(Number(runs)) !== runs)
  )
    throw new Error("--runs must be a positive integer");
  const env: Record<string, string> = {};
  let args: string[] = [];
  switch (command) {
    case "collect":
      env.JOLTY_RESEARCH_CORPUS_VERSION = version;
      args = [get("output") ?? artifact("research-corpus")];
      break;
    case "readiness":
      args = [get("dataset") ?? "artifacts/dataset-v1-fallback"];
      break;
    case "train": {
      const bias = get("bias") ?? "fitted";
      if (bias !== "zero" && bias !== "fitted")
        throw new Error("--bias must be zero or fitted");
      env.JOLTY_FROZEN_ACTION_BIAS = bias === "zero" ? "0" : "1";
      args = [
        get("corpus") ?? artifact("research-corpus"),
        get("output") ?? artifact("frozen-encoder"),
      ];
      break;
    }
    case "baseline":
      if (get("include-codex")) env.JOLTY_RESEARCH_INCLUDE_CODEX = "1";
      args = [
        get("corpus") ?? artifact("research-corpus"),
        get("output") ??
          (version === "0"
            ? "artifacts/laya-research-test.json"
            : artifact("laya-research-test")),
      ];
      break;
    case "benchmark": {
      const headVersion = get("head-version") ?? version;
      parseResearchVersion(headVersion);
      const bias = get("bias") ?? "zero";
      if (bias !== "zero" && bias !== "fitted")
        throw new Error("--bias must be zero or fitted");
      const suffix = bias === "fitted" && headVersion === "5" ? "-biased" : "";
      env.JOLTY_RESEARCH_CORPUS_VERSION = version;
      args = [
        get("head") ?? `artifacts/frozen-encoder-v${headVersion}${suffix}.json`,
        get("corpus") ?? artifact("research-corpus", headVersion),
        get("output") ??
          `artifacts/frozen-encoder-live-v${version}${suffix}.json`,
      ];
      break;
    }
    case "multistep": {
      const policy = get("policy") ?? "reference";
      if (!["reference", "zero", "biased", "laya"].includes(policy))
        throw new Error("--policy must be reference, zero, biased, or laya");
      const suite = get("suite") ?? "v6";
      if (suite !== "v6" && suite !== "heldout")
        throw new Error("--suite must be v6 or heldout");
      if (suite === "heldout" && policy === "biased")
        throw new Error("The held-out suite has no fitted-intercept head");
      env.JOLTY_RESEARCH_MULTI_POLICY = policy;
      env.JOLTY_RESEARCH_MULTI_SUITE = suite;
      if (runs) env.JOLTY_RESEARCH_MULTI_RUNS = runs;
      args = [
        get("output") ?? `artifacts/research-multistep-${suite}-${policy}.json`,
      ];
      break;
    }
    case "public": {
      env.JOLTY_PUBLIC_CORPUS_VERSION = version;
      if (runs) env.JOLTY_PUBLIC_RUNS = runs;
      const flows = get("flows");
      const policies = get("policies");
      if (flows) env.JOLTY_PUBLIC_FLOWS = flows;
      if (policies) env.JOLTY_PUBLIC_POLICIES = policies;
      break;
    }
  }
  return { script: scripts[command], args, env };
}
