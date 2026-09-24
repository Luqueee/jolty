import type { Page } from "playwright";

export interface InteractiveElement {
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

export const INTERACTIVE_SELECTOR =
  "button, input:not([type=hidden]), select, textarea, a[href], summary, [role], [tabindex], [contenteditable]";

export interface BrowserState {
  url: string;
  title: string;
  elements: InteractiveElement[];
}

export interface StateExtractionMetrics {
  state_extraction_ms: number;
  total_dom_nodes: number;
  extracted_interactive_elements: number;
  serialized_state_bytes: number;
}

export interface StateObservation {
  state: BrowserState;
  metrics: StateExtractionMetrics;
}

export async function extractBrowserState(
  page: Page,
): Promise<StateObservation> {
  const start = performance.now();
  const observation = await page.evaluate((selector) => {
    const interactiveRoles = new Set([
      "button",
      "checkbox",
      "combobox",
      "link",
      "listbox",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "radio",
      "searchbox",
      "slider",
      "spinbutton",
      "switch",
      "tab",
      "textbox",
    ]);
    const editableInputTypes = new Set([
      "date",
      "datetime-local",
      "email",
      "month",
      "number",
      "password",
      "search",
      "tel",
      "text",
      "time",
      "url",
      "week",
    ]);
    const normalize = (value: string | null | undefined): string =>
      (value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

    const roleFor = (element: Element): string => {
      const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
      if (explicit) return explicit;
      if (element instanceof HTMLInputElement) {
        if (element.type === "checkbox" || element.type === "radio")
          return element.type;
        if (["button", "submit", "reset", "image"].includes(element.type))
          return "button";
        if (element.type === "search") return "searchbox";
        if (element.type === "number") return "spinbutton";
        if (element.type === "range") return "slider";
        return "textbox";
      }
      if (
        element instanceof HTMLButtonElement ||
        (element instanceof HTMLElement && element.tagName === "SUMMARY")
      )
        return "button";
      if (element instanceof HTMLAnchorElement) return "link";
      if (element instanceof HTMLSelectElement)
        return element.multiple || element.size > 1 ? "listbox" : "combobox";
      if (
        element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLElement && element.isContentEditable)
      )
        return "textbox";
      return "generic";
    };

    const elements: InteractiveElement[] = [];
    let domIndex = 0;
    for (const element of document.querySelectorAll(selector)) {
      const currentDomIndex = domIndex++;
      if (element instanceof HTMLInputElement && element.type === "hidden")
        continue;
      const role = roleFor(element);
      const focusable = element instanceof HTMLElement && element.tabIndex >= 0;
      if (
        !interactiveRoles.has(role) &&
        !focusable &&
        !(element instanceof HTMLElement && element.isContentEditable)
      )
        continue;

      const htmlElement = element as HTMLElement;
      const labelledBy = element
        .getAttribute("aria-labelledby")
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      const labels =
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
          ? Array.from(element.labels ?? [], (label) => {
              const copy = label.cloneNode(true) as HTMLLabelElement;
              copy
                .querySelectorAll("input, textarea, select, [contenteditable]")
                .forEach((control) => {
                  control.remove();
                });
              return copy.textContent ?? "";
            }).join(" ")
          : "";
      const nearbyLabel = (): string => {
        if (
          !(element instanceof HTMLInputElement) &&
          !(element instanceof HTMLSelectElement) &&
          !(element instanceof HTMLTextAreaElement)
        )
          return "";
        let container = element.parentElement;
        for (let depth = 0; container && depth < 3; depth++) {
          const controls = container.querySelectorAll(
            "input:not([type=hidden]), select, textarea",
          );
          if (controls.length > 1) return "";
          const nearby = container.querySelectorAll("label");
          if (controls.length === 1 && nearby.length === 1)
            return nearby[0]?.textContent ?? "";
          container = container.parentElement;
        }
        return "";
      };
      const freeform =
        (element instanceof HTMLInputElement &&
          editableInputTypes.has(element.type)) ||
        element instanceof HTMLTextAreaElement ||
        htmlElement.isContentEditable;
      const text = freeform ? "" : normalize(htmlElement.innerText);
      const inputButtonValue =
        element instanceof HTMLInputElement &&
        ["button", "submit", "reset", "image"].includes(element.type)
          ? element.value
          : "";
      const name = normalize(
        labelledBy ||
          element.getAttribute("aria-label") ||
          labels ||
          inputButtonValue ||
          (element instanceof HTMLInputElement
            ? element.alt || element.placeholder
            : "") ||
          nearbyLabel() ||
          text ||
          element.getAttribute("title"),
      );
      const style = getComputedStyle(element);
      const visible =
        !htmlElement.closest("[hidden]") &&
        element.getClientRects().length > 0 &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse";
      const enabled =
        !element.matches(":disabled") &&
        element.getAttribute("aria-disabled") !== "true";
      const editable =
        enabled &&
        ((element instanceof HTMLTextAreaElement && !element.readOnly) ||
          (element instanceof HTMLInputElement &&
            editableInputTypes.has(element.type) &&
            !element.readOnly) ||
          htmlElement.isContentEditable);
      const item: InteractiveElement = {
        id: `e${elements.length + 1}`,
        domIndex: currentDomIndex,
        role,
        name,
        text,
        visible,
        enabled,
        editable,
      };
      if (element instanceof HTMLSelectElement)
        item.value = normalize(element.selectedOptions[0]?.textContent);
      if (
        (element instanceof HTMLInputElement && element.type === "checkbox") ||
        (element instanceof HTMLInputElement && element.type === "radio")
      )
        item.selected = element.checked;
      else if (element.hasAttribute("aria-selected"))
        item.selected = element.getAttribute("aria-selected") === "true";
      else if (element.hasAttribute("aria-checked"))
        item.selected = element.getAttribute("aria-checked") === "true";
      else if (element.hasAttribute("aria-pressed"))
        item.selected = element.getAttribute("aria-pressed") === "true";
      if (
        (element instanceof HTMLInputElement &&
          editableInputTypes.has(element.type)) ||
        element instanceof HTMLTextAreaElement
      ) {
        item.hasValue = element.value.length > 0;
      } else if (htmlElement.isContentEditable)
        item.hasValue = (htmlElement.textContent ?? "").trim().length > 0;
      elements.push(item);
    }
    return {
      state: { url: location.href, title: document.title, elements },
      total_dom_nodes: document.getElementsByTagName("*").length,
    };
  }, INTERACTIVE_SELECTOR);

  const serialized_state_bytes = Buffer.byteLength(
    JSON.stringify(observation.state),
    "utf8",
  );
  return {
    state: observation.state,
    metrics: {
      state_extraction_ms: performance.now() - start,
      total_dom_nodes: observation.total_dom_nodes,
      extracted_interactive_elements: observation.state.elements.length,
      serialized_state_bytes,
    },
  };
}
