import type { PlatformRecord } from "./ports.js";
import { familyIdForGateType } from "../db/gateTypeFamilyMap.js";

/** One blocker hypothesis attached to a gate or step (never a diagnosed cause). */
export interface BlockerHypothesisRef {
  id: string;
  kind: string;
  label: string;
  diagnosticEligibility: string | null;
  linkSource: "soft-map" | "curated";
  note: string;
}

export interface JourneyGateView {
  id: string | null;
  atStep: number | null;
  type: string;
  description: string;
  documentedRequirement: boolean | null;
  blockerHypotheses: BlockerHypothesisRef[];
}

export interface JourneyStepView {
  stepNumber: number;
  phase: string | null;
  actor: string | null;
  interface: string | null;
  action: string;
  details: string[];
  successSignal: string | null;
  required: boolean;
  sourceIds: string[];
  hasFriction: boolean;
  frictionGates: JourneyGateView[];
}

export interface JourneyOverlay {
  slug: string;
  name: string;
  category: string;
  organization: string | null;
  note: string;
  steps: JourneyStepView[];
  frictionGateCount: number;
  highlightedStepCount: number;
}

const HYPOTHESIS_NOTE =
  "Documented friction may relate to this blocker family. It is a hypothesis, not a confirmed drop-off cause.";

type FamilyLookup = (familyId: string) => { id: string; label: string; kind: string; diagnosticEligibility: string | null } | null;

/**
 * Build a readable journey from a platform record, attaching soft-mapped blocker families to gates.
 */
export function buildJourneyOverlay(
  record: PlatformRecord,
  options: {
    familyLookup: FamilyLookup;
    gateIds?: Map<string, string>;
  },
): JourneyOverlay {
  const gates = (record.friction_gates ?? []).map((gate, index) => {
    const type = gate.type ?? "other";
    const familyId = familyIdForGateType(type);
    const family = familyId ? options.familyLookup(familyId) : null;
    const key = `${gate.at_step ?? "x"}:${type}:${index}`;
    const hypotheses: BlockerHypothesisRef[] = family
      ? [{
          id: family.id,
          kind: family.kind,
          label: family.label,
          diagnosticEligibility: family.diagnosticEligibility,
          linkSource: "soft-map",
          note: HYPOTHESIS_NOTE,
        }]
      : [];
    return {
      id: options.gateIds?.get(key) ?? null,
      atStep: gate.at_step ?? null,
      type,
      description: gate.description ?? "",
      documentedRequirement: (gate as { documented_requirement?: boolean }).documented_requirement ?? null,
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
      phase: step.phase ?? null,
      actor: step.actor ?? null,
      interface: step.interface ?? null,
      action: step.action,
      details: Array.isArray(step.details) ? step.details.map(String) : [],
      successSignal: step.success_signal ?? null,
      required: step.required !== false,
      sourceIds: step.source_ids ?? [],
      hasFriction: stepGates.length > 0,
      frictionGates: stepGates,
    };
  });

  return {
    slug: record.platform.slug,
    name: record.platform.name,
    category: record.category,
    organization: record.platform.organization ?? null,
    note:
      "Journey steps come from official documentation. Highlighted steps have documented friction gates; linked blockers are hypotheses, not observed drop-off.",
    steps,
    frictionGateCount: gates.length,
    highlightedStepCount: steps.filter((step) => step.hasFriction).length,
  };
}
