import type {
  BrowserState,
  InteractiveElement,
} from "../../browser/src/index.ts";
import { filterCandidates } from "../src/candidate-filter.ts";

const makeElements = (
  count: number,
  overrides: Partial<InteractiveElement>,
  prefix: string,
): InteractiveElement[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    role: "button",
    name: `${prefix}${i}`,
    text: "",
    visible: true,
    enabled: true,
    editable: false,
    ...overrides,
  }));

const state: BrowserState = {
  url: "http://fixtures.jolty.test/filter-benchmark",
  title: "Candidate filter benchmark",
  elements: [
    ...makeElements(4_400, { visible: false }, "hidden"),
    ...makeElements(450, { enabled: false }, "disabled"),
    ...makeElements(100, { role: "heading" }, "heading"),
    ...makeElements(50, {}, "action"),
  ],
};

for (let i = 0; i < 100; i++) filterCandidates(state);
const samples: number[] = [];
let outputCount = 0;
for (let i = 0; i < 1_000; i++) {
  const result = filterCandidates(state);
  samples.push(result.metrics.candidate_filter_ms);
  outputCount = result.metrics.output_element_count;
}
samples.sort((a, b) => a - b);
const percentile = (p: number) => samples[Math.ceil(samples.length * p) - 1];
console.log(
  JSON.stringify(
    {
      benchmark: "candidate-filter-v0",
      warmup_iterations: 100,
      measured_iterations: samples.length,
      input_element_count: state.elements.length,
      output_element_count: outputCount,
      candidate_filter_ms: {
        p50: percentile(0.5),
        p95: percentile(0.95),
        p99: percentile(0.99),
      },
    },
    null,
    2,
  ),
);
