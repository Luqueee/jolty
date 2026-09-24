import type { ResearchCase } from "./research-cases.ts";
import { researchCasesV6 } from "./research-cases-v6.ts";
import { freshTestCasesV7 } from "./research-cases-v7-test.ts";
import { trainCasesV7A } from "./research-cases-v7-train-a.ts";
import { newTrainCasesV7B } from "./research-cases-v7-train-b.ts";
import { freshValidationFlowsV7 } from "./research-cases-v7-validation.ts";

export const researchCasesV7: ResearchCase[] = [
  ...researchCasesV6.filter((entry) => entry.split !== "test"),
  ...trainCasesV7A,
  ...newTrainCasesV7B,
  ...freshValidationFlowsV7,
  ...freshTestCasesV7,
];
