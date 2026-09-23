# Performance

Performance is a core design requirement. All figures here are **engineering goals or illustrative examples**, not measured Jolty results.

## Fast path

The repeated decision pipeline is browser state extraction, candidate retrieval, tokenization, model inference, decision decoding, and Playwright action. Measure each stage separately, including serialization if present. Keep the fast path observable in [traces](architecture.md).

The first proposed target is a decision pipeline below **25 ms**, excluding browser rendering and navigation. A later target is below **10 ms** on suitable hardware with an optimized Jolty model. Neither target is a current result. Actual browser wait time and full test duration need separate reporting.

## Runtime choices

- **Reuse the browser:** Keep Chromium running and use separate browser contexts for isolated tests; do not launch a browser at each step.
- **Keep the model resident:** Load the BDM at process startup, then reuse it for inference. Exclude one-time loading from per-step latency while reporting startup separately.
- **Avoid unnecessary IPC:** The initial fast path should keep Playwright, retrieval, and ONNX inference in the Node process where practical. A separate Python inference service would add serialization and scheduling costs.
- **Keep inputs compact:** Candidate filtering and retrieval reduce both model input size and tokenization work. Tokenization must be timed separately from inference.

## Optimization after measurement

Benchmark model precision options such as FP32, FP16, and INT8 against accuracy, latency, memory, and throughput. Possible later improvements include tokenizer changes, input or state-prefix caching, and ONNX graph optimization. Add worker separation only if profiling shows a need.

Two later scheduling modes are proposed: **latency mode** sends a single decision immediately; **throughput mode** may batch decisions from concurrent tests. Batching should be judged by both queue delay and decisions per second.

Record at least p50, p95, and p99 decision latency, per-stage latency, total test duration, throughput, browser idle time, memory, and fallback rate. Compare these with quality and cost metrics under the [benchmark plan](benchmarks.md); a faster decision is useful only if the test remains reliable.
