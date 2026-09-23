export interface StepEvaluation {
  fixture: string;
  goal: string;
  expected_action: string;
  expected_target_id: string;
  selected_action: string | null;
  selected_target_id: string | null;
  confidence: number | null;
  retrieval_rank: number;
  retrieval_top_k: number;
  heuristic_action: string | null;
  heuristic_target_id: string | null;
}

const matches = (
  action: string | null,
  targetId: string | null,
  entry: StepEvaluation,
): boolean =>
  action === entry.expected_action && targetId === entry.expected_target_id;

export function summarizeSteps(cases: readonly StepEvaluation[]) {
  const count = cases.length;
  const retrieved = cases.filter(
    ({ retrieval_rank, retrieval_top_k }) =>
      retrieval_rank > 0 && retrieval_rank <= retrieval_top_k,
  );
  const modelCorrect = cases.filter((entry) =>
    matches(entry.selected_action, entry.selected_target_id, entry),
  );
  const heuristicCorrect = cases.filter((entry) =>
    matches(entry.heuristic_action, entry.heuristic_target_id, entry),
  );
  const buckets = [0, 0.25, 0.5, 0.75].map((lower) => {
    const upper = lower + 0.25;
    const entries = cases.filter(
      ({ confidence }) =>
        confidence !== null &&
        confidence >= lower &&
        (upper === 1 ? confidence <= upper : confidence < upper),
    );
    const correct = entries.filter((entry) =>
      matches(entry.selected_action, entry.selected_target_id, entry),
    ).length;
    return {
      range: `[${lower}, ${upper}${upper === 1 ? "]" : ")"}`,
      count: entries.length,
      correct,
      accuracy: entries.length ? correct / entries.length : null,
      mean_confidence: entries.length
        ? entries.reduce(
            (total, { confidence }) => total + (confidence ?? 0),
            0,
          ) / entries.length
        : null,
    };
  });

  return {
    fixture_cases: count,
    retrieval_top_k_coverage: count ? retrieved.length / count : null,
    retrieval_top_k_misses: cases
      .filter(
        ({ retrieval_rank, retrieval_top_k }) =>
          retrieval_rank < 1 || retrieval_rank > retrieval_top_k,
      )
      .map(({ fixture, goal, expected_target_id, retrieval_rank }) => ({
        fixture,
        goal,
        expected_target_id,
        retrieval_rank,
      })),
    heuristic_top_1_correct_steps: heuristicCorrect.length,
    heuristic_top_1_step_accuracy: count
      ? heuristicCorrect.length / count
      : null,
    model_correct_steps: modelCorrect.length,
    model_step_accuracy: count ? modelCorrect.length / count : null,
    model_accuracy_given_target_retrieved: retrieved.length
      ? retrieved.filter((entry) =>
          matches(entry.selected_action, entry.selected_target_id, entry),
        ).length / retrieved.length
      : null,
    confidence_distribution: buckets,
  };
}
