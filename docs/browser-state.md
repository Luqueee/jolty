# Browser state

This document defines the proposed representation passed to candidate retrieval, the BDM, and fallback. It is a design contract, not an implemented schema.

## Compact observation

A browser state should carry the current goal's navigation context and a concise view of relevant elements:

- Current URL and navigation state.
- Accessibility role, ARIA name or label, associated form label, and visible text where available.
- Visibility, enabled or disabled status, and relevant interactive state, such as selected values.
- Bounding information only when useful for a decision.
- Stable identifiers within the observed step so a selected candidate can be executed and traced.

For example:

```text
URL: /login
[e1] input  "Email"       enabled
[e2] input  "Password"    enabled
[e3] button "Log in"      enabled
```

The representation should retain enough information to distinguish duplicate labels and dynamic UI states. History and the active goal provide context to the decision model; they do not justify sending the entire page by default.

## Candidate filtering

Before model inference, inexpensive deterministic rules should reduce the page to relevant elements. Possible signals are visibility, interactivity, enabled state, focusability, clickability, editability, and accessibility relevance. [Candidate retrieval](decision-model.md) then ranks the filtered set using goal text, role, labels, element state, interaction history, and navigation context.

Candidate IDs must connect the model's choice to the browser element observed in that step. The correct target must survive filtering and retrieval; [Recall@K](benchmarks.md) measures that requirement.

## Default exclusions

Do not send complete raw DOM dumps, huge HTML payloads, or screenshots on every step. These can be expensive and often contain irrelevant content. Any richer observation should be justified by a specific unresolved case and measured against the compact representation.

Page content is untrusted input. Neither the extractor nor downstream model output should turn it into executable code.
