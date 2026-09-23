import type { BrowserState, InteractiveElement } from "@jolty/browser";

export interface CandidateFilterMetrics {
  input_element_count: number;
  output_element_count: number;
  candidate_filter_ms: number;
}

export interface CandidateFilterResult {
  candidates: InteractiveElement[];
  metrics: CandidateFilterMetrics;
}

const nonActionRoles = new Set([
  "alert",
  "article",
  "banner",
  "contentinfo",
  "group",
  "heading",
  "img",
  "list",
  "listitem",
  "main",
  "navigation",
  "none",
  "paragraph",
  "presentation",
  "region",
  "separator",
  "status",
  "tablist",
]);

export function filterCandidates(state: BrowserState): CandidateFilterResult {
  const start = performance.now();
  const candidates: InteractiveElement[] = [];
  for (const element of state.elements) {
    if (!element.visible || !element.enabled) continue;
    if (!element.editable && nonActionRoles.has(element.role)) continue;
    candidates.push(element);
  }
  return {
    candidates,
    metrics: {
      input_element_count: state.elements.length,
      output_element_count: candidates.length,
      candidate_filter_ms: performance.now() - start,
    },
  };
}
