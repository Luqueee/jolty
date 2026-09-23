import type { InteractiveElement } from "@jolty/browser";

export interface RetrievalSignals {
  exactMatch: number;
  normalizedMatch: number;
  labelMatch: number;
  textMatch: number;
  keywordOverlap: number;
  roleCompatibility: number;
  elementState: number;
}

export interface RankedCandidate {
  element: InteractiveElement;
  score: number;
  signals: RetrievalSignals;
  sourceIndex: number;
}

export interface RetrievalResult {
  ranked: RankedCandidate[];
  topCandidates: RankedCandidate[];
  metrics: {
    input_candidate_count: number;
    output_candidate_count: number;
    candidate_retrieval_ms: number;
  };
}

const stopwords = new Set([
  "a",
  "an",
  "and",
  "as",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);
const normalize = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const tokens = (value: string): Set<string> =>
  new Set(
    value.split(" ").filter((word) => word.length > 0 && !stopwords.has(word)),
  );

function containsPhrase(goal: string, candidate: string): boolean {
  return candidate.length > 2 && ` ${goal} `.includes(` ${candidate} `);
}

function scoreCandidate(
  goal: string,
  normalizedGoal: string,
  goalTokens: ReadonlySet<string>,
  element: InteractiveElement,
): RetrievalSignals {
  const name = normalize(element.name);
  const text = normalize(element.text);
  const rawGoal = goal.trim();
  const exactMatch =
    rawGoal.length > 0 &&
    (rawGoal === element.name.trim() || rawGoal === element.text.trim());
  const role = element.role;
  const fillIntent = ["fill", "type", "enter", "write", "input"].some((word) =>
    goalTokens.has(word),
  );
  const selectIntent = ["select", "choose"].some((word) =>
    goalTokens.has(word),
  );
  const clickIntent = [
    "click",
    "press",
    "open",
    "submit",
    "save",
    "continue",
    "logout",
  ].some((word) => goalTokens.has(word));
  const nameTokens = tokens(name);
  const textTokens = text === name ? new Set<string>() : tokens(text);
  let overlap = 0;
  for (const word of nameTokens) if (goalTokens.has(word)) overlap++;
  for (const word of textTokens)
    if (goalTokens.has(word) && !nameTokens.has(word)) overlap++;

  let roleCompatibility = 0;
  if (fillIntent && ["textbox", "searchbox", "spinbutton"].includes(role))
    roleCompatibility = 8;
  else if (
    selectIntent &&
    ["combobox", "listbox", "option", "checkbox", "radio"].includes(role)
  )
    roleCompatibility = 8;
  else if (clickIntent && ["button", "link", "tab", "menuitem"].includes(role))
    roleCompatibility = 8;

  return {
    exactMatch: exactMatch ? 50 : 0,
    normalizedMatch:
      !exactMatch &&
      normalizedGoal.length > 0 &&
      (normalizedGoal === name || normalizedGoal === text)
        ? 45
        : 0,
    labelMatch:
      normalizedGoal !== name && containsPhrase(normalizedGoal, name) ? 30 : 0,
    textMatch: text !== name && containsPhrase(normalizedGoal, text) ? 20 : 0,
    keywordOverlap: Math.min(overlap, 3) * 8,
    roleCompatibility,
    elementState:
      fillIntent && element.editable
        ? 4
        : selectIntent && element.selected
          ? -2
          : 0,
  };
}

export function retrieveCandidates(
  goal: string,
  candidates: readonly InteractiveElement[],
  topK = 10,
): RetrievalResult {
  if (!Number.isInteger(topK) || topK < 1)
    throw new RangeError("topK must be a positive integer");
  const start = performance.now();
  const normalizedGoal = normalize(goal);
  const goalTokens = tokens(normalizedGoal);
  const ranked = candidates.map((element, sourceIndex) => {
    const signals = scoreCandidate(goal, normalizedGoal, goalTokens, element);
    const score = Object.values(signals).reduce(
      (total, value) => total + value,
      0,
    );
    return { element, score, signals, sourceIndex };
  });
  ranked.sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex);
  const topCandidates = ranked.slice(0, topK);
  return {
    ranked,
    topCandidates,
    metrics: {
      input_candidate_count: candidates.length,
      output_candidate_count: topCandidates.length,
      candidate_retrieval_ms: performance.now() - start,
    },
  };
}
