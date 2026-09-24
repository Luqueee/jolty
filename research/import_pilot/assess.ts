import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BrowserState } from "../../packages/browser/src/index.ts";
import { filterCandidates } from "../../packages/retrieval/src/candidate-filter.ts";
import { retrieveCandidates } from "../../packages/retrieval/src/candidate-retrieval.ts";

type Action = "click" | "type" | "select" | null;
type Element = BrowserState["elements"][number];
type Observation = {
  schema_version: string;
  example_id: string;
  source: {
    dataset: string;
    revision: string;
    original_split: string;
    trace_id: string;
    source_row_index?: number;
    source_step_id?: string;
    source_step_index?: number;
    site_id: string;
    known_site_overlap?: string;
  };
  task?: { goal?: string };
  state?: {
    source_snapshot_sha256?: string | null;
    production_compatible?: boolean;
  };
  action: Action | string;
  source_action_type?: string;
  reference_target_ids?: string[];
  target_resolution?: {
    status?: string;
    target_shape?: string;
    target_role?: string | null;
    target_name?: string | null;
    locator_sha256?: string | null;
  };
  label?: { evidence_tier?: string };
  evidence_tier?: string;
  independent_outcome?: boolean;
  validation?: {
    executed?: boolean;
    step_passed?: boolean | null;
    task_passed?: boolean | null;
    validator_revision?: string | null;
    evidence_digest?: string | null;
  };
  elements: Element[];
  state_present: boolean;
  snapshot_download_status?: string;
  capture_status?: string;
  history?: Array<{
    action_type?: string;
    target_summary?: string;
    outcome?: string;
  }>;
  history_length?: number;
  history_bucket?: string;
  site_id?: string;
  duplicate_group?: string;
  duplicate_group_size?: number;
  duplicate_status?: string;
  manual_audit_status?: string;
  state_schema_version?: string;
  retriever_version?: string;
};

type CandidatePreview = {
  rank: number;
  id: string;
  role: string;
  name: string;
  text: string;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
};

type Assessment = {
  source: string;
  example_id: string;
  site_id: string;
  action: string;
  history_length: number;
  evidence_tier: string;
  state_present: boolean;
  target_mapping_status: string;
  target_mapped: boolean;
  action_supported: boolean;
  action_target_compatible: boolean;
  capture_ready: boolean;
  retrieval_attempted: boolean;
  candidate_count: number | null;
  top_k_candidate_count: number | null;
  target_in_top_k: boolean | null;
  rank: number | null;
  primary_rejection_reason: string | null;
  tier_a_rejection_reason: string | null;
  admission_rejection_reasons: string[];
  rejection_reasons: string[];
  tier_b_candidate: boolean;
  duplicate_group: string;
  duplicate_group_size: number;
  dedup_keep: boolean;
  top_k: CandidatePreview[];
};

const input = process.argv[2] ?? "artifacts/import-pilot-observations.json";
const output = process.argv[3] ?? "artifacts/import-pilot-report.json";
const auditOutput = process.argv[4] ?? "artifacts/import-pilot-audit.jsonl";
const topK = 10;
const observations = JSON.parse(await readFile(input, "utf8")) as Observation[];
const assessments: Assessment[] = [];
const auditRows: Record<string, unknown>[] = [];
const SUPPORTED_ACTIONS: Record<string, true> = {
  click: true,
  type: true,
  select: true,
};
const TARGET_RESOLUTION_STATUSES: Record<string, true> = {
  unique: true,
  missing_target: true,
  ambiguous_target: true,
  target_unmapped: true,
};

for (const observation of observations) {
  const action =
    typeof observation.action === "string" &&
    SUPPORTED_ACTIONS[observation.action]
      ? (observation.action as Action)
      : null;
  const goal = observation.task?.goal?.trim() ?? "";
  const siteId = observation.source.site_id || observation.site_id || "unknown";
  const referenceIds = observation.reference_target_ids ?? [];
  const targetResolutionStatus =
    observation.target_resolution?.status ?? "missing_target";
  const targetElements = observation.elements.filter((element) =>
    referenceIds.includes(element.id),
  );
  const target = targetElements.length === 1 ? targetElements[0] : undefined;
  let mappingStatus = targetResolutionStatus;
  if (targetResolutionStatus === "unique" && referenceIds.length === 0) {
    mappingStatus = "missing_target";
  } else if (
    targetResolutionStatus === "unique" &&
    (referenceIds.length > 1 || targetElements.length > 1)
  ) {
    mappingStatus = "ambiguous_target";
  } else if (targetResolutionStatus === "unique" && !target) {
    mappingStatus = "target_unmapped";
  } else if (!TARGET_RESOLUTION_STATUSES[mappingStatus]) {
    mappingStatus = "target_unmapped";
  }
  const targetMapped = mappingStatus === "unique" && target !== undefined;
  const actionSupported = action !== null;
  const actionCompatible =
    action === "type"
      ? Boolean(target?.editable && target.role !== "combobox")
      : action === "select"
        ? target?.role === "combobox"
        : action === "click"
          ? target !== undefined
          : false;
  const stateUsable =
    observation.state_present && observation.elements.length > 0;
  const pendingSelect =
    action === "select" ||
    observation.capture_status === "pending_select_schema";
  const captureReady =
    stateUsable &&
    goal.length > 0 &&
    actionSupported &&
    targetMapped &&
    actionCompatible &&
    !pendingSelect;
  let rank: number | null = null;
  let candidateCount: number | null = null;
  let topKCandidateCount: number | null = null;
  let topKPreview: CandidatePreview[] = [];
  let retrievalAttempted = false;

  if (captureReady && action && target) {
    const state: BrowserState = {
      url: "https://offline-import.invalid/",
      title: "",
      elements: observation.elements,
    };
    const filtered = filterCandidates(state);
    const retrieval = retrieveCandidates(goal, filtered.candidates, topK);
    retrievalAttempted = true;
    candidateCount = filtered.candidates.length;
    topKCandidateCount = retrieval.topCandidates.length;
    topKPreview = retrieval.topCandidates.map((candidate, index) => ({
      rank: index + 1,
      id: candidate.element.id,
      role: candidate.element.role,
      name: candidate.element.name,
      text: candidate.element.text,
      visible: candidate.element.visible,
      enabled: candidate.element.enabled,
      editable: candidate.element.editable,
    }));
    const index = retrieval.topCandidates.findIndex(
      (candidate) => candidate.element.id === target.id,
    );
    rank = index < 0 ? null : index + 1;
  }

  const snapshotStatus =
    observation.snapshot_download_status ??
    (stateUsable ? "available" : "missing_snapshot");
  const primaryRejectionReason = !stateUsable
    ? snapshotStatus === "missing_snapshot"
      ? "missing_snapshot"
      : "unusable_dom"
    : !goal
      ? "missing_goal"
      : !actionSupported
        ? "unsupported_action"
        : mappingStatus !== "unique"
          ? mappingStatus
          : !actionCompatible
            ? "action_target_mismatch"
            : pendingSelect
              ? "pending_select_schema"
              : retrievalAttempted && rank === null
                ? "gold_not_in_top_k"
                : null;
  const evidenceTier =
    observation.evidence_tier ?? observation.label?.evidence_tier ?? "D";
  const tierBCandidate = evidenceTier === "B" && captureReady;
  const tierAValidated =
    observation.independent_outcome === true &&
    observation.validation?.executed === true &&
    observation.validation.step_passed === true &&
    observation.validation.task_passed === true &&
    Boolean(
      observation.validation.validator_revision &&
        observation.validation.evidence_digest,
    );
  const tierARejectionReason = tierAValidated ? null : "no_independent_outcome";
  const admissionReasons = [
    observation.manual_audit_status !== "complete"
      ? "manual_audit_pending"
      : null,
    observation.source.known_site_overlap !== "verified_clear"
      ? "protected_site_overlap_unverified"
      : null,
    observation.state?.production_compatible !== true
      ? "production_parity_unverified"
      : null,
  ].filter((reason): reason is string => reason !== null);
  const rejectionReasons = [
    primaryRejectionReason,
    tierARejectionReason,
    ...admissionReasons,
  ].filter((reason): reason is string => reason !== null);
  const duplicateGroup = observation.duplicate_group ?? observation.example_id;
  assessments.push({
    source: observation.source.dataset,
    example_id: observation.example_id,
    site_id: siteId,
    action: action ?? "unsupported",
    history_length:
      observation.history_length ?? observation.history?.length ?? 0,
    evidence_tier: evidenceTier,
    state_present: stateUsable,
    target_mapping_status: mappingStatus,
    target_mapped: targetMapped,
    action_supported: actionSupported,
    action_target_compatible: actionCompatible,
    capture_ready: captureReady,
    retrieval_attempted: retrievalAttempted,
    candidate_count: candidateCount,
    top_k_candidate_count: topKCandidateCount,
    target_in_top_k: retrievalAttempted ? rank !== null : null,
    rank,
    primary_rejection_reason: primaryRejectionReason,
    tier_a_rejection_reason: tierARejectionReason,
    admission_rejection_reasons: admissionReasons,
    rejection_reasons: rejectionReasons,
    tier_b_candidate: tierBCandidate,
    duplicate_group: duplicateGroup,
    duplicate_group_size: observation.duplicate_group_size ?? 1,
    dedup_keep: false,
    top_k: topKPreview,
  });
  auditRows.push({
    audit_template_version: "bdm-import-audit-v1",
    example_id: observation.example_id,
    source: {
      dataset: observation.source.dataset,
      revision: observation.source.revision,
      split: observation.source.original_split,
      trace_id: observation.source.trace_id,
      source_row_index: observation.source.source_row_index ?? null,
      source_step_id: observation.source.source_step_id ?? null,
      source_step_index: observation.source.source_step_index ?? null,
      site_id: siteId,
      known_site_overlap: observation.source.known_site_overlap ?? "unverified",
      snapshot_sha256: observation.state?.source_snapshot_sha256 ?? null,
    },
    task: { goal },
    action: action ?? observation.source_action_type ?? "unsupported",
    history: observation.history ?? [],
    evidence: {
      tier: evidenceTier,
      independent_outcome: tierAValidated,
      state_present: stateUsable,
      capture_status: observation.capture_status ?? "unknown",
      target_resolution: {
        status: mappingStatus,
        target_role: observation.target_resolution?.target_role ?? null,
        target_name: observation.target_resolution?.target_name ?? null,
        target_shape: observation.target_resolution?.target_shape ?? null,
        locator_sha256: observation.target_resolution?.locator_sha256 ?? null,
      },
      elements: observation.elements,
      retrieval_attempted: retrievalAttempted,
      candidate_count: candidateCount,
      target_in_top_k: retrievalAttempted ? rank !== null : null,
      rank,
      top_k: topKPreview,
      duplicate_group: duplicateGroup,
      duplicate_group_size: observation.duplicate_group_size ?? 1,
    },
    assessment: {
      primary_rejection_reason: primaryRejectionReason,
      tier_a_rejection_reason: tierARejectionReason,
      admission_rejection_reasons: admissionReasons,
    },
    review: {
      status: "pending",
      reviewer: "",
      verdict: "",
      reason: "",
      notes: "",
    },
  });
}

const representatives = new Map<string, Assessment>();
for (const assessment of [...assessments]
  .filter((item) => item.tier_b_candidate)
  .sort((left, right) => left.example_id.localeCompare(right.example_id))) {
  if (!representatives.has(assessment.duplicate_group)) {
    representatives.set(assessment.duplicate_group, assessment);
    assessment.dedup_keep = true;
  }
}

function counts(values: string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [
        value,
        values.filter((entry) => entry === value).length,
      ]),
  );
}

function summarize(rows: Assessment[]) {
  const rowsWithPrimaryReason = rows.map(
    (row) => row.primary_rejection_reason ?? "none",
  );
  const allReasons = rows.flatMap((row) => row.rejection_reasons);
  const actionRows = Object.fromEntries(
    [...new Set(rows.map((row) => row.action))].sort().map((action) => {
      const subset = rows.filter((row) => row.action === action);
      return [
        action,
        {
          observations: subset.length,
          target_mapped: subset.filter((row) => row.target_mapped).length,
          capture_ready: subset.filter((row) => row.capture_ready).length,
          retrieval_attempted: subset.filter((row) => row.retrieval_attempted)
            .length,
          gold_in_top_k: subset.filter((row) => row.target_in_top_k === true)
            .length,
          primary_rejection_reasons: counts(
            subset.map((row) => row.primary_rejection_reason ?? "none"),
          ),
        },
      ];
    }),
  );
  const dimensionCounts = (
    key:
      | "history_length"
      | "evidence_tier"
      | "site_id"
      | "target_mapping_status"
      | "primary_rejection_reason",
  ) => counts(rows.map((row) => String(row[key] ?? "none")));
  return {
    raw_sampled_observations: rows.length,
    unique_sites: new Set(rows.map((row) => row.site_id)).size,
    pre_action_state_available: rows.filter((row) => row.state_present).length,
    unique_targets_mapped: rows.filter((row) => row.target_mapped).length,
    supported_actions: rows.filter((row) => row.action_supported).length,
    action_target_compatible: rows.filter(
      (row) => row.action_target_compatible && row.target_mapped,
    ).length,
    capture_ready: rows.filter((row) => row.capture_ready).length,
    retrieval_attempted: rows.filter((row) => row.retrieval_attempted).length,
    gold_in_top_k: rows.filter((row) => row.target_in_top_k === true).length,
    tier_b_candidates_before_dedup: rows.filter((row) => row.tier_b_candidate)
      .length,
    tier_b_candidates_after_exact_dedup: rows.filter((row) => row.dedup_keep)
      .length,
    tier_a_independent_outcomes: rows.filter(
      (row) => row.tier_a_rejection_reason === null,
    ).length,
    tier_a_rejections: counts(
      rows.map((row) => row.tier_a_rejection_reason ?? "none"),
    ),
    manually_audited: rows.filter((row) =>
      row.admission_rejection_reasons.every(
        (reason) => reason !== "manual_audit_pending",
      ),
    ).length,
    training_admitted: 0,
    primary_rejection_reasons: counts(rowsWithPrimaryReason),
    all_rejection_reasons: counts(allReasons),
    action_type: actionRows,
    by_site: dimensionCounts("site_id"),
    by_history_length: dimensionCounts("history_length"),
    by_evidence_tier: dimensionCounts("evidence_tier"),
    by_target_mapping_status: dimensionCounts("target_mapping_status"),
  };
}

const sourceNames = [...new Set(assessments.map((row) => row.source))].sort();
const summary = Object.fromEntries(
  sourceNames.map((source) => [
    source,
    summarize(assessments.filter((row) => row.source === source)),
  ]),
);
const result = {
  schema_version: "bdm-import-assessment-v1",
  input,
  observation_count: observations.length,
  top_k: topK,
  method:
    "offline structural proxy; retrieved from static HTML projections, not the production serializer or browser state",
  input_versions: {
    state_schema_versions: [
      ...new Set(
        observations.map((item) => item.state_schema_version ?? "unknown"),
      ),
    ],
    retriever_versions: [
      ...new Set(
        observations.map((item) => item.retriever_version ?? "unknown"),
      ),
    ],
    production_compatible: false,
  },
  limitations: [
    "All source actions are demonstrations without an independent current step/task outcome; tier A remains empty.",
    "SELECT-dependent captures remain pending; no selected/current value or serializer parity is inferred.",
    "Manual audit is pending; protected site/template overlap remains unverified; nothing is admitted for training.",
    "A retrieval rank is an offline proxy against an inert static HTML projection, not browser or production behavior.",
  ],
  summary,
  steps: assessments,
};
await mkdir(dirname(output), { recursive: true });
await mkdir(dirname(auditOutput), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(
  auditOutput,
  auditRows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  "utf8",
);
console.log(JSON.stringify({ output, audit: auditOutput, summary }, null, 2));
