import type { JourneyExternalGate, JourneyNode } from "./journeyGraph.js";
import type { PlatformRecord } from "./ports.js";

export type ComplexityRating = "low" | "medium" | "high" | "very-high";

export interface ComplexityDimensions {
  requiredActions: number;
  requiredFields: number;
  decisionPoints: number;
  documentedExternalGates: number;
  unavoidableWaits: number;
  platformOutcomes: number;
  totalAtomicNodes: number;
}

export interface ComplexityProfile {
  rating: ComplexityRating;
  score: number;
  formula: string;
  dimensions: ComplexityDimensions;
  evidenceState: "documented-graph" | "draft-primary-path";
  note: string;
}

const FORMULA =
  "required actions + 0.35*required fields + 1.2*decision points + 1.5*documented external gates + unavoidable waits + 0.4*platform outcomes";

function ratingFor(score: number): ComplexityRating {
  if (score >= 28) return "very-high";
  if (score >= 16) return "high";
  if (score >= 8) return "medium";
  return "low";
}

function profile(dimensions: ComplexityDimensions, evidenceState: ComplexityProfile["evidenceState"]): ComplexityProfile {
  const score = Number((
    dimensions.requiredActions
    + dimensions.requiredFields * 0.35
    + dimensions.decisionPoints * 1.2
    + dimensions.documentedExternalGates * 1.5
    + dimensions.unavoidableWaits
    + dimensions.platformOutcomes * 0.4
  ).toFixed(2));
  return {
    rating: ratingFor(score),
    score,
    formula: FORMULA,
    dimensions,
    evidenceState,
    note:
      "This is documented structural complexity, not observed user difficulty. It counts required work, fields, branches, gates, waits, and platform status changes in the selected first-mile route.",
  };
}

export function buildComplexityProfileFromGraph(
  nodes: JourneyNode[],
  externalGates: JourneyExternalGate[],
): ComplexityProfile {
  const selectedIds = new Set(nodes.map((node) => node.id));
  return profile({
    requiredActions: nodes.filter((node) => node.kind === "developer_action" && node.required).length,
    requiredFields: nodes
      .flatMap((node) => node.requiredFields)
      .filter((field) => field.required).length,
    decisionPoints: nodes.filter((node) => node.kind === "decision" && node.required).length,
    documentedExternalGates: externalGates.filter((gate) => gate.required && selectedIds.has(gate.atNodeId)).length,
    unavoidableWaits: nodes.filter((node) => node.kind === "passive_wait" && node.required).length,
    platformOutcomes: nodes.filter((node) => node.kind === "platform_outcome" && node.required).length,
    totalAtomicNodes: nodes.length,
  }, "documented-graph");
}

export function buildComplexityProfileFromRecord(record: PlatformRecord): ComplexityProfile {
  const steps = record.primary_path ?? [];
  const gates = record.friction_gates ?? [];
  return profile({
    requiredActions: steps.filter((step) =>
      step.required !== false &&
      step.actor !== "platform" &&
      step.actor !== "system" &&
      step.phase !== "wait").length,
    requiredFields: steps
      .flatMap((step) => step.required_fields ?? [])
      .filter((field) => field.required !== false).length,
    decisionPoints: (record.branches as unknown[] | undefined)?.length ?? 0,
    documentedExternalGates: gates.length,
    unavoidableWaits: [
      ...steps.filter((step) => step.required !== false && step.phase === "wait"),
      ...gates.filter((gate) => gate.type === "wait"),
    ].length,
    platformOutcomes: steps.filter((step) =>
      step.required !== false &&
      (step.actor === "platform" || step.actor === "system")).length,
    totalAtomicNodes: steps.length,
  }, "draft-primary-path");
}
