# Architecture

This is the proposed architecture. Browser-state extraction, candidate filtering and retrieval, and an isolated Laya decision baseline are implemented. The full decision loop, executor, validator, and fallback are not yet implemented. Jolty separates test planning from repeated browser decisions.

```text
Test intent -> Planner (System 2) -> Structured goals / test graph
                                             |
                                             v
                                          Browser
                                             |
                                             v
                                       State extractor
                                             |
                                             v
                                      Candidate filtering
                                             |
                                             v
                                      Candidate retrieval
                                             |
                                             v
                                    BDM (System 1 fast path)
                                      /               \
                              confident             uncertain
                                 |                       |
                                 v                       v
                              Decision          Large-model fallback
                                 \                       /
                                  +---------+-----------+
                                            |
                                            v
                                         Executor
                                            |
                                            v
                                         Validator
                                            |
                                            v
                                     Trace -> next state
```

## Component boundaries

- **Test intent and planner:** A user describes a test in natural language. The large-model planner turns that intent into structured goals or a test graph; it does not choose every browser action.
- **Browser and state extractor:** Playwright controls the browser. The extractor produces a compact, model-facing [browser state](browser-state.md), including navigation context and relevant elements.
- **Candidate filtering and retrieval:** The implemented [candidate filter](candidate-filter.md) removes hidden, disabled, and clearly non-actionable elements. [Candidate retrieval v0](candidate-retrieval.md) ranks the remainder against the current goal and selects a small Top-K set for a future BDM.
- **Browser Decision Model (BDM):** The isolated Laya baseline selects one constrained action and optional candidate target through a local ONNX session. Its [decision contract](decision-model.md) includes model scores and explicit errors; accuracy and latency are measured on controlled fixtures.
- **Executor and validator:** The executor applies a valid action through Playwright. The validator checks observable outcomes such as URL changes, changed input values, or expected elements where possible.
- **Large-model fallback:** System 2 resolves ambiguous or failed fast-path decisions from the structured state. A validated fallback decision can become a training example.
- **Traces:** Each step should record the goal, observed state, candidate set, decision source, confidence, timing, fallback, and outcome. Traces support debugging, evaluation, and later dataset creation.

System 1 is the repeated fast path: state extraction, candidate retrieval, BDM selection, execution, and validation. System 2 handles initial planning, ambiguity, and recovery. Uncertainty should route to fallback rather than force an unsupported action.

## Runtime direction

The specification recommends a CLI-first TypeScript and Node.js runtime with Playwright, ONNX Runtime Node, and SQLite for operational records. Node.js 24 LTS is the initial runtime choice because Playwright and ONNX Runtime support is central to the workload; Bun can be reconsidered using Jolty-specific benchmarks. TypeScript, Node.js, Playwright, and ONNX Runtime Node are in use; SQLite remains proposed.

Model development is a separate proposed Python workflow. Its output should be a deployable ONNX model. Training data may be exported from operational traces to Parquet and analyzed with DuckDB. A dashboard and a separate inference service are not part of the initial design. Later [roadmap](roadmap.md) stages cover trace compilation and self-healing.
