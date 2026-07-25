import type { JourneyGraph, EvidenceLocator } from "./journeyGraph.js";
import type { PlatformRecord } from "./ports.js";

export interface JourneyEvidenceSource {
  id: string;
  title: string;
  officialDomain: string;
  url: string;
  retrievedAt: string | null;
  claimOrRouteElements: string[];
  locators: string[];
}

export interface JourneyEvidence {
  slug: string;
  evidenceClass: "documented_fact";
  derivationNote: string;
  sources: JourneyEvidenceSource[];
}

interface EvidenceAccumulator {
  elements: Set<string>;
  locators: Set<string>;
}

function domainFor(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function addEvidence(
  bySource: Map<string, EvidenceAccumulator>,
  evidence: EvidenceLocator[],
  element: string,
): void {
  for (const item of evidence) {
    const accumulator = bySource.get(item.sourceId) ?? {
      elements: new Set<string>(),
      locators: new Set<string>(),
    };
    accumulator.elements.add(element);
    accumulator.locators.add(item.locator);
    bySource.set(item.sourceId, accumulator);
  }
}

/** Build the public evidence disclosure from the same selected graph used by the route. */
export function buildJourneyEvidence(
  record: PlatformRecord,
  graph: JourneyGraph,
): JourneyEvidence {
  const bySource = new Map<string, EvidenceAccumulator>();
  const selectedIds = new Set(graph.selectedRoute.nodeIds);
  const selectedNodes = graph.nodes.filter((node) => selectedIds.has(node.id));

  for (const prerequisite of graph.prerequisites) {
    addEvidence(bySource, prerequisite.evidence, `Prerequisite: ${prerequisite.requirement}`);
  }
  for (const node of selectedNodes) {
    addEvidence(bySource, node.evidence, `Route event: ${node.action}`);
    for (const field of node.requiredFields) {
      addEvidence(bySource, field.evidence, `Field: ${field.label}`);
    }
  }
  for (const gate of graph.externalGates.filter((gate) => selectedIds.has(gate.atNodeId))) {
    addEvidence(bySource, gate.evidence, `Documented gate: ${gate.description}`);
  }
  for (const candidate of graph.candidateRoutes) {
    addEvidence(
      bySource,
      candidate.evidence,
      `${candidate.status === "selected" ? "Selected" : "Alternative"} route: ${candidate.routeSummary}`,
    );
  }
  const terminal = selectedNodes.at(-1);
  addEvidence(
    bySource,
    graph.firstSuccessBoundary.evidence,
    `First-success boundary: ${terminal?.action ?? record.documented_first_success?.normalized_outcome ?? ""}`,
  );

  const sources = (record.sources ?? [])
    .filter((source) => bySource.has(source.id) && /^https:\/\//.test(source.url))
    .map((source) => {
      const evidence = bySource.get(source.id);
      return {
        id: source.id,
        title: source.title,
        officialDomain: domainFor(source.url),
        url: source.url,
        retrievedAt: source.accessed_at ?? record.researched_at ?? null,
        claimOrRouteElements: [...(evidence?.elements ?? [])].sort(),
        locators: [...(evidence?.locators ?? [])].sort(),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    slug: record.platform.slug,
    evidenceClass: "documented_fact",
    derivationNote:
      "Official pages document the cited route elements. Atlas derives the selected sequence and direct counts from the reviewed graph.",
    sources,
  };
}
