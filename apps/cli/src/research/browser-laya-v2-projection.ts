import type { BrowserState } from "@jolty/browser";
import { safeResearchText } from "./research-text.ts";

/** Versioned projection for experiments after the first blind comparison. */
export function projectBrowserLayaV2State(state: BrowserState) {
  const url = new URL(state.url);
  return {
    origin: url.origin,
    pathname: `${url.pathname}${url.search}`,
    title: safeResearchText(state.title),
    elements: state.elements.map((element) => ({
      id: element.id,
      role: element.role,
      name: safeResearchText(element.name),
      text: safeResearchText(element.text),
      editable: element.editable,
      visible: element.visible,
      enabled: element.enabled,
      has_value: element.hasValue ?? false,
      selected: element.selected ?? false,
      ...(element.value !== undefined
        ? {
            native_select: true,
            current_value: safeResearchText(element.value),
          }
        : {}),
    })),
  };
}
