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
  domIndex?: number;
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

Elements include native controls, links, summaries, supported interactive ARIA roles, focusable elements, and editable elements. Hidden and disabled controls remain in the observation with their state flags; the separate [candidate filter](candidate-filter.md) decides whether to retain them for action selection. Native roles are mapped to concise role names. `name` uses `aria-labelledby`, `aria-label`, form labels, input placeholders, a unique nearby label for an otherwise unnamed form control, control text, and selected fallbacks in that order. The nearby fallback searches a bounded ancestor and skips groups with multiple controls. This is a deterministic naming approximation, not the complete accessible-name algorithm. `text` is visible text for non-freeform controls. Text fields, textareas, and editable regions report `hasValue` instead of their content; native selects, including multiple selects with role `listbox`, report their selected option text in `value`. Names, text, and values are whitespace-normalized and capped at 160 characters.

IDs (`e1`, `e2`, ...) follow document order and are stable within one observation. They can change after a DOM update or a new observation. Extracted elements also have a zero-based `domIndex` in the shared interactive-selector query; synthetic test elements may omit it. The [executor](executor.md) uses that index only after a fresh observation confirms the element and page context still match. `visible` uses layout rectangles, CSS visibility, and the `hidden` attribute; `enabled` uses native disabled state and `aria-disabled`. These flags are inexpensive approximations, not Playwright actionability checks.

`StateExtractionMetrics` is returned separately from the state:

| Field | Meaning |
| --- | --- |
| `state_extraction_ms` | Elapsed time for browser evaluation and state serialization on the Node side. |
| `total_dom_nodes` | Number of elements in the main document. |
| `extracted_interactive_elements` | Number of returned elements. |
| `serialized_state_bytes` | UTF-8 byte length of `JSON.stringify(state)`. |

The extractor currently observes the main document only. Shadow roots and frames are not included. Browser or page content remains untrusted; downstream components must treat every string as data. Freeform control contents are omitted, but visible page text and selected option labels can still contain sensitive data and need review before persistent tracing.

Run `pnpm run benchmark:state` to measure 100 observations after 10 warmups on a local page with 200 noninteractive nodes and 30 buttons. The script reports p50, p95, and p99 extraction time and the size/count metrics. Browser startup and page creation are excluded. This controlled microbenchmark is coverage for extraction, not a claim about full Jolty decision latency or real-site performance.

On the development machine, adding `domIndex` changed the controlled serialized state from 3459 to 3869 bytes for 30 interactive elements. Extraction p50 was 0.99 ms before and 1.04 ms after in separate short runs; this difference is too small and the sample too limited to claim a stable latency change.
