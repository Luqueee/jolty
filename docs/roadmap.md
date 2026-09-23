# Roadmap

These are proposed stages from [SPECS.md](../SPECS.md), not completed milestones. The repository includes the pnpm workspace, BrowserState v0 extraction, deterministic candidate filtering and retrieval, controlled browser fixtures, and a Playwright smoke test; the broader roadmap stages below remain unimplemented. See [MILESTONES.md](../MILESTONES.md) for the sequential implementation checklist.

1. **Research and fast-path prototype:** Define representative tasks and success checks. Build Playwright state extraction, deterministic candidate filtering, simple retrieval, a Laya baseline, confidence-based fallback, and step telemetry. Test whether System 1 is viable.
2. **Trace collection and dataset:** Record goals, browser states, candidates, decisions, fallback or teacher actions, outcomes, confidence, and latency. Validate labels and include difficult UI cases. Export training data for analysis.
3. **Jolty BDM:** Train and calibrate a specialized model from validated traces. Compare it with Laya and the large-LLM baseline on accuracy, coverage, latency, memory, and throughput.
4. **Inference optimization:** Profile the pipeline before tuning ONNX inference, precision, tokenization, state reuse, retrieval, and possible batching.
5. **Test compilation:** Turn validated successful traces into deterministic Playwright tests for repeat execution.
6. **Self-healing and continuous learning:** When a compiled test breaks, attempt BDM and then large-model recovery, validate the new path, and use difficult traces to improve later models.

The initial product direction is a CLI with reports and traces. A dashboard or more complex worker infrastructure should wait for measured need.
