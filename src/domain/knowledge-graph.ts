import { catalog, getCatalogNode, getFamiliesForStage, getReasonsForParent, type CatalogNode } from "./catalog";

export const lastStageToCatalogStages = {
  "No attempt observed": ["S01"],
  "They found or evaluated the platform": ["S02"],
  "They tried to get access or approval": ["S03"],
  "They started setup or implementation": ["S04", "S05"],
  "They produced a first result": ["S06"],
  "They verified a meaningful result": ["S07"],
  "We cannot locate the stop yet": ["S00", "S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08"],
} as const satisfies Record<string, readonly string[]>;

export const platformSurfaceToArchetypes = {
  "API or SDK": ["P04", "P06", "P16"],
  "Cloud, deployment, infrastructure, or data": ["P01", "P02", "P03", "P09", "P10"],
  "Framework, library, runtime, or developer tool": ["P06", "P08"],
  "AI or agent platform": ["P05"],
  "Integration, plugin, extension, or marketplace": ["P11", "P16"],
  "Open-source project": ["P07"],
  "Internal developer platform": ["P14"],
  "Mobile, browser, hardware, edge, or IoT": ["P12"],
  "Web3, blockchain, wallet, or decentralized protocol": ["P13"],
  "Workflow or visual builder": ["P15"],
  "Something else": [],
} as const satisfies Record<string, readonly string[]>;

const outgoing = new Map<string, typeof catalog.edges>();
const incoming = new Map<string, typeof catalog.edges>();

for (const edge of catalog.edges) {
  outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

export function getCatalogChildren(id: string, edgeType?: (typeof catalog.edges)[number]["type"]): CatalogNode[] {
  return (incoming.get(id) ?? [])
    .filter((edge) => !edgeType || edge.type === edgeType)
    .map((edge) => getCatalogNode(edge.from))
    .filter((node): node is CatalogNode => Boolean(node));
}

export function getCatalogTargets(id: string, edgeType?: (typeof catalog.edges)[number]["type"]): CatalogNode[] {
  return (outgoing.get(id) ?? [])
    .filter((edge) => !edgeType || edge.type === edgeType)
    .map((edge) => getCatalogNode(edge.to))
    .filter((node): node is CatalogNode => Boolean(node));
}

export function getParentNode(id: string): CatalogNode | null {
  const memberEdge = (outgoing.get(id) ?? []).find((edge) => edge.type === "member_of");
  return memberEdge ? getCatalogNode(memberEdge.to) : null;
}

export function getStageIdsForLastStage(lastStage: string): string[] {
  return [...(lastStageToCatalogStages[lastStage as keyof typeof lastStageToCatalogStages] ?? lastStageToCatalogStages["We cannot locate the stop yet"])];
}

export function resolvePlatformArchetypeIds(surfaces: readonly string[]): string[] {
  return unique(surfaces.flatMap((surface) => platformSurfaceToArchetypes[surface as keyof typeof platformSurfaceToArchetypes] ?? []));
}

export interface PlatformResearchGroup {
  archetypeId: string;
  label: string;
  reasons: Array<{ id: string; label: string }>;
}

export function getPlatformResearchGroups(surfaces: readonly string[]): PlatformResearchGroup[] {
  return resolvePlatformArchetypeIds(surfaces).map((archetypeId) => {
    const archetype = getCatalogNode(archetypeId)!;
    return {
      archetypeId,
      label: archetype.label,
      reasons: getReasonsForParent(archetypeId).map((reason) => ({ id: reason.id, label: reason.label })),
    };
  });
}

export interface CandidateUniverse {
  stageIds: string[];
  platformArchetypeIds: string[];
  universalFamilyIds: string[];
  universalReasonIds: string[];
  platformReasonIds: string[];
  reasonIds: string[];
  hasUnmappedPlatformSurface: boolean;
}

export function buildCandidateUniverse(input: {
  lastStage?: string;
  platformSurfaceLabels?: readonly string[];
  platformArchetypeIds?: readonly string[];
}): CandidateUniverse {
  const stageIds = getStageIdsForLastStage(input.lastStage ?? "We cannot locate the stop yet");
  const surfaceIds = resolvePlatformArchetypeIds(input.platformSurfaceLabels ?? []);
  const platformArchetypeIds = unique([...(input.platformArchetypeIds ?? []), ...surfaceIds])
    .filter((id) => getCatalogNode(id)?.kind === "platform_archetype");
  const universalFamilyIds = unique(stageIds.flatMap((stageId) => getFamiliesForStage(stageId).map((family) => family.id)));
  const universalReasonIds = unique(universalFamilyIds.flatMap((familyId) => getReasonsForParent(familyId).map((reason) => reason.id)));
  const platformReasonIds = unique(platformArchetypeIds.flatMap((platformId) => getReasonsForParent(platformId).map((reason) => reason.id)));
  const platformSurfaceLabels = input.platformSurfaceLabels ?? [];

  return {
    stageIds,
    platformArchetypeIds,
    universalFamilyIds,
    universalReasonIds,
    platformReasonIds,
    reasonIds: unique([...universalReasonIds, ...platformReasonIds]),
    hasUnmappedPlatformSurface: platformSurfaceLabels.some((surface) => !(surface in platformSurfaceToArchetypes) || surface === "Something else"),
  };
}

export interface ReasonContext {
  reason: CatalogNode;
  parent: CatalogNode;
  applicableStageIds: string[];
  applicablePlatformIds: string[];
}

export function getReasonContext(reasonId: string): ReasonContext | null {
  const reason = getCatalogNode(reasonId);
  const parent = getParentNode(reasonId);
  if (!reason || reason.kind !== "reason" || !parent) return null;
  return {
    reason,
    parent,
    applicableStageIds: getCatalogTargets(parent.id, "applies_to_stage").map((node) => node.id),
    applicablePlatformIds: parent.kind === "platform_archetype"
      ? [parent.id]
      : getCatalogTargets(parent.id, "applies_to_platform").map((node) => node.id),
  };
}

export interface KnowledgeGraphAudit {
  reasonCount: number;
  indexedReasonCount: number;
  universalReasonCount: number;
  platformReasonCount: number;
  unreachableReasonIds: string[];
  brokenEdgeNodeIds: string[];
  platformArchetypesWithoutReasons: string[];
  platformArchetypesWithoutSurfaceMapping: string[];
}

export function auditKnowledgeGraphRuntime(): KnowledgeGraphAudit {
  const reasons = catalog.nodes.filter((node) => node.kind === "reason");
  const indexed = reasons.filter((reason) => {
    const parent = getParentNode(reason.id);
    return Boolean(parent && getReasonsForParent(parent.id).some((candidate) => candidate.id === reason.id));
  });
  const universalReasons = indexed.filter((reason) => getParentNode(reason.id)?.kind === "universal_family");
  const platformReasons = indexed.filter((reason) => getParentNode(reason.id)?.kind === "platform_archetype");
  const brokenEdgeNodeIds = unique(catalog.edges.flatMap((edge) => [edge.from, edge.to]).filter((id) => !getCatalogNode(id)));
  const platformArchetypesWithoutReasons = catalog.nodes
    .filter((node) => node.kind === "platform_archetype" && getReasonsForParent(node.id).length === 0)
    .map((node) => node.id);
  const mappedPlatformIds = new Set<string>(Object.values(platformSurfaceToArchetypes).flat());
  const platformArchetypesWithoutSurfaceMapping = catalog.nodes
    .filter((node) => node.kind === "platform_archetype" && !mappedPlatformIds.has(node.id))
    .map((node) => node.id);

  return {
    reasonCount: reasons.length,
    indexedReasonCount: indexed.length,
    universalReasonCount: universalReasons.length,
    platformReasonCount: platformReasons.length,
    unreachableReasonIds: reasons.filter((reason) => !indexed.some((candidate) => candidate.id === reason.id)).map((reason) => reason.id),
    brokenEdgeNodeIds,
    platformArchetypesWithoutReasons,
    platformArchetypesWithoutSurfaceMapping,
  };
}
