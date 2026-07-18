import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ChoiceGroup,
  MultiChoiceGroup,
  QuestionShell,
  TextArea,
  TextField,
  WhyThisQuestion,
} from "./components";
import {
  actorTypeChoices,
  concernPatternChoices,
  evidenceChoices,
  friendlyCopy,
  lastStageChoices,
  moveTypeChoices,
  outcomeCheckChoices,
  ownershipChoices,
  phaseLabels,
  platformSurfaceChoices,
  reviewDecisionChoices,
  roleChoices,
} from "./copy";
import {
  clearAdaptiveCredential,
  createAdaptiveSession,
  deleteAdaptiveSession,
  getAdaptiveSession,
  getAdaptiveTurn,
  loadAdaptiveCredential,
  retryAdaptiveTurn,
  saveAdaptiveCredential,
  submitAdaptiveTurn,
  AdaptiveRequestError,
  type AdaptiveAnswer,
  type AdaptiveCredential,
  type AdaptiveNextQuestion,
  type AdaptiveRecovery,
  type AdaptiveTurnResponse,
} from "./adaptive-client";
import { actionBriefToMarkdown, compileActionBrief } from "./action-brief";
import { catalog } from "./domain/catalog";
import { guidedAnswerQualityMessage } from "./domain/answer-quality";
import {
  caseAnswersToDiagnosticCase,
  deriveDiagnosticState,
  evaluateStopCondition,
  type ObjectiveId,
} from "./domain/diagnostic-engine";
import { getPlatformResearchGroups, resolvePlatformArchetypeIds } from "./domain/knowledge-graph";
import { explainSelection, selectDiscriminatorQuestion } from "./domain/question-routes";
import {
  createPortableCase,
  parsePortableCase,
  safeFilename,
  serializePortableCase,
  type PortableCase,
} from "./session-portability";
import { clearSession, loadSession, saveSession } from "./storage";
import { emptyAnswers, type CaseAnswers, type PhaseId, type ScreenId } from "./types";

const screenOrder: ScreenId[] = [
  "welcome",
  "name",
  "company",
  "platform",
  "role",
  "concern",
  "developer",
  "developer-job",
  "outcome",
  "last-truth",
  "explanation",
  "evidence",
  "discriminator",
  "ownership",
  "next-move",
  "summary",
  "seven-day",
];

const adaptiveEnabled = import.meta.env.VITE_ADAPTIVE_ENABLED === "true";
const boredomOrIrritation = /\b(?:this\s+is\s+(?:really\s+)?boring|i(?:'m|\s+am)\s+bored|too\s+many\s+questions|this\s+is\s+taking\s+too\s+long|can\s+we\s+(?:stop|finish|speed\s+this\s+up)|just\s+finish)\b/i;
const objectiveIds = new Set<ObjectiveId>(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"]);
const diagnosticObjectiveOrder: ObjectiveId[] = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"];
const answerObjective: Partial<Record<keyof CaseAnswers, ObjectiveId>> = {
  platform: "D2",
  platformSurfaces: "D2",
  platformSurfaceOther: "D2",
  concern: "D1",
  concernPattern: "D1",
  developer: "D3",
  actorType: "D3",
  developerJob: "D3",
  outcome: "D4",
  outcomeCheck: "D4",
  lastStage: "D5",
  lastTruth: "D6",
  explanation: "D7",
  evidenceTypes: "D7",
  evidenceDetail: "D7",
  alternative: "D7",
  discriminatorQuestionId: "D8",
  discriminatorAnswerIds: "D8",
  ownershipMode: "D9",
  ownership: "D9",
  moveType: "D10",
  nextMove: "D10",
  expectedSignal: "D10",
};

function isObjectiveId(value: string): value is ObjectiveId {
  return objectiveIds.has(value as ObjectiveId);
}

function recordObjectiveTurn(
  turnIds: Record<string, string>,
  objectiveId: ObjectiveId,
  turnId: string,
): Record<string, string> {
  const objectiveIndex = diagnosticObjectiveOrder.indexOf(objectiveId);
  return {
    ...Object.fromEntries(Object.entries(turnIds).filter(([candidateObjectiveId]) => (
      isObjectiveId(candidateObjectiveId)
      && diagnosticObjectiveOrder.indexOf(candidateObjectiveId) < objectiveIndex
    ))),
    [objectiveId]: turnId,
  };
}

function currentGuidedText(screen: ScreenId, answers: CaseAnswers): string {
  return ({
    concern: answers.concern,
    developer: answers.developer,
    "developer-job": answers.developerJob,
    outcome: answers.outcome,
    "last-truth": answers.lastTruth,
    explanation: answers.explanation,
    evidence: answers.evidenceDetail,
    ownership: answers.ownership,
    "next-move": `${answers.nextMove}\n${answers.expectedSignal}`,
    "seven-day": answers.reviewNotes,
  } as Partial<Record<ScreenId, string>>)[screen] ?? "";
}

function screenForObjective(objectiveId: ObjectiveId): ScreenId {
  return ({
    D1: "concern",
    D2: "platform",
    D3: "developer",
    D4: "outcome",
    D5: "last-truth",
    D6: "last-truth",
    D7: "explanation",
    D8: "discriminator",
    D9: "ownership",
    D10: "next-move",
  } satisfies Record<ObjectiveId, ScreenId>)[objectiveId];
}

function fallbackScreenAfterObjective(objectiveId: ObjectiveId): ScreenId {
  return ({
    D1: "developer",
    D2: "concern",
    D3: "outcome",
    D4: "last-truth",
    D5: "last-truth",
    D6: "explanation",
    D7: "discriminator",
    D8: "ownership",
    D9: "next-move",
    D10: "summary",
  } satisfies Record<ObjectiveId, ScreenId>)[objectiveId];
}

function phaseForObjective(objectiveId: ObjectiveId): PhaseId {
  if (["D1", "D2", "D3", "D4"].includes(objectiveId)) return "frame";
  if (["D5", "D6"].includes(objectiveId)) return "locate";
  if (["D7", "D8"].includes(objectiveId)) return "test";
  return "move";
}

function phaseForScreen(screen: ScreenId): PhaseId {
  if (["name", "company", "platform", "role"].includes(screen)) return "profile";
  if (["concern", "developer", "developer-job", "outcome"].includes(screen)) return "frame";
  if (screen === "last-truth") return "locate";
  if (["explanation", "evidence", "discriminator"].includes(screen)) return "test";
  if (["ownership", "next-move"].includes(screen)) return "move";
  if (screen === "adaptive") return "test";
  if (["summary", "seven-day"].includes(screen)) return "complete";
  return "profile";
}

function nextScreen(screen: ScreenId): ScreenId {
  return screenOrder[Math.min(screenOrder.indexOf(screen) + 1, screenOrder.length - 1)];
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validationMessage(screen: ScreenId, answers: CaseAnswers, checkSemanticQuality = true): string | null {
  const requiredText: Partial<Record<ScreenId, keyof CaseAnswers>> = {
    name: "name",
    company: "company",
    role: "role",
    concern: "concern",
    developer: "developer",
    "developer-job": "developerJob",
    outcome: "outcome",
    explanation: "explanation",
    ownership: "ownershipMode",
    "next-move": "moveType",
    "seven-day": "reviewDecision",
  };
  const field = requiredText[screen];
  if (field && typeof answers[field] === "string" && !answers[field].trim()) {
    return "Add a short answer, or choose the unsure option when one is available.";
  }
  if (screen === "platform" && (
    !answers.platform.trim()
    || answers.platformSurfaces.length === 0
    || (answers.platformSurfaces.includes("Something else") && !answers.platformSurfaceOther.trim())
  )) {
    return "Name the platform and choose one or two surfaces that best match it.";
  }
  if (screen === "role" && answers.role === "Something else" && !answers.roleOther.trim()) {
    return "Describe your role in a few words.";
  }
  if (screen === "concern" && !answers.concernPattern) {
    return "Choose the pattern that is closest to what you see.";
  }
  if (screen === "developer" && !answers.actorType) {
    return "Choose who performed the path, including unknown when that is the honest answer.";
  }
  if (screen === "outcome" && !answers.outcomeCheck) {
    return "Choose what kind of milestone your answer describes.";
  }
  if (screen === "last-truth" && !answers.lastStage) {
    return "Choose where your direct observation ends.";
  }
  if (screen === "evidence" && answers.evidenceTypes.length === 0) {
    return "Choose every evidence source that actually supports the explanation, including no evidence yet.";
  }
  if (screen === "discriminator" && answers.discriminatorAnswerIds.length === 0) {
    return "Choose the answer that is closest to what was actually observed.";
  }
  if (screen === "next-move" && !answers.nextMove.trim()) {
    return "Describe the smallest next move, even if the move is to gather evidence or wait.";
  }
  if (screen === "seven-day" && !answers.reviewDate) {
    return "Choose the date when you will compare the evidence and decide what changed.";
  }
  return checkSemanticQuality ? guidedAnswerQualityMessage(screen, answers) : null;
}

function Progress({ phase }: { phase: PhaseId }) {
  const activeIndex = phaseLabels.findIndex((item) => item.id === phase);
  return (
    <nav className="phase-progress" aria-label="Case progress">
      <ol>
        {phaseLabels.map((item, index) => (
          <li
            className={index < activeIndex ? "is-done" : index === activeIndex ? "is-current" : ""}
            key={item.id}
            aria-current={index === activeIndex ? "step" : undefined}
          >
            <span className="phase-dot" aria-hidden="true" />
            <span className="phase-name">{item.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function App() {
  const [savedSession, setSavedSession] = useState(() => loadSession());
  const initialGuidanceMode = savedSession?.guidanceMode ?? "guided";
  const adaptiveCredentialAtStart = useMemo(
    () => adaptiveEnabled ? loadAdaptiveCredential() : null,
    [],
  );
  const [screen, setScreen] = useState<ScreenId>("welcome");
  const [history, setHistory] = useState<ScreenId[]>([]);
  const [answers, setAnswers] = useState<CaseAnswers>(emptyAnswers);
  const [error, setError] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [showShortRoute, setShowShortRoute] = useState(false);
  const [pendingImport, setPendingImport] = useState<PortableCase | null>(null);
  const [adaptiveCredential, setAdaptiveCredential] = useState<AdaptiveCredential | null>(adaptiveCredentialAtStart);
  const [guidanceMode, setGuidanceMode] = useState<"adaptive" | "guided">(
    initialGuidanceMode,
  );
  const adaptiveCredentialRef = useRef<AdaptiveCredential | null>(adaptiveCredentialAtStart);
  const [adaptivePrompt, setAdaptivePrompt] = useState<AdaptiveNextQuestion | null>(null);
  const [adaptivePromptText, setAdaptivePromptText] = useState("");
  const [adaptivePromptOptions, setAdaptivePromptOptions] = useState<string[]>([]);
  const [adaptiveReflection, setAdaptiveReflection] = useState("");
  const [adaptiveRecovery, setAdaptiveRecovery] = useState<AdaptiveRecovery | null>(
    adaptiveCredentialAtStart?.recovery ?? null,
  );
  const [adaptiveStatus, setAdaptiveStatus] = useState<"off" | "ready" | "working" | "fallback" | "deleting">(
    adaptiveEnabled && initialGuidanceMode === "adaptive" ? "ready" : "off",
  );
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const modalReturnFocusRef = useRef<HTMLElement | null>(null);
  const phase = screen === "adaptive" && adaptivePrompt
    ? phaseForObjective(adaptivePrompt.objectiveId)
    : phaseForScreen(screen);
  const discriminator = selectDiscriminatorQuestion(answers);
  const discriminatorResult = explainSelection(answers.discriminatorQuestionId, answers.discriminatorAnswerIds);
  const actionBrief = compileActionBrief(answers);
  const diagnosticCase = useMemo(() => caseAnswersToDiagnosticCase(answers), [answers]);
  const diagnosticState = useMemo(() => deriveDiagnosticState(diagnosticCase), [diagnosticCase]);
  const stopDecision = useMemo(
    () => evaluateStopCondition(diagnosticCase, diagnosticState),
    [diagnosticCase, diagnosticState],
  );
  const liveResearchFamilies = diagnosticState.candidateFamilies
    .filter((candidate) => ["live", "needs_observation"].includes(candidate.evidenceState))
    .map((candidate) => candidate.label);
  const platformResearchGroups = useMemo(
    () => getPlatformResearchGroups(answers.platformSurfaces),
    [answers.platformSurfaces],
  );
  const platformResearchReasonCount = platformResearchGroups.reduce((total, group) => total + group.reasons.length, 0);
  const adaptiveClarificationEntries = Object.entries(answers.adaptiveClarifications);

  function rememberAdaptiveCredential(credential: AdaptiveCredential | null) {
    adaptiveCredentialRef.current = credential;
    setAdaptiveCredential(credential);
    setAdaptiveRecovery(credential?.recovery ?? null);
    if (credential) saveAdaptiveCredential(credential);
    else clearAdaptiveCredential();
  }

  function rememberAdaptiveRecovery(recovery: AdaptiveRecovery | null) {
    const credential = adaptiveCredentialRef.current;
    if (!credential) {
      setAdaptiveRecovery(recovery);
      return;
    }
    const { recovery: _previousRecovery, ...baseCredential } = credential;
    rememberAdaptiveCredential(recovery ? { ...baseCredential, recovery } : baseCredential);
  }

  useEffect(() => {
    if (screen === "welcome" && history.length === 0 && answers === emptyAnswers) return;
    saveSession({
      version: 1,
      guidanceMode,
      screen,
      history,
      answers,
      updatedAt: new Date().toISOString(),
    });
  }, [answers, guidanceMode, history, screen]);

  useEffect(() => {
    document.querySelector<HTMLElement>("#question-title, #summary-title")?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  useEffect(() => {
    if (screen !== "discriminator") return;
    if (answers.discriminatorQuestionId === discriminator.id) return;
    setAnswers((current) => ({
      ...current,
      discriminatorQuestionId: discriminator.id,
      discriminatorAnswerIds: [],
    }));
  }, [answers.discriminatorQuestionId, discriminator.id, screen]);

  useEffect(() => {
    if (!showReset && !pendingImport) return;
    function handleModalKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (showReset) setShowReset(false);
        if (pendingImport) setPendingImport(null);
        requestAnimationFrame(() => modalReturnFocusRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleModalKeys);
    return () => document.removeEventListener("keydown", handleModalKeys);
  }, [pendingImport, showReset]);

  function updateAnswer<K extends keyof CaseAnswers>(key: K, value: CaseAnswers[K]) {
    setAnswers((current) => {
      const invalidatesResearchSelection: Array<keyof CaseAnswers> = [
        "platformSurfaces",
        "platformSurfaceOther",
        "concern",
        "concernPattern",
        "developer",
        "actorType",
        "developerJob",
        "outcome",
        "outcomeCheck",
        "lastStage",
        "lastTruth",
        "explanation",
        "evidenceTypes",
        "evidenceDetail",
        "alternative",
      ];
      const changed = current[key] !== value;
      const correctedObjective = changed ? answerObjective[key] : undefined;
      const adaptiveClarifications = correctedObjective
        ? Object.fromEntries(Object.entries(current.adaptiveClarifications).filter(([objectiveId]) => (
            diagnosticObjectiveOrder.indexOf(objectiveId as ObjectiveId) < diagnosticObjectiveOrder.indexOf(correctedObjective)
          )))
        : current.adaptiveClarifications;
      if (invalidatesResearchSelection.includes(key) && changed) {
        return {
          ...current,
          [key]: value,
          adaptiveClarifications,
          adaptiveCandidates: [],
          adaptiveTerminalState: "",
          discriminatorQuestionId: "",
          discriminatorAnswerIds: [],
        };
      }
      return {
        ...current,
        [key]: value,
        adaptiveClarifications,
        ...(correctedObjective ? { adaptiveCandidates: [], adaptiveTerminalState: "" } : {}),
      };
    });
    setShowShortRoute(false);
    setError("");
  }

  function goTo(next: ScreenId) {
    setHistory((current) => [...current, screen]);
    setScreen(next);
    setShowShortRoute(false);
    setError("");
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setScreen(previous);
    setShowShortRoute(false);
    setError("");
  }

  async function ensureAdaptiveSession(): Promise<AdaptiveCredential | null> {
    if (!adaptiveEnabled || guidanceMode === "guided" || adaptiveStatus === "fallback") return null;
    if (adaptiveCredentialRef.current) return adaptiveCredentialRef.current;
    try {
      const created = await createAdaptiveSession({
        platformArchetypeIds: resolvePlatformArchetypeIds(answers.platformSurfaces),
      }, AbortSignal.timeout(8_000));
      const credential: AdaptiveCredential = {
        sessionId: created.session.id,
        sessionToken: created.sessionToken,
        revision: created.session.revision,
        turnIds: {},
      };
      rememberAdaptiveCredential(credential);
      return credential;
    } catch {
      setAdaptiveStatus("fallback");
      return null;
    }
  }

  async function awaitAdaptiveCompletion(
    credential: AdaptiveCredential,
    response: AdaptiveTurnResponse,
  ): Promise<AdaptiveTurnResponse> {
    if (response.turn.status === "completed") return response;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 750));
      const turn = await getAdaptiveTurn(credential, response.turn.id, AbortSignal.timeout(4_000));
      if (turn.status === "failed") return { ...response, turn };
      if (turn.status === "completed") {
        const session = await getAdaptiveSession(credential, AbortSignal.timeout(4_000));
        return { ...response, session, turn };
      }
    }
    return response;
  }

  async function submitAdaptiveObjective(
    objectiveId: ObjectiveId,
    answer: AdaptiveAnswer,
  ): Promise<AdaptiveTurnResponse | null> {
    const credential = await ensureAdaptiveSession();
    if (!credential) return null;
    setAdaptiveStatus("working");
    try {
      const initial = await submitAdaptiveTurn({
        credential,
        idempotencyKey: crypto.randomUUID(),
        objectiveId,
        answer,
        correctionOfTurnId: screen === "adaptive" ? undefined : credential.turnIds[objectiveId],
        signal: AbortSignal.timeout(25_000),
      });
      const completed = await awaitAdaptiveCompletion(credential, initial);
      if (completed.turn.status !== "completed") {
        if (completed.turn.status === "failed" && completed.turn.retryable) {
          rememberAdaptiveRecovery({ turnId: completed.turn.id, objectiveId, action: "retry" });
        } else if (["accepted", "processing"].includes(completed.turn.status)) {
          rememberAdaptiveRecovery({ turnId: completed.turn.id, objectiveId, action: "check" });
        } else {
          setAdaptiveStatus("fallback");
          return null;
        }
        setAdaptiveStatus("ready");
        return null;
      }
      const { recovery: _recovery, ...credentialWithoutRecovery } = credential;
      const nextCredential: AdaptiveCredential = {
        ...credentialWithoutRecovery,
        revision: completed.session.revision,
        turnIds: recordObjectiveTurn(credential.turnIds, objectiveId, completed.turn.id),
      };
      rememberAdaptiveCredential(nextCredential);
      setAdaptiveReflection(completed.turn.result?.reflection ?? completed.session.state.lastReflection ?? "");
      setAdaptiveStatus("ready");
      return completed;
    } catch (caught) {
      if (caught instanceof AdaptiveRequestError && caught.code === "turn_retryable") {
        const details = caught.details as { turnId?: unknown } | undefined;
        if (typeof details?.turnId === "string") {
          rememberAdaptiveRecovery({ turnId: details.turnId, objectiveId, action: "retry" });
          setAdaptiveStatus("ready");
          return null;
        }
      }
      setAdaptiveStatus("fallback");
      return null;
    }
  }

  function resetAdaptivePrompt() {
    setAdaptivePrompt(null);
    setAdaptivePromptText("");
    setAdaptivePromptOptions([]);
  }

  function routeAdaptiveResponse(response: AdaptiveTurnResponse | null, submittedObjective: ObjectiveId): ScreenId | null {
    if (!response) return null;
    const nextQuestion = response.turn.result?.nextQuestion ?? response.session.state.nextQuestion;
    const terminalState = response.turn.result?.terminalState ?? response.session.state.terminalState;
    setAnswers((current) => ({
      ...current,
      adaptiveCandidates: (response.turn.result?.candidates ?? []).map((candidate) => ({
        catalogId: candidate.catalogId,
        evidenceState: candidate.evidenceState,
      })),
      adaptiveTerminalState: terminalState ?? "",
    }));
    if (terminalState || !nextQuestion) {
      resetAdaptivePrompt();
      return "summary";
    }
    if (nextQuestion.objectiveId === submittedObjective) {
      setAdaptivePrompt(nextQuestion);
      setAdaptivePromptText("");
      setAdaptivePromptOptions([]);
      return "adaptive";
    }
    resetAdaptivePrompt();
    return screenForObjective(nextQuestion.objectiveId);
  }

  async function recoverAdaptiveTurn() {
    const credential = adaptiveCredentialRef.current;
    const recovery = adaptiveRecovery;
    if (!credential || !recovery) {
      setAdaptiveStatus("fallback");
      return;
    }
    setAdaptiveStatus("working");
    setError("");
    try {
      let response: AdaptiveTurnResponse;
      if (recovery.action === "retry") {
        const existingTurn = await getAdaptiveTurn(credential, recovery.turnId, AbortSignal.timeout(8_000));
        if (existingTurn.status === "completed") {
          const session = await getAdaptiveSession(credential, AbortSignal.timeout(8_000));
          response = { session, turn: existingTurn, dispatchMode: "late_completion" };
        } else {
          response = await retryAdaptiveTurn(credential, recovery.turnId, AbortSignal.timeout(25_000));
        }
      } else {
        const turn = await getAdaptiveTurn(credential, recovery.turnId, AbortSignal.timeout(8_000));
        const session = await getAdaptiveSession(credential, AbortSignal.timeout(8_000));
        response = { session, turn, dispatchMode: "recovery_check" };
      }
      const completed = await awaitAdaptiveCompletion(credential, response);
      if (completed.turn.status === "failed" && completed.turn.retryable) {
        rememberAdaptiveRecovery({ ...recovery, action: "retry" });
        setAdaptiveStatus("ready");
        return;
      }
      if (completed.turn.status === "failed") {
        rememberAdaptiveRecovery(null);
        setAdaptiveReflection("The short-lived server copy of that answer expired. Your browser copy is still here, so you can submit it again or continue with the guided path.");
        setAdaptiveStatus("ready");
        return;
      }
      if (completed.turn.status !== "completed") {
        rememberAdaptiveRecovery({ ...recovery, action: "check" });
        setAdaptiveStatus("ready");
        return;
      }
      const { recovery: _recovery, ...credentialWithoutRecovery } = credential;
      const nextCredential: AdaptiveCredential = {
        ...credentialWithoutRecovery,
        revision: completed.session.revision,
        turnIds: recordObjectiveTurn(credential.turnIds, recovery.objectiveId, completed.turn.id),
      };
      rememberAdaptiveCredential(nextCredential);
      setAdaptiveReflection(completed.turn.result?.reflection ?? completed.session.state.lastReflection ?? "");
      setAdaptiveStatus("ready");
      const route = routeAdaptiveResponse(completed, recovery.objectiveId);
      if (route) goTo(route);
    } catch (caught) {
      if (caught instanceof AdaptiveRequestError && caught.code === "turn_retryable") {
        rememberAdaptiveRecovery({ ...recovery, action: "retry" });
        setAdaptiveStatus("ready");
        return;
      }
      setAdaptiveStatus("fallback");
    }
  }

  async function submitCurrentScreenToAdaptiveRuntime(): Promise<ScreenId | null> {
    switch (screen) {
      case "concern": {
        const response = await submitAdaptiveObjective("D1", {
          kind: "text",
          text: `${answers.concern}\nObserved pattern: ${answers.concernPattern}`,
        });
        return routeAdaptiveResponse(response, "D1");
      }
      case "developer-job": {
        const response = await submitAdaptiveObjective("D3", {
          kind: "text",
          text: `Developer: ${answers.developer}\nActor: ${answers.actorType}\nJob: ${answers.developerJob}`,
        });
        return routeAdaptiveResponse(response, "D3");
      }
      case "outcome": {
        const response = await submitAdaptiveObjective("D4", {
          kind: "text",
          text: `${answers.outcome}\nMilestone check: ${answers.outcomeCheck}`,
        });
        return routeAdaptiveResponse(response, "D4");
      }
      case "last-truth": {
        const stageResponse = await submitAdaptiveObjective("D5", { kind: "text", text: answers.lastStage });
        if (!stageResponse) return null;
        const stageRoute = routeAdaptiveResponse(stageResponse, "D5");
        if (stageRoute === "adaptive") return stageRoute;
        const eventResponse = await submitAdaptiveObjective("D6", {
          kind: answers.lastTruth.trim() ? "text" : "unknown",
          ...(answers.lastTruth.trim() ? { text: answers.lastTruth } : {}),
        } as AdaptiveAnswer);
        return routeAdaptiveResponse(eventResponse, "D6");
      }
      case "evidence": {
        const response = await submitAdaptiveObjective("D7", {
          kind: "text",
          text: `Current explanation: ${answers.explanation}\nEvidence types: ${answers.evidenceTypes.join(", ")}\nStrongest evidence: ${answers.evidenceDetail || "not stated"}`,
        });
        return routeAdaptiveResponse(response, "D7");
      }
      case "discriminator": {
        const selected = answers.discriminatorAnswerIds[0];
        const selectedOption = discriminator.options.find((option) => option.id === selected);
        const response = await submitAdaptiveObjective("D8", selected
          ? {
              kind: "single_choice",
              optionIds: [selected],
              text: selectedOption
                ? `Observed answer: ${selectedOption.label}\nNext distinguishing observation: ${selectedOption.nextObservation}`
                : undefined,
            }
          : { kind: "unknown" });
        return routeAdaptiveResponse(response, "D8");
      }
      case "ownership": {
        const response = await submitAdaptiveObjective("D9", {
          kind: "text",
          text: `${answers.ownershipMode}\n${answers.ownership}`,
        });
        return routeAdaptiveResponse(response, "D9");
      }
      case "next-move": {
        const response = await submitAdaptiveObjective("D10", {
          kind: "text",
          text: `${answers.moveType}\nMove: ${answers.nextMove}\nExpected signal: ${answers.expectedSignal || "not defined"}`,
        });
        return routeAdaptiveResponse(response, "D10");
      }
      default:
        return null;
    }
  }

  async function submitAdaptivePromptAnswer(): Promise<ScreenId | null> {
    if (!adaptivePrompt) return null;
    let answer: AdaptiveAnswer;
    let clarification = "";
    if (adaptivePrompt.inputMode === "text") {
      clarification = adaptivePromptText.trim();
      answer = clarification ? { kind: "text", text: clarification } : { kind: "unknown" };
    } else if (adaptivePrompt.inputMode === "single_choice") {
      clarification = adaptivePrompt.options.find((option) => option.id === adaptivePromptOptions[0])?.label ?? "";
      answer = adaptivePromptOptions[0]
        ? {
            kind: "single_choice",
            optionIds: [adaptivePromptOptions[0]],
            text: clarification,
          }
        : { kind: "unknown" };
    } else {
      clarification = adaptivePrompt.options
        .filter((option) => adaptivePromptOptions.includes(option.id))
        .map((option) => option.label)
        .join("; ");
      answer = adaptivePromptOptions.length > 0
        ? {
            kind: "multi_choice",
            optionIds: adaptivePromptOptions,
            text: clarification,
          }
        : { kind: "unknown" };
    }
    const objectiveId = adaptivePrompt.objectiveId;
    if (clarification) {
      setAnswers((current) => {
        const previous = current.adaptiveClarifications[objectiveId];
        const combined = previous && previous !== clarification
          ? `${previous}\n${clarification}`
          : clarification;
        return {
          ...current,
          adaptiveClarifications: {
            ...current.adaptiveClarifications,
            [objectiveId]: combined,
          },
        };
      });
    }
    const response = await submitAdaptiveObjective(objectiveId, answer);
    return routeAdaptiveResponse(response, objectiveId);
  }

  async function continueFromCurrent(event?: FormEvent) {
    event?.preventDefault();
    if (screen === "adaptive" && adaptivePrompt) {
      const hasAnswer = adaptivePrompt.inputMode === "text"
        ? adaptivePromptText.trim().length > 0
        : adaptivePromptOptions.length > 0;
      if (!hasAnswer) {
        setError("Add a short answer, or choose the closest option.");
        return;
      }
      const route = await submitAdaptivePromptAnswer();
      if (adaptiveCredentialRef.current?.recovery) return;
      goTo(route ?? fallbackScreenAfterObjective(adaptivePrompt.objectiveId));
      return;
    }
    const usingAdaptiveHelp = adaptiveEnabled && guidanceMode === "adaptive" && adaptiveStatus !== "fallback";
    if (!usingAdaptiveHelp && boredomOrIrritation.test(currentGuidedText(screen, answers))) {
      setShowShortRoute(true);
      setError("");
      return;
    }
    const message = validationMessage(screen, answers, !usingAdaptiveHelp);
    if (message) {
      setError(message);
      return;
    }
    const adaptiveRoute = await submitCurrentScreenToAdaptiveRuntime();
    if (adaptiveCredentialRef.current?.recovery) return;
    if (!adaptiveRoute && usingAdaptiveHelp) {
      const guidedFallbackMessage = guidedAnswerQualityMessage(screen, answers);
      if (guidedFallbackMessage) {
        setError(guidedFallbackMessage);
        return;
      }
    }
    goTo(adaptiveRoute ?? (screen === "seven-day" ? "summary" : nextScreen(screen)));
  }

  function finishWithCurrentEvidence() {
    goTo("summary");
  }

  function removeInterruptionText() {
    setAnswers((current) => {
      switch (screen) {
        case "concern": return { ...current, concern: "" };
        case "developer": return { ...current, developer: "" };
        case "developer-job": return { ...current, developerJob: "" };
        case "outcome": return { ...current, outcome: "" };
        case "last-truth": return { ...current, lastTruth: "" };
        case "explanation": return { ...current, explanation: "" };
        case "evidence": return { ...current, evidenceDetail: "" };
        case "ownership": return { ...current, ownership: "" };
        case "next-move": return { ...current, nextMove: "", expectedSignal: "" };
        case "seven-day": return { ...current, reviewNotes: "" };
        default: return current;
      }
    });
  }

  function finishAfterInterruption() {
    removeInterruptionText();
    setShowShortRoute(false);
    goTo("summary");
  }

  function correctAfterInterruption() {
    removeInterruptionText();
    setShowShortRoute(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("main textarea, main input:not([type='radio']):not([type='checkbox'])")?.focus());
  }

  async function resume() {
    if (!savedSession) return;
    setAnswers(savedSession.answers);
    setHistory(savedSession.history);
    setGuidanceMode(savedSession.guidanceMode);
    if (adaptiveCredentialRef.current) {
      try {
        const session = await getAdaptiveSession(adaptiveCredentialRef.current, AbortSignal.timeout(8_000));
        const nextCredential = { ...adaptiveCredentialRef.current, revision: session.revision };
        rememberAdaptiveCredential(nextCredential);
        if (nextCredential.recovery) {
          const turn = await getAdaptiveTurn(nextCredential, nextCredential.recovery.turnId, AbortSignal.timeout(8_000));
          if (isObjectiveId(turn.objectiveId) && turn.status === "failed" && !turn.retryable) {
            rememberAdaptiveRecovery(null);
            setAdaptiveReflection("The short-lived server copy of that answer expired. Your browser copy is still here, so you can submit it again or continue with the guided path.");
            setAdaptiveStatus("ready");
            setScreen(savedSession.screen === "adaptive"
              ? fallbackScreenAfterObjective(turn.objectiveId)
              : savedSession.screen);
            return;
          }
          if (isObjectiveId(turn.objectiveId) && ["accepted", "processing", "failed", "completed"].includes(turn.status)) {
            rememberAdaptiveRecovery({
              turnId: turn.id,
              objectiveId: turn.objectiveId,
              action: turn.status === "failed" && turn.retryable ? "retry" : "check",
            });
            setAdaptiveStatus("ready");
            setScreen(savedSession.screen === "adaptive"
              ? fallbackScreenAfterObjective(turn.objectiveId)
              : savedSession.screen);
            return;
          }
          rememberAdaptiveRecovery(null);
        }
        if (session.pendingTurnId) {
          const turn = await getAdaptiveTurn(nextCredential, session.pendingTurnId, AbortSignal.timeout(8_000));
          if (isObjectiveId(turn.objectiveId) && turn.status === "failed" && !turn.retryable) {
            rememberAdaptiveRecovery(null);
            setAdaptiveReflection("The short-lived server copy of that answer expired. Your browser copy is still here, so you can submit it again or continue with the guided path.");
            setAdaptiveStatus("ready");
            setScreen(savedSession.screen === "adaptive"
              ? fallbackScreenAfterObjective(turn.objectiveId)
              : savedSession.screen);
            return;
          }
          if (isObjectiveId(turn.objectiveId) && ["accepted", "processing", "failed"].includes(turn.status)) {
            rememberAdaptiveRecovery({
              turnId: turn.id,
              objectiveId: turn.objectiveId,
              action: turn.status === "failed" && turn.retryable ? "retry" : "check",
            });
            setAdaptiveStatus("ready");
            setScreen(savedSession.screen === "adaptive"
              ? fallbackScreenAfterObjective(turn.objectiveId)
              : savedSession.screen);
            return;
          }
        }
        if (savedSession.screen === "adaptive" && session.state.nextQuestion) {
          setAdaptivePrompt(session.state.nextQuestion);
          setScreen("adaptive");
          return;
        }
        if (savedSession.screen === "adaptive" || session.status === "complete") {
          setScreen(session.status === "complete" ? "summary" : "name");
          return;
        }
      } catch {
        setAdaptiveStatus("fallback");
      }
    }
    setScreen(savedSession.screen === "welcome" || savedSession.screen === "adaptive" ? "name" : savedSession.screen);
  }

  function closeReset() {
    setShowReset(false);
    requestAnimationFrame(() => modalReturnFocusRef.current?.focus());
  }

  function closeImport() {
    setPendingImport(null);
    requestAnimationFrame(() => modalReturnFocusRef.current?.focus());
  }

  async function reset() {
    if (adaptiveCredential) {
      setAdaptiveStatus("deleting");
      try {
        await deleteAdaptiveSession(adaptiveCredential, AbortSignal.timeout(8_000));
      } catch {
        setAdaptiveStatus("ready");
        setShowReset(false);
        setError("We could not confirm deletion of the short-lived server session. Your browser copy is still here so you can retry.");
        return;
      }
    }
    clearSession();
    setSavedSession(null);
    rememberAdaptiveCredential(null);
    setAnswers(emptyAnswers);
    setHistory([]);
    setScreen("welcome");
    setShowReset(false);
    setError("");
    setAdaptiveReflection("");
    resetAdaptivePrompt();
    setAdaptiveStatus("off");
    setGuidanceMode("guided");
  }

  async function previewImport(file: File | undefined) {
    if (!file) return;
    try {
      setPendingImport(parsePortableCase(await file.text()));
      setError("");
    } catch {
      setPendingImport(null);
      setError("That file is not a valid First Mile case. Your current work has not changed.");
    }
  }

  async function acceptImport() {
    if (!pendingImport) return;
    if (adaptiveCredentialRef.current) {
      setAdaptiveStatus("deleting");
      try {
        await deleteAdaptiveSession(adaptiveCredentialRef.current, AbortSignal.timeout(8_000));
      } catch {
        setAdaptiveStatus("ready");
        setError("We could not close the previous adaptive session. Your current case is unchanged, so you can retry safely.");
        return;
      }
    }
    rememberAdaptiveCredential(null);
    setGuidanceMode("guided");
    setAdaptiveStatus("off");
    setAdaptiveReflection("");
    resetAdaptivePrompt();
    setAnswers(pendingImport.answers);
    setHistory([]);
    setScreen("summary");
    setPendingImport(null);
    setError("");
  }

  function exportJson() {
    const filename = `${safeFilename(answers.platform || answers.company, "first-mile-case")}.json`;
    downloadText(
      filename,
      serializePortableCase(createPortableCase(answers, catalog.catalogVersion)),
      "application/json;charset=utf-8",
    );
  }

  function exportMarkdown() {
    const filename = `${safeFilename(answers.platform || answers.company, "first-mile-brief")}.md`;
    downloadText(
      filename,
      actionBriefToMarkdown(actionBrief, catalog.catalogVersion),
      "text/markdown;charset=utf-8",
    );
  }

  function startSevenDayCheck() {
    if (!answers.reviewDate) {
      const reviewDate = new Date();
      reviewDate.setDate(reviewDate.getDate() + 7);
      updateAnswer("reviewDate", localDateValue(reviewDate));
    }
    goTo("seven-day");
  }

  const primaryLabel = screen === "next-move" ? "See what this supports" : "Save and continue";

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="wordmark" aria-label={friendlyCopy.title}>
          <span className="wordmark-mark" aria-hidden="true">1</span>
          <span>{friendlyCopy.title}</span>
        </div>
        {screen !== "welcome" ? (
          <button
            className="quiet-button"
            type="button"
            ref={resetTriggerRef}
            onClick={(event) => {
              modalReturnFocusRef.current = event.currentTarget;
              setShowReset(true);
            }}
          >
            Start over
          </button>
        ) : null}
      </header>

      {screen !== "welcome" && screen !== "summary" ? <Progress phase={phase} /> : null}

      <main className={screen === "welcome" ? "main welcome-main" : "main"}>
        {screen !== "welcome" && screen !== "summary" && adaptiveReflection ? (
          <aside className="adaptive-reflection" aria-live="polite">
            <span aria-hidden="true">↳</span>
            <p>{adaptiveReflection}</p>
          </aside>
        ) : null}
        {screen !== "welcome" && adaptiveRecovery ? (
          <aside className="adaptive-recovery" role="status">
            <div>
              <strong>Your answer is safe.</strong>
              <p>
                {adaptiveRecovery.action === "retry"
                  ? "The follow-up could not finish, but the saved answer can be retried without typing it again."
                  : "The follow-up is taking longer than expected. You can check it while the guided path stays available."}
              </p>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={adaptiveStatus === "working"}
              onClick={() => void recoverAdaptiveTurn()}
            >
              {adaptiveStatus === "working"
                ? "Checking…"
                : adaptiveRecovery.action === "retry"
                  ? "Retry saved answer"
                  : "Check saved answer"}
            </button>
          </aside>
        ) : null}
        {screen !== "welcome" && adaptiveStatus === "fallback" ? (
          <p className="adaptive-fallback" role="status">
            Adaptive help is unavailable. Your answers are still saved here, and the guided version will keep working.
          </p>
        ) : null}
        {screen !== "welcome" && screen !== "summary" && showShortRoute ? (
          <aside className="short-route" role="status" aria-labelledby="short-route-title">
            <div>
              <h2 id="short-route-title">Let’s make this shorter.</h2>
              <p>You can finish with the evidence already in this case, or clear this answer and correct it.</p>
            </div>
            <div className="short-route-actions">
              <button className="primary-button" type="button" onClick={finishAfterInterruption}>Finish with what we have</button>
              <button className="secondary-button" type="button" onClick={correctAfterInterruption}>Let me correct my answer</button>
            </div>
          </aside>
        ) : null}
        {screen === "welcome" ? (
          <section className="welcome" aria-labelledby="welcome-title">
            <div className="welcome-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="eyebrow">A guided first-mile check</p>
            <h1 id="welcome-title">{friendlyCopy.welcomeTitle}</h1>
            <p className="welcome-body">{friendlyCopy.welcomeBody}</p>
            <p className="welcome-time">{friendlyCopy.welcomeTime}</p>
            {adaptiveEnabled ? (
              <fieldset className="guidance-choice">
                <legend>How should this case be guided?</legend>
                <label>
                  <input
                    type="radio"
                    name="guidance-mode"
                    value="adaptive"
                    checked={guidanceMode === "adaptive"}
                    onChange={() => {
                      setGuidanceMode("adaptive");
                      setAdaptiveStatus("ready");
                    }}
                  />
                  <span><strong>Adaptive help</strong><small>Allows short follow-up questions when an answer needs clarification.</small></span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="guidance-mode"
                    value="guided"
                    checked={guidanceMode === "guided"}
                    onChange={() => {
                      setGuidanceMode("guided");
                      setAdaptiveStatus("off");
                    }}
                  />
                  <span><strong>Guided only</strong><small>Keeps the full case in this browser and uses the fixed path.</small></span>
                </label>
              </fieldset>
            ) : null}
            <div className="welcome-actions">
              <button className="primary-button" type="button" onClick={() => goTo("name")}>
                Start a case
              </button>
              {savedSession ? (
                <button className="secondary-button" type="button" onClick={() => void resume()}>
                  Resume saved case
                </button>
              ) : null}
              <label className="secondary-button file-button">
                Import a saved case
                <input
                  className="visually-hidden"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    modalReturnFocusRef.current = event.currentTarget;
                    void previewImport(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <div className="trust-note">
              <strong>Your case stays yours.</strong>
              <p>{adaptiveEnabled && guidanceMode === "adaptive"
                ? "Use roles or aliases. Your name and company stay in this browser. Diagnostic answers may be processed in a short-lived server session so adaptive help can respond. Do not paste secrets, customer data, or private incident details."
                : friendlyCopy.privacy}</p>
            </div>
          </section>
        ) : null}

        {screen === "name" ? (
          <QuestionShell eyebrow="Set the scene · 1 of 4" title="What should we call you?" support="A first name or nickname is enough.">
            <TextField id="name" label="Name" value={answers.name} onChange={(value) => updateAnswer("name", value)} autoComplete="given-name" />
          </QuestionShell>
        ) : null}

        {screen === "company" ? (
          <QuestionShell
            eyebrow="Set the scene · 2 of 4"
            title={`Which company, team, or project are we looking at${answers.name ? `, ${answers.name}` : ""}?`}
            support="This gives the case a boundary. It is not used to look anything up. An alias is fine."
          >
            <TextField id="company" label="Company, team, or project" value={answers.company} onChange={(value) => updateAnswer("company", value)} autoComplete="organization" />
          </QuestionShell>
        ) : null}

        {screen === "platform" ? (
          <QuestionShell
            eyebrow="Set the scene · 3 of 4"
            title="Which developer-facing platform is this about?"
            support="Name the product, then choose up to two surfaces developers actually touch."
          >
            <TextField
              id="platform"
              label="Platform or product"
              value={answers.platform}
              onChange={(value) => updateAnswer("platform", value)}
              hint="A company can have several developer platforms. Pick the one involved in this journey."
            />
            <MultiChoiceGroup
              legend="What are developers working with?"
              values={answers.platformSurfaces}
              choices={platformSurfaceChoices}
              onChange={(values) => updateAnswer("platformSurfaces", values)}
              max={2}
              hint="Choose one or two. This narrows the research without assuming the company has only one platform type."
            />
            {answers.platformSurfaces.includes("Something else") ? (
              <TextField
                id="platform-surface-other"
                label="Describe the developer surface"
                value={answers.platformSurfaceOther}
                onChange={(value) => updateAnswer("platformSurfaceOther", value)}
                hint="This stays in your browser. The result will mark the catalog boundary instead of forcing it into the wrong platform type."
              />
            ) : null}
          </QuestionShell>
        ) : null}

        {screen === "role" ? (
          <QuestionShell
            eyebrow="Set the scene · 4 of 4"
            title="What is your role in this developer journey?"
            support="Choose the closest fit. We’ll keep the next move inside your real influence."
          >
            <ChoiceGroup legend="Your primary role" value={answers.role} choices={roleChoices} onChange={(value) => updateAnswer("role", value)} />
            {answers.role === "Something else" ? (
              <TextField id="role-other" label="Describe your role" value={answers.roleOther} onChange={(value) => updateAnswer("roleOther", value)} />
            ) : null}
          </QuestionShell>
        ) : null}

        {screen === "concern" ? (
          <QuestionShell
            eyebrow="Frame the case"
            title="What are you worried developers are not doing?"
            support="Describe the behavior you can see, not the reason you think it happens."
          >
            <TextArea
              id="concern"
              label="The concerning behavior"
              value={answers.concern}
              onChange={(value) => updateAnswer("concern", value)}
              hint="For example: We do not see developers returning after they create a test project."
            />
            <ChoiceGroup legend="Which pattern is closest?" value={answers.concernPattern} choices={concernPatternChoices} onChange={(value) => updateAnswer("concernPattern", value)} />
            <WhyThisQuestion>A product is not the problem by itself. The behavior and rough stopping pattern tell us which explanations can still fit.</WhyThisQuestion>
          </QuestionShell>
        ) : null}

        {screen === "developer" ? (
          <QuestionShell
            eyebrow="Frame the case"
            title="Which developers are we talking about?"
            support="Name a role and enough context to distinguish this group from everyone else."
          >
            <TextArea
              id="developer"
              label="Developer and context"
              value={answers.developer}
              onChange={(value) => updateAnswer("developer", value)}
              hint="For example: Backend engineers at large companies who manage their organization’s integrations."
              rows={4}
            />
            <ChoiceGroup legend="Who performed the path?" value={answers.actorType} choices={actorTypeChoices} onChange={(value) => updateAnswer("actorType", value)} />
          </QuestionShell>
        ) : null}

        {screen === "developer-job" ? (
          <QuestionShell
            eyebrow="Frame the case"
            title="What are those developers trying to get done?"
            support="Describe their job, not the platform feature they must use."
          >
            <TextArea
              id="developer-job"
              label="The developer’s job"
              value={answers.developerJob}
              onChange={(value) => updateAnswer("developerJob", value)}
              hint="For example: Know when a meeting starts or stops so their system can update employee activity records."
            />
          </QuestionShell>
        ) : null}

        {screen === "outcome" ? (
          <QuestionShell
            eyebrow="Frame the case"
            title="What would count as their first meaningful success?"
            support="Use a result they can independently see or verify."
          >
            <TextArea id="outcome" label="They can independently verify that..." value={answers.outcome} onChange={(value) => updateAnswer("outcome", value)} />
            <ChoiceGroup legend="What kind of milestone is that?" value={answers.outcomeCheck} choices={outcomeCheckChoices} onChange={(value) => updateAnswer("outcomeCheck", value)} />
          </QuestionShell>
        ) : null}

        {screen === "last-truth" ? (
          <QuestionShell
            eyebrow="Locate the stop"
            title="Where does your direct observation end?"
            support="Choose the furthest point you can support, then add the useful detail."
          >
            <ChoiceGroup legend="Last observed stage" value={answers.lastStage} choices={lastStageChoices} onChange={(value) => updateAnswer("lastStage", value)} />
            <TextArea
              id="last-truth"
              label="What did you actually observe?"
              value={answers.lastTruth}
              onChange={(value) => updateAnswer("lastTruth", value)}
              hint="Leave the reason out for now. If you only have aggregate data, say that."
              rows={4}
            />
            <WhyThisQuestion>This keeps an observation from quietly turning into a cause.</WhyThisQuestion>
            <button className="finish-link" type="button" onClick={finishWithCurrentEvidence}>Finish with what we have</button>
          </QuestionShell>
        ) : null}

        {screen === "explanation" ? (
          <QuestionShell
            eyebrow="Test explanations"
            title="What explanation is your team carrying right now?"
            support="Give us the current story, even if you suspect it is incomplete."
          >
            <TextArea id="explanation" label="Current explanation" value={answers.explanation} onChange={(value) => updateAnswer("explanation", value)} rows={4} />
            <button className="text-button" type="button" onClick={() => updateAnswer("explanation", "We do not have a clear explanation yet.")}>We do not have one yet</button>
            <button className="finish-link" type="button" onClick={finishWithCurrentEvidence}>Finish with what we have</button>
          </QuestionShell>
        ) : null}

        {screen === "evidence" ? (
          <QuestionShell
            eyebrow="Test explanations"
            title="What actually supports that explanation?"
            support="Choose every source that applies. Several kinds of evidence can coexist."
          >
            <MultiChoiceGroup
              legend="Evidence sources"
              values={answers.evidenceTypes}
              choices={evidenceChoices}
              exclusiveChoices={["No evidence yet"]}
              onChange={(values) => updateAnswer("evidenceTypes", values)}
            />
            <TextArea
              id="evidence-detail"
              label="What is the strongest specific evidence?"
              value={answers.evidenceDetail}
              onChange={(value) => updateAnswer("evidenceDetail", value)}
              hint="If the answer is an assumption or no evidence yet, say what observation would separate the live explanations."
              rows={4}
            />
            <button className="finish-link" type="button" onClick={finishWithCurrentEvidence}>Finish with what we have</button>
          </QuestionShell>
        ) : null}

        {screen === "discriminator" ? (
          <QuestionShell
            eyebrow="Test explanations"
            title={discriminator.prompt}
            support={discriminator.support}
          >
            <ChoiceGroup
              legend="Closest observed answer"
              value={answers.discriminatorAnswerIds[0] ?? ""}
              choices={discriminator.options.map((option) => option.label)}
              onChange={(label) => {
                const option = discriminator.options.find((candidate) => candidate.label === label);
                if (!option) return;
                setAnswers((current) => ({
                  ...current,
                  discriminatorQuestionId: discriminator.id,
                  discriminatorAnswerIds: [option.id],
                }));
                setError("");
              }}
            />
            <WhyThisQuestion>
              Each answer changes which researched explanations remain live. If none is supported, the result stays underdetermined.
            </WhyThisQuestion>
            <button className="finish-link" type="button" onClick={finishWithCurrentEvidence}>Finish with what we have</button>
          </QuestionShell>
        ) : null}

        {screen === "ownership" ? (
          <QuestionShell
            eyebrow="Choose a move"
            title="What relationship do you have to the next move?"
            support="Ownership is about the decision or work, not merely the team name."
          >
            <ChoiceGroup legend="Your position" value={answers.ownershipMode} choices={ownershipChoices} onChange={(value) => updateAnswer("ownershipMode", value)} />
            <TextArea
              id="ownership"
              label="What can you do, or what exactly do you need from another role?"
              value={answers.ownership}
              onChange={(value) => updateAnswer("ownership", value)}
              rows={4}
            />
            <button className="finish-link" type="button" onClick={finishWithCurrentEvidence}>Finish with what we have</button>
          </QuestionShell>
        ) : null}

        {screen === "next-move" ? (
          <QuestionShell
            eyebrow="Choose a move"
            title="What is the smallest move that would teach you something useful?"
            support="An investigation, a handoff, or deliberately leaving the platform unchanged can all be valid."
          >
            <ChoiceGroup legend="Move type" value={answers.moveType} choices={moveTypeChoices} onChange={(value) => updateAnswer("moveType", value)} />
            <TextArea id="next-move" label="Within seven days, we will..." value={answers.nextMove} onChange={(value) => updateAnswer("nextMove", value)} rows={4} />
            <TextArea
              id="expected-signal"
              label="If that helps, what should the developer do differently?"
              value={answers.expectedSignal}
              onChange={(value) => updateAnswer("expectedSignal", value)}
              rows={3}
            />
            <p className="inline-note">{friendlyCopy.uncertainty}</p>
          </QuestionShell>
        ) : null}

        {screen === "adaptive" && adaptivePrompt ? (
          <QuestionShell
            eyebrow="One useful follow-up"
            title={adaptivePrompt.prompt}
            support={adaptivePrompt.support}
          >
            {adaptivePrompt.inputMode === "text" ? (
              <TextArea
                id="adaptive-answer"
                label="Your answer"
                value={adaptivePromptText}
                onChange={(value) => {
                  setAdaptivePromptText(value);
                  setError("");
                }}
                rows={5}
              />
            ) : adaptivePrompt.inputMode === "single_choice" ? (
              <ChoiceGroup
                legend="Closest answer"
                value={adaptivePrompt.options.find((option) => option.id === adaptivePromptOptions[0])?.label ?? ""}
                choices={adaptivePrompt.options.map((option) => option.label)}
                onChange={(label) => {
                  const option = adaptivePrompt.options.find((candidate) => candidate.label === label);
                  setAdaptivePromptOptions(option ? [option.id] : []);
                  setError("");
                }}
              />
            ) : (
              <MultiChoiceGroup
                legend="Choose every answer that applies"
                values={adaptivePrompt.options.filter((option) => adaptivePromptOptions.includes(option.id)).map((option) => option.label)}
                choices={adaptivePrompt.options.map((option) => option.label)}
                onChange={(labels) => {
                  setAdaptivePromptOptions(adaptivePrompt.options.filter((option) => labels.includes(option.label)).map((option) => option.id));
                  setError("");
                }}
              />
            )}
            <WhyThisQuestion>This follow-up is allowed only because the previous answer did not resolve the current objective. If it still cannot separate the possibilities, the scanner will keep the result uncertain.</WhyThisQuestion>
            <button className="finish-link" type="button" onClick={finishWithCurrentEvidence}>Finish with what we have</button>
          </QuestionShell>
        ) : null}

        {screen === "summary" ? (
          <section className="summary" aria-labelledby="summary-title">
            <p className="eyebrow">What your answers support</p>
            <h1 id="summary-title" tabIndex={-1}>A case you can carry forward.</h1>
            <p className="summary-intro">This is a working formulation, not a verdict. Edit anything that overstates what you know.</p>
            <dl className="brief-list">
              <div><dt>Observed concern</dt><dd>{answers.adaptiveClarifications.D1 || answers.concern || "Not clear yet"}</dd><dd className="brief-meta">Pattern: {answers.concernPattern || "not classified"}</dd></div>
              <div><dt>Developer</dt><dd>{answers.developer || "Not clear yet"}</dd><dd className="brief-meta">Actor: {answers.actorType || "not known"}</dd></div>
              <div><dt>Developer’s job</dt><dd>{answers.developerJob || "Not clear yet"}</dd></div>
              <div><dt>First meaningful success</dt><dd>{answers.outcome || "Not clear yet"}</dd><dd className="brief-meta">Milestone check: {answers.outcomeCheck || "not classified"}</dd></div>
              <div><dt>Last observed truth</dt><dd>{answers.lastTruth || answers.lastStage || "Not observed yet"}</dd></div>
              <div><dt>Current explanation</dt><dd>{answers.explanation || "No explanation supported yet"}</dd><dd className="brief-meta">Evidence: {answers.evidenceTypes.join(", ") || "not classified"}</dd></div>
              <div>
                <dt>What the research narrows</dt>
                <dd>{[
                  ...liveResearchFamilies.slice(0, 5),
                  ...actionBrief.adaptiveResearchAreas,
                ].join("; ") || discriminatorResult[0]?.liveLabels.join("; ") || "No catalog explanation is supported yet"}</dd>
                <dd className="brief-meta">Status: {actionBrief.researchStatus.replaceAll("_", " ")}. This question narrows research areas; it does not establish a cause.</dd>
                {actionBrief.adaptiveTerminalState ? <dd className="brief-meta">Adaptive stop state: {actionBrief.adaptiveTerminalState.replaceAll("_", " ")}.</dd> : null}
                <dd className="brief-meta">Next observation: {actionBrief.nextObservation}</dd>
                <dd className="brief-meta">Why the scanner stopped here: {stopDecision.reason}</dd>
              </div>
              <div>
                <dt>Platform-specific research in scope</dt>
                <dd>{platformResearchGroups.map((group) => group.label).join("; ") || "The selected surface is not represented in the current catalog"}</dd>
                <dd className="brief-meta">
                  {platformResearchReasonCount > 0
                    ? `${platformResearchReasonCount} platform-specific possibilities are available for inspection. None is treated as supported without evidence.`
                    : "This is a catalog boundary, not permission to force the case into the nearest platform type."}
                </dd>
                {platformResearchGroups.length > 0 ? (
                  <dd className="research-details-wrap">
                    <details className="research-details">
                      <summary>Inspect platform-specific possibilities</summary>
                      <p>Use these as prompts for observation, not as a checklist of conclusions.</p>
                      {platformResearchGroups.map((group) => (
                        <section key={group.archetypeId} aria-labelledby={`research-${group.archetypeId}`}>
                          <h2 id={`research-${group.archetypeId}`}>{group.label}</h2>
                          <ul>
                            {group.reasons.map((reason) => <li key={reason.id}>{reason.label}</li>)}
                          </ul>
                        </section>
                      ))}
                    </details>
                  </dd>
                ) : null}
              </div>
              <div><dt>Next evidence-producing move</dt><dd>{answers.nextMove || "Not chosen yet"}</dd><dd className="brief-meta">Move type: {answers.moveType || "not chosen"}</dd></div>
              {adaptiveClarificationEntries.length > 0 ? (
                <div>
                  <dt>Follow-up clarifications</dt>
                  <dd>
                    <ul>
                      {adaptiveClarificationEntries.map(([objectiveId, value]) => (
                        <li key={objectiveId}><strong>{objectiveId}</strong>: {value}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
              {answers.reviewDate ? (
                <div>
                  <dt>Seven-day check</dt>
                  <dd>{answers.reviewDecision || "Decision not recorded yet"}</dd>
                  <dd className="brief-meta">Review date: {answers.reviewDate}. Evidence notes: {answers.reviewNotes || "none yet"}</dd>
                </div>
              ) : null}
            </dl>
            <div className="summary-callout">
              <strong>No intervention justified is a valid result.</strong>
              <p>If the evidence cannot separate the live explanations, the next move is to observe, not to guess.</p>
            </div>
            <div className="summary-actions">
              <button className="primary-button" type="button" onClick={() => goTo("concern")}>Edit this case</button>
              <button className="secondary-button" type="button" onClick={exportMarkdown}>Download Markdown</button>
              <button className="secondary-button" type="button" onClick={exportJson}>Export portable JSON</button>
              <button className="secondary-button" type="button" onClick={() => window.print()}>Print or save as PDF</button>
              <button className="secondary-button" type="button" onClick={startSevenDayCheck}>{answers.reviewDate ? "Review seven-day check" : "Start seven-day check"}</button>
            </div>
          </section>
        ) : null}

        {screen === "seven-day" ? (
          <QuestionShell
            eyebrow="Seven-day check"
            title="What changed after you gathered evidence?"
            support="Use this as a small decision checkpoint, not a promise that every case resolves in seven days."
          >
            <div className="field">
              <label htmlFor="review-date">Review date</label>
              <input
                id="review-date"
                type="date"
                value={answers.reviewDate}
                onChange={(event) => updateAnswer("reviewDate", event.target.value)}
              />
            </div>
            <TextArea
              id="review-notes"
              label="Evidence notes from days 1 to 6"
              value={answers.reviewNotes}
              onChange={(value) => updateAnswer("reviewNotes", value)}
              hint="Record observations, counterevidence, and surprises. Do not rewrite the original case to make the move look successful."
              rows={6}
            />
            <ChoiceGroup
              legend="On day 7, what does the evidence support?"
              value={answers.reviewDecision}
              choices={reviewDecisionChoices}
              onChange={(value) => updateAnswer("reviewDecision", value)}
            />
          </QuestionShell>
        ) : null}

        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </main>

      {screen !== "welcome" && screen !== "summary" ? (
        <form className="action-bar" onSubmit={continueFromCurrent}>
          <div className="action-bar-inner">
            <button className="back-button" type="button" onClick={goBack} disabled={history.length === 0}>Back</button>
            <button className="primary-button" type="submit" disabled={adaptiveStatus === "working" || adaptiveStatus === "deleting"}>
              {adaptiveStatus === "working" ? "Thinking…" : screen === "seven-day" ? "Save seven-day check" : primaryLabel}
            </button>
          </div>
        </form>
      ) : null}

      {showReset ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeReset}>
          <div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="reset-title">Delete this case and start over?</h2>
            <p>{adaptiveCredential
              ? "This first asks the server to delete the short-lived adaptive session, then removes the browser copy. If server deletion cannot be confirmed, the browser copy stays so you can retry."
              : "This removes the saved answers from this browser. It cannot be undone."}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={closeReset} autoFocus>Keep my case</button>
              <button className="danger-button" type="button" onClick={() => void reset()} disabled={adaptiveStatus === "deleting"}>{adaptiveStatus === "deleting" ? "Deleting…" : "Delete and start over"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingImport ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeImport}>
          <div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="import-title">Replace this browser’s case?</h2>
            <p>Review the file before replacing anything. Your current case stays unchanged until you confirm.</p>
            <dl className="import-preview">
              <div><dt>Boundary</dt><dd>{pendingImport.answers.company || "Not named"}</dd></div>
              <div><dt>Platform</dt><dd>{pendingImport.answers.platform || "Not named"}</dd></div>
              <div><dt>Concern</dt><dd>{pendingImport.answers.concern || "Not stated"}</dd></div>
            </dl>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={closeImport} autoFocus>Keep current case</button>
              <button className="primary-button" type="button" onClick={() => void acceptImport()} disabled={adaptiveStatus === "deleting"}>
                {adaptiveStatus === "deleting" ? "Closing previous session…" : "Open imported case"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
