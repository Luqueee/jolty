# Jolty

Jolty is a proposed local-first end-to-end testing framework for web applications. It aims to run browser tests with low latency and fewer calls to large generative models.

Many AI browser agents ask a large model to choose every next action. Jolty's proposed fast path instead filters the browser state, retrieves relevant candidates, and uses a small local **Browser Decision Model (BDM)** to choose an action. A large model handles planning and cases the fast path cannot resolve reliably. Playwright executes actions, and deterministic checks validate outcomes where possible.

```text
Test intent -> Planner -> Goals -> Browser
                                    |
                                    v
             State extraction -> Candidate retrieval -> BDM
                                                        |
                                                        v
                                    Decision or fallback -> Executor
                                                               |
                                                               v
                                                        Validator -> Trace
```

The design separates **System 1**, the repeated fast path, from **System 2**, the large-model planner and fallback. A later stage may compile successful traces into deterministic Playwright tests for repeat runs.

## Status

The repository has a pnpm and TypeScript workspace with Playwright and Vitest. BrowserState v0 extraction, deterministic candidate filtering and retrieval, a local Laya decision baseline, a Playwright executor and validator, in-memory step traces, local E2E fixtures, a controlled five-task fast-path loop, optional fallback through a ChatGPT-signed-in Codex CLI, and a controlled Parquet trace dataset exporter are implemented. General planning and arbitrary-site fallback remain proposed.

## Development

Use Node.js 24 or newer and pnpm 11.5.1.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run benchmark:state
pnpm run benchmark:filter
pnpm run benchmark:retrieval
pnpm run benchmark:decision
pnpm run benchmark:loop
pnpm run benchmark:compare
pnpm run benchmark:hybrid
pnpm run benchmark:kena
pnpm run dataset:export
pnpm run research:readiness
pnpm run jolty -- run modal --trace
```

The bootstrap `build` script currently checks TypeScript without emitting files. The Laya benchmark downloads a roughly 1.7 GB ONNX bundle on first use and keeps its session resident for the measured decisions.

## Read more

- [Architecture](docs/architecture.md): components, data flow, and runtime direction.
- [Browser state](docs/browser-state.md): the implemented BrowserState v0 contract.
- [Candidate filter](docs/candidate-filter.md): implemented filtering rules and metrics.
- [Candidate retrieval](docs/candidate-retrieval.md): lexical ranking, Top-K, and evaluation.
- [Controlled fixtures](docs/fixtures.md): reproducible browser scenarios and their expected outcomes.
- [Decision model](docs/decision-model.md): BDM inputs, outputs, baseline, and fallback.
- [Executor](docs/executor.md): bounded Playwright actions and failure contract.
- [Validator](docs/validator.md): deterministic checks and step outcomes.
- [Step traces](docs/trace-draft.md): in-memory evidence through validation and final outcome.
- [Controlled loop](docs/controlled-loop.md): five controlled fixture tasks and their CLI.
- [Large-model baseline](docs/large-model-baseline.md): the optional ChatGPT subscription comparison setup.
- [Controlled fallback](docs/fallback.md): optional escalation, trace fields, and hybrid benchmark.
- [Trace dataset](docs/dataset.md): versioned Parquet schema, label provenance, privacy limits, and split rules.
- [Research readiness](docs/research-readiness.md): Milestone 13 dataset audit and experiment admission gates.
- [Kena benchmark](docs/kena-benchmark.md): held-out dashboard navigation through local fake adapters.
- [Performance](docs/performance.md): fast-path design and engineering targets.
- [Benchmarks](docs/benchmarks.md): comparison baselines and evaluation metrics.
- [Roadmap](docs/roadmap.md): proposed development stages.
- [Research hypothesis](research/hypothesis.md): claims to test.
- [Original specification](SPECS.md): full source document.
