# TypeScript Guidelines

These guidelines define how TypeScript code should be structured in Jolty.

The goal is to keep the codebase easy to navigate, test, refactor, and optimize.

## Prefer cohesive modules

A file should represent one cohesive concept or responsibility.

Prefer:

```text
browser-state.ts
browser-element.ts
candidate-filter.ts
candidate-ranker.ts
decision.ts
executor.ts
validator.ts
trace.ts
```

over large files containing several unrelated responsibilities.

## Avoid oversized files

There is no strict line-count limit, but file size should trigger architectural review.

As a guideline:

* files under roughly 200–300 lines are usually easy to navigate;
* files approaching 300–400 lines should be reviewed for natural boundaries;
* files significantly larger than that require a clear reason;
* a 1,000-line source file should be exceptional.

Do not split files merely to satisfy a line-count target.

Split when responsibilities are distinct.

## Split by responsibility, not syntax

Do not organize code mechanically into:

```text
types.ts
interfaces.ts
functions.ts
constants.ts
helpers.ts
```

Prefer domain-oriented modules:

```text
retrieval/
├── candidate.ts
├── candidate-filter.ts
├── candidate-ranker.ts
└── candidate-ranker.test.ts
```

Avoid:

```text
retrieval/
├── types.ts
├── interfaces.ts
├── constants.ts
├── utils.ts
└── functions.ts
```

The question should be:

> What responsibility does this module own?

not:

> What TypeScript syntax does this file contain?

## Keep types close to their domain

Do not create giant shared type files.

Avoid:

```text
types.ts
```

containing hundreds of lines of unrelated project types.

Prefer:

```text
browser/
├── browser-state.ts
└── browser-element.ts

retrieval/
├── candidate.ts
└── ranked-candidate.ts

decision/
├── decision.ts
└── browser-action.ts
```

A type should normally live near the subsystem that owns its meaning.

Move a type into a shared contract only when multiple subsystems genuinely depend on it.

## Avoid type-heavy modules with little behavior

Do not create a 700-line module where most of the file consists of interfaces, aliases, enums, and generic machinery supporting a small amount of implementation.

If a domain has enough types to become difficult to navigate, split it into smaller concepts.

Prefer simple domain types over elaborate type-level architectures.

Avoid:

* deeply nested conditional types;
* excessive generic parameters;
* type-level programming with little runtime value;
* duplicate representations of the same concept.

## Avoid generic dumping grounds

Avoid broad modules named:

```text
utils.ts
helpers.ts
common.ts
misc.ts
```

Prefer intent-revealing modules such as:

```text
normalize-label.ts
score-text-match.ts
measure-duration.ts
serialize-browser-state.ts
```

A generic utility module should remain very small and tightly scoped.

## Keep functions focused

Functions should have explicit inputs and outputs.

Review a function when it:

* performs unrelated transformations;
* contains multiple unrelated side effects;
* requires many boolean flags;
* becomes deeply nested;
* needs excessive comments to explain control flow.

Split by responsibility when doing so makes the domain clearer.

Do not create dozens of trivial wrappers solely to make functions shorter.

## Prefer functions for stateless logic

Use plain functions for:

* normalization;
* filtering;
* scoring;
* ranking;
* validation;
* mapping;
* transformations.

Use classes when they model meaningful lifecycle or state, such as:

* browser ownership;
* model sessions;
* long-lived resources.

Do not introduce classes solely for organization.

## Prefer composition over inheritance

Avoid deep inheritance hierarchies.

Prefer small contracts and composed implementations.

Inheritance should only be used when the relationship is genuinely structural and simpler than composition.

## Keep exports intentional

Modules should expose only what other parts of the system need.

Do not export internal helpers simply because they exist.

Avoid giant barrel files that re-export entire package trees and make dependency direction difficult to understand.

Package APIs should remain explicit.

## Colocate related code

Tests should normally live close to the implementation they validate.

Prefer:

```text
candidate-ranker.ts
candidate-ranker.test.ts
```

When a concept grows, a focused directory is acceptable:

```text
candidate-ranker/
├── candidate-ranker.ts
├── candidate-ranker.test.ts
└── scoring.ts
```

Do not create directories containing one trivial file without a reason.

## Keep infrastructure at the edges

Core domain code should not depend directly on:

* Playwright internals;
* ONNX Runtime internals;
* database clients;
* external provider SDKs.

Use small adapters where infrastructure meets domain contracts.

This keeps pure logic easy to test and replace.

## Avoid hidden state

Prefer passing dependencies explicitly.

Avoid:

* mutable module globals;
* invisible singleton state;
* initialization through import side effects;
* functions whose behavior depends on unrelated global configuration.

Long-lived resources may be owned explicitly by runtime objects when lifecycle matters.

## Error handling

Use meaningful error boundaries.

Do not catch errors only to discard information.

Different failures should remain distinguishable where the distinction matters.

Avoid turning all errors into strings early in the pipeline.

Preserve useful context for traces and debugging.

## Performance-sensitive TypeScript

In the hot path:

* avoid unnecessary object copying;
* avoid repeated parsing or normalization;
* avoid large temporary arrays when a cheaper iteration works;
* avoid serializing data unless required;
* reuse long-lived resources where safe;
* do not sacrifice readability for micro-optimizations without measurements.

Measure before introducing low-level complexity.

## Tests

Prefer:

* unit tests for pure functions;
* integration tests for subsystem boundaries;
* Playwright tests for real browser behavior;
* benchmarks for hot-path code.

Do not test implementation details unnecessarily.

Tests should make refactoring easier, not harder.

## Review checklist

Before finishing a TypeScript change, ask:

* Does each file have one clear responsibility?
* Is any file becoming unnecessarily large?
* Are types close to the domain that owns them?
* Did I introduce a generic `types.ts`, `utils.ts`, or `helpers.ts` dumping ground?
* Could a large module be split along real domain boundaries?
* Are dependencies explicit?
* Is infrastructure leaking into core logic?
* Is the code easy to test?
* Did I add an abstraction before it was needed?
* Did I preserve readability while optimizing?
