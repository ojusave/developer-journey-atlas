export type JourneyNodeKind =
  | "developer_action"
  | "decision"
  | "passive_wait"
  | "platform_outcome"
  | "terminal_outcome";

export interface EvidenceLocator {
  sourceId: string;
  locator: string;
}

export interface JourneyField {
  label: string;
  fieldType: string;
  required: boolean;
  evidence: EvidenceLocator[];
}

export interface JourneyNode {
  id: string;
  kind: JourneyNodeKind;
  phase: string;
  actor: "developer" | "platform" | "system" | "administrator" | "external-system";
  interface: string;
  action: string;
  required: boolean;
  requiredFields: JourneyField[];
  inputs: string[];
  outputs: string[];
  successSignal: string;
  evidence: EvidenceLocator[];
  branchId?: string | null;
  requiresFieldInventory: boolean;
}

export interface JourneyEdge {
  from: string;
  to: string;
  condition?: string | null;
  evidence: EvidenceLocator[];
}

export interface JourneyPrerequisite {
  id: string;
  type: string;
  requirement: string;
  required: boolean;
  produces: string[];
  evidence: EvidenceLocator[];
}

export interface JourneyExternalGate {
  id: string;
  type: string;
  description: string;
  atNodeId: string;
  required: boolean;
  evidence: EvidenceLocator[];
}

export interface JourneyCandidateRoute {
  id: string;
  status: "selected" | "considered";
  nodeIds: string[];
  selectionBasis: string;
  condition: string;
  routeSummary: string;
  effectOnFirstSuccess: string;
  reasonNotSelected: string | null;
  branchAtNodeId: string | null;
  evidence: EvidenceLocator[];
}

export interface JourneyUncertainty {
  targetType: "prerequisite" | "node" | "field" | "edge" | "route" | "terminal";
  targetId: string;
  description: string;
  blocksPublication: boolean;
}

/**
 * Explicit cohort keys used for peer comparison. These values are authored
 * from reviewed evidence. Comparison code never infers compatibility from
 * names, categories, legacy scores, or fuzzy text similarity.
 */
export interface JourneyComparisonBasis {
  developerJobKey: string;
  startingBoundaryKey: string;
  firstSuccessOutcomeClass: "meaningful_result" | "resource_creation";
  firstSuccessBoundaryKey: string;
  routeGranularityVersion: string;
  categoryKey: string;
  evidenceFreshnessDate: string;
  organizationKey: string;
  documentationSetKey: string;
}

export interface JourneyGraph {
  schemaVersion: "1.0";
  platformSlug: string;
  startingState: {
    boundary: "account_creation";
    assumptions: string[];
    availableInputs: string[];
  };
  prerequisites: JourneyPrerequisite[];
  nodes: JourneyNode[];
  edges: JourneyEdge[];
  externalGates: JourneyExternalGate[];
  candidateRoutes: JourneyCandidateRoute[];
  uncertainties: JourneyUncertainty[];
  firstSuccessBoundary: {
    nodeId: string;
    outcomeClass: "meaningful_result" | "resource_creation";
    officialRouteContinues: boolean;
    evidence: EvidenceLocator[];
  };
  selectedRoute: {
    id: string | null;
    nodeIds: string[];
    policy: string;
    unresolvedReason: string | null;
  };
  comparisonBasis?: JourneyComparisonBasis;
}

export interface JourneyGraphFinding {
  code:
    | "route_unresolved"
    | "unknown_node"
    | "duplicate_node"
    | "near_duplicate_action"
    | "compound_action"
    | "missing_field_inventory"
    | "field_inventory_status_missing"
    | "field_inventory_inconsistent"
    | "wrong_actor_for_event"
    | "documentation_navigation_action"
    | "broken_causal_input"
    | "missing_evidence"
    | "missing_evidence_locator"
    | "missing_route_edge"
    | "unknown_edge_endpoint"
    | "duplicate_edge"
    | "branch_concatenation"
    | "route_not_declared"
    | "invalid_candidate_route"
    | "unknown_gate_target"
    | "unresolved_uncertainty"
    | "invalid_terminal"
    | "invalid_first_success_boundary"
    | "platform_slug_mismatch"
    | "invalid_starting_state";
  nodeId?: string;
  message: string;
}

/** Editorial granularity findings remain publication blockers, not draft blockers. */
export function draftBlockingJourneyFindings(
  findings: JourneyGraphFinding[],
): JourneyGraphFinding[] {
  return findings.filter((finding) => finding.code !== "compound_action");
}

function normalizedAction(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|your|this|that)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizedAction(value).split(" ").filter((item) => item.length > 2));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function hasEvidence(evidence: EvidenceLocator[]): boolean {
  return (
    Array.isArray(evidence) &&
    evidence.length > 0 &&
    evidence.every((item) => Boolean(item.sourceId?.trim() && item.locator?.trim()))
  );
}

function looksCompound(action: string): boolean {
  const normalized = action.toLowerCase().replace(
    /\b(?:and(?: then)?|then)\s+(?:verify|confirm|check|observe|ensure)\s+(?:that\s+)?(?:the\s+)?(?:response|output|result|status|text|message|success|completion)\b(?:(?!\b(?:and(?: then)?|then|after that)\b).)*$/,
    "",
  );
  const connectors = normalized.match(/\b(and then|then|and|after that)\b/g) ?? [];
  const verbs = normalized.match(
    /\b(open|click|select|choose|enter|create|copy|paste|authorize|connect|submit|run|send|confirm|verify|purchase|add|configure)\b/g,
  ) ?? [];
  return connectors.length > 0 && verbs.length > 1;
}

export function validateJourneyGraph(
  graph: JourneyGraph,
  expectedPlatformSlug?: string,
): JourneyGraphFinding[] {
  const findings: JourneyGraphFinding[] = [];
  if (expectedPlatformSlug && graph.platformSlug !== expectedPlatformSlug) {
    findings.push({
      code: "platform_slug_mismatch",
      message: `Journey graph platform ${graph.platformSlug} does not match record platform ${expectedPlatformSlug}.`,
    });
  }
  if (graph.startingState.boundary !== "account_creation") {
    findings.push({
      code: "invalid_starting_state",
      message: "Selected journeys must begin at account creation unless an explicit comparable exception is approved.",
    });
  }
  if (!graph.selectedRoute.id || graph.selectedRoute.unresolvedReason) {
    findings.push({
      code: "route_unresolved",
      message: graph.selectedRoute.unresolvedReason ?? "No selected route id is present.",
    });
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const candidateRoutes = graph.candidateRoutes ?? [];
  const selectedCandidate = candidateRoutes.find((candidate) => candidate.id === graph.selectedRoute.id);
  if (!selectedCandidate || selectedCandidate.status !== "selected") {
    findings.push({
      code: "route_not_declared",
      message: "The selected route must reference one explicitly declared candidate route.",
    });
  } else if (
    selectedCandidate.nodeIds.length !== graph.selectedRoute.nodeIds.length ||
    selectedCandidate.nodeIds.some((id, index) => graph.selectedRoute.nodeIds[index] !== id)
  ) {
    findings.push({
      code: "invalid_candidate_route",
      message: "The selected route must exactly match its declared candidate route.",
    });
  }
  if (candidateRoutes.filter((candidate) => candidate.status === "selected").length !== 1) {
    findings.push({
      code: "invalid_candidate_route",
      message: "Exactly one candidate route must have selected status.",
    });
  }
  for (const candidate of candidateRoutes) {
    if (
      !candidate.id.trim() ||
      (candidate.status === "selected" && candidate.nodeIds.length === 0) ||
      candidate.nodeIds.some((id) => !byId.has(id)) ||
      !candidate.selectionBasis.trim() ||
      !candidate.condition.trim() ||
      !candidate.routeSummary.trim() ||
      !candidate.effectOnFirstSuccess.trim() ||
      (candidate.status === "selected" && candidate.reasonNotSelected !== null) ||
      (candidate.status === "considered" && !candidate.reasonNotSelected?.trim()) ||
      (candidate.status === "selected" && candidate.branchAtNodeId !== null) ||
      (candidate.status === "considered" && !candidate.branchAtNodeId) ||
      (candidate.branchAtNodeId !== null && !byId.has(candidate.branchAtNodeId)) ||
      !hasEvidence(candidate.evidence)
    ) {
      findings.push({
        code: "invalid_candidate_route",
        message: `Candidate route ${candidate.id || "(missing id)"} is incomplete or references unknown nodes.`,
      });
    }
  }
  const route = graph.selectedRoute.nodeIds.map((id) => {
    const node = byId.get(id);
    if (!node) {
      findings.push({ code: "unknown_node", nodeId: id, message: `Selected route references unknown node ${id}.` });
    }
    return node;
  }).filter((node): node is JourneyNode => Boolean(node));

  const seenIds = new Set<string>();
  const seenActions = new Map<string, string>();
  const priorActions: Array<{ id: string; action: string }> = [];
  const available = new Set(graph.startingState.availableInputs);
  for (const prerequisite of graph.prerequisites ?? []) {
    if (!hasEvidence(prerequisite.evidence)) {
      findings.push({
        code: prerequisite.evidence?.length ? "missing_evidence_locator" : "missing_evidence",
        message: `Prerequisite ${prerequisite.id} needs an accepted source and a specific locator.`,
      });
    }
    for (const output of prerequisite.produces) available.add(output);
  }
  const branchIds = new Set<string>();

  for (const node of route) {
    if (seenIds.has(node.id)) {
      findings.push({ code: "duplicate_node", nodeId: node.id, message: `Node ${node.id} appears more than once in the selected route.` });
    }
    seenIds.add(node.id);
    if (node.branchId) branchIds.add(node.branchId);

    const normalized = normalizedAction(node.action);
    const exact = seenActions.get(normalized);
    if (exact) {
      findings.push({
        code: "duplicate_node",
        nodeId: node.id,
        message: `Action duplicates ${exact}: ${node.action}`,
      });
    }
    seenActions.set(normalized, node.id);
    for (const previous of priorActions) {
      if (jaccard(tokens(previous.action), tokens(node.action)) >= 0.86) {
        findings.push({
          code: "near_duplicate_action",
          nodeId: node.id,
          message: `Action is near-duplicate of ${previous.id}: ${node.action}`,
        });
      }
    }
    priorActions.push({ id: node.id, action: node.action });

    if (node.kind === "developer_action" && looksCompound(node.action)) {
      findings.push({
        code: "compound_action",
        nodeId: node.id,
        message: `Developer action contains multiple intentional interactions: ${node.action}`,
      });
    }
    if (typeof node.requiresFieldInventory !== "boolean") {
      findings.push({
        code: "field_inventory_status_missing",
        nodeId: node.id,
        message: "Every selected interaction must declare whether a field inventory is required.",
      });
    } else if (node.requiresFieldInventory && node.requiredFields.length === 0) {
      findings.push({
        code: "missing_field_inventory",
        nodeId: node.id,
        message: "This interaction requires a field inventory, but no fields are recorded.",
      });
    } else if (!node.requiresFieldInventory && node.requiredFields.length > 0) {
      findings.push({
        code: "field_inventory_inconsistent",
        nodeId: node.id,
        message: "The interaction records fields but declares that no field inventory is required.",
      });
    }
    if (node.kind === "developer_action" && node.interface === "documentation") {
      findings.push({
        code: "documentation_navigation_action",
        nodeId: node.id,
        message: "Opening or reading documentation cannot be counted as a developer journey action.",
      });
    }
    if (
      (node.kind === "passive_wait" || node.kind === "platform_outcome") &&
      node.actor === "developer"
    ) {
      findings.push({
        code: "wrong_actor_for_event",
        nodeId: node.id,
        message: `${node.kind} cannot be counted as a developer action.`,
      });
    }
    for (const input of node.inputs) {
      if (!available.has(input)) {
        findings.push({
          code: "broken_causal_input",
          nodeId: node.id,
          message: `Input "${input}" is not available from the starting state or an earlier output.`,
        });
      }
    }
    for (const output of node.outputs) available.add(output);
    if (!hasEvidence(node.evidence)) {
      findings.push({
        code: node.evidence?.length ? "missing_evidence_locator" : "missing_evidence",
        nodeId: node.id,
        message: "Every selected-route claim needs an accepted source and a specific locator.",
      });
    }
    for (const field of node.requiredFields) {
      if (!hasEvidence(field.evidence)) {
        findings.push({
          code: field.evidence?.length ? "missing_evidence_locator" : "missing_evidence",
          nodeId: node.id,
          message: `Required field "${field.label}" lacks accepted evidence and a locator.`,
        });
      }
    }
  }

  if (branchIds.size > 1) {
    findings.push({
      code: "branch_concatenation",
      message: `Selected route concatenates ${branchIds.size} alternate branches.`,
    });
  }
  const terminal = route.at(-1);
  if (!terminal || terminal.kind !== "terminal_outcome" || !terminal.successSignal.trim()) {
    findings.push({
      code: "invalid_terminal",
      nodeId: terminal?.id,
      message: "Selected route must end at an evidence-backed first-success terminal.",
    });
  }

  const seenEdges = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.from}->${edge.to}`;
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      findings.push({
        code: "unknown_edge_endpoint",
        message: `Edge ${key} references an unknown node.`,
      });
    }
    if (seenEdges.has(key)) {
      findings.push({
        code: "duplicate_edge",
        message: `Edge ${key} appears more than once.`,
      });
    }
    seenEdges.add(key);
    if (!hasEvidence(edge.evidence)) {
      findings.push({
        code: edge.evidence?.length ? "missing_evidence_locator" : "missing_evidence",
        message: `Edge ${edge.from} -> ${edge.to} needs an accepted source and a specific locator.`,
      });
    }
  }
  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index].id;
    const to = route[index + 1].id;
    if (!graph.edges.some((edge) => edge.from === from && edge.to === to)) {
      findings.push({
        code: "missing_route_edge",
        nodeId: to,
        message: `Selected route has no explicit edge from ${from} to ${to}.`,
      });
    }
  }

  for (const gate of graph.externalGates ?? []) {
    if (!byId.has(gate.atNodeId) || !route.some((node) => node.id === gate.atNodeId)) {
      findings.push({
        code: "unknown_gate_target",
        nodeId: gate.atNodeId,
        message: `External gate ${gate.id} must attach to a node in the selected route.`,
      });
    }
    if (!hasEvidence(gate.evidence)) {
      findings.push({
        code: gate.evidence?.length ? "missing_evidence_locator" : "missing_evidence",
        nodeId: gate.atNodeId,
        message: `External gate ${gate.id} needs an accepted source and a specific locator.`,
      });
    }
  }

  for (const uncertainty of graph.uncertainties ?? []) {
    if (uncertainty.blocksPublication) {
      findings.push({
        code: "unresolved_uncertainty",
        nodeId: uncertainty.targetType === "node" ? uncertainty.targetId : undefined,
        message: `${uncertainty.targetType} ${uncertainty.targetId} has a publication-blocking uncertainty: ${uncertainty.description}`,
      });
    }
  }

  const boundary = graph.firstSuccessBoundary;
  if (
    !boundary ||
    boundary.nodeId !== terminal?.id ||
    !hasEvidence(boundary.evidence) ||
    (boundary.outcomeClass === "resource_creation" && boundary.officialRouteContinues)
  ) {
    findings.push({
      code: "invalid_first_success_boundary",
      nodeId: boundary?.nodeId,
      message:
        "The first-success boundary must match the selected terminal, cite evidence, and cannot stop at resource creation when the official route continues to a meaningful result.",
    });
  }

  return findings;
}

export function selectedRouteNodes(graph: JourneyGraph): JourneyNode[] {
  const findings = validateJourneyGraph(graph);
  if (findings.length > 0) {
    throw new Error(`Journey graph is not selectable: ${findings.map((item) => item.code).join(", ")}`);
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.selectedRoute.nodeIds.map((id) => byId.get(id)).filter((node): node is JourneyNode => Boolean(node));
}
