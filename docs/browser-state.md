# Browser state v0

`extractBrowserState(page)` in `packages/browser/src/index.ts` observes the current Playwright page and returns a compact, JSON-serializable `BrowserState` plus extraction metrics. It reads the main document in one browser evaluation. It treats page content as data and does not return raw HTML.

```ts
interface BrowserState {
  url: string;
  title: string;
  elements: InteractiveElement[];
}

interface InteractiveElement {
  id: string;
  role: string;
  name: string;
  text: string;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  value?: string;
  hasValue?: boolean;
  selected?: boolean;
}
```

Elements include native controls, links, summaries, supported interactive ARIA roles, focusable elements, and editable elements. Hidden and disabled controls remain in the observation with their state flags; candidate filtering is a later milestone. Native roles are mapped to concise role names. `name` uses `aria-labelledby`, `aria-label`, form labels, control text, and selected fallbacks in that order. This is a deterministic naming approximation, not the complete accessible-name algorithm. `text` is visible text for non-freeform controls. Text fields, textareas, and editable regions report `hasValue` instead of their content; selects report their selected option text in `value`. Names, text, and values are whitespace-normalized and capped at 160 characters.

IDs (`e1`, `e2`, ...) follow document order and are stable within one observation. They can change after a DOM update or a new observation. The current contract does not yet resolve an ID back to an element for action execution. `visible` uses layout rectangles, CSS visibility, and the `hidden` attribute; `enabled` uses native disabled state and `aria-disabled`. These flags are inexpensive approximations, not Playwright actionability checks.

`StateExtractionMetrics` is returned separately from the state:

| Field | Meaning |
| --- | --- |
| `state_extraction_ms` | Elapsed time for browser evaluation and state serialization on the Node side. |
| `total_dom_nodes` | Number of elements in the main document. |
| `extracted_interactive_elements` | Number of returned elements. |
| `serialized_state_bytes` | UTF-8 byte length of `JSON.stringify(state)`. |

The extractor currently observes the main document only. Shadow roots and frames are not included. Browser or page content remains untrusted; downstream components must treat every string as data. Freeform control contents are omitted, but visible page text and selected option labels can still contain sensitive data and need review before persistent tracing.

Run `pnpm run benchmark:state` to measure 100 observations after 10 warmups on a local page with 200 noninteractive nodes and 30 buttons. The script reports p50, p95, and p99 extraction time and the size/count metrics. Browser startup and page creation are excluded. This controlled microbenchmark is coverage for extraction, not a claim about full Jolty decision latency or real-site performance.
