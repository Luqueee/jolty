export interface ChoiceValidationRow {
  id: string;
  probabilities: readonly number[];
  correctIndex: number | null;
}

export interface ChoicePolicy {
  temperature: number;
  threshold: number;
  validation_total: number;
  validation_correct: number;
  validation_covered: number;
  validation_covered_correct: number;
  missing_correct_option: number;
  negative_log_likelihood: number;
}

const temperatureGrid = [0.25, 0.5, 1, 2, 4] as const;

export function scaledProbabilities(
  probabilities: readonly number[],
  temperature: number,
): number[] {
  if (!(temperature > 0) || !Number.isFinite(temperature))
    throw new Error("Temperature must be positive and finite");
  if (
    probabilities.length < 2 ||
    probabilities.some((value) => !Number.isFinite(value) || value < 0) ||
    probabilities.reduce((sum, value) => sum + value, 0) <= 0
  )
    throw new Error("Choice probabilities are invalid");
  const logits = probabilities.map(
    (value) => Math.log(Math.max(value, 1e-12)) / temperature,
  );
  const offset = Math.max(...logits);
  const weights = logits.map((value) => Math.exp(value - offset));
  const sum = weights.reduce((total, value) => total + value, 0);
  return weights.map((value) => value / sum);
}

export function calibrateChoices(
  rows: readonly ChoiceValidationRow[],
): ChoicePolicy {
  if (rows.length === 0) throw new Error("Validation rows are required");
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.id || seen.has(row.id))
      throw new Error(`Duplicate or empty validation ID: ${row.id}`);
    seen.add(row.id);
    scaledProbabilities(row.probabilities, 1);
    if (
      row.correctIndex !== null &&
      (!Number.isInteger(row.correctIndex) ||
        row.correctIndex < 0 ||
        row.correctIndex >= row.probabilities.length)
    )
      throw new Error(`Invalid correct option for ${row.id}`);
  }
  const valid = rows.filter((row) => row.correctIndex !== null);
  if (valid.length === 0)
    throw new Error("No validation target is in the option list");
  const fits = temperatureGrid.map((temperature) => ({
    temperature,
    loss:
      valid.reduce((sum, row) => {
        const probabilities = scaledProbabilities(
          row.probabilities,
          temperature,
        );
        return (
          sum -
          Math.log(
            Math.max(probabilities[row.correctIndex as number] ?? 0, 1e-12),
          )
        );
      }, 0) / valid.length,
  }));
  fits.sort((a, b) => a.loss - b.loss || a.temperature - b.temperature);
  const selected = fits[0];
  if (!selected) throw new Error("Temperature grid is empty");
  const scored = rows.map((row) => {
    const p = scaledProbabilities(row.probabilities, selected.temperature);
    const confidence = Math.max(...p);
    const choice = p.indexOf(confidence);
    return { confidence, correct: row.correctIndex === choice };
  });
  const thresholds = [
    0,
    ...scored.map((row) =>
      Math.min(1 + Number.EPSILON, row.confidence + Number.EPSILON),
    ),
  ];
  const safe = thresholds
    .map((threshold) => {
      const accepted = scored.filter((row) => row.confidence >= threshold);
      return {
        threshold,
        covered: accepted.length,
        errors: accepted.filter((row) => !row.correct).length,
      };
    })
    .filter((row) => row.errors === 0)
    .sort((a, b) => b.covered - a.covered || a.threshold - b.threshold)[0];
  if (!safe) throw new Error("No safe validation threshold found");
  return {
    temperature: selected.temperature,
    threshold: safe.threshold,
    validation_total: rows.length,
    validation_correct: scored.filter((row) => row.correct).length,
    validation_covered: safe.covered,
    validation_covered_correct: safe.covered,
    missing_correct_option: rows.length - valid.length,
    negative_log_likelihood: selected.loss,
  };
}
