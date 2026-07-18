import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ChoiceGroup,
  QuestionShell,
  TextArea,
  TextField,
  WhyThisQuestion,
} from "./components";
import {
  actorTypeChoices,
  breakEvidenceChoices,
  friendlyCopy,
  journeyTypeChoices,
  phaseLabels,
  platformSurfaceChoices,
  roleChoices,
} from "./copy";
import {
  clearAdaptiveCredential,
  deleteAdaptiveSession,
  loadAdaptiveCredential,
} from "./adaptive-client";
import {
  catalog,
  getFamiliesForStage,
  getReasonsForParent,
} from "./domain/catalog";
import { getPlatformResearchGroups } from "./domain/knowledge-graph";
import { explainSelection, selectDiscriminatorQuestion } from "./domain/question-routes";
import {
  createPortableCase,
  parsePortableCase,
  safeFilename,
  serializePortableCase,
  type PortableCase,
} from "./session-portability";
import { clearSession, loadSession, saveSession } from "./storage";
import {
  createDefaultJourneySteps,
  emptyAnswers,
  type ActiveScreenId,
  type CaseAnswers,
  type JourneyStep,
  type PhaseId,
  type ScreenId,
} from "./types";

const activeScreenOrder: ActiveScreenId[] = [
  "welcome",
  "profile",
  "platform-context",
  "developer",
  "journey-map",
  "break-point",
  "blocker",
  "summary",
];

const stageChoices = catalog.nodes
  .filter((node) => node.kind === "stage" && !["S00", "S08"].includes(node.id))
  .map((node) => ({ id: node.id, label: node.label }));

function isActiveScreen(screen: ScreenId): screen is ActiveScreenId {
  return activeScreenOrder.includes(screen as ActiveScreenId);
}

function normalizeScreen(screen: ScreenId): ActiveScreenId {
  if (screen === "first-mile") return "developer";
  if (isActiveScreen(screen)) return screen;
  return "profile";
}

function phaseForScreen(screen: ActiveScreenId): PhaseId {
  if (["profile", "platform-context"].includes(screen)) return "profile";
  if (screen === "developer") return "frame";
  if (screen === "journey-map") return "map";
  if (screen === "break-point") return "locate";
  if (screen === "blocker") return "test";
  return "complete";
}

function nextScreen(screen: ActiveScreenId): ActiveScreenId {
  return activeScreenOrder[Math.min(activeScreenOrder.indexOf(screen) + 1, activeScreenOrder.length - 1)];
}

function evidenceLabelToLegacy(label: string): string {
  return ({
    "I observed a real attempt": "Direct observation",
    "Product or platform data shows it": "Product or platform data",
    "Developers told us in interviews or support": "Developer interview",
    "The stage was completed with employee, partner, or support help": "Direct observation",
    "This is a team assumption or anecdote": "Assumption",
    "We do not have stage-level evidence": "No evidence yet",
  } as Record<string, string>)[label] ?? "No evidence yet";
}

function lastStageForCatalogStage(stageId: string): string {
  return ({
    S01: "No attempt observed",
    S02: "They found or evaluated the platform",
    S03: "They tried to get access or approval",
    S04: "They started setup or implementation",
    S05: "They started setup or implementation",
    S06: "They produced a first result",
    S07: "They verified a meaningful result",
  } as Record<string, string>)[stageId] ?? "We cannot locate the stop yet";
}

function legacyBreakStepId(lastStage: string): string {
  return ({
    "They found or evaluated the platform": "encounter",
    "They tried to get access or approval": "access",
    "They started setup or implementation": "setup",
    "They produced a first result": "signal",
    "They verified a meaningful result": "verify",
  } as Record<string, string>)[lastStage] ?? (lastStage === "No attempt observed" ? "encounter" : "cannot-tell");
}

function migrateAnswers(input: CaseAnswers): CaseAnswers {
  const journeySteps = input.journeySteps.length > 0
    ? input.journeySteps.map((step) => ({ ...step }))
    : createDefaultJourneySteps();
  return {
    ...emptyAnswers,
    ...input,
    journeySteps,
    journeyType: input.journeyType || "Make the core capability work once",
    meaningfulAction: input.meaningfulAction || input.outcome,
    verificationSignal: input.verificationSignal || input.expectedSignal || input.outcome,
    furthestReachedStepId: input.furthestReachedStepId || "",
    breakStepId: input.breakStepId || (input.lastStage ? legacyBreakStepId(input.lastStage) : ""),
    breakEvidenceType: input.breakEvidenceType || (
      input.evidenceTypes.includes("Product or platform data")
        ? "Product or platform data shows it"
        : input.evidenceTypes.includes("Direct observation")
          ? "I observed a real attempt"
          : input.evidenceTypes.includes("Developer interview")
            ? "Developers told us in interviews or support"
            : input.evidenceTypes.includes("Assumption")
              ? "This is a team assumption or anecdote"
              : input.evidenceTypes.includes("No evidence yet")
                ? "We do not have stage-level evidence"
                : ""
    ),
    breakEvidenceDetail: input.breakEvidenceDetail || input.lastTruth || input.evidenceDetail,
    issueStatement: input.issueStatement || input.explanation,
  };
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("*", "\\*").replaceAll("_", "\\_");
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

function validationMessage(screen: ActiveScreenId, answers: CaseAnswers): string | null {
  if (screen === "profile") {
    if (!answers.name.trim() || !answers.company.trim() || !answers.role.trim()) {
      return "Add a name or alias, a company or project boundary, and your role.";
    }
    if (answers.role === "Something else" && !answers.roleOther.trim()) return "Describe your role in a few words.";
  }
  if (screen === "platform-context") {
    if (!answers.platform.trim() || answers.platformSurfaces.length === 0) {
      return "Name the platform and choose one or two surfaces developers touch.";
    }
    if (answers.platformSurfaces.includes("Something else") && !answers.platformSurfaceOther.trim()) {
      return "Describe the developer surface so the research does not force it into the wrong type.";
    }
  }
  if (screen === "developer") {
    if (!answers.developer.trim() || !answers.developerJob.trim() || !answers.journeyType || !answers.actorType || !answers.meaningfulAction.trim() || !answers.verificationSignal.trim()) {
      return "Name one developer group, their real job, the journey, the first representative operation, and how they verify it.";
    }
  }
  if (screen === "journey-map") {
    const activeSteps = answers.journeySteps.filter((step) => step.status === "in-path" && step.label.trim());
    if (activeSteps.length < 3) return "Keep at least three steps in this journey.";
  }
  if (screen === "break-point") {
    if (!answers.furthestReachedStepId || !answers.breakStepId || !answers.breakEvidenceType) {
      return "Mark the furthest stage you can defend, the first unresolved point, and the evidence behind it.";
    }
  }
  if (screen === "blocker") {
    if (answers.discriminatorAnswerIds.length !== 1) return "Choose the closest observed answer.";
    if (!answers.issueStatement.trim()) return "Name what you think is happening, or choose the evidence-gap option.";
  }
  return null;
}

function Progress({ phase }: { phase: PhaseId }) {
  const activeIndex = phaseLabels.findIndex((item) => item.id === phase);
  return (
    <nav className="phase-progress" aria-label="Journey progress">
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
  const [screen, setScreen] = useState<ActiveScreenId>("welcome");
  const [history, setHistory] = useState<ActiveScreenId[]>([]);
  const [answers, setAnswers] = useState<CaseAnswers>(() => ({
    ...emptyAnswers,
    journeySteps: createDefaultJourneySteps(),
  }));
  const [error, setError] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PortableCase | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeSteps = answers.journeySteps.filter((step) => step.status === "in-path");
  const furthestIndex = activeSteps.findIndex((step) => step.id === answers.furthestReachedStepId);
  const selectedBreakStep = activeSteps.find((step) => step.id === answers.breakStepId) ?? null;
  const availableBreakSteps = answers.furthestReachedStepId === "none"
    ? activeSteps
    : activeSteps.filter((_step, index) => index > furthestIndex);
  const lastStage = selectedBreakStep
    ? lastStageForCatalogStage(selectedBreakStep.catalogStageId)
    : "We cannot locate the stop yet";
  const discriminator = selectDiscriminatorQuestion({ ...answers, lastStage });
  const discriminatorResult = explainSelection(
    answers.discriminatorQuestionId,
    answers.discriminatorAnswerIds,
  )[0] ?? null;
  const selectedDiscriminatorOption = discriminator.options.find(
    (option) => option.id === answers.discriminatorAnswerIds[0],
  ) ?? null;
  const researchFamilies = useMemo(() => {
    const stageIds = selectedBreakStep ? [selectedBreakStep.catalogStageId] : ["S01", "S02", "S03", "S04", "S05", "S06"];
    const seen = new Set<string>();
    return stageIds.flatMap((stageId) => getFamiliesForStage(stageId)).filter((family) => {
      if (seen.has(family.id)) return false;
      seen.add(family.id);
      return true;
    });
  }, [selectedBreakStep]);
  const platformResearchGroups = useMemo(
    () => getPlatformResearchGroups(answers.platformSurfaces),
    [answers.platformSurfaces],
  );
  const resultStateLabel = (() => {
    if (answers.breakStepId === "completed") return "First mile completed";
    if (answers.breakStepId === "cannot-tell" || selectedDiscriminatorOption?.specialState === "needs_external_evidence") return "Needs evidence";
    if (selectedDiscriminatorOption?.specialState === "legitimate_gate") return "Legitimate gate";
    if (selectedDiscriminatorOption?.specialState === "deliberate_non_fit") return "Deliberate non-fit";
    if (selectedDiscriminatorOption?.specialState === "compound_blockers") return "Several breaks observed";
    return "Working hypothesis";
  })();

  useEffect(() => {
    if (screen === "welcome") return;
    const session = {
      version: 1 as const,
      guidanceMode: "guided" as const,
      screen,
      history,
      answers,
      updatedAt: new Date().toISOString(),
    };
    saveSession(session);
    setSavedSession(session);
  }, [answers, history, screen]);

  useEffect(() => {
    document.querySelector<HTMLElement>("#question-title, #summary-title")?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  useEffect(() => {
    if (screen !== "blocker") return;
    if (answers.discriminatorQuestionId === discriminator.id) return;
    setAnswers((current) => ({
      ...current,
      discriminatorQuestionId: discriminator.id,
      discriminatorAnswerIds: [],
      issueStatement: "",
    }));
  }, [answers.discriminatorQuestionId, discriminator.id, screen]);

  function updateAnswer<K extends keyof CaseAnswers>(key: K, value: CaseAnswers[K]) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function updateJourneyStep(id: string, changes: Partial<JourneyStep>) {
    setAnswers((current) => {
      const journeySteps = current.journeySteps.map((step) => step.id === id ? { ...step, ...changes } : step);
      const removedFromPath = changes.status === "not-needed";
      return {
        ...current,
        journeySteps,
        furthestReachedStepId: removedFromPath && current.furthestReachedStepId === id ? "" : current.furthestReachedStepId,
        breakStepId: removedFromPath && current.breakStepId === id ? "" : current.breakStepId,
        discriminatorQuestionId: removedFromPath && current.breakStepId === id ? "" : current.discriminatorQuestionId,
        discriminatorAnswerIds: removedFromPath && current.breakStepId === id ? [] : current.discriminatorAnswerIds,
        issueStatement: removedFromPath && current.breakStepId === id ? "" : current.issueStatement,
      };
    });
    setError("");
  }

  function updatePlatformSurface(index: number, value: string) {
    setAnswers((current) => {
      const next = [...current.platformSurfaces];
      if (value) next[index] = value;
      else next.splice(index, 1);
      const platformSurfaces = next.filter((surface, surfaceIndex) => surface && next.indexOf(surface) === surfaceIndex).slice(0, 2);
      return {
        ...current,
        platformSurfaces,
        platformSurfaceOther: platformSurfaces.includes("Something else") ? current.platformSurfaceOther : "",
      };
    });
    setError("");
  }

  function addJourneyStep() {
    setAnswers((current) => ({
      ...current,
      journeySteps: [
        ...current.journeySteps,
        {
          id: `custom-${crypto.randomUUID()}`,
          catalogStageId: "S05",
          label: "Another step in this journey",
          status: "in-path",
        },
      ],
    }));
  }

  function removeJourneyStep(id: string) {
    setAnswers((current) => ({
      ...current,
      journeySteps: current.journeySteps.filter((step) => step.id !== id),
      furthestReachedStepId: current.furthestReachedStepId === id ? "" : current.furthestReachedStepId,
      breakStepId: current.breakStepId === id ? "" : current.breakStepId,
      discriminatorQuestionId: current.breakStepId === id ? "" : current.discriminatorQuestionId,
      discriminatorAnswerIds: current.breakStepId === id ? [] : current.discriminatorAnswerIds,
      issueStatement: current.breakStepId === id ? "" : current.issueStatement,
    }));
  }

  function goTo(next: ActiveScreenId) {
    setHistory((current) => [...current, screen]);
    setScreen(next);
    setError("");
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setScreen(previous);
    setError("");
  }

  function continueFromCurrent(event: FormEvent) {
    event.preventDefault();
    const message = validationMessage(screen, answers);
    if (message) {
      setError(message);
      return;
    }

    if (screen === "developer") {
      setAnswers((current) => ({
        ...current,
        outcome: `${current.meaningfulAction}. Verification: ${current.verificationSignal}`,
        outcomeCheck: "A result the developer can verify",
        journeySteps: current.journeySteps.map((step) => {
          if (step.id === "execute") return { ...step, label: `Execute: ${current.meaningfulAction}` };
          if (step.id === "verify") return { ...step, label: `Verify: ${current.verificationSignal}` };
          return step;
        }),
      }));
    }

    if (screen === "break-point") {
      const breakStep = activeSteps.find((step) => step.id === answers.breakStepId);
      setAnswers((current) => ({
        ...current,
        lastStage: breakStep ? lastStageForCatalogStage(breakStep.catalogStageId) : "We cannot locate the stop yet",
        lastTruth: current.breakEvidenceDetail,
        evidenceTypes: [evidenceLabelToLegacy(current.breakEvidenceType)],
        evidenceDetail: current.breakEvidenceDetail,
        discriminatorQuestionId: selectDiscriminatorQuestion({
          ...current,
          lastStage: breakStep ? lastStageForCatalogStage(breakStep.catalogStageId) : "We cannot locate the stop yet",
        }).id,
        discriminatorAnswerIds: [],
        issueStatement: "",
      }));
      goTo(answers.breakStepId === "completed" ? "summary" : "blocker");
      return;
    }

    if (screen === "blocker") {
      setAnswers((current) => ({
        ...current,
        explanation: current.issueStatement,
        nextMove: selectedDiscriminatorOption?.nextObservation ?? "",
        moveType: selectedDiscriminatorOption?.specialState === "needs_external_evidence"
          ? "Gather better evidence"
          : "No intervention is justified yet",
      }));
    }
    goTo(nextScreen(screen));
  }

  function resume() {
    if (!savedSession) return;
    const migrated = migrateAnswers(savedSession.answers);
    setAnswers(migrated);
    setHistory(savedSession.history.map(normalizeScreen).filter((item, index, items) => index === 0 || item !== items[index - 1]));
    setScreen(normalizeScreen(savedSession.screen));
    setError("");
  }

  async function reset() {
    setIsDeleting(true);
    setError("");
    const credential = loadAdaptiveCredential();
    if (credential) {
      try {
        await deleteAdaptiveSession(credential, AbortSignal.timeout(8_000));
      } catch {
        setIsDeleting(false);
        setShowReset(false);
        setError("The older server session could not be deleted yet. Your browser copy is still here so you can retry.");
        return;
      }
      clearAdaptiveCredential();
    }
    clearSession();
    setSavedSession(null);
    setAnswers({ ...emptyAnswers, journeySteps: createDefaultJourneySteps() });
    setHistory([]);
    setScreen("welcome");
    setShowReset(false);
    setIsDeleting(false);
  }

  async function previewImport(file?: File) {
    if (!file) return;
    try {
      setPendingImport(parsePortableCase(await file.text()));
      setError("");
    } catch {
      setError("That file is not a valid First Mile case. Your current work has not changed.");
    }
  }

  function acceptImport() {
    if (!pendingImport) return;
    setAnswers(migrateAnswers(pendingImport.answers as CaseAnswers));
    setHistory([]);
    setScreen("summary");
    setPendingImport(null);
    setError("");
  }

  function journeyStatus(step: JourneyStep, index: number): string {
    if (step.status === "not-needed") return "Not required";
    if (answers.breakStepId === "completed") return "Reached";
    if (step.id === answers.furthestReachedStepId && answers.breakEvidenceType === "The stage was completed with employee, partner, or support help") return "Completed with help";
    if (step.id === answers.breakStepId) {
      if (selectedDiscriminatorOption?.specialState === "legitimate_gate") return "Legitimate gate";
      if (selectedDiscriminatorOption?.specialState === "deliberate_non_fit") return "Deliberate non-fit";
      if (selectedDiscriminatorOption?.specialState === "needs_external_evidence") return "Needs evidence";
      if (selectedDiscriminatorOption?.specialState === "compound_blockers") return "Several breaks";
    }
    if (answers.furthestReachedStepId === "none") {
      if (step.id === answers.breakStepId) return "Unresolved";
      return "Untested";
    }
    if (index <= furthestIndex) return "Reached";
    if (step.id === answers.breakStepId) return "Unresolved";
    if (answers.breakStepId === "cannot-tell") return "Unknown";
    return "Untested";
  }

  function firstMileSentence(): string {
    return `For ${answers.developer || "the intended developer"}, the first mile ends when they can independently ${answers.meaningfulAction || "complete the first representative operation"} and verify ${answers.verificationSignal || "the intended result"}.`;
  }

  function markdownExport(): string {
    const selectedOption = discriminator.options.find((option) => option.id === answers.discriminatorAnswerIds[0]);
    const researchLabels = discriminatorResult?.liveLabels ?? [];
    const lines = [
      "# First-mile journey map",
      "",
      `- Participant: ${escapeMarkdown(answers.name || "Not named")}`,
      `- Company or project: ${escapeMarkdown(answers.company || "Not named")}`,
      `- Platform: ${escapeMarkdown(answers.platform || "Not named")}`,
      `- Developer journey: ${escapeMarkdown(answers.journeyType || "Not classified")}`,
      "",
      "## First-mile endpoint",
      "",
      escapeMarkdown(firstMileSentence()),
      "",
      "## Journey",
      "",
      ...answers.journeySteps.map((step, index) => `${index + 1}. **${escapeMarkdown(step.label)}**: ${journeyStatus(step, activeSteps.findIndex((activeStep) => activeStep.id === step.id))}`),
      "",
      "## Located break",
      "",
      `- Furthest stage supported by evidence: ${escapeMarkdown(activeSteps.find((step) => step.id === answers.furthestReachedStepId)?.label || (answers.furthestReachedStepId === "none" ? "No stage reached" : "Unknown"))}`,
      `- Earliest unresolved point: ${escapeMarkdown(selectedBreakStep?.label || (answers.breakStepId === "completed" ? "No break before verified success" : "Cannot tell"))}`,
      `- Evidence class: ${escapeMarkdown(answers.breakEvidenceType || "Not recorded")}`,
      `- Evidence receipt: ${escapeMarkdown(answers.breakEvidenceDetail || "No detail recorded")}`,
      "",
      "## Participant conclusion",
      "",
      escapeMarkdown(answers.issueStatement || (answers.breakStepId === "completed" ? "The mapped first mile is complete." : "The issue is not identified yet.")),
      "",
      "## Research prompts, not diagnoses",
      "",
      ...(researchLabels.length > 0 ? researchLabels.map((label) => `- ${escapeMarkdown(label)}`) : ["- No researched cause is supported yet."]),
      "",
      `Next distinguishing observation: ${escapeMarkdown(selectedOption?.nextObservation || "No additional observation is required by this map yet.")}`,
      "",
      `Research catalog: ${catalog.catalogVersion}`,
      "",
      "A selected stage is not a cause. No intervention justified remains a valid result.",
      "",
    ];
    return lines.join("\n");
  }

  function exportMarkdown() {
    downloadText(
      `${safeFilename(answers.platform || answers.company, "first-mile-map")}.md`,
      markdownExport(),
      "text/markdown;charset=utf-8",
    );
  }

  function exportJson() {
    downloadText(
      `${safeFilename(answers.platform || answers.company, "first-mile-map")}.json`,
      serializePortableCase(createPortableCase(answers, catalog.catalogVersion)),
      "application/json;charset=utf-8",
    );
  }

  const primaryLabel = ({
    profile: "Continue to the platform",
    "platform-context": "Define the developer",
    developer: "Build the journey",
    "journey-map": "Use this path",
    "break-point": "Explore this break",
    blocker: "See my journey map",
  } as Partial<Record<ActiveScreenId, string>>)[screen] ?? "Continue";

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="wordmark" aria-label={friendlyCopy.title}>
          <span className="wordmark-mark" aria-hidden="true">1</span>
          <span>{friendlyCopy.title}</span>
        </div>
        {screen !== "welcome" ? (
          <button className="quiet-button" type="button" onClick={() => setShowReset(true)}>Start over</button>
        ) : null}
      </header>

      {screen !== "welcome" && screen !== "summary" ? <Progress phase={phaseForScreen(screen)} /> : null}

      <main className={screen === "welcome" ? "main welcome-main" : "main"}>
        {screen === "welcome" ? (
          <section className="welcome" aria-labelledby="welcome-title">
            <div className="welcome-mark" aria-hidden="true"><span /><span /><span /></div>
            <p className="eyebrow">A guided journey map</p>
            <h1 id="welcome-title" aria-label={friendlyCopy.welcomeTitle}><span aria-hidden="true">Map the journey.</span><span aria-hidden="true">Find the break.</span></h1>
            <p className="welcome-body">{friendlyCopy.welcomeBody}</p>
            <p className="welcome-time">{friendlyCopy.welcomeTime}</p>
            <div className="welcome-value" aria-label="What you will make">
              <span>Access</span><span>Setup</span><span>First operation</span><span>Verified result</span>
            </div>
            <div className="welcome-actions">
              <button className="primary-button" type="button" onClick={() => goTo("profile")}>Map a journey</button>
              {savedSession ? <button className="secondary-button" type="button" onClick={resume}>Resume saved map</button> : null}
              <button className="secondary-button" type="button" onClick={() => importInputRef.current?.click()}>Import a saved map</button>
              <input
                className="visually-hidden"
                ref={importInputRef}
                type="file"
                aria-label="Choose a saved First Mile map"
                accept="application/json,.json"
                onChange={(event) => {
                  void previewImport(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <div className="trust-note">
              <strong>Your map stays in this browser.</strong>
              <p>{friendlyCopy.privacy}</p>
            </div>
          </section>
        ) : null}

        {screen === "profile" ? (
          <QuestionShell
            eyebrow="Set the scene · 1 of 2"
            title="Who is mapping this journey?"
            support="Use an alias if you prefer. This information only labels your local map."
          >
            <TextField id="name" label="Your name or alias" value={answers.name} onChange={(value) => updateAnswer("name", value)} autoComplete="given-name" />
            <TextField id="company" label="Company, team, or project" value={answers.company} onChange={(value) => updateAnswer("company", value)} autoComplete="organization" />
            <div className="field">
              <label htmlFor="participant-role">Your role</label>
              <select id="participant-role" value={answers.role} onChange={(event) => updateAnswer("role", event.target.value)}>
                <option value="">Choose the closest role</option>
                {roleChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
              </select>
            </div>
            {answers.role === "Something else" ? <TextField id="role-other" label="Describe your role" value={answers.roleOther} onChange={(value) => updateAnswer("roleOther", value)} /> : null}
          </QuestionShell>
        ) : null}

        {screen === "platform-context" ? (
          <QuestionShell
            eyebrow="Set the scene · 2 of 2"
            title={`Which developer platform are we mapping${answers.name ? `, ${answers.name}` : ""}?`}
            support="Pick one journey through one product. A company can have several developer surfaces."
          >
            <TextField id="platform" label="Platform or product" value={answers.platform} onChange={(value) => updateAnswer("platform", value)} />
            <div className="compact-selects platform-selects">
              <div className="field">
                <label htmlFor="primary-surface">Primary developer surface</label>
                <select id="primary-surface" value={answers.platformSurfaces[0] ?? ""} onChange={(event) => updatePlatformSurface(0, event.target.value)}>
                  <option value="">Choose the closest surface</option>
                  {platformSurfaceChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="secondary-surface">Secondary surface, if the path crosses one</label>
                <select id="secondary-surface" value={answers.platformSurfaces[1] ?? ""} disabled={!answers.platformSurfaces[0]} onChange={(event) => updatePlatformSurface(1, event.target.value)}>
                  <option value="">No secondary surface</option>
                  {platformSurfaceChoices.filter((choice) => choice !== answers.platformSurfaces[0]).map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                </select>
              </div>
            </div>
            <p className="inline-help">These choices only filter the research prompts shown after you mark a break.</p>
            {answers.platformSurfaces.includes("Something else") ? (
              <TextField id="platform-surface-other" label="Describe the developer surface" value={answers.platformSurfaceOther} onChange={(value) => updateAnswer("platformSurfaceOther", value)} />
            ) : null}
          </QuestionShell>
        ) : null}

        {screen === "developer" ? (
          <QuestionShell
            eyebrow="Define the journey"
            title="Who is trying to do what, and what counts as success?"
            support="This gives the map its developer, real job, first representative operation, and verified endpoint."
          >
            <div className="developer-definition">
              <TextArea
                id="developer"
                label="Which developer is trying to accomplish what?"
                value={answers.developer}
                onChange={(value) => {
                  setAnswers((current) => ({ ...current, developer: value, developerJob: value }));
                  setError("");
                }}
                hint="For example: Backend engineers who need meeting events in an internal service. Describe their job, not your feature."
                rows={2}
              />
              <div className="compact-selects">
                <div className="field">
                  <label htmlFor="journey-type">What kind of journey is this?</label>
                  <select id="journey-type" value={answers.journeyType} onChange={(event) => updateAnswer("journeyType", event.target.value)}>
                    <option value="">Choose the closest journey</option>
                    {journeyTypeChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="actor-type">Who performs the path?</label>
                  <select id="actor-type" value={answers.actorType} onChange={(event) => updateAnswer("actorType", event.target.value)}>
                    <option value="">Choose the actor</option>
                    {actorTypeChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                  </select>
                </div>
              </div>
              {answers.developer.trim() ? (
                <div className="endpoint-fields">
                  <p className="section-kicker">Now set the finish line</p>
                  <p className="section-note">A signup, key, request, or 200 response is only a step unless the developer can verify the result they needed.</p>
                  <TextArea
                    id="meaningful-action"
                    label="What first representative operation must they complete?"
                    value={answers.meaningfulAction}
                    onChange={(value) => updateAnswer("meaningfulAction", value)}
                    hint="For example: Subscribe a real test account to meeting-start events and trigger one event."
                    rows={2}
                  />
                  <TextArea
                    id="verification-signal"
                    label="How can they independently verify it worked?"
                    value={answers.verificationSignal}
                    onChange={(value) => updateAnswer("verificationSignal", value)}
                    hint="Name a result the developer can see, explain, and reproduce."
                    rows={2}
                  />
                </div>
              ) : null}
            </div>
          </QuestionShell>
        ) : null}

        {screen === "journey-map" ? (
          <QuestionShell
            eyebrow="Map the path"
            title="Does this look like the journey?"
            support="The map is already drafted. Open only the steps that are wrong, missing, or not required."
          >
            <ol className="journey-editor">
              {answers.journeySteps.map((step, index) => (
                <li className={step.status === "not-needed" ? "is-muted" : ""} key={step.id}>
                  <span className="journey-number">{index + 1}</span>
                  <details>
                    <summary>{step.label}</summary>
                    <div className="journey-edit-fields">
                      <TextField id={`step-${step.id}`} label="Developer step" value={step.label} onChange={(value) => updateJourneyStep(step.id, { label: value })} />
                      <div className="field">
                        <label htmlFor={`stage-${step.id}`}>Research stage</label>
                        <select id={`stage-${step.id}`} value={step.catalogStageId} onChange={(event) => updateJourneyStep(step.id, { catalogStageId: event.target.value })}>
                          {stageChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                        </select>
                      </div>
                      <button className="secondary-button" type="button" onClick={() => updateJourneyStep(step.id, { status: step.status === "in-path" ? "not-needed" : "in-path" })}>
                        {step.status === "in-path" ? "Not required in this journey" : "Put this step back"}
                      </button>
                      {step.id.startsWith("custom-") ? <button className="text-button" type="button" onClick={() => removeJourneyStep(step.id)}>Remove this step</button> : null}
                    </div>
                  </details>
                  <span className="journey-step-state">{step.status === "in-path" ? "In path" : "Not required"}</span>
                </li>
              ))}
            </ol>
            <button className="secondary-button add-step-button" type="button" onClick={addJourneyStep}>Add a missing step</button>
          </QuestionShell>
        ) : null}

        {screen === "break-point" ? (
          <QuestionShell
            eyebrow="Mark the break"
            title="Where does the journey stop being clear?"
            support="First mark what you can defend. Then mark the earliest transition that is unresolved."
          >
            <fieldset className="map-choice-group">
              <legend>Furthest stage definitely reached</legend>
              <div className="map-choice-list">
                <button type="button" className={answers.furthestReachedStepId === "none" ? "map-choice is-selected" : "map-choice"} aria-pressed={answers.furthestReachedStepId === "none"} onClick={() => {
                  setAnswers((current) => ({ ...current, furthestReachedStepId: "none", breakStepId: "", discriminatorAnswerIds: [], issueStatement: "" }));
                  setError("");
                }}>No stage is confirmed</button>
                {activeSteps.map((step, index) => (
                  <button type="button" className={answers.furthestReachedStepId === step.id ? "map-choice is-selected" : "map-choice"} aria-pressed={answers.furthestReachedStepId === step.id} key={step.id} onClick={() => {
                    setAnswers((current) => ({ ...current, furthestReachedStepId: step.id, breakStepId: "", discriminatorAnswerIds: [], issueStatement: "" }));
                    setError("");
                  }}><span>{index + 1}</span>{step.label}</button>
                ))}
              </div>
            </fieldset>

            {answers.furthestReachedStepId ? (
              <fieldset className="map-choice-group">
                <legend>Earliest unresolved or broken point</legend>
                <div className="map-choice-list">
                  {availableBreakSteps.map((step) => (
                    <button type="button" className={answers.breakStepId === step.id ? "map-choice is-selected" : "map-choice"} aria-pressed={answers.breakStepId === step.id} key={step.id} onClick={() => updateAnswer("breakStepId", step.id)}>{step.label}</button>
                  ))}
                  <button type="button" className={answers.breakStepId === "cannot-tell" ? "map-choice is-selected" : "map-choice"} aria-pressed={answers.breakStepId === "cannot-tell"} onClick={() => updateAnswer("breakStepId", "cannot-tell")}>We cannot locate it from our data</button>
                  <button type="button" className={answers.breakStepId === "completed" ? "map-choice is-selected" : "map-choice"} aria-pressed={answers.breakStepId === "completed"} onClick={() => updateAnswer("breakStepId", "completed")}>No break before verified first success</button>
                </div>
              </fieldset>
            ) : null}

            {answers.breakStepId ? (
              <>
                <ChoiceGroup legend="What supports that placement?" value={answers.breakEvidenceType} choices={breakEvidenceChoices} onChange={(value) => updateAnswer("breakEvidenceType", value)} />
                <TextArea id="break-evidence" label="Evidence receipt" value={answers.breakEvidenceDetail} onChange={(value) => updateAnswer("breakEvidenceDetail", value)} hint="One event, observation, interview finding, or honest statement that the data stops here." rows={3} />
              </>
            ) : null}

            {answers.furthestReachedStepId && answers.breakStepId ? (
              <div className="map-insight" aria-live="polite">
                <span>What the map says so far</span>
                <p><strong>Last stage you can defend:</strong> {activeSteps.find((step) => step.id === answers.furthestReachedStepId)?.label || "No stage confirmed"}</p>
                <p><strong>Earliest unresolved transition:</strong> {selectedBreakStep?.label || (answers.breakStepId === "completed" ? "None before verified success" : "Cannot tell from current evidence")}</p>
              </div>
            ) : null}
          </QuestionShell>
        ) : null}

        {screen === "blocker" ? (
          <QuestionShell eyebrow="Name the issue" title={discriminator.prompt} support={discriminator.support}>
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
                  issueStatement: "",
                }));
                setError("");
              }}
            />
            {selectedDiscriminatorOption ? (
              <div className="research-prompt" aria-live="polite">
                <span>What this choice changes</span>
                <p>{selectedDiscriminatorOption.nextObservation}</p>
                {discriminatorResult?.liveLabels.length ? <p className="research-labels">Research prompts still in play: {discriminatorResult.liveLabels.join("; ")}</p> : null}
              </div>
            ) : null}
            <TextArea
              id="issue-statement"
              label="In your words, what seems to be getting in the way?"
              value={answers.issueStatement}
              onChange={(value) => updateAnswer("issueStatement", value)}
              hint="This is your working conclusion, not the app's diagnosis."
              rows={3}
            />
            <button className="text-button" type="button" onClick={() => updateAnswer("issueStatement", "We need better evidence before naming the issue.")}>We need more evidence before naming it</button>
            <WhyThisQuestion>This question comes from the exact stage you marked. It narrows alternatives without treating the stage itself as the cause.</WhyThisQuestion>
          </QuestionShell>
        ) : null}

        {screen === "summary" ? (
          <section className="summary" aria-labelledby="summary-title">
            <p className="eyebrow">Your first-mile map</p>
            <h1 id="summary-title" tabIndex={-1}>{answers.breakStepId === "completed" ? "This path reaches first success." : "You found the transition to investigate."}</h1>
            <p className="summary-intro">The map records what you can defend and keeps the unresolved part visible. A selected stage is not a cause.</p>

            <div className="endpoint-card"><span>First-mile endpoint</span><p>{firstMileSentence()}</p></div>

            <ol className="journey-result" aria-label="Annotated developer journey">
              {answers.journeySteps.map((step) => {
                const activeIndex = activeSteps.findIndex((activeStep) => activeStep.id === step.id);
                const status = journeyStatus(step, activeIndex);
                return (
                  <li className={`status-${status.toLowerCase().replaceAll(" ", "-")}`} key={step.id}>
                    <span className="journey-result-marker" aria-hidden="true" />
                    <div><strong>{step.label}</strong><small>{status}</small></div>
                  </li>
                );
              })}
            </ol>

            <dl className="brief-list journey-brief">
              <div><dt>Result state</dt><dd><span className="state-pill">{resultStateLabel}</span></dd></div>
              <div><dt>Developer and job</dt><dd>{answers.developer || "Not recorded"}</dd></div>
              <div><dt>Last stage supported</dt><dd>{activeSteps.find((step) => step.id === answers.furthestReachedStepId)?.label || (answers.furthestReachedStepId === "none" ? "No stage confirmed" : "Not located")}</dd></div>
              <div><dt>Earliest unresolved point</dt><dd>{selectedBreakStep?.label || (answers.breakStepId === "completed" ? "No break before verified first success" : "Cannot tell from current evidence")}</dd><dd className="brief-meta">Evidence: {answers.breakEvidenceType || "not recorded"}. {answers.breakEvidenceDetail || "No detail recorded."}</dd></div>
              <div><dt>Your working conclusion</dt><dd>{answers.issueStatement || (answers.breakStepId === "completed" ? "The mapped journey reaches verified first success." : "The issue is not identified yet.")}</dd></div>
              {selectedDiscriminatorOption ? <div><dt>Next observation</dt><dd>{selectedDiscriminatorOption.nextObservation}</dd></div> : null}
            </dl>

            {discriminatorResult?.liveLabels.length ? (
              <div className="research-summary">
                <span>Research prompts, not diagnoses</span>
                <ul>{discriminatorResult.liveLabels.map((label) => <li key={label}>{label}</li>)}</ul>
              </div>
            ) : null}

            <details className="research-details research-library">
              <summary>Inspect research relevant to this stage</summary>
              <p>The catalog contains {catalog.counts.reasons} possible blockers. These are prompts for inspection. None is a diagnosis without evidence from this journey.</p>
              {researchFamilies.map((family) => (
                <section key={family.id}>
                  <h2>{family.label}</h2>
                  <ul>{getReasonsForParent(family.id).map((reason) => <li key={reason.id}>{reason.label}</li>)}</ul>
                </section>
              ))}
              {platformResearchGroups.map((group) => (
                <section key={group.archetypeId}>
                  <h2>{group.label}</h2>
                  <ul>{group.reasons.map((reason) => <li key={reason.id}>{reason.label}</li>)}</ul>
                </section>
              ))}
            </details>

            <div className="summary-callout">
              <strong>No intervention justified remains a valid result.</strong>
              <p>If the evidence cannot separate the live explanations, the next move is to observe, not to guess. An intentional access, safety, billing, or compliance gate is not automatically a defect.</p>
            </div>
            <div className="summary-actions">
              <button className="primary-button" type="button" onClick={() => goTo("journey-map")}>Edit the map</button>
              <button className="secondary-button" type="button" onClick={exportMarkdown}>Download Markdown</button>
              <button className="secondary-button" type="button" onClick={exportJson}>Export portable JSON</button>
              <button className="secondary-button" type="button" onClick={() => window.print()}>Print or save as PDF</button>
            </div>
          </section>
        ) : null}

        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </main>

      {screen !== "welcome" && screen !== "summary" ? (
        <form className="action-bar" onSubmit={continueFromCurrent}>
          <div className="action-bar-inner">
            <button className="back-button" type="button" onClick={goBack} disabled={history.length === 0}>Back</button>
            <button className="primary-button" type="submit">{primaryLabel}</button>
          </div>
        </form>
      ) : null}

      {showReset ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => !isDeleting && setShowReset(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="reset-title">Delete this map and start over?</h2>
            <p>This removes the saved map from this browser. If an older adaptive session exists, it is deleted first.</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setShowReset(false)} disabled={isDeleting} autoFocus>Keep my map</button>
              <button className="danger-button" type="button" onClick={() => void reset()} disabled={isDeleting}>{isDeleting ? "Deleting…" : "Delete and start over"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingImport ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setPendingImport(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="import-title">Open this saved map?</h2>
            <p>Your current map stays unchanged until you confirm.</p>
            <dl className="import-preview">
              <div><dt>Company or project</dt><dd>{pendingImport.answers.company || "Not named"}</dd></div>
              <div><dt>Platform</dt><dd>{pendingImport.answers.platform || "Not named"}</dd></div>
            </dl>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setPendingImport(null)} autoFocus>Keep current map</button>
              <button className="primary-button" type="button" onClick={acceptImport}>Open saved map</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
