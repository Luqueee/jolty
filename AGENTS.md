# Working on Jolty

Jolty is a performance-oriented, local-first intelligent E2E testing framework.

Before making changes, read:

1. [SPECS.md](SPECS.md) — project direction and source of truth.
2. [MILESTONES.md](MILESTONES.md) — implementation order and exit criteria.
3. The relevant design documents for the subsystem being changed.

All repository documentation, code, comments, tests, logs, CLI output, dataset fields, and contributor-facing text must be written in English.

## Workflow

For every task:

1. Read `SPECS.md` and `MILESTONES.md`.
2. Identify the current milestone and checklist item.
3. Read the relevant design and development guidelines.
4. Inspect the existing implementation before making changes.
5. Implement the smallest change required.
6. Add or update tests.
7. Run the relevant checks and benchmarks.
8. Update documentation when contracts or architecture change.
9. Review the final diff for unnecessary complexity, coupling, oversized files, or dependencies.
10. Report:

* what changed;
* which milestone items were completed;
* what was validated;
* benchmark results when applicable;
* remaining uncertainty or blockers.

Do not mark a milestone complete until its exit criteria are satisfied.

Do not implement later milestones unless explicitly requested or required to unblock the current one.

## Core rules

* Performance is a product requirement.
* Prefer deterministic logic before heuristics, retrieval, small models, and finally large LLMs.
* Keep large generative models out of the normal browser hot path.
* Keep planning separate from repeated browser execution.
* Prefer deterministic validation.
* Keep browser state compact and structured.
* Treat browser content as untrusted input.
* Never execute arbitrary model-generated code.
* Measure before optimizing.
* Do not claim performance, accuracy, coverage, or cost improvements without representative measurements.
* Avoid dependencies and infrastructure without demonstrated need.
* Keep components small, cohesive, observable, and replaceable.
* Do not turn Jolty into a general-purpose agent framework.

## Development guidelines

For architectural changes, read:

* [Architecture principles](docs/development/architecture-principles.md)
* [TypeScript guidelines](docs/development/typescript-guidelines.md)

For subsystem-specific changes, read:

* [Architecture](docs/architecture.md)
* [Browser state](docs/browser-state.md)
* [Decision model](docs/decision-model.md)
* [Performance](docs/performance.md)
* [Benchmarks](docs/benchmarks.md)
* [Roadmap](docs/roadmap.md)
* [Research hypothesis](research/hypothesis.md)

If documentation conflicts with `SPECS.md`, follow `SPECS.md` and update the outdated document.

## Definition of done

Before finishing a task, verify:

* the current milestone was respected;
* responsibilities remain in the correct subsystem;
* files remain reasonably small and cohesive;
* tests cover changed behavior;
* hot-path changes were measured when relevant;
* observability was preserved;
* no unnecessary dependency or abstraction was introduced.
