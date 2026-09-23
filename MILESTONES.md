# Jolty Milestones

This document defines the initial implementation path for Jolty.

It is intentionally sequential. Complete and validate each milestone before expanding scope.

> **Rule:** do not skip ahead unless the current milestone has met its exit criteria.

---

## Milestone 0 — Repository Bootstrap

### Goal

Create the minimum project structure required to start implementation without introducing unnecessary infrastructure.

### Checklist

- [x] Initialize the TypeScript workspace.
- [x] Use Node.js as the runtime.
- [x] Add Playwright.
- [x] Add Vitest.
- [x] Enable strict TypeScript.
- [x] Add formatter/linter configuration.
- [x] Create the initial package structure:
  - [x] `apps/cli`
  - [x] `packages/browser`
  - [x] `packages/retrieval`
  - [x] `packages/decision`
  - [x] `packages/core`
  - [x] `packages/telemetry`
- [x] Keep documentation consistent with `SPECS.md`.
- [x] Verify the repository builds and tests successfully.

### Exit criteria

- [x] The workspace installs cleanly.
- [x] Type-checking passes.
- [x] Tests can be executed.
- [x] Playwright can launch a browser in a minimal test.

### Do not add yet

- SQLite
- ONNX Runtime
- Python runtime dependencies
- LLM integrations
- vector databases
- dashboards
- distributed services

---

## Milestone 1 — BrowserState v0

### Goal

Define the first stable, compact representation of what Jolty observes from a web page.

This contract will be used by retrieval, decision models, traces, datasets, and benchmarks.

### Checklist

- [x] Define `BrowserState`.
- [x] Define the representation of an interactive element.
- [x] Include only relevant fields such as:
  - [x] element ID
  - [x] role
  - [x] accessible name / label
  - [x] visible text
  - [x] value when relevant
  - [x] visible state
  - [x] enabled state
  - [x] editable state
  - [x] selected state when relevant
  - [x] URL
  - [x] page title when useful
- [x] Ensure element IDs are stable during a single decision step.
- [x] Ensure the state is serializable.
- [x] Keep the representation compact.
- [x] Document the contract in `docs/browser-state.md`.

### Measure

- [x] `state_extraction_ms`
- [x] total DOM node count
- [x] extracted interactive element count
- [x] serialized state size

### Exit criteria

- [x] Jolty can transform a real page into `BrowserState`.
- [x] The representation is deterministic enough for tests.
- [x] The representation does not require the full raw DOM.
- [x] State extraction has benchmark coverage.

### Do not add yet

- screenshots by default
- vision models
- embeddings
- decision models

---

## Milestone 2 — Controlled E2E Fixtures

### Goal

Create deterministic web scenarios for development and benchmarking.

Do not start by testing arbitrary production websites.

### Checklist

Create fixtures covering at least:

- [x] login form
- [x] logout flow
- [x] profile/settings page
- [x] generic form submission
- [x] validation error
- [x] modal
- [x] dropdown/select
- [x] tabs
- [x] redirect
- [x] delayed/loading state
- [x] duplicate or ambiguous labels
- [x] scroll-to-element scenario

For each fixture:

- [x] define the expected goal
- [x] define valid actions
- [x] define the expected successful outcome
- [x] make the fixture reproducible
- [x] avoid external network dependencies where practical

### Exit criteria

- [x] Fixtures run locally.
- [x] Their expected outcomes are deterministic.
- [x] They can be used by Playwright tests and benchmarks.

---

## Milestone 3 — Candidate Filtering

### Goal

Reduce the page to elements that could plausibly participate in the next action.

### Checklist

- [x] Filter non-visible elements when appropriate.
- [x] Filter non-interactive elements when appropriate.
- [x] Preserve editable elements.
- [x] Preserve enabled actionable controls.
- [x] Preserve ARIA-relevant interactive elements.
- [x] Preserve candidates required by fixture ground truth.
- [x] Keep filtering deterministic.
- [x] Add tests for edge cases.

### Measure

- [x] input element count
- [x] output element count
- [x] `candidate_filter_ms`

### Exit criteria

- [x] Filtering reduces the search space significantly in controlled noisy cases.
- [x] Correct fixture targets are not accidentally removed.
- [ ] Filtering remains cheap relative to model inference. This comparison requires the Milestone 5 model baseline.

---

## Milestone 4 — Candidate Retrieval v0

### Goal

Rank filtered candidates against the current goal without using a model.

### Initial signals

Use inexpensive signals first:

- [ ] exact text match
- [ ] normalized text match
- [ ] label match
- [ ] role compatibility
- [ ] keyword overlap with the goal
- [ ] element state
- [ ] interaction history when available

### Checklist

- [ ] Implement deterministic scoring.
- [ ] Return ranked candidates.
- [ ] Support configurable Top-K.
- [ ] Add retrieval tests.
- [ ] Add fixture-based evaluation.

### Measure

- [ ] `Recall@1`
- [ ] `Recall@5`
- [ ] `Recall@10`
- [ ] `candidate_retrieval_ms`

### Exit criteria

- [ ] Retrieval has a reproducible benchmark.
- [ ] Correct targets appear in Top-K at a useful rate.
- [ ] The retrieval step is fast enough for the hot path.

### Important

If the correct candidate is missing from Top-K, the decision model cannot recover.

Treat retrieval quality as a first-class metric.

### Do not add yet

- vector database
- remote embedding API
- large semantic retrieval model

---

## Milestone 5 — Fast Decision Model Baseline

### Goal

Evaluate whether an existing small decision model can select the correct next action from Jolty's compact state and candidate set.

The first model is a baseline, not a permanent dependency.

### Checklist

- [ ] Integrate the selected fast decision model.
- [ ] Keep the model resident in memory.
- [ ] Define the model input format.
- [ ] Define the action vocabulary.
- [ ] Include candidate identifiers.
- [ ] Return:
  - [ ] selected action
  - [ ] selected target
  - [ ] confidence / score
- [ ] Record inference telemetry.
- [ ] Add controlled evaluation against fixtures.

### Initial action vocabulary

- [ ] `click`
- [ ] `type`
- [ ] `select`
- [ ] `scroll`
- [ ] `wait`
- [ ] `back`
- [ ] `done`

### Measure

- [ ] step accuracy
- [ ] `tokenization_ms`
- [ ] `inference_ms`
- [ ] decision latency
- [ ] confidence distribution

### Exit criteria

- [ ] The baseline can make decisions on controlled fixtures.
- [ ] Accuracy and latency are measurable.
- [ ] Failures are visible instead of silently repaired.

### Important

Do **not** add a large-LLM fallback yet.

At this stage, failures should remain failures so the baseline can be evaluated honestly.

---

## Milestone 6 — Executor

### Goal

Translate a selected Jolty action into a safe Playwright interaction.

### Checklist

- [ ] Implement the supported action vocabulary.
- [ ] Resolve candidate IDs to browser elements safely.
- [ ] Reject unsupported actions.
- [ ] Reject invalid targets.
- [ ] Do not execute arbitrary model-generated JavaScript.
- [ ] Add action-level tests.
- [ ] Record action timing and failures.

### Exit criteria

- [ ] Model decisions can be executed against fixtures.
- [ ] Invalid actions fail clearly.
- [ ] Execution remains independent from model implementation details.

---

## Milestone 7 — Deterministic Validator

### Goal

Determine whether an executed action succeeded without asking another model whenever possible.

### Validation signals

Support deterministic checks such as:

- [ ] URL changed
- [ ] expected element appeared
- [ ] expected element disappeared
- [ ] input value changed
- [ ] expected text became visible
- [ ] request completed successfully
- [ ] authentication state changed
- [ ] unexpected console error occurred
- [ ] HTTP failure occurred

### Checklist

- [ ] Define `ValidationResult`.
- [ ] Add fixture-specific validations.
- [ ] Keep validation logic observable.
- [ ] Record validation timing.
- [ ] Distinguish action failure from validation failure.

### Exit criteria

- [ ] Fixture actions can be validated deterministically.
- [ ] Successful and failed steps are clearly distinguishable.

---

## Milestone 8 — Trace and Observability

### Goal

Make every Jolty decision inspectable.

### Checklist

Record, at minimum:

- [ ] run ID
- [ ] step ID
- [ ] current goal
- [ ] browser-state summary
- [ ] candidate list
- [ ] retrieval scores
- [ ] selected action
- [ ] selected target
- [ ] model name/version
- [ ] model confidence
- [ ] extraction latency
- [ ] filtering latency
- [ ] retrieval latency
- [ ] tokenization latency
- [ ] inference latency
- [ ] action latency
- [ ] validation latency
- [ ] final step outcome

### Exit criteria

- [ ] A failed step can be debugged from its trace.
- [ ] Hot-path latency can be broken down by stage.
- [ ] No critical decision path is opaque.

---

## Milestone 9 — First End-to-End Jolty Loop

### Goal

Run a complete controlled task using the fast path only.

### Expected flow

```text
Goal
  ↓
BrowserState
  ↓
Candidate Filtering
  ↓
Candidate Retrieval
  ↓
Fast Decision Model
  ↓
Executor
  ↓
Validator
  ↓
Next State
```

### Checklist

- [ ] Run multi-step fixture tasks.
- [ ] Stop correctly when the goal is complete.
- [ ] Fail clearly when the model makes a wrong decision.
- [ ] Record a complete trace.
- [ ] Produce a human-readable result summary.

### Target CLI experience

Conceptually:

```text
jolty run <fixture>

01  type   Email       PASS
02  type   Password    PASS
03  click  Log in      PASS

Task completed.
```

The exact CLI is not yet a stable contract.

### Exit criteria

- [ ] At least one multi-step fixture completes entirely through the fast path.
- [ ] Performance is measurable end to end.
- [ ] Failure behavior is understood.

---

## Milestone 10 — Baseline Benchmark Suite

### Goal

Establish measurable baselines before introducing fallback intelligence or training a Jolty-specific model.

### Compare

- [ ] deterministic heuristic baseline
- [ ] fast decision model baseline
- [ ] large-model browser decision baseline

### Measure

- [ ] task success rate
- [ ] step accuracy
- [ ] candidate Recall@K
- [ ] decision latency p50
- [ ] decision latency p95
- [ ] decision latency p99
- [ ] total task duration
- [ ] model calls per task
- [ ] tokens per task when applicable
- [ ] estimated cost per task when applicable

### Exit criteria

- [ ] Results are reproducible.
- [ ] Benchmark scenarios are documented.
- [ ] Jolty's current strengths and weaknesses are visible.
- [ ] No unsupported performance claims are made.

---

## Milestone 11 — Large-Model Fallback

### Goal

Add System 2 only after the fast-path baseline is understood.

### Checklist

- [ ] Define explicit fallback reasons.
- [ ] Add confidence-based escalation.
- [ ] Keep fallback optional/configurable.
- [ ] Send structured browser state rather than unnecessary raw HTML.
- [ ] Record provider/model.
- [ ] Record fallback latency.
- [ ] Record fallback action.
- [ ] Validate fallback outcomes.
- [ ] Preserve failed fast-model prediction for analysis.

### Measure

- [ ] fast-path coverage
- [ ] fallback rate
- [ ] task success improvement
- [ ] added latency
- [ ] LLM calls per test
- [ ] tokens per test
- [ ] cost per test

### Exit criteria

- [ ] Fallback measurably improves task success.
- [ ] Fast-path performance remains independently measurable.
- [ ] Fallbacks are fully observable.

---

## Milestone 12 — Trace Dataset

### Goal

Turn validated execution traces into research-quality training data.

### Checklist

- [ ] Define a versioned dataset schema.
- [ ] Store:
  - [ ] goal
  - [ ] browser state
  - [ ] candidates
  - [ ] retrieval scores
  - [ ] fast-model decision
  - [ ] confidence
  - [ ] fallback/teacher decision
  - [ ] validation outcome
- [ ] Exclude secrets and sensitive values.
- [ ] Distinguish validated labels from unvalidated teacher outputs.
- [ ] Export training data to Parquet.
- [ ] Add dataset integrity checks.
- [ ] Define train/validation/test split rules.
- [ ] Prevent fixture/template leakage where possible.

### Exit criteria

- [ ] Jolty can generate a clean dataset from its own runs.
- [ ] Labels have provenance.
- [ ] Dataset versions are reproducible.

---

## Milestone 13 — Jolty BDM Research

### Goal

Evaluate whether a Jolty-specific Browser Decision Model can outperform the initial baseline.

### Rule

Do not start this milestone before the complete inference and tracing pipeline exists.

### Checklist

- [ ] Establish the existing fast-model baseline.
- [ ] Select a pretrained encoder candidate.
- [ ] Start with the least expensive adaptation strategy.
- [ ] Evaluate:
  - [ ] frozen encoder + head
  - [ ] PEFT / LoRA
  - [ ] partial fine-tuning if needed
  - [ ] full fine-tuning only if justified
- [ ] Export successful candidates to ONNX.
- [ ] Evaluate calibration.
- [ ] Evaluate unseen fixture/site generalization.

### Compare

- [ ] original fast-model baseline
- [ ] Jolty BDM candidate
- [ ] large-model teacher

### Measure

- [ ] step accuracy
- [ ] task success rate
- [ ] fast-path coverage
- [ ] calibration
- [ ] inference latency
- [ ] memory usage
- [ ] throughput

### Exit criteria

- [ ] A Jolty-specific BDM provides measurable value over the baseline, or the experiment clearly shows that it does not.

---

## Milestone 14 — Inference Optimization

### Goal

Optimize only after profiling identifies real bottlenecks.

### Possible experiments

- [ ] ONNX graph optimization
- [ ] FP16
- [ ] INT8
- [ ] tokenization optimization
- [ ] token/state caching
- [ ] batch inference
- [ ] improved candidate pruning
- [ ] latency mode
- [ ] throughput mode

### Rule

Every optimization experiment must include before/after measurements.

### Exit criteria

- [ ] Improvements are supported by representative benchmark data.
- [ ] Accuracy regressions are measured.
- [ ] Complexity added is justified by the gain.

---

## Milestone 15 — Test Compilation

### Goal

Convert a successful AI-assisted trace into a deterministic reusable E2E test.

### Expected lifecycle

```text
Natural-language intent
        ↓
Jolty exploration
        ↓
Validated successful trace
        ↓
Compilation
        ↓
Deterministic test
```

### Checklist

- [ ] Define what makes a trace compilable.
- [ ] Generate deterministic test steps.
- [ ] Preserve assertions/validation.
- [ ] Re-run generated tests without model inference.
- [ ] Compare compiled execution with exploratory execution.

### Exit criteria

- [ ] At least one successful Jolty trace can be replayed deterministically without AI.

---

## Milestone 16 — Self-Healing

### Goal

Repair a previously compiled test when the UI changes.

### Recovery order

1. deterministic recovery
2. candidate retrieval
3. BDM
4. large-model fallback

### Checklist

- [ ] Detect when a deterministic test has become invalid.
- [ ] Attempt local candidate recovery.
- [ ] Use BDM when required.
- [ ] Escalate only when needed.
- [ ] Validate repaired paths.
- [ ] Record the repair trace.
- [ ] Never silently rewrite a test without traceability.

### Exit criteria

- [ ] Jolty can repair at least one controlled UI change and produce a validated updated path.

---

# Global Engineering Rules

These rules apply to every milestone.

## Keep the hot path small

Prefer:

```text
deterministic logic
→ heuristics
→ retrieval
→ small local model
→ large-model fallback
```

in that order.

## Measure before optimizing

Do not claim a performance improvement without representative measurements.

## Avoid premature infrastructure

Do not add services, queues, vector stores, distributed systems, or databases unless a demonstrated problem requires them.

## Keep everything observable

Every important decision should be explainable after the run.

## Keep everything in English

Code, documentation, tests, logs, CLI output, datasets, telemetry, commits, and contributor-facing text must remain in English.

## Treat browser content as untrusted

Never execute arbitrary code produced by a model or instructions embedded in page content.

## Do not train too early

Do not begin Jolty-specific model training until:

- the browser-state contract exists;
- retrieval exists;
- the decision pipeline exists;
- validation exists;
- tracing exists;
- real execution examples have been collected.

---

# Agent Workflow

When working on a milestone:

1. Read `SPECS.md`.
2. Read this file.
3. Read the relevant files under `docs/`.
4. Inspect the existing implementation.
5. Work only on the current milestone unless explicitly instructed otherwise.
6. Choose the smallest implementation that satisfies the milestone.
7. Add or update tests.
8. Run the relevant checks.
9. Run benchmarks when touching the hot path.
10. Update documentation if contracts or architecture changed.
11. Review the final diff for unnecessary complexity.
12. Report:
    - what changed;
    - which checklist items were completed;
    - what was validated;
    - benchmark results when applicable;
    - remaining blockers or uncertainty.

Do not mark a milestone complete until its exit criteria are satisfied.
