import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

const packetPath = path.resolve(
  valueAfter("--packet") ?? path.join(root, "evaluation", "blocker-labeling-packet.json"),
);
const statusPath = path.join(path.dirname(packetPath), "blocker-evaluation-status.json");
const packet = JSON.parse(readFileSync(packetPath, "utf8"));
const catalog = JSON.parse(readFileSync(path.join(root, "blocker-catalog.json"), "utf8"));
const reasons = new Map(
  catalog.nodes
    .filter((node) => node.kind === "reason")
    .map((node) => [node.id, node]),
);

function atomicWrite(file, value) {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
}

function outcome(review) {
  if (review?.taxonomy_gap) return "taxonomy_gap";
  if (review?.abstain) return "abstain";
  if (review?.label) return `reason:${review.label}`;
  return null;
}

function emptyReview(notes = null) {
  return {
    reviewer_id: null,
    label: null,
    abstain: false,
    taxonomy_gap: false,
    notes,
    labeled_at: null,
  };
}

function completedReview(reviewerId, fields, notes) {
  if (!reviewerId?.trim()) {
    throw new Error("A stable --reviewer-id is required.");
  }
  return {
    reviewer_id: reviewerId.trim(),
    label: null,
    abstain: false,
    taxonomy_gap: false,
    notes,
    labeled_at: new Date().toISOString(),
    ...fields,
  };
}

function setReason(reasonId, reviewerId, notes) {
  if (!reasons.has(reasonId)) {
    throw new Error(`Unknown blocker reason: ${reasonId}`);
  }
  return completedReview(reviewerId, { label: reasonId }, notes);
}

function recomputeSample(sample) {
  const left = outcome(sample.reviewer_a);
  const right = outcome(sample.reviewer_b);
  const adjudicated = outcome(sample.adjudication);
  const independentLabels = Boolean(
    sample.reviewer_a?.reviewer_id &&
    sample.reviewer_b?.reviewer_id &&
    sample.reviewer_a.reviewer_id !== sample.reviewer_b.reviewer_id,
  );
  const independentAdjudicator = Boolean(
    sample.adjudication?.reviewer_id &&
    ![sample.reviewer_a?.reviewer_id, sample.reviewer_b?.reviewer_id]
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
  sample.public_eligible = false;
}

function persist() {
  for (const sample of packet.samples) recomputeSample(sample);
  const labelsComplete = packet.samples.every((sample) =>
    Boolean(outcome(sample.reviewer_a) && outcome(sample.reviewer_b)),
  );
  const adjudicationComplete = packet.samples.every((sample) =>
    sample.adjudication_state === "agreement" ||
    sample.adjudication_state === "adjudicated",
  );
  packet.status =
    labelsComplete && adjudicationComplete
      ? "labels_and_adjudication_complete"
      : "awaiting_two_independent_reviewers";
  atomicWrite(packetPath, packet);
  try {
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    status.status =
      labelsComplete && adjudicationComplete
        ? "awaiting_threshold_approval_and_frozen_test_run"
        : "awaiting_independent_labels";
    status.labels_complete = labelsComplete;
    status.adjudication_complete = adjudicationComplete;
    status.public_blocker_links_allowed = false;
    atomicWrite(statusPath, status);
  } catch {
    // A custom packet path may intentionally omit a companion status file.
  }
}

function sampleById(sampleId) {
  const sample = packet.samples.find((item) => item.sample_id === sampleId);
  if (!sample) throw new Error(`Unknown Reason Lab sample: ${sampleId}`);
  return sample;
}

function notesValue() {
  return valueAfter("--notes");
}

function publicView(sample) {
  const candidate = sample.candidate_hypothesis;
  return {
    workflow: packet.workflow_name,
    sample_id: sample.sample_id,
    split: sample.split,
    gate: {
      platform: sample.platform,
      route_phase: sample.route_phase,
      gate_type: sample.gate_type,
      description: sample.gate_description,
      step_action: sample.step_action,
      source_context: sample.source_context,
    },
    candidate_hypothesis: {
      family: candidate?.family_id
        ? { id: candidate.family_id, label: candidate.family_label }
        : null,
      reason: candidate?.reason_id
        ? { id: candidate.reason_id, label: candidate.reason_label }
        : null,
      evidence_class: candidate?.evidence_class ?? "model_hypothesis",
      method: candidate?.method ?? "no_candidate",
      confidence: candidate?.confidence ?? null,
      versions: candidate?.versions ?? packet.versions,
    },
    reviewer_a: sample.reviewer_a,
    reviewer_b: sample.reviewer_b,
    adjudication: sample.adjudication,
    adjudication_state: sample.adjudication_state,
    evaluation_eligible: sample.evaluation_eligible,
    public_eligible: false,
    invalidated_at: sample.invalidated_at ?? null,
  };
}

function usage() {
  console.log(`Reason Lab commands:
  inspect <sample-id>
  list [--state awaiting_labels|agreement|disagreement|adjudicated|reviewer_identity_invalid]
  label <sample-id> <reviewer_a|reviewer_b> <reason-id> [--notes text]
  abstain <sample-id> <reviewer_a|reviewer_b> [--notes text]
  taxonomy-gap <sample-id> <reviewer_a|reviewer_b> [--notes text]
  compare <sample-id>
  adjudicate <sample-id> <reason-id|abstain|taxonomy-gap> [--notes text]
  invalidate --reason <text>
  Label and adjudication commands require --reviewer-id <stable-id>.
  Add --packet <path> to operate on a copy.`);
}

try {
  const command = args[0];
  if (!command || command === "help") {
    usage();
    process.exit(0);
  }
  if (command === "inspect") {
    console.log(JSON.stringify(publicView(sampleById(args[1])), null, 2));
    process.exit(0);
  }
  if (command === "list") {
    const state = valueAfter("--state");
    const rows = packet.samples
      .map((sample) => publicView(sample))
      .filter((sample) => !state || sample.adjudication_state === state)
      .map((sample) => ({
        sample_id: sample.sample_id,
        platform: sample.gate.platform.slug,
        gate_type: sample.gate.gate_type,
        adjudication_state: sample.adjudication_state,
        evaluation_eligible: sample.evaluation_eligible,
      }));
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  }
  if (command === "compare") {
    const sample = sampleById(args[1]);
    recomputeSample(sample);
    console.log(JSON.stringify({
      sample_id: sample.sample_id,
      reviewer_a: sample.reviewer_a,
      reviewer_b: sample.reviewer_b,
      same_outcome: outcome(sample.reviewer_a) === outcome(sample.reviewer_b),
      adjudication: sample.adjudication,
      adjudication_state: sample.adjudication_state,
    }, null, 2));
    process.exit(0);
  }
  if (command === "label" || command === "abstain" || command === "taxonomy-gap") {
    const sample = sampleById(args[1]);
    const reviewer = args[2];
    if (!["reviewer_a", "reviewer_b"].includes(reviewer)) {
      throw new Error("Reviewer must be reviewer_a or reviewer_b.");
    }
    const reviewerId = valueAfter("--reviewer-id");
    const otherReviewer = reviewer === "reviewer_a" ? "reviewer_b" : "reviewer_a";
    if (reviewerId && sample[otherReviewer]?.reviewer_id === reviewerId.trim()) {
      throw new Error("reviewer_a and reviewer_b must use distinct reviewer IDs.");
    }
    sample[reviewer] =
      command === "label"
        ? setReason(args[3], reviewerId, notesValue())
        : command === "abstain"
          ? completedReview(reviewerId, { abstain: true }, notesValue())
          : completedReview(reviewerId, { taxonomy_gap: true }, notesValue());
    sample.adjudication = emptyReview();
    persist();
    console.log(JSON.stringify(publicView(sample), null, 2));
    process.exit(0);
  }
  if (command === "adjudicate") {
    const sample = sampleById(args[1]);
    const left = outcome(sample.reviewer_a);
    const right = outcome(sample.reviewer_b);
    if (!left || !right) {
      throw new Error("Adjudication requires completed reviewer_a and reviewer_b labels.");
    }
    if (left === right) {
      throw new Error("Reviewer outcomes already agree; adjudication is not required.");
    }
    const reviewerId = valueAfter("--reviewer-id");
    if (
      reviewerId &&
      [sample.reviewer_a.reviewer_id, sample.reviewer_b.reviewer_id].includes(reviewerId.trim())
    ) {
      throw new Error("The adjudicator must use a reviewer ID distinct from both labelers.");
    }
    const decision = args[2];
    sample.adjudication =
      decision === "abstain"
        ? completedReview(reviewerId, { abstain: true }, notesValue())
        : decision === "taxonomy-gap"
          ? completedReview(reviewerId, { taxonomy_gap: true }, notesValue())
          : setReason(decision, reviewerId, notesValue());
    persist();
    console.log(JSON.stringify(publicView(sample), null, 2));
    process.exit(0);
  }
  if (command === "invalidate") {
    const reason = valueAfter("--reason");
    if (!reason) throw new Error("invalidate requires --reason.");
    const invalidatedAt = new Date().toISOString();
    for (const sample of packet.samples) {
      sample.reviewer_a = emptyReview();
      sample.reviewer_b = emptyReview();
      sample.adjudication = emptyReview();
      sample.invalidated_at = invalidatedAt;
      sample.invalidation_reason = reason;
    }
    persist();
    console.log(`Invalidated ${packet.samples.length} Reason Lab samples at ${invalidatedAt}.`);
    process.exit(0);
  }
  throw new Error(`Unknown Reason Lab command: ${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
