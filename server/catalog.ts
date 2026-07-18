import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DiagnosticState, ObjectiveId, SessionContext } from "./domain.js";

export type CatalogKind = "journey" | "stage" | "universal_family" | "platform_archetype" | "reason";
export type DiagnosticEligibility = "not_diagnosis_eligible" | "diagnosis_eligible";

export interface CatalogNode {
  id: string;
  kind: CatalogKind;
  label: string;
  description: string | null;
  parentId?: string;
  catalogMaturity: "inventory" | "routing_ready" | "reviewed" | "locally_validated";
  diagnosticEligibility?: DiagnosticEligibility;
}

export interface CatalogEdge {
  from: string;
  to: string;
  type: "member_of" | "applies_to_stage" | "applies_to_platform";
}

interface CatalogFile {
  schemaVersion: number;
  catalogVersion: string;
  nodes: CatalogNode[];
  edges: CatalogEdge[];
}

export interface CatalogPacketNode {
  id: string;
  kind: CatalogKind;
  label: string;
  description: string | null;
  maturity: CatalogNode["catalogMaturity"];
  diagnosticEligibility: DiagnosticEligibility | null;
  parentId: string | null;
}

export interface CatalogPacket {
  catalogVersion: string;
  completeIndex: {
    universalFamilies: Array<{ id: string; label: string }>;
    platformArchetypes: Array<{ id: string; label: string }>;
    journeys: Array<{ id: string; label: string }>;
    specialStates: string[];
  };
  nodes: CatalogPacketNode[];
  allowedCatalogIds: string[];
}

export class DiagnosticCatalog {
  readonly version: string;
  private readonly nodesById: Map<string, CatalogNode>;
  private readonly edges: CatalogEdge[];

  constructor(file: CatalogFile) {
    if (!file.catalogVersion || !Array.isArray(file.nodes) || !Array.isArray(file.edges)) {
      throw new Error("The diagnostic catalog is not valid");
    }
    this.version = file.catalogVersion;
    this.nodesById = new Map(file.nodes.map((node) => [node.id, node]));
    this.edges = file.edges;
  }

  static fromDefaultPath(): DiagnosticCatalog {
    const catalogPath = process.env.CATALOG_PATH ?? resolve(process.cwd(), "src/generated/catalog.json");
    return DiagnosticCatalog.fromPath(catalogPath);
  }

  static fromPath(path: string): DiagnosticCatalog {
    return new DiagnosticCatalog(JSON.parse(readFileSync(path, "utf8")) as CatalogFile);
  }

  get(id: string): CatalogNode | null {
    return this.nodesById.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.nodesById.has(id);
  }

  reasonIdsForParent(parentId: string): string[] {
    return this.edges
      .filter((edge) => edge.type === "member_of" && edge.to === parentId)
      .map((edge) => edge.from)
      .filter((id) => this.get(id)?.kind === "reason")
      .sort();
  }

  validateContext(context: SessionContext): string[] {
    const errors: string[] = [];
    for (const id of context.platformArchetypeIds) {
      if (this.get(id)?.kind !== "platform_archetype") errors.push(`Unknown platform archetype ${id}`);
    }
    if (context.journeyId && this.get(context.journeyId)?.kind !== "journey") {
      errors.push(`Unknown journey ${context.journeyId}`);
    }
    if (context.stageId && this.get(context.stageId)?.kind !== "stage") {
      errors.push(`Unknown stage ${context.stageId}`);
    }
    return errors;
  }

  packetFor(state: DiagnosticState, context: SessionContext, currentObjectiveId?: ObjectiveId): CatalogPacket {
    const selected = new Set<string>();
    for (const candidate of state.candidates.filter((item) => item.evidenceState !== "contradicted")) {
      selected.add(candidate.catalogId);
    }

    if (selected.size === 0 && context.stageId) {
      for (const edge of this.edges) {
        if (edge.type === "applies_to_stage" && edge.to === context.stageId) selected.add(edge.from);
      }
    }

    if (selected.size === 0) {
      for (const node of this.nodesById.values()) {
        if (node.kind === "universal_family") selected.add(node.id);
      }
    }

    for (const platformId of context.platformArchetypeIds) {
      selected.add(platformId);
      if (currentObjectiveId === "D8") {
        for (const edge of this.edges) {
          if (edge.type === "member_of" && edge.to === platformId) selected.add(edge.from);
        }
      }
    }

    const nodes = [...selected]
      .map((id) => this.get(id))
      .filter((node): node is CatalogNode => Boolean(node))
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        label: node.label,
        description: node.description,
        maturity: node.catalogMaturity,
        diagnosticEligibility: node.diagnosticEligibility ?? null,
        parentId: node.parentId ?? null,
      }));

    return {
      catalogVersion: this.version,
      completeIndex: {
        universalFamilies: this.indexForKind("universal_family"),
        platformArchetypes: this.indexForKind("platform_archetype"),
        journeys: this.indexForKind("journey"),
        specialStates: ["catalog_gap", "compound_blockers", "legitimate_gate", "deliberate_non_fit"],
      },
      nodes,
      allowedCatalogIds: nodes.map((node) => node.id),
    };
  }

  private indexForKind(kind: CatalogKind): Array<{ id: string; label: string }> {
    return [...this.nodesById.values()]
      .filter((node) => node.kind === kind)
      .map((node) => ({ id: node.id, label: node.label }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}
