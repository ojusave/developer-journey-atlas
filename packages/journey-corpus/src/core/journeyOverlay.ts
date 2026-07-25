import type { PlatformRecord } from "./ports.js";
import { familyIdForGateType } from "../db/gateTypeFamilyMap.js";
import { selectedRouteNodes, type JourneyGraph } from "./journeyGraph.js";

/** One blocker hypothesis attached to a gate or step (never a diagnosed cause). */
export interface BlockerHypothesisRef {
  id: string;
  kind: string;
  label: string;
  diagnosticEligibility: string | null;
  linkSource: "soft-map" | "curated" | "openrouter";
  note: string;
  confidence?: string | null;
  similarity?: number | null;
  rationale?: string | null;
}

export interface JourneyGateView {
  id: string | null;
  atStep: number | null;
  type: string;
  description: string;
  documentedRequirement: boolean | null;
  required?: boolean;
  blockerHypotheses?: BlockerHypothesisRef[];
}

export interface JourneyStepView {
  stepNumber: number;
  kind: "developer_action" | "decision" | "passive_wait" | "platform_outcome" | "terminal_outcome";
  phase: string | null;
  actor: string | null;
  interface: string | null;
  action: string;
  details: string[];
  successSignal: string | null;
  required: boolean;
  sourceIds: string[];
  requiredFields: Array<{ label: string; type: string; required: boolean }>;
  hasFriction: boolean;
  frictionGates: JourneyGateView[];
}

export interface JourneyRouteScope {
  selectedPath: string;
  bestFit: string;
  firstSuccess: string;
  alternatives: Array<{
    id: string;
    condition: string;
    routeSummary: string;
    reasonNotSelected: string;
  }>;
}

export interface JourneyOverlay {
  slug: string;
  name: string;
  category: string;
  organization: string | null;
  /** Official docs entry URL for the documented product surface. */
  startingUrl: string | null;
  note: string;
  routeScope: JourneyRouteScope | null;
  prerequisites: Array<{ id: string | null; requirement: string; required: boolean }>;
  steps: JourneyStepView[];
}

const HYPOTHESIS_NOTE =
  "Documented friction may relate to this blocker family. It is a hypothesis, not a confirmed drop-off cause.";

const MODEL_LINK_NOTE =
  "OpenRouter retrieve-then-confirm linked this catalog reason as a hypothesis only. Not observed drop-off.";

type FamilyLookup = (familyId: string) => { id: string; label: string; kind: string; diagnosticEligibility: string | null } | null;

export interface ModelLinkInput {
  gateKey: string;
  reasonId: string;
  label: string;
  diagnosticEligibility: string | null;
  confidence: string | null;
  similarity: number | null;
  rationale: string | null;
}

/**
 * Build a readable journey from a platform record, attaching soft-mapped blocker families to gates.
 */
export function buildJourneyOverlay(
  record: PlatformRecord,
  options: {
    familyLookup: FamilyLookup;
    gateIds?: Map<string, string>;
    modelLinks?: ModelLinkInput[];
    includeUnvalidatedHypotheses?: boolean;
  },
): JourneyOverlay {
  const modelByGateKey = new Map<string, ModelLinkInput[]>();
  for (const link of options.modelLinks ?? []) {
    const list = modelByGateKey.get(link.gateKey) ?? [];
    list.push(link);
    modelByGateKey.set(link.gateKey, list);
  }

  const gates = (record.friction_gates ?? []).map((gate, index) => {
    const type = gate.type ?? "other";
    const familyId = familyIdForGateType(type);
    const family = familyId ? options.familyLookup(familyId) : null;
    const key = `${gate.at_step ?? "x"}:${type}:${index}`;
    const hypotheses: BlockerHypothesisRef[] = options.includeUnvalidatedHypotheses && family
      ? [{
          id: family.id,
          kind: family.kind,
          label: family.label,
          diagnosticEligibility: family.diagnosticEligibility,
          linkSource: "soft-map",
          note: HYPOTHESIS_NOTE,
        }]
      : [];
    for (const link of options.includeUnvalidatedHypotheses ? (modelByGateKey.get(key) ?? []) : []) {
      hypotheses.push({
        id: link.reasonId,
        kind: "reason",
        label: link.label,
        diagnosticEligibility: link.diagnosticEligibility,
        linkSource: "openrouter",
        note: MODEL_LINK_NOTE,
        confidence: link.confidence,
        similarity: link.similarity,
        rationale: link.rationale,
      });
    }
    return {
      id: options.gateIds?.get(key) ?? null,
      atStep: gate.at_step ?? null,
      type,
      description: gate.description ?? "",
      documentedRequirement: (gate as { documented_requirement?: boolean }).documented_requirement ?? null,
      required: true,
      blockerHypotheses: hypotheses,
    } satisfies JourneyGateView;
  });

  const gatesByStep = new Map<number, JourneyGateView[]>();
  for (const gate of gates) {
    if (gate.atStep == null) continue;
    const list = gatesByStep.get(gate.atStep) ?? [];
    list.push(gate);
    gatesByStep.set(gate.atStep, list);
  }

  const steps: JourneyStepView[] = (record.primary_path ?? []).map((step) => {
    const stepGates = gatesByStep.get(step.step_number) ?? [];
    return {
      stepNumber: step.step_number,
      kind:
        step.actor === "platform" || step.actor === "system"
          ? step.phase === "wait"
            ? "passive_wait"
            : "platform_outcome"
          : "developer_action",
      phase: step.phase ?? null,
      actor: step.actor ?? null,
      interface: step.interface ?? null,
      action: step.action,
      details: Array.isArray(step.details) ? step.details.map(String) : [],
      successSignal: step.success_signal ?? null,
      required: step.required !== false,
      sourceIds: step.source_ids ?? [],
      requiredFields: [],
      hasFriction: stepGates.length > 0,
      frictionGates: stepGates,
    };
  });

  const startingUrl =
    typeof record.entry_point?.starting_url === "string" && /^https:\/\//.test(record.entry_point.starting_url)
      ? record.entry_point.starting_url
      : null;

  return {
    slug: record.platform.slug,
    name: record.platform.name,
    category: record.category,
    organization: record.platform.organization ?? null,
    startingUrl,
    note:
      "Journey steps come from official documentation. Highlighted steps have documented friction gates; linked blockers are hypotheses, not observed drop-off.",
    routeScope: null,
    prerequisites: (record.prerequisites ?? []).map((item) => ({
      id: null,
      requirement: item.requirement,
      required: item.required,
    })),
    steps,
  };
}

/** Build the public route from the selected graph, never from a compact model-authored path. */
export function buildJourneyOverlayFromGraph(
  record: PlatformRecord,
  graph: JourneyGraph,
): JourneyOverlay {
  const nodes = selectedRouteNodes(graph);
  const selectedCandidate = graph.candidateRoutes.find(
    (candidate) => candidate.id === graph.selectedRoute.id && candidate.status === "selected",
  );
  const stepNumberByNodeId = new Map(nodes.map((node, index) => [node.id, index + 1]));
  const gatesByNodeId = new Map<string, JourneyGateView[]>();
  for (const gate of graph.externalGates) {
    const list = gatesByNodeId.get(gate.atNodeId) ?? [];
    list.push({
      id: gate.id,
      atStep: stepNumberByNodeId.get(gate.atNodeId) ?? null,
      type: gate.type,
      description: gate.description,
      documentedRequirement: true,
      required: gate.required,
    });
    gatesByNodeId.set(gate.atNodeId, list);
  }
  const steps: JourneyStepView[] = nodes.map((node, index) => {
    const frictionGates = gatesByNodeId.get(node.id) ?? [];
    return {
      stepNumber: index + 1,
      kind: node.kind,
      phase: node.phase,
      actor: node.actor,
      interface: node.interface,
      action: node.action,
      details: [],
      successSignal: node.successSignal || null,
      required: node.required,
      sourceIds: [...new Set(node.evidence.map((item) => item.sourceId))],
      requiredFields: node.requiredFields.map((field) => ({
        label: field.label,
        type: field.fieldType,
        required: field.required,
      })),
      hasFriction: frictionGates.length > 0,
      frictionGates,
    };
  });
  return {
    slug: record.platform.slug,
    name: record.platform.name,
    category: record.category,
    organization: record.platform.organization ?? null,
    startingUrl:
      typeof record.entry_point?.starting_url === "string" && /^https:\/\//.test(record.entry_point.starting_url)
        ? record.entry_point.starting_url
        : null,
    note:
      "Source-grounded map of one documented route. It separates your actions, choices, waits, and platform status changes. It does not measure difficulty or completion time.",
    routeScope: selectedCandidate
      ? {
          selectedPath: selectedCandidate.routeSummary,
          bestFit: selectedCandidate.condition,
          firstSuccess: nodes.at(-1)?.action ?? "",
          alternatives: graph.candidateRoutes
            .filter((candidate) => candidate.status === "considered")
            .map((candidate) => ({
              id: candidate.id,
              condition: candidate.condition,
              routeSummary: candidate.routeSummary,
              reasonNotSelected: candidate.reasonNotSelected ?? "",
            })),
        }
      : null,
    prerequisites: graph.prerequisites.map((item) => ({
      id: item.id,
      requirement: item.requirement,
      required: item.required,
    })),
    steps,
  };
}
