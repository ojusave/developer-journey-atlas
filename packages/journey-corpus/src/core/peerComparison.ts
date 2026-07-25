import type { JourneyComparisonBasis, JourneyGraph } from "./journeyGraph.js";
import { validateJourneyGraph } from "./journeyGraph.js";
import type { DataStore, PlatformRecord } from "./ports.js";

export const MIN_QUALIFIED_PEERS = 3;
export const COMPARISON_FRESHNESS_DAYS = 90;

export const COMPARISON_CRITERIA = [
  "The same developer job and account-creation starting boundary",
  "The same first-success outcome and boundary",
  "The same route granularity and platform category",
  "A distinct organization and documentation set",
  `Reviewed evidence no more than ${COMPARISON_FRESHNESS_DAYS} days old`,
] as const;

export type ComparisonDimensionKey =
  | "requiredActions"
  | "requiredFields"
  | "externalGates"
  | "unavoidableWaits";

export interface RouteMeasurements {
  requiredActions: number;
  requiredFields: number;
  externalGates: number;
  unavoidableWaits: number;
}

export interface QualifiedPeer {
  slug: string;
  name: string;
  organization: string;
  measurements: RouteMeasurements;
}

export interface ComparisonDimension {
  key: ComparisonDimensionKey;
  label: string;
  subjectValue: number;
  peerMedian: number;
  peerMinimum: number;
  peerMaximum: number;
  position: "below" | "at" | "above";
}

export interface AvailablePeerComparison {
  slug: string;
  available: true;
  qualifiedPeerCount: number;
  requiredPeerCount: number;
  criteria: readonly string[];
  subject: QualifiedPeer;
  peers: QualifiedPeer[];
  dimensions: ComparisonDimension[];
  note: string;
}

export interface UnavailablePeerComparison {
  slug: string;
  available: false;
  reason:
    | "subject_not_comparison_qualified"
    | "insufficient_qualified_peers";
  qualifiedPeerCount: number;
  requiredPeerCount: number;
  criteria: readonly string[];
  note: string;
}

export type PeerComparison = AvailablePeerComparison | UnavailablePeerComparison;

const DIMENSIONS: ReadonlyArray<{ key: ComparisonDimensionKey; label: string }> = [
  { key: "requiredActions", label: "Required developer actions" },
  { key: "requiredFields", label: "Required fields" },
  { key: "externalGates", label: "Documented external gates" },
  { key: "unavoidableWaits", label: "Unavoidable waits" },
];

const COMPATIBILITY_KEYS: ReadonlyArray<keyof JourneyComparisonBasis> = [
  "developerJobKey",
  "startingBoundaryKey",
  "firstSuccessOutcomeClass",
  "firstSuccessBoundaryKey",
  "routeGranularityVersion",
  "categoryKey",
];

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validFreshnessDate(value: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = now.getTime() - timestamp;
  return ageMs >= 0 && ageMs <= COMPARISON_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}

function validBasis(
  graph: JourneyGraph,
  record: PlatformRecord,
  now: Date,
): graph is JourneyGraph & { comparisonBasis: JourneyComparisonBasis } {
  const basis = graph.comparisonBasis;
  if (!basis) return false;
  if (
    ![
      basis.developerJobKey,
      basis.startingBoundaryKey,
      basis.firstSuccessBoundaryKey,
      basis.routeGranularityVersion,
      basis.categoryKey,
      basis.organizationKey,
      basis.documentationSetKey,
    ].every(isNonEmpty)
  ) {
    return false;
  }
  return (
    basis.firstSuccessOutcomeClass === graph.firstSuccessBoundary.outcomeClass &&
    basis.organizationKey === record.platform.organization.trim().toLowerCase() &&
    validFreshnessDate(basis.evidenceFreshnessDate, now)
  );
}

function compatible(left: JourneyComparisonBasis, right: JourneyComparisonBasis): boolean {
  return COMPATIBILITY_KEYS.every((key) => left[key] === right[key]);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function peerFrom(
  graph: JourneyGraph,
  record: PlatformRecord,
): QualifiedPeer {
  return {
    slug: graph.platformSlug,
    name: record.platform.name,
    organization: record.platform.organization,
    measurements: measureSelectedRoute(graph),
  };
}

function qualifiedSubject(
  store: DataStore,
  slug: string,
  now: Date,
): { graph: JourneyGraph & { comparisonBasis: JourneyComparisonBasis }; record: PlatformRecord } | null {
  if (!store.isPublicEligible(slug)) return null;
  const graph = store.getJourneyGraph?.(slug);
  const record = store.getRecord(slug);
  if (!graph || !record) return null;
  if (validateJourneyGraph(graph, slug).length > 0) return null;
  if (!validBasis(graph, record, now)) return null;
  return { graph, record };
}

export function measureSelectedRoute(graph: JourneyGraph): RouteMeasurements {
  const selectedIds = new Set(graph.selectedRoute.nodeIds);
  const selectedNodes = graph.nodes.filter((node) => selectedIds.has(node.id));
  return {
    requiredActions: selectedNodes.filter(
      (node) => node.kind === "developer_action" && node.required,
    ).length,
    requiredFields: selectedNodes
      .flatMap((node) => node.requiredFields)
      .filter((field) => field.required).length,
    externalGates: graph.externalGates.filter((gate) => selectedIds.has(gate.atNodeId)).length,
    unavoidableWaits: selectedNodes.filter(
      (node) => node.kind === "passive_wait" && node.required,
    ).length,
  };
}

/**
 * Builds a public comparison only from public, graph-valid, explicitly
 * compatible, fresh records. Any missing proof returns an unavailable result.
 */
export function buildPeerComparison(
  store: DataStore,
  slug: string,
  now = new Date(),
): PeerComparison {
  const subject = qualifiedSubject(store, slug, now);
  if (!subject) {
    return {
      slug,
      available: false,
      reason: "subject_not_comparison_qualified",
      qualifiedPeerCount: 0,
      requiredPeerCount: MIN_QUALIFIED_PEERS,
      criteria: COMPARISON_CRITERIA,
      note: "Comparison requires a reviewed subject route with explicit, current cohort evidence.",
    };
  }

  const peers: QualifiedPeer[] = [];
  const seenOrganizations = new Set([subject.graph.comparisonBasis.organizationKey]);
  const seenDocumentationSets = new Set([subject.graph.comparisonBasis.documentationSetKey]);
  const rows = [...store.listRows()].sort((left, right) => left.slug.localeCompare(right.slug));

  for (const row of rows) {
    if (row.slug === slug) continue;
    const candidate = qualifiedSubject(store, row.slug, now);
    if (!candidate) continue;
    const basis = candidate.graph.comparisonBasis;
    if (!compatible(subject.graph.comparisonBasis, basis)) continue;
    if (
      seenOrganizations.has(basis.organizationKey) ||
      seenDocumentationSets.has(basis.documentationSetKey)
    ) {
      continue;
    }
    seenOrganizations.add(basis.organizationKey);
    seenDocumentationSets.add(basis.documentationSetKey);
    peers.push(peerFrom(candidate.graph, candidate.record));
  }

  if (peers.length < MIN_QUALIFIED_PEERS) {
    return {
      slug,
      available: false,
      reason: "insufficient_qualified_peers",
      qualifiedPeerCount: peers.length,
      requiredPeerCount: MIN_QUALIFIED_PEERS,
      criteria: COMPARISON_CRITERIA,
      note: "No comparison is shown until at least three distinct, compatible peer routes pass every qualification rule.",
    };
  }

  const subjectPeer = peerFrom(subject.graph, subject.record);
  const dimensions = DIMENSIONS.map(({ key, label }) => {
    const values = peers.map((peer) => peer.measurements[key]);
    const peerMedian = median(values);
    const subjectValue = subjectPeer.measurements[key];
    return {
      key,
      label,
      subjectValue,
      peerMedian,
      peerMinimum: Math.min(...values),
      peerMaximum: Math.max(...values),
      position: subjectValue < peerMedian ? "below" : subjectValue > peerMedian ? "above" : "at",
    } satisfies ComparisonDimension;
  });

  return {
    slug,
    available: true,
    qualifiedPeerCount: peers.length,
    requiredPeerCount: MIN_QUALIFIED_PEERS,
    criteria: COMPARISON_CRITERIA,
    subject: subjectPeer,
    peers,
    dimensions,
    note: "Values are direct counts from reviewed selected routes. They are not scores, ranks, or causal claims.",
  };
}
