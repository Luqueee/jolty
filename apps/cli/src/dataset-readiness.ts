import type { DatasetRow } from "./dataset.ts";

type Split = "train" | "validation" | "test";
const splits: readonly Split[] = ["train", "validation", "test"];

export function assessResearchReadiness(rows: readonly DatasetRow[]) {
  const summary = Object.fromEntries(
    splits.map((split) => {
      const selected = rows.filter((row) => row.split === split);
      const labeled = selected.filter((row) => row.training_action !== null);
      const distinct = [
        ...new Map(
          labeled.map((row) => [
            JSON.stringify({
              goal: row.goal,
              state: row.browser_state,
              candidate_ids: row.candidates.map((candidate) => candidate.id),
              label: row.training_action,
            }),
            row,
          ]),
        ).values(),
      ];
      return [
        split,
        {
          attempted_decisions: selected.length,
          validated_labels: labeled.length,
          distinct_validated_decisions: distinct.length,
          fixture_groups: [
            ...new Set(selected.map((row) => row.split_group)),
          ].sort(),
          origins: [
            ...new Set(selected.map((row) => row.browser_state.origin)),
          ].sort(),
          actions: Object.fromEntries(
            [...new Set(distinct.map((row) => row.training_action?.action))]
              .filter((action) => action !== undefined)
              .sort()
              .map((action) => [
                action,
                distinct.filter((row) => row.training_action?.action === action)
                  .length,
              ]),
          ),
        },
      ];
    }),
  ) as Record<
    Split,
    {
      attempted_decisions: number;
      validated_labels: number;
      distinct_validated_decisions: number;
      fixture_groups: string[];
      origins: string[];
      actions: Record<string, number>;
    }
  >;
  const reasons: string[] = [];
  // These are experiment admission gates, not claims of statistical sufficiency.
  if (summary.train.distinct_validated_decisions < 20)
    reasons.push("Fewer than 20 distinct validated training decisions");
  if (summary.validation.distinct_validated_decisions < 10)
    reasons.push("Fewer than 10 validated calibration decisions");
  if (summary.test.distinct_validated_decisions < 10)
    reasons.push("Fewer than 10 validated held-out decisions");
  const trainActions = new Set(Object.keys(summary.train.actions));
  const unseenActions = [
    ...new Set([
      ...Object.keys(summary.validation.actions),
      ...Object.keys(summary.test.actions),
    ]),
  ].filter((action) => !trainActions.has(action));
  if (unseenActions.length > 0)
    reasons.push(
      `Evaluation actions absent from training: ${unseenActions.sort().join(", ")}`,
    );
  const trainSites = new Set(summary.train.origins);
  if (summary.train.origins.length < 2)
    reasons.push("Training lacks independent site origins");
  if (!summary.test.origins.some((origin) => !trainSites.has(origin)))
    reasons.push("Test split has no unseen site origin");
  return {
    assessment_version: 1,
    summary,
    unseen_evaluation_actions: unseenActions.sort(),
    ready_for_encoder_experiment: reasons.length === 0,
    reasons,
  };
}
