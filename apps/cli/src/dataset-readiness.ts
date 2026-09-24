type Split = "train" | "validation" | "test";
const splits: readonly Split[] = ["train", "validation", "test"];
const reservedTestOrigins = new Set([
  "https://the-internet.herokuapp.com",
  "https://todomvc.com",
  "https://www.saucedemo.com",
  "https://www.selenium.dev",
  "https://www.qa-practice.com",
  "https://playground.go-bigger.de",
  "https://www.testtrack.org",
  "https://webdriveruniversity.com",
  "https://lastest.cloud",
  "https://qaplayground.com",
  "https://testing.qaautomationlabs.com",
  "https://practicetestautomation.com",
  "https://demoqa.com",
  "https://www.automation-bible.com",
  "https://www.stepcampus.in",
  "https://www.sreenidhirajakrishnan.com",
]);

export interface ReadinessSample {
  split: Split;
  split_group: string;
  goal: string;
  browser_state: {
    origin: string;
    pathname: string;
    title: string;
    elements: readonly unknown[];
  };
  candidates: readonly { id: string }[];
  training_action: { action: string; target_id: string | null } | null;
}

export function assessResearchReadiness(rows: readonly ReadinessSample[]) {
  const summary = Object.fromEntries(
    splits.map((split) => {
      const selected = rows.filter((row) => row.split === split);
      const labeled = selected.filter((row) => row.training_action !== null);
      const distinct = [
        ...new Map(
          labeled.map((row) => [
            JSON.stringify({
              state: row.browser_state,
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
  for (const action of new Set([
    ...Object.keys(summary.validation.actions),
    ...Object.keys(summary.test.actions),
  ])) {
    if ((summary.train.actions[action] ?? 0) < 3)
      reasons.push(`Fewer than 3 training decisions for ${action}`);
    if ((summary.validation.actions[action] ?? 0) < 2)
      reasons.push(`Fewer than 2 calibration decisions for ${action}`);
  }
  const trainSites = new Set(summary.train.origins);
  if (summary.train.origins.length < 2)
    reasons.push("Training lacks independent site origins");
  if (!summary.test.origins.some((origin) => !trainSites.has(origin)))
    reasons.push("Test split has no unseen site origin");
  if (summary.validation.origins.some((origin) => trainSites.has(origin)))
    reasons.push("Calibration site origin overlaps training");
  const calibrationSites = new Set(summary.validation.origins);
  if (
    summary.test.origins.some(
      (origin) => trainSites.has(origin) || calibrationSites.has(origin),
    )
  )
    reasons.push("Held-out site origin overlaps training or calibration");
  if (
    [...summary.train.origins, ...summary.validation.origins].some((origin) =>
      reservedTestOrigins.has(origin),
    )
  )
    reasons.push("Reserved public test origin appears outside test split");
  return {
    assessment_version: 1,
    summary,
    unseen_evaluation_actions: unseenActions.sort(),
    ready_for_encoder_experiment: reasons.length === 0,
    reasons,
  };
}
