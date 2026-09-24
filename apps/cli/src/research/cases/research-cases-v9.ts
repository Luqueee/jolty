import type { ResearchCase } from "./research-cases.ts";
import { researchCasesV8 } from "./research-cases-v8.ts";
import { freshTestCasesV9 } from "./research-cases-v9-test.ts";
import { freshPlayQaTrainCasesV9 } from "./research-cases-v9-train-playqa.ts";
import { freshUpexTrainCasesV9 } from "./research-cases-v9-train-upex.ts";
import { freshValidationCasesV9 } from "./research-cases-v9-validation.ts";

export { freshTestCasesV9 } from "./research-cases-v9-test.ts";

export const researchCasesV9: ResearchCase[] = [
  ...researchCasesV8.filter((entry) => entry.split !== "test"),
  ...freshPlayQaTrainCasesV9,
  ...freshUpexTrainCasesV9,
  ...freshValidationCasesV9,
  ...freshTestCasesV9,
];
