import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const health = JSON.parse(readFileSync(path.join(root, "corpus-health.json"), "utf8"));
const args = process.argv.slice(2);

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const recordSlug = valueAfter("--record");
if (recordSlug) {
  const record = health.records.find((item) => item.slug === recordSlug);
  if (!record) {
    console.error(`Unknown corpus record: ${recordSlug}`);
    process.exit(1);
  }
  print({
    slug: record.slug,
    disposition: record.operational_disposition,
    identity: record.resolved_platform_identity,
    source_authority: record.source_authority,
    source_content_availability: record.source_content_availability,
    claims: record.claims,
    journey_integrity: record.journey_integrity,
    launch_cohorts: health.review_operations.candidate_cohorts
      .filter((cohort) => cohort.participants.some((participant) => participant.slug === recordSlug))
      .map((cohort) => cohort.id),
  });
  process.exit(0);
}

const cohortId = valueAfter("--cohort");
if (cohortId) {
  const cohort = health.review_operations.candidate_cohorts.find((item) => item.id === cohortId);
  if (!cohort) {
    console.error(`Unknown launch cohort: ${cohortId}`);
    process.exit(1);
  }
  print(cohort);
  process.exit(0);
}

if (args.includes("--json")) {
  print({
    summary: health.summary,
    review_operations: health.review_operations,
  });
  process.exit(0);
}

const dispositions = health.summary.dispositions;
console.log(`Corpus: ${health.summary.records} deterministic dispositions`);
console.log(
  [
    `published=${dispositions.published}`,
    `excluded=${dispositions.excluded}`,
    `stale=${dispositions.stale}`,
    `identity_needs_approval=${dispositions.identity_needs_approval}`,
    `evidence_needs_review=${dispositions.evidence_needs_review}`,
    `route_needs_review=${dispositions.route_needs_review}`,
  ].join(" "),
);
console.log(
  `Launch threshold: ${dispositions.published}/20 public routes; ` +
  `${health.summary.qualified_comparison_cohorts}/5 qualified cohorts; ` +
  `${health.summary.routes_with_three_qualified_peers} routes with at least three qualified peers.`,
);
for (const cohort of health.review_operations.candidate_cohorts) {
  console.log(
    `${cohort.id}: ${cohort.publication_eligible_count}/${cohort.required_platform_count} public, ` +
    `${cohort.comparison_qualified_count}/${cohort.required_platform_count} comparison-qualified`,
  );
}
console.log(`Next: ${health.review_operations.recommended_next_review_action}`);
console.log("Use --record <slug>, --cohort <id>, or --json for the full evidence-backed view.");
