import type { CaseAnswers } from "../types";
import { getCatalogNode, hasCatalogId } from "./catalog";

export type QuestionValueCode =
  | "locate_attempt_boundary"
  | "separate_relevance_from_access"
  | "separate_access_gates"
  | "separate_implementation_layers"
  | "separate_failure_from_false_success"
  | "separate_adaptation_from_organizational_stop"
  | "repair_measurement_boundary"
  | "test_agent_overlay";

export interface DiscriminatorOption {
  id: string;
  label: string;
  strengthens: string[];
  weakens: string[];
  specialState?: "needs_external_evidence" | "deliberate_non_fit" | "catalog_gap" | "compound_blockers" | "legitimate_gate";
  nextObservation: string;
}

export interface DiscriminatorQuestion {
  id: string;
  objectiveId: "D3" | "D8";
  prompt: string;
  support: string;
  answerMode: "single";
  valueCode: QuestionValueCode;
  diagnosticLevel: "family_narrowing" | "reason_discriminator";
  reviewState: "reviewed";
  sourceIds: string[];
  options: DiscriminatorOption[];
}

export const discriminatorQuestions: DiscriminatorQuestion[] = [
  {
    id: "DQ_AGENT_ACTOR",
    objectiveId: "D3",
    prompt: "Who actually performed the path you observed?",
    support: "An AI product and an agent-performed attempt are not the same thing.",
    answerMode: "single",
    valueCode: "test_agent_overlay",
    diagnosticLevel: "family_narrowing",
    reviewState: "reviewed",
    sourceIds: ["U26"],
    options: [
      { id: "human", label: "A person performed it", strengthens: [], weakens: ["U26"], nextObservation: "Continue with the human path and keep agent-specific reasons out unless new evidence appears." },
      { id: "agent", label: "An AI or coding agent performed it", strengthens: ["U26"], weakens: [], nextObservation: "Inspect discovery, authority, side effects, verification, recovery, and human handoff for the agent attempt." },
      { id: "both", label: "A person and agent handed work back and forth", strengthens: ["U26.17", "U26.26"], weakens: [], nextObservation: "Locate the handoff where context, authority, or state stopped transferring cleanly." },
      { id: "unknown", label: "We do not know", strengthens: ["U27"], weakens: [], specialState: "needs_external_evidence", nextObservation: "Inspect one attempt closely enough to identify which actor performed each consequential step." },
    ],
  },
  {
    id: "DQ_NO_ATTEMPT",
    objectiveId: "D8",
    prompt: "What is the earliest signal that developers encountered this platform?",
    support: "No usage can come from discovery, relevance, access, priority, deliberate non-fit, or missing measurement.",
    answerMode: "single",
    valueCode: "locate_attempt_boundary",
    diagnosticLevel: "family_narrowing",
    reviewState: "reviewed",
    sourceIds: ["U01", "U02", "U03", "U04", "U06", "U07", "U21", "U23", "U25", "U27"],
    options: [
      { id: "none", label: "We have no evidence they encountered it", strengthens: ["U02", "U27.01", "U27.12"], weakens: ["U04", "U06", "U07", "U17", "U18"], specialState: "needs_external_evidence", nextObservation: "Observe discovery or speak with the intended developers before choosing a platform fix." },
      { id: "saw_no_fit", label: "They encountered it but did not connect it to their job", strengthens: ["U01.05", "U03.02", "U03.03"], weakens: ["U04", "U11", "U17"], nextObservation: "Compare their stated job with the starting examples and ask what made the platform appear irrelevant." },
      { id: "access", label: "They tried to sign up, get access, or obtain approval", strengthens: ["U04", "U05", "U06", "U07", "U19", "U20", "U21"], weakens: ["U02.01"], nextObservation: "Locate the earliest access or authority gate and identify what happened there." },
      { id: "planned_delayed", label: "They intended to try, but another priority or time limit won", strengthens: ["U01.02", "U01.03", "U01.15", "U25.01", "U25.02"], weakens: ["U11", "U17", "U18"], nextObservation: "Check whether the job was urgent, assigned, and small enough to begin in the available time." },
      { id: "accessibility_inclusion", label: "Language, geography, device, network, accessibility, or assumed context excluded them", strengthens: ["U23"], weakens: [], nextObservation: "Observe the starting path with the affected language, location, device, network, or access need before choosing a content or product fix." },
      { id: "chose_other", label: "They deliberately chose another path or decided it was not a fit", strengthens: ["U01.07", "U03.06", "U03.07"], weakens: [], specialState: "deliberate_non_fit", nextObservation: "Record the decision criterion and verify whether the non-fit is intentional and appropriate." },
      { id: "unknown", label: "We cannot tell from the data we have", strengthens: ["U27.01", "U27.11", "U27.12", "U27.16"], weakens: [], specialState: "needs_external_evidence", nextObservation: "Choose one observation that can distinguish no discovery, no relevance, blocked access, and no priority." },
      { id: "compound", label: "More than one of these happened in the same observed journey", strengthens: [], weakens: [], specialState: "compound_blockers", nextObservation: "Separate the earliest barrier from later barriers, then assign one observation to each instead of treating them as one cause." },
    ],
  },
  {
    id: "DQ_DISCOVERY_EVALUATION",
    objectiveId: "D8",
    prompt: "What happened before they committed to an attempt?",
    support: "This separates finding the path from judging whether it is worth starting.",
    answerMode: "single",
    valueCode: "separate_relevance_from_access",
    diagnosticLevel: "family_narrowing",
    reviewState: "reviewed",
    sourceIds: ["U01", "U02", "U03", "U08", "U09", "U23", "U27"],
    options: [
      { id: "start_missing", label: "They could not find or choose the official starting point", strengthens: ["U02.01", "U02.03", "U02.11", "U02.12"], weakens: ["U04", "U11"], nextObservation: "Watch one fresh developer try to choose a start without facilitator help." },
      { id: "job_mismatch", label: "They found it, but the examples or promise did not match their job", strengthens: ["U01.05", "U03.01", "U03.02", "U03.03"], weakens: ["U02.01"], nextObservation: "Ask what job they expected the platform to solve and which example failed to make that connection." },
      { id: "trust_risk", label: "They could not judge tradeoffs, trust, risk, price, or longevity", strengthens: ["U03.05", "U03.07", "U03.08", "U03.09", "U03.12"], weakens: ["U11"], nextObservation: "Record the unanswered decision criterion rather than treating hesitation as lack of interest." },
      { id: "concept_load", label: "They could not form enough understanding to choose or proceed", strengthens: ["U08.05", "U08.06", "U09.01", "U09.03", "U09.15"], weakens: ["U02.01"], nextObservation: "Ask them to explain the path and consequence in their own words, then locate the missing concept." },
      { id: "accessibility_inclusion", label: "Language, geography, device, accessibility, or assumed context excluded the developer", strengthens: ["U23"], weakens: [], nextObservation: "Observe the path with the affected language, location, device, network, or access need before choosing a content or product fix." },
      { id: "unknown", label: "We only know they did not continue", strengthens: ["U27.15", "U27.16"], weakens: [], specialState: "needs_external_evidence", nextObservation: "Collect one observed evaluation or interview before selecting a discovery, relevance, or learning explanation." },
      { id: "compound", label: "More than one of these happened in the same observed journey", strengthens: [], weakens: [], specialState: "compound_blockers", nextObservation: "Locate the earliest barrier and keep later barriers as separate hypotheses with their own evidence." },
    ],
  },
  {
    id: "DQ_ACCESS_GATE",
    objectiveId: "D8",
    prompt: "What was the earliest access or authority gate you actually observed?",
    support: "A gate may be legitimate. The question is whether it was visible, understandable, and workable for this evaluation.",
    answerMode: "single",
    valueCode: "separate_access_gates",
    diagnosticLevel: "family_narrowing",
    reviewState: "reviewed",
    sourceIds: ["U04", "U05", "U06", "U07", "U19", "U20", "U21", "U23"],
    options: [
      { id: "account", label: "Account, email verification, SSO, MFA, or OAuth", strengthens: ["U04"], weakens: ["U11", "U17"], nextObservation: "Capture the exact identity step, required actor, and observed failure." },
      { id: "workspace", label: "Organization, workspace, tenant, region, or administrator activation", strengthens: ["U05.03", "U05.04", "U05.13", "U05.14"], weakens: ["U04.01"], nextObservation: "Identify which organization state or administrator action was required and whether the developer could see it." },
      { id: "commercial", label: "Credit card, pricing, sales, procurement, contract, or legal review", strengthens: ["U06.01", "U06.09", "U06.14", "U06.16", "U06.17", "U06.18"], weakens: ["U11"], nextObservation: "Record the exact commitment, why it was required, and whether a lower-risk evaluation path existed." },
      { id: "permission", label: "Permission, security policy, app approval, network, or governance", strengthens: ["U07.03", "U07.04", "U07.06", "U07.13", "U07.14", "U19.05"], weakens: ["U02"], nextObservation: "Identify the approving role, requested permission, response, and elapsed time." },
      { id: "plan_quota", label: "Plan entitlement, quota, credits, limits, or cost boundary", strengthens: ["U20.01", "U20.02", "U20.05", "U20.06", "U20.11"], weakens: ["U04"], nextObservation: "Capture the visible limit, current entitlement, expected cost, and safe bound for the test." },
      { id: "handoff", label: "The path depended on another team or owner", strengthens: ["U21.02", "U21.03", "U21.08", "U21.11", "U21.12"], weakens: [], nextObservation: "Map the handoff, the missing decision or asset, and where context or state was lost." },
      { id: "accessibility_inclusion", label: "The access path excluded a language, geography, device, network, or accessibility need", strengthens: ["U23"], weakens: [], nextObservation: "Repeat the access path with the affected context and capture the first inaccessible, unavailable, or misleading step." },
      { id: "expected_gate", label: "The gate worked as designed; self-service evaluation was not intended", strengthens: [], weakens: [], specialState: "legitimate_gate", nextObservation: "Confirm the intended audience and route, then decide whether clearer expectation-setting is enough." },
      { id: "unknown", label: "We know access failed, but not where", strengthens: ["U27.16"], weakens: [], specialState: "needs_external_evidence", nextObservation: "Inspect one access attempt from the developer's first action through the first blocked response." },
      { id: "compound", label: "More than one gate affected the same observed journey", strengthens: [], weakens: [], specialState: "compound_blockers", nextObservation: "Order the gates by when they first blocked progress and name the owner of each." },
    ],
  },
  {
    id: "DQ_IMPLEMENTATION",
    objectiveId: "D8",
    prompt: "Which layer contains the last observed successful step?",
    support: "This prevents a visible error from being mistaken for the upstream cause.",
    answerMode: "single",
    valueCode: "separate_implementation_layers",
    diagnosticLevel: "family_narrowing",
    reviewState: "reviewed",
    sourceIds: ["U08", "U09", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U22", "U23", "U24"],
    options: [
      { id: "understanding", label: "They had not yet formed the needed concept or decision model", strengthens: ["U08.05", "U08.06", "U09.01", "U09.15"], weakens: ["U17"], nextObservation: "Ask the developer to explain the intended state change and expected result before changing instructions." },
      { id: "environment", label: "Prerequisites, local environment, install, dependency, or build", strengthens: ["U10", "U11"], weakens: ["U14", "U18"], nextObservation: "Capture the supported versions, environment facts, exact command, and first divergent output." },
      { id: "configuration", label: "Configuration, credentials, secrets, state, or permissions", strengthens: ["U12", "U07"], weakens: ["U02"], nextObservation: "Compare the required configuration state with the developer's actual state without collecting secrets." },
      { id: "external", label: "Network, region, external dependency, data, schema, or input", strengthens: ["U13", "U14"], weakens: ["U02", "U04"], nextObservation: "Isolate the failing boundary with a representative request and inspect both sides." },
      { id: "interface", label: "The API, SDK, CLI, product interface, example, or generated code", strengthens: ["U15", "U16", "U08.10"], weakens: ["U10"], nextObservation: "Compare the documented contract, example, generated code, and live behavior at the same version." },
      { id: "feedback", label: "The attempt failed, but the error or recovery path did not identify the next action", strengthens: ["U17", "U24"], weakens: [], nextObservation: "Capture the exact failure signal and whether it names the failed layer, consequence, and recovery action." },
      { id: "accessibility_inclusion", label: "Language, device, network, accessibility, or assumed context changed the setup path", strengthens: ["U23"], weakens: [], nextObservation: "Reproduce the setup with the affected context and compare the first divergent instruction, control, request, or response." },
      { id: "unknown", label: "We do not have one complete failed attempt", strengthens: ["U27.16"], weakens: [], specialState: "needs_external_evidence", nextObservation: "Collect one reproducible attempt before selecting an implementation cause." },
      { id: "compound", label: "More than one layer failed in the same observed attempt", strengthens: [], weakens: [], specialState: "compound_blockers", nextObservation: "Reproduce once, then isolate the earliest failing layer before working on later symptoms." },
    ],
  },
  {
    id: "DQ_VERIFY",
    objectiveId: "D8",
    prompt: "What prevented the developer from trusting or verifying the result?",
    support: "A passing platform event can still be a developer failure, and a visible failure can come from another layer.",
    answerMode: "single",
    valueCode: "separate_failure_from_false_success",
    diagnosticLevel: "family_narrowing",
    reviewState: "reviewed",
    sourceIds: ["U00", "U17", "U18", "U23", "U24", "U26", "U27"],
    options: [
      { id: "no_signal", label: "The platform reported success, but the developer could not verify their outcome", strengthens: ["U00.09", "U00.13", "U27.06", "U27.07", "U27.09"], weakens: [], nextObservation: "Compare the platform completion event with the developer-owned verification signal." },
      { id: "error", label: "An error appeared without a clear failed layer or recovery action", strengthens: ["U17.01", "U17.03", "U17.10", "U17.11"], weakens: ["U18"], nextObservation: "Capture the exact error, request ID or trace, failed layer, and next supported action." },
      { id: "unstable", label: "The first result was slow, intermittent, capacity-limited, or not repeatable", strengthens: ["U18", "U20.06"], weakens: ["U02"], nextObservation: "Repeat the same representative attempt and compare timing, limits, and platform status." },
      { id: "support", label: "They could not get enough help to interpret or recover", strengthens: ["U24"], weakens: ["U02"], nextObservation: "Inspect the support path, response time, requested evidence, and whether the response changed the next action." },
      { id: "agent_false_green", label: "An agent or automation declared success before the human could verify it", strengthens: ["U26.08", "U26.12", "U26.18"], weakens: [], nextObservation: "Require an independent human-visible receipt or verification step after the automated action." },
      { id: "accessibility_inclusion", label: "The result or recovery signal was not usable in the developer’s language, device, network, or accessibility context", strengthens: ["U23"], weakens: [], nextObservation: "Ask the affected developer to verify and recover from the same result without facilitator help, then record the first inaccessible signal." },
      { id: "unknown", label: "We have a completion signal, but not the developer’s verification", strengthens: ["U27.06", "U27.07", "U27.13"], weakens: [], specialState: "needs_external_evidence", nextObservation: "Observe whether the developer can independently reproduce and verify the result." },
      { id: "compound", label: "Several verification or reliability failures occurred together", strengthens: [], weakens: [], specialState: "compound_blockers", nextObservation: "Separate whether the result was wrong, unverifiable, unstable, or unsupported, then test the earliest one." },
    ],
  },
  {
    id: "DQ_REPRESENTATIVE",
    objectiveId: "D8",
    prompt: "What changed when the developer moved from the first result to their real job?",
    support: "A quickstart can prove capability without proving fit, authority, or maintainability.",
    answerMode: "single",
    valueCode: "separate_adaptation_from_organizational_stop",
    diagnosticLevel: "family_narrowing",
    reviewState: "reviewed",
    sourceIds: ["U19", "U20", "U21", "U22", "U23", "U25", "U27"],
    options: [
      { id: "adaptation", label: "They could not replace the toy input, account, repository, data, or workflow", strengthens: ["U22.01", "U22.02", "U22.03", "U22.15"], weakens: ["U02"], nextObservation: "Identify the first adaptation seam and the real constraint it introduced." },
      { id: "production_constraint", label: "Real networking, identity, security, operations, reliability, or cost changed the path", strengthens: ["U19", "U20", "U22.04", "U22.05", "U22.08", "U22.10"], weakens: ["U02"], nextObservation: "Name the representative constraint and test it without pretending the toy path already covered it." },
      { id: "team_change", label: "Another team, approver, maintainer, or process became necessary", strengthens: ["U21", "U22.09", "U22.14"], weakens: ["U11"], nextObservation: "Map the new owner, evidence they need, and decision that blocks the next step." },
      { id: "priority_effort", label: "The next step became too large, ambiguous, political, or low priority", strengthens: ["U01.02", "U21.14", "U21.15", "U25.09", "U25.12", "U25.14"], weakens: ["U17"], nextObservation: "Compare expected value, next-step size, reversibility, and sponsor commitment." },
      { id: "accessibility_inclusion", label: "The real environment introduced a language, geography, device, network, or accessibility exclusion", strengthens: ["U23"], weakens: [], nextObservation: "Test the representative path with the affected context and distinguish platform fit from an exclusion in the path." },
      { id: "not_fit", label: "The platform was deliberately rejected for the real job", strengthens: ["U20.15", "U21.07", "U22.11", "U22.15"], weakens: [], specialState: "deliberate_non_fit", nextObservation: "Record the decisive non-fit criterion and avoid treating the decision as accidental drop-off." },
      { id: "unknown", label: "The first result exists, but we do not know what happened next", strengthens: ["U27.07", "U27.09", "U27.13"], weakens: [], specialState: "needs_external_evidence", nextObservation: "Observe one transition from the first result to representative use." },
      { id: "compound", label: "Several real-world constraints appeared in the same transition", strengthens: [], weakens: [], specialState: "compound_blockers", nextObservation: "List the constraints separately, then identify which one first prevented representative use." },
    ],
  },
  {
    id: "DQ_MEASUREMENT",
    objectiveId: "D8",
    prompt: "What is the smallest next observation?",
    support: "When the stopping point is unknown, asking for a cause only produces a better-sounding guess.",
    answerMode: "single",
    valueCode: "repair_measurement_boundary",
    diagnosticLevel: "family_narrowing",
    reviewState: "reviewed",
    sourceIds: ["U23", "U27"],
    options: [
      { id: "observe", label: "Observe one representative developer attempt", strengthens: ["U27.12", "U27.16"], weakens: [], nextObservation: "Watch without rescuing until the first unresolved transition, then record the evidence." },
      { id: "interview", label: "Interview developers who did and did not start", strengthens: ["U27.12", "U27.16"], weakens: [], nextObservation: "Compare reported intent with the earliest concrete action and non-action." },
      { id: "instrument", label: "Instrument an earlier or currently invisible step", strengthens: ["U27.01", "U27.08"], weakens: [], nextObservation: "Add the smallest event needed to locate entry and stopping without redefining success around what is easy to measure." },
      { id: "segment", label: "Separate mixed cohorts, actors, plans, regions, or intents", strengthens: ["U27.03", "U27.04", "U27.05", "U27.11", "U27.14"], weakens: [], nextObservation: "Recompute the path for one coherent cohort before interpreting the aggregate." },
      { id: "accessibility_inclusion", label: "Observe the path with an affected language, geography, device, network, or accessibility context", strengthens: ["U23", "U27.12"], weakens: [], nextObservation: "Recruit or replay one affected journey and record the earliest inaccessible or excluded transition." },
      { id: "none", label: "We cannot obtain better evidence yet", strengthens: ["U27"], weakens: [], specialState: "needs_external_evidence", nextObservation: "Record the decision as underdetermined and do not authorize an intervention from the current evidence." },
    ],
  },
];

const byId = new Map(discriminatorQuestions.map((question) => [question.id, question]));

export function getDiscriminatorQuestion(id: string): DiscriminatorQuestion | null {
  return byId.get(id) ?? null;
}

export function selectDiscriminatorQuestion(answers: CaseAnswers): DiscriminatorQuestion {
  const routeId = (() => {
    switch (answers.lastStage) {
      case "No attempt observed": return "DQ_NO_ATTEMPT";
      case "They found or evaluated the platform": return "DQ_DISCOVERY_EVALUATION";
      case "They tried to get access or approval": return "DQ_ACCESS_GATE";
      case "They started setup or implementation": return "DQ_IMPLEMENTATION";
      case "They produced a first result": return "DQ_VERIFY";
      case "They verified a meaningful result": return "DQ_REPRESENTATIVE";
      default: return "DQ_MEASUREMENT";
    }
  })();
  return byId.get(routeId)!;
}

export function validateQuestionRoutes(): string[] {
  const errors: string[] = [];
  const questionIds = new Set<string>();
  for (const question of discriminatorQuestions) {
    if (questionIds.has(question.id)) errors.push(`Duplicate question ID ${question.id}`);
    questionIds.add(question.id);
    if (question.options.length < 2) errors.push(`${question.id} cannot distinguish alternatives`);
    for (const sourceId of question.sourceIds) {
      if (!hasCatalogId(sourceId)) errors.push(`${question.id} has missing source ${sourceId}`);
    }
    const optionIds = new Set<string>();
    for (const option of question.options) {
      if (optionIds.has(option.id)) errors.push(`${question.id} has duplicate option ${option.id}`);
      optionIds.add(option.id);
      if (option.strengthens.length === 0 && option.weakens.length === 0 && !option.specialState) {
        errors.push(`${question.id}/${option.id} does not change hypothesis state`);
      }
      for (const catalogId of [...option.strengthens, ...option.weakens]) {
        if (!hasCatalogId(catalogId)) errors.push(`${question.id}/${option.id} has missing catalog ID ${catalogId}`);
      }
      if (!option.nextObservation.trim()) errors.push(`${question.id}/${option.id} has no next observation`);
    }
  }
  return errors;
}

export function explainSelection(questionId: string, answerIds: string[]) {
  const question = getDiscriminatorQuestion(questionId);
  if (!question) return [];
  return answerIds
    .map((answerId) => question.options.find((option) => option.id === answerId))
    .filter((option): option is DiscriminatorOption => Boolean(option))
    .map((option) => ({
      answer: option.label,
      liveIds: option.strengthens,
      weakenedIds: option.weakens,
      specialState: option.specialState ?? null,
      nextObservation: option.nextObservation,
      liveLabels: option.strengthens.map((id) => getCatalogNode(id)?.label ?? id),
    }));
}
