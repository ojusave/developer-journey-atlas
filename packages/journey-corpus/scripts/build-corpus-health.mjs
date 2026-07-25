import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "corpus-health.json");
const migrationPath = path.join(root, "migration-analysis.json");
const launchCohortsPath = path.join(root, "trust", "launch-cohort-candidates.json");
const COMPARISON_FRESHNESS_DAYS = 90;

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function normalizeIdentityKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function identityCandidates(record, identities) {
  const requested = [
    record.platform?.slug,
    record.platform?.name,
    record.platform?.organization,
  ].map(normalizeIdentityKey);
  return identities.filter((identity) => {
    const keys = [
      identity.slug,
      identity.canonicalName,
      identity.organization,
      ...(identity.aliases ?? []),
    ].map(normalizeIdentityKey);
    return requested.some((key) => keys.includes(key));
  });
}

function isDomainOrSubdomain(host, domain) {
  const accepted = domain.toLowerCase().replace(/^\./, "").replace(/\.$/, "");
  return host === accepted || host.endsWith(`.${accepted}`);
}

function sourceAuthority(source, identity) {
  let url;
  try {
    url = new URL(source.url);
  } catch {
    return { source_id: source.id, url: source.url, accepted: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:") {
    return { source_id: source.id, url: source.url, accepted: false, reason: "https_required" };
  }
  if (url.hostname.toLowerCase() === "github.com") {
    const owner = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    const approved = (identity.approvedGithubOrganizations ?? []).map((item) => item.toLowerCase());
    return {
      source_id: source.id,
      url: source.url,
      accepted: Boolean(owner && approved.includes(owner)),
      reason: owner && approved.includes(owner)
        ? "approved_github_organization"
        : "github_organization_not_approved",
    };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const domains = [
    identity.officialRootDomain,
    ...(identity.documentationDomains ?? []),
    ...(identity.applicationDomains ?? []),
  ];
  const accepted = domains.some((domain) => isDomainOrSubdomain(host, domain));
  return {
    source_id: source.id,
    url: source.url,
    accepted,
    reason: accepted ? "domain_allowlist_match" : "domain_not_allowlisted",
  };
}

function loadOptionalJson(file) {
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

function normalizedAction(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|your|this|that)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function daysOld(date, now) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / (24 * 60 * 60 * 1000));
}

function dispositionFor(record, now) {
  const age = record.last_retrieval_date?.slice(0, 10)
    ? daysOld(record.last_retrieval_date.slice(0, 10), now)
    : null;
  const passesEveryRuleExceptFreshness =
    record.resolved_platform_identity.status === "resolved" &&
    record.source_authority.rejected_sources.length === 0 &&
    record.source_authority.accepted_sources.length > 0 &&
    record.source_content_availability.missing_or_unusable_source_ids.length === 0 &&
    record.claims.without_evidence.length === 0 &&
    record.journey_integrity.findings.length === 0;
  if (
    passesEveryRuleExceptFreshness &&
    age !== null &&
    age > COMPARISON_FRESHNESS_DAYS
  ) {
    return {
      status: "stale",
      machine_readable_reasons: ["evidence_freshness_exceeded_90_days"],
      failed_freshness_rule: {
        maximum_age_days: COMPARISON_FRESHNESS_DAYS,
        observed_age_days: age,
        last_retrieval_date: record.last_retrieval_date,
      },
    };
  }
  if (record.eligibility.public_display) {
    return {
      status: "published",
      machine_readable_reasons: [],
      failed_freshness_rule: null,
    };
  }
  if (record.resolved_platform_identity.status !== "resolved") {
    return {
      status: "identity_needs_approval",
      machine_readable_reasons: [record.resolved_platform_identity.status],
      failed_freshness_rule: null,
    };
  }
  if (record.source_authority.rejected_sources.length > 0) {
    return {
      status: "excluded",
      machine_readable_reasons: [
        "rejected_authoritative_source",
        ...record.source_authority.rejected_sources.map((source) => source.reason),
      ],
      failed_freshness_rule: null,
    };
  }
  if (
    record.source_authority.accepted_sources.length === 0 ||
    record.source_content_availability.missing_or_unusable_source_ids.length > 0 ||
    record.claims.without_evidence.length > 0
  ) {
    return {
      status: "evidence_needs_review",
      machine_readable_reasons: [
        ...(record.source_authority.accepted_sources.length === 0 ? ["no_accepted_source"] : []),
        ...(record.source_content_availability.missing_or_unusable_source_ids.length > 0
          ? ["source_content_unavailable"]
          : []),
        ...(record.claims.without_evidence.length > 0 ? ["claim_grounding_failed"] : []),
      ],
      failed_freshness_rule: null,
    };
  }
  return {
    status: "route_needs_review",
    machine_readable_reasons: record.journey_integrity.findings.map((finding) => finding.code),
    failed_freshness_rule: null,
  };
}

function generatedFilesFor(slug) {
  return [
    `trust/platform-identities.json`,
    `trust/source-evidence/${slug}.json`,
    `trust/journey-graphs/${slug}.json`,
    "corpus-health.json",
    "migration-analysis.json",
    "selected-path-heuristic.json",
    "public/data/index.json",
    `public/data/records/${slug}.json`,
    "public/llms.txt",
    "public/llms-full.txt",
    "public/sitemap.xml",
    "public/source/index.md",
  ];
}

function looksCompound(action) {
  const normalized = action.toLowerCase();
  const connectors = normalized.match(/\b(and then|then|and|after that)\b/g) ?? [];
  const verbs = normalized.match(
    /\b(open|click|select|choose|enter|create|copy|paste|authorize|connect|submit|run|send|confirm|verify|purchase|add|configure)\b/g,
  ) ?? [];
  return connectors.length > 0 && verbs.length > 1;
}

function graphHealth(graph, evidenceById, recordSourceIds, expectedPlatformSlug) {
  if (!graph) {
    return {
      selected_route_resolved: false,
      findings: [{ code: "missing_journey_graph", message: "No evidence-backed journey graph is committed." }],
      claims_with_evidence: 0,
      claims_without_evidence: [],
      field_inventory_count: 0,
    };
  }
  const findings = [];
  const byId = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const routeIds = graph.selectedRoute?.nodeIds ?? [];
  const route = routeIds.map((id) => byId.get(id)).filter(Boolean);
  if (!graph.selectedRoute?.id || graph.selectedRoute?.unresolvedReason) {
    findings.push({ code: "route_unresolved", message: graph.selectedRoute?.unresolvedReason ?? "No selected route." });
  }
  if (graph.startingState?.boundary !== "account_creation") {
    findings.push({ code: "invalid_starting_state", message: "Route does not begin at account creation." });
  }
  if (graph.platformSlug !== expectedPlatformSlug) {
    findings.push({ code: "platform_slug_mismatch" });
  }
  if (route.length !== routeIds.length) {
    findings.push({ code: "unknown_node", message: "Selected route references an unknown node." });
  }

  const seenIds = new Set();
  const seenActions = new Map();
  const available = new Set(graph.startingState?.availableInputs ?? []);
  const branches = new Set();
  let claimsWithEvidence = 0;
  const claimsWithoutEvidence = [];
  let fieldInventoryCount = 0;

  function checkEvidence(owner, evidence) {
    if (!Array.isArray(evidence) || evidence.length === 0) {
      claimsWithoutEvidence.push(owner);
      return;
    }
    const valid = evidence.every((item) => {
      const sourceExists = recordSourceIds.has(item.sourceId);
      const metadata = evidenceById.get(item.sourceId);
      return Boolean(
        sourceExists &&
        item.locator?.trim() &&
        metadata?.content_present &&
        metadata?.content_hash &&
        metadata?.locator_coverage?.includes(item.locator) &&
        metadata?.http_status >= 200 &&
        metadata?.http_status < 300,
      );
    });
    if (valid) claimsWithEvidence += 1;
    else claimsWithoutEvidence.push(owner);
  }

  for (const prerequisite of graph.prerequisites ?? []) {
    checkEvidence(`prerequisite:${prerequisite.id}`, prerequisite.evidence);
    for (const output of prerequisite.produces ?? []) available.add(output);
  }

  for (const node of route) {
    if (seenIds.has(node.id)) findings.push({ code: "duplicate_node", node_id: node.id });
    seenIds.add(node.id);
    const action = normalizedAction(node.action);
    if (seenActions.has(action)) {
      findings.push({ code: "duplicate_action", node_id: node.id, duplicates: seenActions.get(action) });
    }
    seenActions.set(action, node.id);
    if (node.kind === "developer_action" && looksCompound(node.action)) {
      findings.push({ code: "compound_action", node_id: node.id });
    }
    if (typeof node.requiresFieldInventory !== "boolean") {
      findings.push({ code: "field_inventory_status_missing", node_id: node.id });
    } else if (node.requiresFieldInventory && (node.requiredFields ?? []).length === 0) {
      findings.push({ code: "missing_field_inventory", node_id: node.id });
    } else if (!node.requiresFieldInventory && (node.requiredFields ?? []).length > 0) {
      findings.push({ code: "field_inventory_inconsistent", node_id: node.id });
    }
    if (node.kind === "developer_action" && node.interface === "documentation") {
      findings.push({ code: "documentation_navigation_action", node_id: node.id });
    }
    if (
      ["passive_wait", "platform_outcome"].includes(node.kind) &&
      node.actor === "developer"
    ) {
      findings.push({ code: "event_counted_as_developer_action", node_id: node.id });
    }
    for (const input of node.inputs ?? []) {
      if (!available.has(input)) findings.push({ code: "broken_causal_input", node_id: node.id, input });
    }
    for (const output of node.outputs ?? []) available.add(output);
    if (node.branchId) branches.add(node.branchId);
    checkEvidence(`node:${node.id}`, node.evidence);
    for (const field of node.requiredFields ?? []) {
      fieldInventoryCount += 1;
      checkEvidence(`field:${node.id}:${field.label}`, field.evidence);
    }
  }
  const edges = graph.edges ?? [];
  const seenEdges = new Set();
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      findings.push({ code: "unknown_edge_endpoint", edge: key });
    }
    if (seenEdges.has(key)) findings.push({ code: "duplicate_edge", edge: key });
    seenEdges.add(key);
    checkEvidence(`edge:${edge.from}:${edge.to}`, edge.evidence);
  }
  const edgeKeys = new Set(edges.map((edge) => `${edge.from}->${edge.to}`));
  for (let index = 0; index < route.length - 1; index += 1) {
    const key = `${route[index].id}->${route[index + 1].id}`;
    if (!edgeKeys.has(key)) findings.push({ code: "missing_route_edge", edge: key });
  }
  if (branches.size > 1) findings.push({ code: "branch_concatenation", branches: [...branches] });
  const selectedCandidate = (graph.candidateRoutes ?? [])
    .find((candidate) => candidate.id === graph.selectedRoute?.id);
  if (!selectedCandidate || selectedCandidate.status !== "selected") {
    findings.push({ code: "route_not_declared" });
  } else if (
    selectedCandidate.nodeIds.length !== routeIds.length ||
    selectedCandidate.nodeIds.some((id, index) => routeIds[index] !== id)
  ) {
    findings.push({ code: "invalid_candidate_route" });
  }
  if ((graph.candidateRoutes ?? []).filter((candidate) => candidate.status === "selected").length !== 1) {
    findings.push({ code: "invalid_candidate_route" });
  }
  for (const candidate of graph.candidateRoutes ?? []) {
    if (
      !candidate.selectionBasis?.trim() ||
      !candidate.condition?.trim() ||
      !candidate.routeSummary?.trim() ||
      !candidate.effectOnFirstSuccess?.trim() ||
      (candidate.status === "selected" && candidate.reasonNotSelected !== null) ||
      (candidate.status === "considered" && !candidate.reasonNotSelected?.trim()) ||
      (candidate.status === "selected" && candidate.branchAtNodeId !== null) ||
      (candidate.status === "considered" && !routeIds.includes(candidate.branchAtNodeId))
    ) {
      findings.push({ code: "invalid_candidate_route", route_id: candidate.id });
    }
    checkEvidence(`candidate-route:${candidate.id}`, candidate.evidence);
  }
  for (const gate of graph.externalGates ?? []) {
    if (!routeIds.includes(gate.atNodeId)) {
      findings.push({ code: "unknown_gate_target", gate_id: gate.id, node_id: gate.atNodeId });
    }
    checkEvidence(`external-gate:${gate.id}`, gate.evidence);
  }
  for (const uncertainty of graph.uncertainties ?? []) {
    if (uncertainty.blocksPublication) {
      findings.push({
        code: "unresolved_uncertainty",
        target_type: uncertainty.targetType,
        target_id: uncertainty.targetId,
      });
    }
  }
  const terminal = route.at(-1);
  if (terminal?.kind !== "terminal_outcome") findings.push({ code: "invalid_terminal" });
  const boundary = graph.firstSuccessBoundary;
  if (
    !boundary ||
    boundary.nodeId !== terminal?.id ||
    (boundary.outcomeClass === "resource_creation" && boundary.officialRouteContinues)
  ) {
    findings.push({ code: "invalid_first_success_boundary" });
  } else {
    checkEvidence("first-success-boundary", boundary.evidence);
  }
  if (claimsWithoutEvidence.length > 0) {
    findings.push({ code: "claim_grounding_failed", count: claimsWithoutEvidence.length });
  }
  return {
    selected_route_resolved: Boolean(graph.selectedRoute?.id && !graph.selectedRoute?.unresolvedReason),
    findings,
    claims_with_evidence: claimsWithEvidence,
    claims_without_evidence: claimsWithoutEvidence,
    field_inventory_count: fieldInventoryCount,
  };
}

const roster = readJson(path.join(root, "roster.json"));
const identities = readJson(path.join(root, "trust", "platform-identities.json")).identities;
const records = roster.map((entry) => readJson(path.join(root, "records", `${entry.slug}.json`)));
const recordsBySlug = new Map(records.map((record) => [record.platform.slug, record]));
const healthRecords = [];
const generatedAt = new Date();

for (const record of records) {
  const slug = record.platform.slug;
  const candidates = identityCandidates(record, identities);
  const resolvedIdentity = candidates.length === 1 ? candidates[0] : null;
  const authority = resolvedIdentity
    ? (record.sources ?? []).map((source) => sourceAuthority(source, resolvedIdentity))
    : [];
  const acceptedSources = authority.filter((item) => item.accepted);
  const rejectedSources = authority.filter((item) => !item.accepted);
  const evidenceFile = loadOptionalJson(path.join(root, "trust", "source-evidence", `${slug}.json`));
  const evidenceRows = evidenceFile?.sources ?? [];
  const evidenceById = new Map(evidenceRows.map((item) => [item.source_id, item]));
  const missingContent = acceptedSources
    .filter((item) => {
      const metadata = evidenceById.get(item.source_id);
      return !metadata?.content_present || !metadata?.content_hash || metadata.http_status < 200 || metadata.http_status >= 300;
    })
    .map((item) => item.source_id);
  const graph = loadOptionalJson(path.join(root, "trust", "journey-graphs", `${slug}.json`));
  const graphResult = graphHealth(
    graph,
    evidenceById,
    new Set((record.sources ?? []).map((source) => source.id)),
    slug,
  );
  const lastRetrievalDate = evidenceFile?.retrieved_at ?? null;
  const evidenceAgeDays = lastRetrievalDate?.slice(0, 10)
    ? daysOld(lastRetrievalDate.slice(0, 10), generatedAt)
    : null;
  const evidenceIsFresh =
    evidenceAgeDays !== null && evidenceAgeDays <= COMPARISON_FRESHNESS_DAYS;
  const identityStatus = candidates.length === 1
    ? "resolved"
    : candidates.length > 1
      ? "identity_ambiguous"
      : "identity_unresolved";
  const eligible =
    identityStatus === "resolved" &&
    rejectedSources.length === 0 &&
    acceptedSources.length > 0 &&
    missingContent.length === 0 &&
    graphResult.findings.length === 0 &&
    evidenceIsFresh;
  const reasons = [
    ...(identityStatus === "resolved" ? [] : [identityStatus]),
    ...(rejectedSources.length ? ["rejected_authoritative_source"] : []),
    ...(missingContent.length ? ["source_content_unavailable"] : []),
    ...graphResult.findings.map((item) => item.code),
    ...(evidenceAgeDays === null ? ["evidence_retrieval_date_missing"] : []),
    ...(evidenceAgeDays !== null && !evidenceIsFresh
      ? ["evidence_freshness_exceeded_90_days"]
      : []),
  ];
  healthRecords.push({
    slug,
    resolved_platform_identity: {
      status: identityStatus,
      canonical_name: resolvedIdentity?.canonicalName ?? null,
      organization: resolvedIdentity?.organization ?? null,
      official_root_domain: resolvedIdentity?.officialRootDomain ?? null,
      candidate_slugs: candidates.map((item) => item.slug),
    },
    source_authority: {
      accepted_sources: acceptedSources,
      rejected_sources: rejectedSources,
    },
    source_content_availability: {
      metadata_records: evidenceRows.length,
      missing_or_unusable_source_ids: missingContent,
    },
    claims: {
      with_evidence: graphResult.claims_with_evidence,
      without_evidence: graphResult.claims_without_evidence,
    },
    journey_integrity: {
      selected_route_resolved: graphResult.selected_route_resolved,
      findings: graphResult.findings,
      required_field_inventory_count: graphResult.field_inventory_count,
    },
    last_retrieval_date: lastRetrievalDate,
    eligibility: {
      reconstruction: eligible,
      audit: eligible,
      public_display: eligible,
      reasons,
    },
  });
}

const allowedDispositions = new Set([
  "published",
  "excluded",
  "stale",
  "identity_needs_approval",
  "evidence_needs_review",
  "route_needs_review",
]);
for (const healthRecord of healthRecords) {
  const record = recordsBySlug.get(healthRecord.slug);
  const sourcesById = new Map((record?.sources ?? []).map((source) => [source.id, source]));
  const disposition = dispositionFor(healthRecord, generatedAt);
  if (!allowedDispositions.has(disposition.status)) {
    throw new Error(`${healthRecord.slug}: unknown operational disposition ${disposition.status}`);
  }
  healthRecord.operational_disposition = {
    ...disposition,
    failed_evidence: {
      rejected_sources: healthRecord.source_authority.rejected_sources.map((source) => ({
        source_id: source.source_id,
        url: source.url,
        reason: source.reason,
      })),
      missing_or_unusable_sources:
        healthRecord.source_content_availability.missing_or_unusable_source_ids.map((sourceId) => ({
          source_id: sourceId,
          title: sourcesById.get(sourceId)?.title ?? null,
          url: sourcesById.get(sourceId)?.url ?? null,
        })),
      claims_without_evidence: healthRecord.claims.without_evidence,
      route_findings: healthRecord.journey_integrity.findings,
    },
    generated_files_on_approval: generatedFilesFor(healthRecord.slug),
  };
}

const launchPlan = readJson(launchCohortsPath);
const cohortParticipants = launchPlan.cohorts.flatMap((cohort) => cohort.participant_slugs);
if (launchPlan.cohorts.length < 5) {
  throw new Error("Launch cohort plan must contain at least five candidate cohorts.");
}
if (new Set(cohortParticipants).size < 20 || new Set(cohortParticipants).size !== cohortParticipants.length) {
  throw new Error("Launch cohort plan must contain at least 20 distinct platforms with no repeated platform.");
}

const healthBySlug = new Map(healthRecords.map((record) => [record.slug, record]));
const candidateCohorts = launchPlan.cohorts.map((cohort) => {
  if (cohort.participant_slugs.length < 4) {
    throw new Error(`${cohort.id}: candidate cohort requires at least four platforms.`);
  }
  const participants = cohort.participant_slugs.map((slug) => {
    const healthRecord = healthBySlug.get(slug);
    const record = recordsBySlug.get(slug);
    if (!healthRecord || !record) throw new Error(`${cohort.id}: unknown platform ${slug}`);
    return { slug, healthRecord, record };
  });
  const organizations = new Set(
    participants.map(({ record }) => normalizeIdentityKey(record.platform.organization)),
  );
  if (organizations.size !== participants.length) {
    throw new Error(`${cohort.id}: organizations must be distinct within the candidate cohort.`);
  }
  const qualifiedParticipants = participants.filter(({ healthRecord, record }) => {
    if (healthRecord.operational_disposition.status !== "published") return false;
    const graph = loadOptionalJson(path.join(root, "trust", "journey-graphs", `${healthRecord.slug}.json`));
    const basis = graph?.comparisonBasis;
    return Boolean(
      basis &&
      basis.developerJobKey === cohort.developer_job_key &&
      basis.startingBoundaryKey === cohort.starting_boundary_key &&
      basis.firstSuccessOutcomeClass === cohort.first_success_outcome_class &&
      basis.firstSuccessBoundaryKey === cohort.first_success_boundary_key &&
      basis.routeGranularityVersion === cohort.route_granularity_version &&
      basis.categoryKey === cohort.category_key &&
      basis.organizationKey === normalizeIdentityKey(record.platform.organization),
    );
  });
  return {
    id: cohort.id,
    status:
      qualifiedParticipants.length === participants.length
        ? "qualified"
        : "candidate_needs_review",
    developer_job_key: cohort.developer_job_key,
    starting_boundary_key: cohort.starting_boundary_key,
    first_success_outcome_class: cohort.first_success_outcome_class,
    first_success_boundary_key: cohort.first_success_boundary_key,
    route_granularity_version: cohort.route_granularity_version,
    category_key: cohort.category_key,
    review_hypothesis: cohort.review_hypothesis,
    publication_eligible_count: participants.filter(
      ({ healthRecord }) => healthRecord.operational_disposition.status === "published",
    ).length,
    comparison_qualified_count: qualifiedParticipants.length,
    required_platform_count: participants.length,
    participants: participants.map(({ slug, healthRecord, record }) => ({
      slug,
      name: record.platform.name,
      organization: record.platform.organization,
      disposition: healthRecord.operational_disposition.status,
      blocking_reasons: healthRecord.operational_disposition.machine_readable_reasons,
      starting_url: record.entry_point?.starting_url ?? null,
      proposed_first_success: record.documented_first_success?.normalized_outcome ?? null,
      unresolved_questions: (record.uncertainties ?? []).map((item) => item.question),
      source_candidates: (record.sources ?? []).map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        accessed_at: source.accessed_at ?? null,
        sections_used: source.sections_used ?? [],
      })),
      generated_files_on_approval:
        healthRecord.operational_disposition.generated_files_on_approval,
    })),
    required_review_sequence: [
      "Approve one unambiguous platform identity per participant.",
      "Retrieve current first-party pages and record request, redirects, content, hashes, titles, links, authority, and locators.",
      "Reconstruct and validate one atomic selected route per participant.",
      "Independently review every route and its first-success boundary.",
      "Certify cohort equivalence and comparison basis only after all four routes pass.",
    ],
  };
});

const dispositionCounts = Object.fromEntries(
  [...allowedDispositions].map((status) => [
    status,
    healthRecords.filter((record) => record.operational_disposition.status === status).length,
  ]),
);
if (Object.values(dispositionCounts).reduce((sum, count) => sum + count, 0) !== healthRecords.length) {
  throw new Error("Every corpus record must receive exactly one operational disposition.");
}
const rankedCohorts = [...candidateCohorts].sort((left, right) =>
  right.publication_eligible_count - left.publication_eligible_count ||
  left.id.localeCompare(right.id),
);
const recommendedCohort = rankedCohorts[0] ?? null;
const candidateSlugSet = new Set(cohortParticipants);
const dispositionRank = {
  route_needs_review: 0,
  evidence_needs_review: 1,
  identity_needs_approval: 2,
  stale: 3,
  excluded: 4,
  published: 5,
};
const closestRecords = healthRecords
  .filter((record) => record.operational_disposition.status !== "published")
  .sort((left, right) =>
    Number(candidateSlugSet.has(right.slug)) - Number(candidateSlugSet.has(left.slug)) ||
    dispositionRank[left.operational_disposition.status] -
      dispositionRank[right.operational_disposition.status] ||
    left.slug.localeCompare(right.slug),
  )
  .slice(0, 20)
  .map((record) => ({
    slug: record.slug,
    disposition: record.operational_disposition.status,
    blocking_reasons: record.operational_disposition.machine_readable_reasons,
    launch_cohorts: candidateCohorts
      .filter((cohort) => cohort.participants.some((participant) => participant.slug === record.slug))
      .map((cohort) => cohort.id),
  }));

const health = {
  schema_version: "1.0",
  generated_at: generatedAt.toISOString(),
  contract:
    "A record is public only when identity, source authority, source content, claim coverage, and selected-route integrity all pass.",
  summary: {
    records: healthRecords.length,
    identity_resolved: healthRecords.filter((item) => item.resolved_platform_identity.status === "resolved").length,
    records_with_rejected_sources: healthRecords.filter((item) => item.source_authority.rejected_sources.length > 0).length,
    records_with_content_metadata: healthRecords.filter((item) => item.source_content_availability.metadata_records > 0).length,
    records_with_selected_graph: healthRecords.filter((item) => item.journey_integrity.selected_route_resolved).length,
    eligible_for_public_display: healthRecords.filter((item) => item.eligibility.public_display).length,
    dispositions: dispositionCounts,
    candidate_launch_platforms: new Set(cohortParticipants).size,
    candidate_comparison_cohorts: candidateCohorts.length,
    qualified_comparison_cohorts: candidateCohorts.filter((cohort) => cohort.status === "qualified").length,
    routes_with_three_qualified_peers: candidateCohorts
      .filter((cohort) => cohort.status === "qualified")
      .reduce((sum, cohort) => sum + cohort.required_platform_count, 0),
  },
  review_operations: {
    source: "trust/launch-cohort-candidates.json",
    status: launchPlan.status,
    closest_cohort: recommendedCohort?.id ?? null,
    closest_records: closestRecords,
    cohort_completion_candidates: candidateCohorts.map((cohort) => ({
      cohort_id: cohort.id,
      remaining_platforms: cohort.participants
        .filter((participant) => participant.disposition !== "published")
        .map((participant) => participant.slug),
      remaining_count: cohort.participants.filter(
        (participant) => participant.disposition !== "published",
      ).length,
    })),
    recommended_next_review_action: recommendedCohort
      ? `Review identity candidates for the unpublished ${recommendedCohort.id} participants as one cohort, then retrieve and reconstruct those routes together.`
      : null,
    candidate_cohorts: candidateCohorts,
  },
  records: healthRecords,
};

const quality = readJson(path.join(root, "ds-quality.json"));
const exactDuplicateRecords = [];
for (const record of records) {
  const seen = new Map();
  const duplicates = [];
  for (const step of record.primary_path ?? []) {
    const action = normalizedAction(step.action);
    if (seen.has(action)) {
      duplicates.push({ step_number: step.step_number, duplicates_step: seen.get(action) });
    } else {
      seen.set(action, step.step_number);
    }
  }
  if (duplicates.length) exactDuplicateRecords.push({ slug: record.platform.slug, duplicates });
}
const qualityBySlug = new Map((quality.records ?? []).map((item) => [item.slug, item]));
const migration = {
  schema_version: "1.0",
  generated_at: health.generated_at,
  scope:
    "Analysis only. The representative Render route is repaired. All other records remain quarantined until identity, source, and route review passes.",
  summary: {
    records: records.length,
    records_with_compound_steps: quality.summary?.with_non_atomic_steps ?? null,
    compound_steps: (quality.records ?? []).reduce((sum, item) => sum + (item.non_atomic_step_count ?? 0), 0),
    records_with_exact_duplicate_actions: exactDuplicateRecords.length,
    exact_duplicate_actions: exactDuplicateRecords.reduce((sum, item) => sum + item.duplicates.length, 0),
    records_missing_field_inventories: records.length - health.summary.records_with_selected_graph,
    unresolved_routes: healthRecords.filter((item) => !item.journey_integrity.selected_route_resolved).length,
    broken_causal_continuity: healthRecords.filter((item) =>
      item.journey_integrity.findings.some((finding) => finding.code === "broken_causal_input"),
    ).length,
  },
  launch_review: {
    candidate_platforms: new Set(cohortParticipants).size,
    candidate_cohorts: candidateCohorts.length,
    qualified_cohorts: candidateCohorts.filter((cohort) => cohort.status === "qualified").length,
    public_route_shortfall: Math.max(0, 20 - dispositionCounts.published),
    qualified_cohort_shortfall: Math.max(
      0,
      5 - candidateCohorts.filter((cohort) => cohort.status === "qualified").length,
    ),
    routes_with_three_qualified_peers: health.summary.routes_with_three_qualified_peers,
    recommended_next_review_action: health.review_operations.recommended_next_review_action,
  },
  affected_records: (quality.records ?? [])
    .filter((item) => item.non_atomic_step_count > 0)
    .map((item) => ({
      slug: item.slug,
      compound_step_numbers: (item.detector_matches ?? [])
        .filter((match) => match.detector === "non-atomic-step")
        .map((match) => match.step_number),
      exact_duplicate_steps: exactDuplicateRecords.find((entry) => entry.slug === item.slug)?.duplicates ?? [],
      disposition: item.slug === "render" ? "representative_repair" : "human_route_judgment",
      comparability_status: qualityBySlug.get(item.slug)?.comparability_status ?? null,
    })),
};

function comparableJson(value) {
  const copy = structuredClone(value);
  delete copy.generated_at;
  return `${JSON.stringify(copy, null, 2)}\n`;
}

if (process.argv.includes("--check")) {
  const currentHealth = readJson(outputPath);
  const currentMigration = readJson(migrationPath);
  if (comparableJson(currentHealth) !== comparableJson(health) || comparableJson(currentMigration) !== comparableJson(migration)) {
    console.error("Corpus health artifacts are stale. Run npm run trust:health.");
    process.exit(1);
  }
  console.log(
    `Corpus health current: ${health.summary.eligible_for_public_display}/${health.summary.records} records eligible for public display.`,
  );
} else {
  writeFileSync(outputPath, `${JSON.stringify(health, null, 2)}\n`);
  writeFileSync(migrationPath, `${JSON.stringify(migration, null, 2)}\n`);
  console.log(
    `Corpus health: ${health.summary.eligible_for_public_display}/${health.summary.records} records eligible for public display.`,
  );
}
