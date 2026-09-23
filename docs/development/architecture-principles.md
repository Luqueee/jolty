# Architecture Principles

These principles define how Jolty should evolve internally.

They complement `SPECS.md` and `MILESTONES.md`.

## Explicit boundaries

Each subsystem should have one clear responsibility.

The intended data flow is:

```text
Planner
  ↓
Browser
  ↓
State Extraction
  ↓
Candidate Retrieval
  ↓
Decision
  ↓
Execution
  ↓
Validation
  ↓
Trace
```

Do not merge responsibilities simply because it is convenient.

Examples:

* browser extraction must not depend on a specific model;
* retrieval must not execute browser actions;
* decision logic must not depend directly on Playwright;
* validation must not silently perform recovery;
* telemetry must observe execution rather than control it.

## Contracts over implementations

Subsystems should communicate through explicit domain contracts.

Examples:

```text
BrowserState
Candidate
RankedCandidate
Decision
BrowserAction
ValidationResult
Trace
```

Do not leak implementation-specific objects across subsystem boundaries.

Avoid exposing:

* Playwright objects;
* ONNX Runtime objects;
* provider SDK responses;
* persistence-specific records.

Infrastructure should adapt to Jolty's domain model, not define it.

## Dependency direction

Dependencies should flow in one direction.

Avoid cyclic package dependencies.

Low-level components must not depend back on orchestration code.

Keep package boundaries understandable without relying on runtime magic or global state.

## Policy vs mechanism

Separate decisions about **what should happen** from **how it happens**.

Examples:

* ranking policy is separate from browser extraction;
* action selection is separate from Playwright execution;
* fallback policy is separate from LLM provider adapters;
* benchmark methodology is separate from telemetry storage.

This makes each layer replaceable and independently testable.

## Functional core, imperative shell

Keep deterministic logic pure where practical.

Good candidates include:

* normalization;
* filtering;
* candidate scoring;
* ranking;
* action validation;
* result classification.

Keep side effects at system boundaries:

* browser interaction;
* filesystem access;
* network calls;
* model inference;
* persistence.

Pure logic should normally be testable without launching a browser.

## Explicit data flow

Prefer visible transformations:

```text
Page
→ BrowserState
→ Candidates
→ RankedCandidates
→ Decision
→ BrowserAction
→ ValidationResult
```

Avoid hidden mutations and shared global state.

Inputs and outputs should be inspectable and traceable.

## Replaceable components

Jolty is experimental.

Do not permanently couple core architecture to:

* Laya;
* a specific encoder;
* ONNX Runtime;
* a specific LLM provider;
* a specific storage implementation.

The first implementation may use them, but architectural seams should allow meaningful alternatives to be benchmarked.

Do not create speculative abstraction layers for replacements that do not yet exist.

Add abstractions where a real boundary already exists.

## Failure is part of the design

Failures must be explicit.

Distinguish between:

```text
state extraction failure
candidate retrieval failure
low confidence
model failure
execution failure
validation failure
fallback failure
```

Do not collapse unrelated failures into a generic retry.

Do not silently recover in ways that hide incorrect behavior from traces or benchmarks.

## Observability

Every important decision should be reconstructable after execution.

It should be possible to determine:

* what browser state was observed;
* which candidates were considered;
* how they were ranked;
* what decision was selected;
* model confidence;
* whether fallback occurred;
* stage latency;
* validation outcome.

Opaque decision paths should be treated as an architectural problem.

## Simplicity

Choose the simplest architecture that satisfies the current milestone.

Avoid:

* speculative frameworks;
* unnecessary factories;
* deep inheritance;
* service layers without meaningful boundaries;
* wrappers around wrappers;
* distributed architecture for local problems;
* abstractions created solely for future possibilities.

Duplication can be cheaper than the wrong abstraction.

Extract shared abstractions only after the common behavior is understood.

## Performance-sensitive architecture

The browser decision loop is a hot path.

Avoid unnecessary:

* serialization;
* IPC;
* network calls;
* process boundaries;
* repeated initialization;
* large intermediate structures;
* duplicate transformations.

Keep persistent resources such as browser processes and model sessions alive when appropriate.

Architectural changes affecting the hot path should be justified with measurements.

## Security boundaries

Browser content is untrusted data.

Page text must never gain authority over Jolty's internal instructions.

Never execute arbitrary code produced by:

* a page;
* a model;
* an external provider.

Secrets, authentication tokens, and sensitive user data must not enter traces or training datasets unintentionally.

## Architectural decisions

Significant decisions that require historical context should be recorded under:

```text
docs/decisions/
```

Use an ADR when a decision:

* affects multiple subsystems;
* introduces a major dependency;
* changes the hot path;
* changes a core contract;
* is likely to be questioned or revisited later.