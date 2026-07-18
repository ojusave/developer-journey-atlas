import { catalog } from "./catalog";
import { discriminatorQuestions } from "./question-routes";
import { auditKnowledgeGraphRuntime, platformSurfaceToArchetypes } from "./knowledge-graph";

export interface DiagnosticReadinessReport {
  workshopReadyForReasonDetermination: boolean;
  workshopReadyForSafeNarrowing: boolean;
  universalFamilies: {
    total: number;
    referenced: number;
    missingIds: string[];
  };
  platformArchetypes: {
    total: number;
    referenced: number;
    missingIds: string[];
  };
  reasons: {
    total: number;
    referenced: number;
    reachable: number;
    diagnosisEligible: number;
    notDiagnosisEligible: number;
  };
  mappedCaseCapabilities: {
    stageRouting: boolean;
    familyNarrowing: boolean;
    reasonDetermination: boolean;
    correctionRetraction: boolean;
    catalogGapResult: boolean;
    compoundResult: boolean;
    boredomRecovery: boolean;
  };
  blockingGaps: string[];
  safeNarrowingGaps: string[];
}

function parentId(id: string): string | null {
  return /^[UP]\d{2}(?:\.\d{2,3})?$/.test(id) ? id.slice(0, 3) : null;
}

export function getDiagnosticReadiness(): DiagnosticReadinessReport {
  const referencedIds = new Set<string>();
  for (const question of discriminatorQuestions) {
    for (const id of question.sourceIds) referencedIds.add(id);
    for (const option of question.options) {
      for (const id of [...option.strengthens, ...option.weakens]) referencedIds.add(id);
    }
  }

  const referencedParents = new Set(
    [...referencedIds]
      .map(parentId)
      .filter((id): id is string => Boolean(id)),
  );
  const universalFamilies = catalog.nodes.filter((node) => node.kind === "universal_family");
  const platformArchetypes = catalog.nodes.filter((node) => node.kind === "platform_archetype");
  const reasons = catalog.nodes.filter((node) => node.kind === "reason");
  const diagnosisEligible = reasons.filter((reason) => reason.diagnosticEligibility === "diagnosis_eligible");
  const reasonDiscriminators = discriminatorQuestions.filter((question) => question.diagnosticLevel === "reason_discriminator");

  const blockingGaps: string[] = [];
  const safeNarrowingGaps: string[] = [];
  const missingUniversal = universalFamilies.filter((node) => !referencedParents.has(node.id)).map((node) => node.id);
  const mappedPlatformIds = new Set<string>(Object.values(platformSurfaceToArchetypes).flat());
  const missingPlatforms = platformArchetypes.filter((node) => !mappedPlatformIds.has(node.id)).map((node) => node.id);
  if (missingUniversal.length > 0) safeNarrowingGaps.push(`Universal families without a reviewed route: ${missingUniversal.join(", ")}`);
  if (missingPlatforms.length > 0) safeNarrowingGaps.push(`Platform archetypes without a participant context route: ${missingPlatforms.join(", ")}`);
  if (diagnosisEligible.length !== reasons.length) {
    blockingGaps.push(`${reasons.length - diagnosisEligible.length} reasons do not have complete reviewed diagnostic cards`);
  }
  if (reasonDiscriminators.length === 0) blockingGaps.push("All current catalog questions narrow families; none determines an individual reason");
  const runtimeAudit = auditKnowledgeGraphRuntime();
  if (runtimeAudit.unreachableReasonIds.length > 0) safeNarrowingGaps.push(`${runtimeAudit.unreachableReasonIds.length} research reasons are unreachable at runtime`);

  return {
    workshopReadyForReasonDetermination: blockingGaps.length === 0,
    workshopReadyForSafeNarrowing: safeNarrowingGaps.length === 0,
    universalFamilies: {
      total: universalFamilies.length,
      referenced: universalFamilies.length - missingUniversal.length,
      missingIds: missingUniversal,
    },
    platformArchetypes: {
      total: platformArchetypes.length,
      referenced: platformArchetypes.length - missingPlatforms.length,
      missingIds: missingPlatforms,
    },
    reasons: {
      total: reasons.length,
      referenced: reasons.filter((reason) => referencedIds.has(reason.id)).length,
      reachable: runtimeAudit.indexedReasonCount,
      diagnosisEligible: diagnosisEligible.length,
      notDiagnosisEligible: reasons.length - diagnosisEligible.length,
    },
    mappedCaseCapabilities: {
      stageRouting: true,
      familyNarrowing: true,
      reasonDetermination: reasonDiscriminators.length > 0 && diagnosisEligible.length > 0,
      correctionRetraction: true,
      catalogGapResult: true,
      compoundResult: true,
      boredomRecovery: true,
    },
    blockingGaps,
    safeNarrowingGaps,
  };
}
