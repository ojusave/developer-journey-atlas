import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(path.join(root, "evaluation"), { recursive: true });

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readOptionalJson(file) {
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalize(value).split(" ").filter((token) => token.length > 2));
}

function similarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

const roster = readJson(path.join(root, "roster.json"));
const records = roster.map((entry) => readJson(path.join(root, "records", `${entry.slug}.json`)));
const catalog = readJson(path.join(root, "blocker-catalog.json"));
const reasons = catalog.nodes.filter((node) => node.kind === "reason");
const catalogById = new Map(catalog.nodes.map((node) => [node.id, node]));
const previousLabelingPacket = readOptionalJson(
  path.join(root, "evaluation", "blocker-labeling-packet.json"),
);
const previousEvaluationStatus = readOptionalJson(
  path.join(root, "evaluation", "blocker-evaluation-status.json"),
);
const gateTypeFamilyMap = {
  account: "U04",
  verification: "U04",
  credential: "U12",
  permission: "U07",
  access: "U07",
  approval: "U07",
  payment: "U06",
  billing: "U06",
  legal: "U06",
  terms: "U06",
  policy: "U06",
  dns: "U13",
  domain: "U13",
  network: "U13",
  wait: "U25",
  "rate-limit": "U20",
  limit: "U20",
  installation: "U11",
  download: "U11",
  software: "U11",
  configuration: "U12",
  environment: "U12",
  form: "U15",
  choice: "U15",
  hardware: "U10",
  knowledge: "U09",
  other: "U08",
};
const reasonLabVersions = {
  taxonomy_version: catalog.catalogVersion,
  taxonomy_source_hash: catalog.sourceHash,
  embedding_model: previousEvaluationStatus?.embedding_model ?? null,
  model: previousEvaluationStatus?.model_version ?? null,
};
const previousSamples = new Map(
  (previousLabelingPacket?.samples ?? []).map((sample) => [sample.sample_id, sample]),
);
const previousVersions = previousLabelingPacket?.versions ?? null;
const versionsMatch =
  previousVersions?.taxonomy_version === reasonLabVersions.taxonomy_version &&
  previousVersions?.taxonomy_source_hash === reasonLabVersions.taxonomy_source_hash &&
  previousVersions?.embedding_model === reasonLabVersions.embedding_model &&
  previousVersions?.model === reasonLabVersions.model;

function normalizedReview(review) {
  return {
    reviewer_id: review?.reviewer_id ?? null,
    label: review?.label ?? null,
    abstain: review?.abstain ?? false,
    taxonomy_gap: review?.taxonomy_gap ?? false,
    notes: review?.notes ?? null,
    labeled_at: review?.labeled_at ?? null,
  };
}

const exactGroups = new Map();
for (const reason of reasons) {
  const key = normalize(reason.label);
  const group = exactGroups.get(key) ?? [];
  group.push(reason.id);
  exactGroups.set(key, group);
}
const exactDuplicates = [...exactGroups.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([normalized_label, reason_ids]) => ({ normalized_label, reason_ids }));
const nearDuplicates = [];
for (let i = 0; i < reasons.length; i += 1) {
  for (let j = i + 1; j < reasons.length; j += 1) {
    const score = similarity(reasons[i].label, reasons[j].label);
    if (score >= 0.88 && normalize(reasons[i].label) !== normalize(reasons[j].label)) {
      nearDuplicates.push({
        left_id: reasons[i].id,
        right_id: reasons[j].id,
        token_jaccard: Number(score.toFixed(3)),
      });
    }
  }
}
const combinedMechanisms = reasons
  .filter((reason) => /\b(and|or)\b/i.test(reason.label))
  .map((reason) => ({ id: reason.id, label: reason.label }));
const missingProvenance = reasons
  .filter((reason) => !reason.sourceLine || !catalog.sourceHash || !catalog.catalogVersion)
  .map((reason) => reason.id);

const taxonomyAudit = {
  schema_version: "1.0",
  catalog_version: catalog.catalogVersion,
  source_hash: catalog.sourceHash,
  owner: "Developer Journey Atlas maintainer",
  status: "hypothesis_library_not_publicly_validated",
  counts: {
    reasons: reasons.length,
    exact_duplicate_groups: exactDuplicates.length,
    near_duplicate_pairs: nearDuplicates.length,
    combined_mechanism_labels: combinedMechanisms.length,
    missing_provenance: missingProvenance.length,
  },
  exact_duplicates: exactDuplicates,
  near_duplicates: nearDuplicates,
  combined_mechanisms: combinedMechanisms,
  missing_provenance_reason_ids: missingProvenance,
  required_human_review: [
    "overlapping or inconsistent hierarchy and granularity",
    "missing categories found during independent journey review",
    "label leakage against the frozen gate sample",
    "owner-approved change history for every reason",
  ],
};

const platforms = records
  .filter((record) => (record.friction_gates ?? []).length > 0)
  .sort((a, b) => a.platform.slug.localeCompare(b.platform.slug));
const selectedPlatforms = [];
const categories = new Set();
for (const record of platforms) {
  if (selectedPlatforms.length >= 20 && categories.size >= 8) break;
  selectedPlatforms.push(record);
  categories.add(record.category);
}
while (selectedPlatforms.length < 20 && selectedPlatforms.length < platforms.length) {
  selectedPlatforms.push(platforms[selectedPlatforms.length]);
}

const samples = [];
let cursor = 0;
while (samples.length < 100 && selectedPlatforms.length > 0) {
  const record = selectedPlatforms[cursor % selectedPlatforms.length];
  const gates = record.friction_gates ?? [];
  const gateIndex = Math.floor(cursor / selectedPlatforms.length) % gates.length;
  const gate = gates[gateIndex];
  const step = (record.primary_path ?? []).find((item) => item.step_number === gate.at_step);
  const sourceById = new Map((record.sources ?? []).map((source) => [source.id, source]));
  const sourceContext = (gate.source_ids ?? [])
    .map((id) => sourceById.get(id))
    .filter(Boolean)
    .map((source) => ({
      id: source.id,
      url: source.url,
      sections_used: source.sections_used,
    }));
  const sampleNumber = samples.length + 1;
  const heldOutPlatforms = new Set(selectedPlatforms.slice(-5).map((item) => item.platform.slug));
  const familyId = gateTypeFamilyMap[String(gate.type ?? "").toLowerCase()] ?? null;
  const contextHash = createHash("sha256").update(JSON.stringify({
    platform_slug: record.platform.slug,
    route_phase: step?.phase ?? "unknown",
    gate_type: gate.type,
    gate_description: gate.description,
    step_action: step?.action ?? null,
    source_context: sourceContext,
  })).digest("hex");
  const previous = previousSamples.get(`G${String(sampleNumber).padStart(3, "0")}`);
  const preserveReview =
    versionsMatch &&
    previous?.context_hash === contextHash;
  samples.push({
    sample_id: `G${String(sampleNumber).padStart(3, "0")}`,
    context_hash: contextHash,
    split: heldOutPlatforms.has(record.platform.slug) ? "platform_held_out_test" : "development",
    platform: {
      slug: record.platform.slug,
      name: record.platform.name,
      category: record.category,
    },
    route_phase: step?.phase ?? "unknown",
    gate_type: gate.type,
    gate_description: gate.description,
    step_action: step?.action ?? null,
    source_context: sourceContext,
    candidate_hypothesis: {
      family_id: familyId,
      family_label: familyId ? catalogById.get(familyId)?.label ?? null : null,
      reason_id: null,
      reason_label: null,
      evidence_class: "model_hypothesis",
      method: familyId ? "curated_gate_type_soft_map" : "no_candidate",
      confidence: null,
      versions: reasonLabVersions,
    },
    reviewer_a: preserveReview
      ? normalizedReview(previous.reviewer_a)
      : normalizedReview(null),
    reviewer_b: preserveReview
      ? normalizedReview(previous.reviewer_b)
      : normalizedReview(null),
    adjudication: preserveReview
      ? normalizedReview(previous.adjudication)
      : normalizedReview(null),
    evaluation_eligible: false,
    public_eligible: false,
    invalidated_at: preserveReview ? previous.invalidated_at ?? null : previous ? new Date().toISOString() : null,
  });
  cursor += 1;
}

function reviewerOutcome(review) {
  if (review?.taxonomy_gap) return "taxonomy_gap";
  if (review?.abstain) return "abstain";
  if (review?.label) return `reason:${review.label}`;
  return null;
}

for (const sample of samples) {
  const left = reviewerOutcome(sample.reviewer_a);
  const right = reviewerOutcome(sample.reviewer_b);
  const adjudicated = reviewerOutcome(sample.adjudication);
  const independentLabels = Boolean(
    sample.reviewer_a.reviewer_id &&
    sample.reviewer_b.reviewer_id &&
    sample.reviewer_a.reviewer_id !== sample.reviewer_b.reviewer_id,
  );
  const independentAdjudicator = Boolean(
    sample.adjudication.reviewer_id &&
    ![sample.reviewer_a.reviewer_id, sample.reviewer_b.reviewer_id]
      .includes(sample.adjudication.reviewer_id),
  );
  sample.adjudication_state =
    !left || !right
      ? "awaiting_labels"
      : !independentLabels
        ? "reviewer_identity_invalid"
      : left === right
        ? "agreement"
        : adjudicated && independentAdjudicator
          ? "adjudicated"
          : adjudicated
            ? "reviewer_identity_invalid"
          : "disagreement";
  sample.evaluation_eligible =
    sample.adjudication_state === "agreement" ||
    sample.adjudication_state === "adjudicated";
}

const labelsComplete = samples.every((sample) =>
  Boolean(reviewerOutcome(sample.reviewer_a) && reviewerOutcome(sample.reviewer_b)),
);
const adjudicationComplete = samples.every((sample) =>
  sample.adjudication_state === "agreement" || sample.adjudication_state === "adjudicated",
);

const labelingPacket = {
  schema_version: "1.0",
  status:
    labelsComplete && adjudicationComplete
      ? "labels_and_adjudication_complete"
      : "awaiting_two_independent_reviewers",
  workflow_name: "Reason Lab",
  versions: reasonLabVersions,
  invalidation_policy:
    "Reviewer and adjudication results are invalidated when the sample context, taxonomy version, taxonomy source hash, embedding model, or reconstruction model changes.",
  instructions: [
    "Reviewers label independently from source and route context without model scores.",
    "Use abstain when no reason is supported.",
    "Use taxonomy_gap when the library lacks the needed reason.",
    "Adjudicate disagreements before any model threshold is inspected.",
  ],
  sampling: {
    samples: samples.length,
    platforms: new Set(samples.map((sample) => sample.platform.slug)).size,
    categories: new Set(samples.map((sample) => sample.platform.category)).size,
    development_samples: samples.filter((sample) => sample.split === "development").length,
    platform_held_out_test_samples: samples.filter((sample) => sample.split === "platform_held_out_test").length,
  },
  provisional_thresholds_requiring_owner_approval: {
    family_precision_min: 0.9,
    leaf_precision_at_3_min: 0.8,
    unsupported_link_rate_max: 0.05,
    per_stratum_precision_min: 0.7,
  },
  samples,
};

const evaluationStatus = {
  schema_version: "1.0",
  status:
    labelsComplete && adjudicationComplete
      ? "awaiting_threshold_approval_and_frozen_test_run"
      : "awaiting_independent_labels",
  public_blocker_links_allowed: false,
  labels_complete: labelsComplete,
  adjudication_complete: adjudicationComplete,
  thresholds_approved: versionsMatch && previousEvaluationStatus?.thresholds_approved === true,
  frozen_test_run_complete:
    versionsMatch && previousEvaluationStatus?.frozen_test_run_complete === true,
  model_version: reasonLabVersions.model,
  embedding_model: reasonLabVersions.embedding_model,
  taxonomy_version: reasonLabVersions.taxonomy_version,
  taxonomy_source_hash: reasonLabVersions.taxonomy_source_hash,
  metrics: null,
  evidence_class: "model_hypothesis",
};

const associationPlan = {
  schema_version: "1.0",
  status: "unavailable_zero_qualified_cohort",
  public_associations_allowed: false,
  exploratory_and_confirmatory_separated: true,
  required_cohort_gates: [
    "verified identity and source evidence",
    "same journey job",
    "compatible starting state",
    "equivalent first-success boundary",
    "compatible action granularity",
    "source freshness within policy",
    "organization and copied-documentation deduplication",
  ],
  missing_data_values: ["unknown", "missing", "unresolved", "not_applicable"],
  required_reporting: [
    "sample size and missingness",
    "effect size and uncertainty interval",
    "category stratification and reversal check",
    "false-discovery-rate control",
    "documentation-pattern wording only",
  ],
};

const productValidation = {
  schema_version: "1.0",
  status: "protocol_ready_human_studies_not_run",
  route_accuracy: {
    baseline: "independent reviewer reconstruction from first-party documentation",
    sample: "20 representative platforms after publication eligibility passes",
    measures: [
      "required_action_recall",
      "unsupported_action_rate",
      "required_field_coverage",
      "branch_accuracy",
      "first_success_boundary_agreement",
      "correction_count",
    ],
    thresholds: {
      required_action_recall_min: 0.95,
      unsupported_action_rate_max: 0.02,
      required_field_coverage_min: 0.95,
      branch_accuracy_min: 0.9,
      first_success_boundary_agreement_min: 0.9,
    },
  },
  user_value: {
    participants: "Representative developers plus DevRel or developer-experience practitioners",
    design: "Counterbalanced comparison of Atlas against official documentation alone",
    measures: [
      "task_correctness",
      "time_to_correct_route_understanding",
      "governing_evidence_retrieval",
      "useful_corrections_found",
      "real_onboarding_or_documentation_decision_changed",
    ],
    threshold:
      "Atlas must improve correctness or median time by at least 15 percent without reducing evidence retrieval, and at least 30 percent of practitioners must identify a useful decision or correction.",
  },
  growth_stop_rule:
    "Stop growth work if Atlas does not improve accuracy, speed, evidence retrieval, or decision usefulness over the official-documentation baseline.",
};

const outputs = [
  ["taxonomy-audit.json", taxonomyAudit],
  ["blocker-labeling-packet.json", labelingPacket],
  ["blocker-evaluation-status.json", evaluationStatus],
  ["association-analysis-plan.json", associationPlan],
  ["product-validation-protocols.json", productValidation],
];
for (const [file, value] of outputs) {
  writeFileSync(path.join(root, "evaluation", file), `${JSON.stringify(value, null, 2)}\n`);
}
console.log(
  `Validation foundations: ${samples.length} gates across ${labelingPacket.sampling.platforms} platforms; public blocker links and associations disabled.`,
);
