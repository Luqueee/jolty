import { flows as legacyFlows } from "../../benchmarks/public-site-flows.ts";
import { researchCases } from "./cases/research-cases.ts";
import { freshTestFlows, researchCasesV1 } from "./cases/research-cases-v1.ts";
import {
  freshTestFlowsV2,
  researchCasesV2,
} from "./cases/research-cases-v2.ts";
import {
  freshTestFlowsV3,
  researchCasesV3,
} from "./cases/research-cases-v3.ts";
import {
  freshTestFlowsV4,
  researchCasesV4,
} from "./cases/research-cases-v4.ts";
import {
  freshTestFlowsV5,
  researchCasesV5,
} from "./cases/research-cases-v5.ts";
import {
  freshTestFlowsV6,
  researchCasesV6,
} from "./cases/research-cases-v6.ts";
import { researchCasesV7 } from "./cases/research-cases-v7.ts";
import { freshTestCasesV7 } from "./cases/research-cases-v7-test.ts";

const corpusCases = [
  researchCases,
  researchCasesV1,
  researchCasesV2,
  researchCasesV3,
  researchCasesV4,
  researchCasesV5,
  researchCasesV6,
  researchCasesV7,
] as const;
const testFlows = [
  legacyFlows,
  freshTestFlows,
  freshTestFlowsV2,
  freshTestFlowsV3,
  freshTestFlowsV4,
  freshTestFlowsV5,
  freshTestFlowsV6,
  freshTestCasesV7,
] as const;

export const latestResearchVersion = corpusCases.length - 1;

export function parseResearchVersion(value: string): number {
  const version = Number(value);
  if (
    !Number.isInteger(version) ||
    String(version) !== value ||
    version < 0 ||
    version > latestResearchVersion
  )
    throw new Error(
      `Research corpus version must be an integer from 0 to ${latestResearchVersion}`,
    );
  return version;
}

export function researchCasesForVersion(value: string) {
  return corpusCases[parseResearchVersion(value)];
}

export function testFlowsForVersion(value: string) {
  return testFlows[parseResearchVersion(value)];
}
