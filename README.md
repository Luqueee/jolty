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

The repository has a pnpm and TypeScript workspace with Playwright and Vitest. BrowserState v0 extraction, tests, and a controlled extraction benchmark are implemented. Retrieval, decision models, and the CLI are not implemented. The broader architecture and performance targets remain proposed.

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
```

The bootstrap `build` script currently checks TypeScript without emitting files. Only `packages/browser` has runtime code; the other workspace packages remain scaffolds for later milestones.

## Read more

- [Architecture](docs/architecture.md): components, data flow, and runtime direction.
- [Browser state](docs/browser-state.md): the proposed browser representation and candidate filtering contract.
- [Decision model](docs/decision-model.md): BDM inputs, outputs, baseline, and fallback.
- [Performance](docs/performance.md): fast-path design and engineering targets.
- [Benchmarks](docs/benchmarks.md): comparison baselines and evaluation metrics.
- [Roadmap](docs/roadmap.md): proposed development stages.
- [Research hypothesis](research/hypothesis.md): claims to test.
- [Original specification](SPECS.md): full source document.
