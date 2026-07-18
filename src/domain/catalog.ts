import rawCatalog from "../generated/catalog.json";

export type CatalogMaturity = "inventory" | "routing_ready" | "reviewed" | "locally_validated";
export type CaseEvidenceState = "not_considered" | "live" | "weakened" | "contradicted" | "needs_observation" | "supported";

export interface CatalogNode {
  id: string;
  kind: "journey" | "stage" | "universal_family" | "platform_archetype" | "reason";
  label: string;
  description: string | null;
  parentId?: string;
  scope?: "universal" | "platform_delta";
  catalogMaturity: CatalogMaturity;
  diagnosticEligibility?: "not_diagnosis_eligible" | "diagnosis_eligible";
  sourceLine?: number;
}

export interface CatalogEdge {
  from: string;
  to: string;
  type: "member_of" | "applies_to_stage" | "applies_to_platform";
  provenance: string;
  reviewState: "verified" | "reviewed";
}

export interface CatalogGraph {
  schemaVersion: number;
  catalogVersion: string;
  source: string;
  sourceHash: string;
  generatedAt: string;
  counts: {
    universalFamilies: number;
    platformArchetypes: number;
    universalReasons: number;
    platformReasons: number;
    reasons: number;
    nodes: number;
    edges: number;
  };
  nodes: CatalogNode[];
  edges: CatalogEdge[];
}

export const catalog = rawCatalog as CatalogGraph;
const nodesById = new Map(catalog.nodes.map((node) => [node.id, node]));
const incoming = new Map<string, CatalogEdge[]>();

for (const edge of catalog.edges) {
  incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
}

export function getCatalogNode(id: string): CatalogNode | null {
  return nodesById.get(id) ?? null;
}

export function getReasonsForParent(parentId: string): CatalogNode[] {
  return (incoming.get(parentId) ?? [])
    .filter((edge) => edge.type === "member_of")
    .map((edge) => nodesById.get(edge.from))
    .filter((node): node is CatalogNode => Boolean(node));
}

export function getFamiliesForStage(stageId: string): CatalogNode[] {
  return (incoming.get(stageId) ?? [])
    .filter((edge) => edge.type === "applies_to_stage")
    .map((edge) => nodesById.get(edge.from))
    .filter((node): node is CatalogNode => Boolean(node));
}

export function hasCatalogId(id: string): boolean {
  return nodesById.has(id);
}
