import type { CaseAnswers } from "../types";
import { catalog, getCatalogNode, getReasonsForParent, type CaseEvidenceState, type CatalogNode } from "./catalog";
import { buildCandidateUniverse, getParentNode, type CandidateUniverse } from "./knowledge-graph";
import { questionContracts } from "./question-contract";
import { getDiscriminatorQuestion, selectDiscriminatorQuestion, type DiscriminatorOption } from "./question-routes";

export type ObjectiveId = "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8" | "D9" | "D10";
export type ObjectiveStatus = "unanswered" | "partial" | "satisfied" | "blocked";
export type QuestionProgressStatus = "unanswered" | "partial" | "satisfied" | "blocked" | "stale";
export type EvidenceKind =
  | "participant_report"
  | "direct_observation"
  | "product_data"
  | "support_case"
  | "developer_interview"
  | "team_anecdote"
  | "assumption"
  | "none";

export type AnswerValue = string | string[] | boolean | null;
export type AnswerFields = Record<string, AnswerValue>;

interface DiagnosticEventBase {
  eventId: string;
  sequence: number;
  recordedAt: string;
}

export interface AnswerAcceptedEvent extends DiagnosticEventBase {
  kind: "answer_accepted";
  questionId: string;
  answer: AnswerFields;
  evidenceKinds: EvidenceKind[];
}

export interface AnswerCorrectedEvent extends DiagnosticEventBase {
  kind: "answer_corrected";
  questionId: string;
  answer: AnswerFields;
  evidenceKinds: EvidenceKind[];
  correctsEventId: string;
}

export type CaseSignal = "user_declines" | "safety_boundary" | "legitimate_gate" | "catalog_gap" | "compound_blockers";

export interface CaseSignalEvent extends DiagnosticEventBase {
  kind: "case_signal";
  signal: CaseSignal;
  evidenceEventIds: string[];
  note: string;
}

export type DiagnosticEvent = AnswerAcceptedEvent | AnswerCorrectedEvent | CaseSignalEvent;

export interface DiagnosticCase {
  caseId: string;
  catalogVersion: string;
  revision: number;
  events: DiagnosticEvent[];
}

export interface AnswerInput {
  eventId: string;
  questionId: string;
  answer: AnswerFields;
  evidenceKinds?: EvidenceKind[];
  recordedAt?: string;
}

export interface CorrectionInput extends AnswerInput {
  correctsEventId: string;
}

export interface ObjectiveDefinition {
  id: ObjectiveId;
  label: string;
  requiredQuestionIds: string[];
  clarifier: string;
}

export const objectiveDefinitions: ObjectiveDefinition[] = [
  { id: "D1", label: "Concerning behavior", requiredQuestionIds: ["concern"], clarifier: "What did developers do or not do that caused concern?" },
  { id: "D2", label: "Platform boundary", requiredQuestionIds: ["profile-platform"], clarifier: "Which developer surface is in scope for this case?" },
  { id: "D3", label: "Developer and job", requiredQuestionIds: ["developer", "developer-job"], clarifier: "Who is the developer, and what job are they trying to complete beyond using the product?" },
  { id: "D4", label: "First meaningful success", requiredQuestionIds: ["outcome"], clarifier: "What result could the developer verify that would count as the first mile?" },
  { id: "D5", label: "Stopping boundary", requiredQuestionIds: ["concern", "last-truth"], clarifier: "Where does direct observation stop?" },
  { id: "D6", label: "Last observed truth", requiredQuestionIds: ["last-truth"], clarifier: "What is the last event you directly observed, without adding an explanation?" },
  { id: "D7", label: "Explanation and evidence", requiredQuestionIds: ["explanation-evidence"], clarifier: "What evidence actually supports the current explanation?" },
  { id: "D8", label: "Catalog discrimination", requiredQuestionIds: ["catalog-discriminator"], clarifier: "Which observed answer separates the remaining research areas?" },
  { id: "D9", label: "Ownership and handoff", requiredQuestionIds: ["profile-role", "ownership"], clarifier: "What can you do directly, and what requires another owner?" },
  { id: "D10", label: "Evidence-producing next move", requiredQuestionIds: ["next-move"], clarifier: "What small move would change what the team knows within seven days?" },
];

const questionOrder = [
  "profile-name",
  "profile-company",
  "profile-platform",
  "profile-role",
  "concern",
  "developer",
  "developer-job",
  "outcome",
  "last-truth",
  "explanation-evidence",
  "catalog-discriminator",
  "ownership",
  "next-move",
] as const;

const knownQuestionIds = new Set(questionContracts.map((contract) => contract.id));

function nonEmptyString(fields: AnswerFields, key: string): boolean {
  return typeof fields[key] === "string" && fields[key].trim().length > 0;
}

function stringList(fields: AnswerFields, key: string): string[] {
  return Array.isArray(fields[key]) ? fields[key].filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
}

function anyFieldPresent(fields: AnswerFields): boolean {
  return Object.values(fields).some((value) => typeof value === "boolean" || (typeof value === "string" && value.trim()) || (Array.isArray(value) && value.length > 0));
}

function evidenceKindsFromLabels(labels: readonly string[]): EvidenceKind[] {
  const mapping: Record<string, EvidenceKind> = {
    "Direct observation": "direct_observation",
    "Product or platform data": "product_data",
    "Support cases": "support_case",
    "Developer interview": "developer_interview",
    "Team anecdote": "team_anecdote",
    Assumption: "assumption",
    "No evidence yet": "none",
  };
  return [...new Set(labels.map((label) => mapping[label]).filter((kind): kind is EvidenceKind => Boolean(kind)))];
}

function validateEventId(caseFile: DiagnosticCase, eventId: string): void {
  if (!eventId.trim()) throw new Error("An event ID is required");
  if (caseFile.events.some((event) => event.eventId === eventId)) throw new Error(`Duplicate event ID ${eventId}`);
}

function validateQuestionId(questionId: string): void {
  if (!knownQuestionIds.has(questionId)) throw new Error(`Unknown question ID ${questionId}`);
}

function activeAnswerEvents(events: readonly DiagnosticEvent[]): Array<AnswerAcceptedEvent | AnswerCorrectedEvent> {
  const correctedIds = new Set(events.filter((event): event is AnswerCorrectedEvent => event.kind === "answer_corrected").map((event) => event.correctsEventId));
  return events.filter(
    (event): event is AnswerAcceptedEvent | AnswerCorrectedEvent =>
      (event.kind === "answer_accepted" || event.kind === "answer_corrected") && !correctedIds.has(event.eventId),
  );
}

export function getActiveAnswerEvents(caseFile: DiagnosticCase): Array<AnswerAcceptedEvent | AnswerCorrectedEvent> {
  return activeAnswerEvents(caseFile.events).sort((left, right) => left.sequence - right.sequence);
}

export function createDiagnosticCase(caseId: string): DiagnosticCase {
  if (!caseId.trim()) throw new Error("A case ID is required");
  return { caseId, catalogVersion: catalog.catalogVersion, revision: 0, events: [] };
}

export function acceptAnswer(caseFile: DiagnosticCase, input: AnswerInput): DiagnosticCase {
  validateEventId(caseFile, input.eventId);
  validateQuestionId(input.questionId);
  if (getActiveAnswerEvents(caseFile).some((event) => event.questionId === input.questionId)) {
    throw new Error(`Question ${input.questionId} already has an active answer; record a correction instead`);
  }
  const event: AnswerAcceptedEvent = {
    kind: "answer_accepted",
    eventId: input.eventId,
    sequence: caseFile.revision + 1,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    questionId: input.questionId,
    answer: { ...input.answer },
    evidenceKinds: [...new Set<EvidenceKind>(input.evidenceKinds ?? ["participant_report"])],
  };
  return { ...caseFile, revision: event.sequence, events: [...caseFile.events, event] };
}

export function correctAnswer(caseFile: DiagnosticCase, input: CorrectionInput): DiagnosticCase {
  validateEventId(caseFile, input.eventId);
  validateQuestionId(input.questionId);
  const target = getActiveAnswerEvents(caseFile).find((event) => event.eventId === input.correctsEventId);
  if (!target) throw new Error(`Correction target ${input.correctsEventId} is not an active answer`);
  if (target.questionId !== input.questionId) throw new Error("A correction must replace an answer to the same question");
  const event: AnswerCorrectedEvent = {
    kind: "answer_corrected",
    eventId: input.eventId,
    sequence: caseFile.revision + 1,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    questionId: input.questionId,
    answer: { ...input.answer },
    evidenceKinds: [...new Set(input.evidenceKinds ?? target.evidenceKinds)],
    correctsEventId: target.eventId,
  };
  return { ...caseFile, revision: event.sequence, events: [...caseFile.events, event] };
}

export function appendCaseSignal(caseFile: DiagnosticCase, input: {
  eventId: string;
  signal: CaseSignal;
  evidenceEventIds?: string[];
  note?: string;
  recordedAt?: string;
}): DiagnosticCase {
  validateEventId(caseFile, input.eventId);
  const evidenceEventIds = [...new Set(input.evidenceEventIds ?? [])];
  const activeIds = new Set(getActiveAnswerEvents(caseFile).map((event) => event.eventId));
  const missingEvidenceIds = evidenceEventIds.filter((id) => !activeIds.has(id));
  if (missingEvidenceIds.length > 0) throw new Error(`Case signal cites inactive or missing evidence: ${missingEvidenceIds.join(", ")}`);
  if (["legitimate_gate", "catalog_gap", "compound_blockers"].includes(input.signal) && evidenceEventIds.length === 0) {
    throw new Error(`${input.signal} requires at least one active evidence event`);
  }
  const event: CaseSignalEvent = {
    kind: "case_signal",
    eventId: input.eventId,
    sequence: caseFile.revision + 1,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    signal: input.signal,
    evidenceEventIds,
    note: input.note?.trim() ?? "",
  };
  return { ...caseFile, revision: event.sequence, events: [...caseFile.events, event] };
}

export function getActiveAnswerForQuestion(caseFile: DiagnosticCase, questionId: string): AnswerAcceptedEvent | AnswerCorrectedEvent | null {
  return getActiveAnswerEvents(caseFile).find((event) => event.questionId === questionId) ?? null;
}

function lastStageFromCase(caseFile: DiagnosticCase): string {
  const event = getActiveAnswerForQuestion(caseFile, "last-truth");
  return typeof event?.answer.lastStage === "string" ? event.answer.lastStage : "We cannot locate the stop yet";
}

function expectedDiscriminatorId(caseFile: DiagnosticCase): string {
  return selectDiscriminatorQuestion({ lastStage: lastStageFromCase(caseFile) } as CaseAnswers).id;
}

function getQuestionProgressFromEvent(questionId: string, event: AnswerAcceptedEvent | AnswerCorrectedEvent | null, caseFile: DiagnosticCase): QuestionProgressStatus {
  if (!event || !anyFieldPresent(event.answer)) return "unanswered";
  const fields = event.answer;
  switch (questionId) {
    case "profile-name": return nonEmptyString(fields, "name") ? "satisfied" : "partial";
    case "profile-company": return nonEmptyString(fields, "company") ? "satisfied" : "partial";
    case "profile-platform": {
      const surfaces = stringList(fields, "platformSurfaces");
      return nonEmptyString(fields, "platform")
        && surfaces.length > 0
        && (!surfaces.includes("Something else") || nonEmptyString(fields, "platformSurfaceOther"))
        ? "satisfied"
        : "partial";
    }
    case "profile-role": return nonEmptyString(fields, "role") && (fields.role !== "Something else" || nonEmptyString(fields, "roleOther")) ? "satisfied" : "partial";
    case "concern": return nonEmptyString(fields, "concern") && nonEmptyString(fields, "concernPattern") ? "satisfied" : "partial";
    case "developer": return nonEmptyString(fields, "developer") && nonEmptyString(fields, "actorType") ? "satisfied" : "partial";
    case "developer-job": return nonEmptyString(fields, "developerJob") ? "satisfied" : "partial";
    case "outcome": return nonEmptyString(fields, "outcome") && nonEmptyString(fields, "outcomeCheck") ? "satisfied" : "partial";
    case "last-truth": {
      if (!nonEmptyString(fields, "lastStage")) return "partial";
      if (fields.lastStage === "We cannot locate the stop yet") return "satisfied";
      return nonEmptyString(fields, "lastTruth") ? "satisfied" : "partial";
    }
    case "explanation-evidence": return nonEmptyString(fields, "explanation") && stringList(fields, "evidenceTypes").length > 0 ? "satisfied" : "partial";
    case "catalog-discriminator": {
      if (fields.discriminatorQuestionId !== expectedDiscriminatorId(caseFile)) return "stale";
      const question = typeof fields.discriminatorQuestionId === "string" ? getDiscriminatorQuestion(fields.discriminatorQuestionId) : null;
      const answerIds = stringList(fields, "discriminatorAnswerIds");
      if (!question || answerIds.length !== 1 || !question.options.some((option) => option.id === answerIds[0])) return "partial";
      return "satisfied";
    }
    case "ownership": return nonEmptyString(fields, "ownershipMode") && nonEmptyString(fields, "ownership") ? "satisfied" : "partial";
    case "next-move": {
      if (!nonEmptyString(fields, "moveType") || !nonEmptyString(fields, "nextMove")) return "partial";
      if (fields.moveType === "No intervention is justified yet") return "satisfied";
      return nonEmptyString(fields, "expectedSignal") ? "satisfied" : "partial";
    }
    default: return "unanswered";
  }
}

export interface QuestionProgress {
  questionId: string;
  status: QuestionProgressStatus;
  activeEventId: string | null;
  correctionCount: number;
}

export function getQuestionProgress(caseFile: DiagnosticCase, questionId: string): QuestionProgress {
  const activeEvent = getActiveAnswerForQuestion(caseFile, questionId);
  return {
    questionId,
    status: getQuestionProgressFromEvent(questionId, activeEvent, caseFile),
    activeEventId: activeEvent?.eventId ?? null,
    correctionCount: caseFile.events.filter((event) => event.kind === "answer_corrected" && event.questionId === questionId).length,
  };
}

function objectiveComponentStatus(objectiveId: ObjectiveId, questionId: string, status: QuestionProgressStatus, event: AnswerAcceptedEvent | AnswerCorrectedEvent | null): ObjectiveStatus {
  if (status === "unanswered" || status === "stale") return "unanswered";
  if (status === "blocked") return "blocked";
  if (status === "partial") return "partial";
  if ((objectiveId === "D5" || objectiveId === "D6") && questionId === "last-truth" && event?.answer.lastStage === "We cannot locate the stop yet") return "blocked";
  if (objectiveId === "D5" && questionId === "last-truth") return nonEmptyString(event?.answer ?? {}, "lastStage") ? "satisfied" : "partial";
  if (objectiveId === "D6" && questionId === "last-truth") return nonEmptyString(event?.answer ?? {}, "lastTruth") ? "satisfied" : "partial";
  if (objectiveId === "D8" && questionId === "catalog-discriminator") {
    const questionIdValue = typeof event?.answer.discriminatorQuestionId === "string" ? event.answer.discriminatorQuestionId : "";
    const answerId = stringList(event?.answer ?? {}, "discriminatorAnswerIds")[0];
    const option = getDiscriminatorQuestion(questionIdValue)?.options.find((candidate) => candidate.id === answerId);
    return option?.specialState === "needs_external_evidence" ? "blocked" : "satisfied";
  }
  return "satisfied";
}

export interface ObjectiveState {
  id: ObjectiveId;
  label: string;
  status: ObjectiveStatus;
  requiredQuestionIds: string[];
  satisfiedQuestionIds: string[];
  unresolvedQuestionIds: string[];
  evidenceEventIds: string[];
}

export function getObjectiveStates(caseFile: DiagnosticCase): Record<ObjectiveId, ObjectiveState> {
  return Object.fromEntries(objectiveDefinitions.map((definition) => {
    const components = definition.requiredQuestionIds.map((questionId) => {
      const event = getActiveAnswerForQuestion(caseFile, questionId);
      return { questionId, event, status: objectiveComponentStatus(definition.id, questionId, getQuestionProgressFromEvent(questionId, event, caseFile), event) };
    });
    const status: ObjectiveStatus = components.every((component) => component.status === "satisfied")
      ? "satisfied"
      : components.some((component) => component.status === "blocked")
        ? "blocked"
        : components.some((component) => component.status !== "unanswered")
          ? "partial"
          : "unanswered";
    return [definition.id, {
      id: definition.id,
      label: definition.label,
      status,
      requiredQuestionIds: [...definition.requiredQuestionIds],
      satisfiedQuestionIds: components.filter((component) => component.status === "satisfied").map((component) => component.questionId),
      unresolvedQuestionIds: components.filter((component) => component.status !== "satisfied").map((component) => component.questionId),
      evidenceEventIds: components.map((component) => component.event?.eventId).filter((id): id is string => Boolean(id)),
    } satisfies ObjectiveState];
  })) as Record<ObjectiveId, ObjectiveState>;
}

export interface CandidateReason {
  reasonId: string;
  label: string;
  parentId: string;
  evidenceState: CaseEvidenceState;
  diagnosticEligibility: "not_diagnosis_eligible" | "diagnosis_eligible";
  canBeReportedAsCause: boolean;
  supportingEventIds: string[];
  weakeningEventIds: string[];
}

export interface CandidateFamily {
  familyId: string;
  label: string;
  evidenceState: CaseEvidenceState;
  supportingEventIds: string[];
  weakeningEventIds: string[];
}

function selectedDiscriminatorOption(caseFile: DiagnosticCase): { event: AnswerAcceptedEvent | AnswerCorrectedEvent; option: DiscriminatorOption } | null {
  const event = getActiveAnswerForQuestion(caseFile, "catalog-discriminator");
  if (!event || getQuestionProgressFromEvent("catalog-discriminator", event, caseFile) === "stale") return null;
  const questionId = typeof event.answer.discriminatorQuestionId === "string" ? event.answer.discriminatorQuestionId : "";
  const answerId = stringList(event.answer, "discriminatorAnswerIds")[0];
  const option = getDiscriminatorQuestion(questionId)?.options.find((candidate) => candidate.id === answerId);
  return option ? { event, option } : null;
}

function selectedCatalogOptions(caseFile: DiagnosticCase): Array<{ event: AnswerAcceptedEvent | AnswerCorrectedEvent; option: DiscriminatorOption }> {
  const selections: Array<{ event: AnswerAcceptedEvent | AnswerCorrectedEvent; option: DiscriminatorOption }> = [];
  const discriminatorSelection = selectedDiscriminatorOption(caseFile);
  if (discriminatorSelection) selections.push(discriminatorSelection);

  const developerEvent = getActiveAnswerForQuestion(caseFile, "developer");
  const actorType = typeof developerEvent?.answer.actorType === "string" ? developerEvent.answer.actorType : "";
  const actorOptionId = ({
    "A person": "human",
    "An AI or coding agent": "agent",
    "A person and agent handing work back and forth": "both",
    "We do not know": "unknown",
  } as Record<string, string>)[actorType];
  const actorOption = actorOptionId
    ? getDiscriminatorQuestion("DQ_AGENT_ACTOR")?.options.find((option) => option.id === actorOptionId)
    : null;
  if (developerEvent && actorOption) selections.push({ event: developerEvent, option: actorOption });
  return selections;
}

function applyFamilyState(candidates: Map<string, CandidateReason>, family: CatalogNode, state: CaseEvidenceState, eventId: string): void {
  for (const reason of getReasonsForParent(family.id)) {
    const candidate = candidates.get(reason.id);
    if (!candidate) continue;
    if (state === "weakened") {
      candidate.evidenceState = "weakened";
      candidate.weakeningEventIds.push(eventId);
    } else if (candidate.evidenceState === "not_considered") {
      candidate.evidenceState = "needs_observation";
      candidate.supportingEventIds.push(eventId);
    }
  }
}

export function getCandidateReasons(caseFile: DiagnosticCase, universe: CandidateUniverse): CandidateReason[] {
  const candidates = new Map<string, CandidateReason>(universe.reasonIds.map((reasonId) => {
    const reason = getCatalogNode(reasonId)!;
    return [reasonId, {
      reasonId,
      label: reason.label,
      parentId: getParentNode(reasonId)?.id ?? reason.parentId ?? "",
      evidenceState: "not_considered" as CaseEvidenceState,
      diagnosticEligibility: reason.diagnosticEligibility ?? "not_diagnosis_eligible",
      canBeReportedAsCause: reason.diagnosticEligibility === "diagnosis_eligible" && ["reviewed", "locally_validated"].includes(reason.catalogMaturity),
      supportingEventIds: [],
      weakeningEventIds: [],
    } satisfies CandidateReason];
  }));
  const selections = selectedCatalogOptions(caseFile);
  if (selections.length === 0) return [...candidates.values()];

  for (const selection of selections) {
    for (const id of selection.option.strengthens) {
      const node = getCatalogNode(id);
      if (!node) continue;
      if (node.kind === "reason") {
        const candidate = candidates.get(id);
        if (candidate) {
          candidate.evidenceState = "live";
          candidate.supportingEventIds.push(selection.event.eventId);
        }
      } else if (node.kind === "universal_family" || node.kind === "platform_archetype") {
        applyFamilyState(candidates, node, "needs_observation", selection.event.eventId);
      }
    }
    for (const id of selection.option.weakens) {
      const node = getCatalogNode(id);
      if (!node) continue;
      if (node.kind === "reason") {
        const candidate = candidates.get(id);
        if (candidate) {
          candidate.evidenceState = "weakened";
          candidate.weakeningEventIds.push(selection.event.eventId);
        }
      } else if (node.kind === "universal_family" || node.kind === "platform_archetype") {
        applyFamilyState(candidates, node, "weakened", selection.event.eventId);
      }
    }
  }
  return [...candidates.values()];
}

export function getCandidateFamilies(caseFile: DiagnosticCase, universe: CandidateUniverse): CandidateFamily[] {
  const familyIds = [...new Set([...universe.universalFamilyIds, ...universe.platformArchetypeIds])];
  const families = new Map<string, CandidateFamily>(familyIds.map((familyId) => {
    const node = getCatalogNode(familyId)!;
    return [familyId, {
      familyId,
      label: node.label,
      evidenceState: "not_considered" as CaseEvidenceState,
      supportingEventIds: [],
      weakeningEventIds: [],
    } satisfies CandidateFamily];
  }));
  const selections = selectedCatalogOptions(caseFile);
  if (selections.length === 0) return [...families.values()];
  for (const selection of selections) {
    for (const id of selection.option.strengthens) {
      const node = getCatalogNode(id);
      const familyId = node?.kind === "reason" ? getParentNode(id)?.id : id;
      const family = familyId ? families.get(familyId) : null;
      if (family) {
        family.evidenceState = "live";
        family.supportingEventIds.push(selection.event.eventId);
      }
    }
    for (const id of selection.option.weakens) {
      const node = getCatalogNode(id);
      const familyId = node?.kind === "reason" ? getParentNode(id)?.id : id;
      const family = familyId ? families.get(familyId) : null;
      if (family) {
        family.evidenceState = "weakened";
        family.weakeningEventIds.push(selection.event.eventId);
      }
    }
  }
  return [...families.values()];
}

export interface DiagnosticState {
  caseId: string;
  revision: number;
  activeAnswerEvents: Array<AnswerAcceptedEvent | AnswerCorrectedEvent>;
  objectives: Record<ObjectiveId, ObjectiveState>;
  questionProgress: Record<string, QuestionProgress>;
  candidateUniverse: CandidateUniverse;
  candidateFamilies: CandidateFamily[];
  candidateReasons: CandidateReason[];
  selectedSpecialState: DiscriminatorOption["specialState"] | null;
  evidenceKinds: EvidenceKind[];
  signals: CaseSignalEvent[];
}

function augmentUniverseWithSelections(universe: CandidateUniverse, selections: Array<{ option: DiscriminatorOption }>): CandidateUniverse {
  if (selections.length === 0) return universe;
  const addedFamilyIds = new Set<string>();
  const addedPlatformIds = new Set<string>();
  for (const selection of selections) {
    for (const id of [...selection.option.strengthens, ...selection.option.weakens]) {
      const node = getCatalogNode(id);
      const parent = node?.kind === "reason" ? getParentNode(id) : node;
      if (parent?.kind === "universal_family") addedFamilyIds.add(parent.id);
      if (parent?.kind === "platform_archetype") addedPlatformIds.add(parent.id);
    }
  }
  const universalFamilyIds = [...new Set([...universe.universalFamilyIds, ...addedFamilyIds])];
  const platformArchetypeIds = [...new Set([...universe.platformArchetypeIds, ...addedPlatformIds])];
  const universalReasonIds = [...new Set([...universe.universalReasonIds, ...[...addedFamilyIds].flatMap((id) => getReasonsForParent(id).map((reason) => reason.id))])];
  const platformReasonIds = [...new Set([...universe.platformReasonIds, ...[...addedPlatformIds].flatMap((id) => getReasonsForParent(id).map((reason) => reason.id))])];
  return {
    ...universe,
    platformArchetypeIds,
    universalFamilyIds,
    universalReasonIds,
    platformReasonIds,
    reasonIds: [...new Set([...universalReasonIds, ...platformReasonIds])],
  };
}

export function deriveDiagnosticState(caseFile: DiagnosticCase): DiagnosticState {
  const platformEvent = getActiveAnswerForQuestion(caseFile, "profile-platform");
  const platformSurfaces = stringList(platformEvent?.answer ?? {}, "platformSurfaces");
  const selections = selectedCatalogOptions(caseFile);
  const discriminatorSelection = selectedDiscriminatorOption(caseFile);
  const activeEvidenceIds = new Set(getActiveAnswerEvents(caseFile).map((event) => event.eventId));
  const universe = augmentUniverseWithSelections(
    buildCandidateUniverse({ lastStage: lastStageFromCase(caseFile), platformSurfaceLabels: platformSurfaces }),
    selections,
  );
  return {
    caseId: caseFile.caseId,
    revision: caseFile.revision,
    activeAnswerEvents: getActiveAnswerEvents(caseFile),
    objectives: getObjectiveStates(caseFile),
    questionProgress: Object.fromEntries(questionOrder.map((questionId) => [questionId, getQuestionProgress(caseFile, questionId)])),
    candidateUniverse: universe,
    candidateFamilies: getCandidateFamilies(caseFile, universe),
    candidateReasons: getCandidateReasons(caseFile, universe),
    selectedSpecialState: universe.hasUnmappedPlatformSurface
      ? "catalog_gap"
      : discriminatorSelection?.option.specialState ?? selections.find((selection) => selection.option.specialState)?.option.specialState ?? null,
    evidenceKinds: [...new Set(getActiveAnswerEvents(caseFile).flatMap((event) => event.evidenceKinds))],
    signals: caseFile.events.filter((event): event is CaseSignalEvent => event.kind === "case_signal")
      .filter((event) => ["user_declines", "safety_boundary"].includes(event.signal) || (event.evidenceEventIds.length > 0 && event.evidenceEventIds.every((id) => activeEvidenceIds.has(id)))),
  };
}

export interface QuestionTarget {
  kind: "question" | "clarifier" | "recovery" | "finish";
  questionId: string | null;
  discriminatorQuestionId: string | null;
  objectiveIds: ObjectiveId[];
  prompt: string;
  reason: string;
  canFinishWithCurrentEvidence: boolean;
}

export function selectNextQuestionTarget(caseFile: DiagnosticCase, options: { maxAnswerEvents?: number } = {}): QuestionTarget {
  const maxAnswerEvents = options.maxAnswerEvents ?? 14;
  const answerEvents = getActiveAnswerEvents(caseFile);
  if (answerEvents.length >= maxAnswerEvents) {
    return {
      kind: "finish",
      questionId: null,
      discriminatorQuestionId: null,
      objectiveIds: [],
      prompt: "Finish with what the current evidence supports.",
      reason: "The diagnostic attention budget is exhausted. More participant questions would risk repetition without better evidence.",
      canFinishWithCurrentEvidence: true,
    };
  }

  for (const questionId of questionOrder) {
    const progress = getQuestionProgress(caseFile, questionId);
    if (progress.status === "satisfied") continue;
    const contract = questionContracts.find((candidate) => candidate.id === questionId)!;
    const objectiveIds = contract.objectiveIds as ObjectiveId[];
    const discriminator = questionId === "catalog-discriminator"
      ? selectDiscriminatorQuestion({ lastStage: lastStageFromCase(caseFile) } as CaseAnswers)
      : null;
    if (progress.correctionCount >= 2 || (progress.status === "blocked" && questionId !== "catalog-discriminator")) {
      const objective = objectiveDefinitions.find((candidate) => objectiveIds.includes(candidate.id));
      return {
        kind: "recovery",
        questionId,
        discriminatorQuestionId: discriminator?.id ?? null,
        objectiveIds,
        prompt: objective?.clarifier ?? "Would you rather finish with the evidence you have?",
        reason: "This objective has not resolved after repeated answers. Offer a shorter route or let the participant finish without manufacturing certainty.",
        canFinishWithCurrentEvidence: true,
      };
    }
    if (progress.status === "partial" || progress.status === "blocked" || progress.status === "stale") {
      const objective = objectiveDefinitions.find((candidate) => objectiveIds.includes(candidate.id));
      return {
        kind: "clarifier",
        questionId,
        discriminatorQuestionId: discriminator?.id ?? null,
        objectiveIds,
        prompt: discriminator?.prompt ?? objective?.clarifier ?? contract.job,
        reason: progress.status === "stale"
          ? "An upstream correction changed the applicable route, so the previous discriminator no longer applies."
          : contract.followUpTrigger,
        canFinishWithCurrentEvidence: true,
      };
    }
    return {
      kind: "question",
      questionId,
      discriminatorQuestionId: discriminator?.id ?? null,
      objectiveIds,
      prompt: discriminator?.prompt ?? contract.job,
      reason: contract.job,
      canFinishWithCurrentEvidence: questionId !== "profile-name" && questionId !== "profile-company",
    };
  }
  return {
    kind: "finish",
    questionId: null,
    discriminatorQuestionId: null,
    objectiveIds: [],
    prompt: "Show what the answers support and what remains unresolved.",
    reason: "Every required question has a structurally complete active answer.",
    canFinishWithCurrentEvidence: true,
  };
}

export type TerminalState =
  | "continue"
  | "focus_clarified"
  | "hypothesis_ready"
  | "needs_evidence"
  | "action_ready"
  | "catalog_gap"
  | "compound_blockers"
  | "legitimate_gate"
  | "deliberate_non_fit"
  | "user_declines"
  | "safety_boundary";

export interface StopDecision {
  terminalState: TerminalState;
  shouldAskAnotherQuestion: boolean;
  reason: string;
  nextObservation: string | null;
}

export function evaluateStopCondition(caseFile: DiagnosticCase, state = deriveDiagnosticState(caseFile)): StopDecision {
  const signalPriority: CaseSignal[] = ["safety_boundary", "user_declines", "catalog_gap", "compound_blockers", "legitimate_gate"];
  const signal = signalPriority.find((candidate) => state.signals.some((event) => event.signal === candidate));
  if (signal) {
    return {
      terminalState: signal,
      shouldAskAnotherQuestion: false,
      reason: state.signals.find((event) => event.signal === signal)?.note || `The case reached ${signal}.`,
      nextObservation: null,
    };
  }
  const selection = selectedDiscriminatorOption(caseFile);
  if (state.selectedSpecialState === "catalog_gap") {
    return { terminalState: "catalog_gap", shouldAskAnotherQuestion: false, reason: "The observed case is not represented by a reviewed catalog route.", nextObservation: selection?.option.nextObservation ?? null };
  }
  if (state.selectedSpecialState === "deliberate_non_fit") {
    return { terminalState: "deliberate_non_fit", shouldAskAnotherQuestion: false, reason: "The evidence describes an intentional non-fit decision, not an accidental first-mile failure.", nextObservation: selection?.option.nextObservation ?? null };
  }
  if (state.selectedSpecialState === "compound_blockers") {
    return { terminalState: "compound_blockers", shouldAskAnotherQuestion: false, reason: "The answers describe more than one barrier in the same journey. They need separate evidence and ownership.", nextObservation: selection?.option.nextObservation ?? null };
  }
  if (state.selectedSpecialState === "legitimate_gate") {
    return { terminalState: "legitimate_gate", shouldAskAnotherQuestion: false, reason: "The observed gate may be intentional rather than a broken developer path.", nextObservation: selection?.option.nextObservation ?? null };
  }
  const next = selectNextQuestionTarget(caseFile);
  const objectiveValues = Object.values(state.objectives);
  const evidenceQuestion = getActiveAnswerForQuestion(caseFile, "explanation-evidence");
  const evidenceLabels = stringList(evidenceQuestion?.answer ?? {}, "evidenceTypes");
  const weakEvidenceOnly = evidenceLabels.length > 0 && evidenceLabels.every((label) => ["Team anecdote", "Assumption", "No evidence yet"].includes(label));
  if (state.selectedSpecialState === "needs_external_evidence" || weakEvidenceOnly || state.objectives.D6.status === "blocked") {
    return {
      terminalState: "needs_evidence",
      shouldAskAnotherQuestion: next.kind !== "finish" && !["catalog-discriminator"].includes(next.questionId ?? ""),
      reason: "The participant answers cannot separate the live explanations without another observation.",
      nextObservation: selection?.option.nextObservation ?? "Observe one complete attempt and record the earliest unresolved transition.",
    };
  }
  if (state.objectives.D10.status === "satisfied") {
    return {
      terminalState: "action_ready",
      shouldAskAnotherQuestion: false,
      reason: "The case has a bounded next move tied to an observable developer signal.",
      nextObservation: null,
    };
  }
  if (state.candidateReasons.some((candidate) => candidate.evidenceState === "supported" && candidate.canBeReportedAsCause)) {
    return { terminalState: "hypothesis_ready", shouldAskAnotherQuestion: next.kind !== "finish", reason: "At least one reviewed reason is supported by active evidence.", nextObservation: null };
  }
  if (["satisfied", "blocked"].includes(state.objectives.D8.status)) {
    return {
      terminalState: "needs_evidence",
      shouldAskAnotherQuestion: next.kind !== "finish",
      reason: "The research areas are narrower, but no individual reason has a reviewed diagnostic card and active discriminating evidence.",
      nextObservation: selection?.option.nextObservation ?? "Collect the smallest observation that separates the live research areas.",
    };
  }
  if (["satisfied", "blocked"].includes(state.objectives.D6.status)) {
    return { terminalState: "focus_clarified", shouldAskAnotherQuestion: next.kind !== "finish", reason: "The stopping boundary is clearer, but the explanation is not yet tested.", nextObservation: null };
  }
  return {
    terminalState: "continue",
    shouldAskAnotherQuestion: next.kind !== "finish" && objectiveValues.some((objective) => objective.status !== "satisfied"),
    reason: next.reason,
    nextObservation: null,
  };
}

function eventInput(questionId: string, answer: AnswerFields, evidenceKinds?: EvidenceKind[]): Omit<AnswerInput, "eventId"> | null {
  return anyFieldPresent(answer) ? { questionId, answer, evidenceKinds } : null;
}

export function caseAnswersToDiagnosticCase(answers: CaseAnswers, caseId = "browser-case"): DiagnosticCase {
  const inputs: Array<Omit<AnswerInput, "eventId"> | null> = [
    eventInput("profile-name", { name: answers.name }),
    eventInput("profile-company", { company: answers.company }),
    eventInput("profile-platform", { platform: answers.platform, platformSurfaces: answers.platformSurfaces, platformSurfaceOther: answers.platformSurfaceOther }),
    eventInput("profile-role", { role: answers.role, roleOther: answers.roleOther }),
    eventInput("concern", { concern: answers.concern, concernPattern: answers.concernPattern }),
    eventInput("developer", { developer: answers.developer, actorType: answers.actorType }),
    eventInput("developer-job", { developerJob: answers.developerJob }),
    eventInput("outcome", { outcome: answers.outcome, outcomeCheck: answers.outcomeCheck }),
    eventInput("last-truth", { lastStage: answers.lastStage, lastTruth: answers.lastTruth }),
    eventInput("explanation-evidence", { explanation: answers.explanation, evidenceTypes: answers.evidenceTypes, evidenceDetail: answers.evidenceDetail }, evidenceKindsFromLabels(answers.evidenceTypes)),
    eventInput("catalog-discriminator", { discriminatorQuestionId: answers.discriminatorQuestionId, discriminatorAnswerIds: answers.discriminatorAnswerIds }),
    eventInput("ownership", { ownershipMode: answers.ownershipMode, ownership: answers.ownership }),
    eventInput("next-move", { moveType: answers.moveType, nextMove: answers.nextMove, expectedSignal: answers.expectedSignal }),
  ];
  return inputs.reduce((caseFile, input, index) => input
    ? acceptAnswer(caseFile, { ...input, eventId: `snapshot-${index + 1}`, recordedAt: "1970-01-01T00:00:00.000Z" })
    : caseFile, createDiagnosticCase(caseId));
}
