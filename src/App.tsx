import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ChoiceGroup,
  QuestionShell,
  TextArea,
  TextField,
} from "./components";
import {
  breakEvidenceChoices,
  friendlyCopy,
  phaseLabels,
  roleChoices,
} from "./copy";
import {
  clearAdaptiveCredential,
  deleteAdaptiveSession,
  loadAdaptiveCredential,
} from "./adaptive-client";
import { catalog } from "./domain/catalog";
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
  "developer",
  "journey-map",
  "break-point",
  "blocker",
  "summary",
];

const insufficientEvidenceConclusion = "We need better evidence before naming the issue.";

function isActiveScreen(screen: ScreenId): screen is ActiveScreenId {
  return activeScreenOrder.includes(screen as ActiveScreenId);
}

function normalizeScreen(screen: ScreenId): ActiveScreenId {
  if (screen === "first-mile") return "developer";
  if (screen === "platform-context") return "profile";
  if (isActiveScreen(screen)) return screen;
  return "profile";
}

function phaseForScreen(screen: ActiveScreenId): PhaseId {
  if (screen === "profile") return "profile";
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
    if (!answers.name.trim() || !answers.company.trim() || !answers.platform.trim() || !answers.role.trim()) {
      return "Add your name or alias, company, platform, and role.";
    }
    if (answers.role === "Something else" && !answers.roleOther.trim()) return "Describe your role in a few words.";
  }
  if (screen === "developer") {
    if (!answers.developer.trim() || !answers.developerJob.trim() || !answers.meaningfulAction.trim() || !answers.verificationSignal.trim()) {
      return "Add the developer, their goal, the first real product action, and what tells them it worked.";
    }
  }
  if (screen === "journey-map") {
    const activeSteps = answers.journeySteps.filter((step) => step.status === "in-path" && step.label.trim());
    if (activeSteps.length < 3) return "Keep at least three steps in this journey.";
  }
  if (screen === "break-point") {
    if (!answers.furthestReachedStepId || !answers.breakStepId || !answers.breakEvidenceType) {
      return "Choose where the developer stopped and how you know.";
    }
  }
  if (screen === "blocker") {
    if (answers.discriminatorAnswerIds.length !== 1) return "Choose the closest observed answer.";
    if (!answers.issueStatement.trim()) return "Choose not enough evidence, or add a working explanation.";
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
  const [showIssueStatement, setShowIssueStatement] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PortableCase | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeSteps = answers.journeySteps.filter((step) => step.status === "in-path");
  const furthestIndex = activeSteps.findIndex((step) => step.id === answers.furthestReachedStepId);
  const selectedBreakStep = activeSteps.find((step) => step.id === answers.breakStepId) ?? null;
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
  const summaryTitle = (() => {
    if (answers.breakStepId === "completed") return "This journey does not show a drop-off.";
    if (answers.breakStepId === "cannot-tell") return "You need better evidence to locate the drop-off.";
    if (selectedDiscriminatorOption?.specialState === "needs_external_evidence") return "You found the first unconfirmed step, but not its cause.";
    if (selectedDiscriminatorOption?.specialState === "legitimate_gate") return "The first stop is an expected gate.";
    if (selectedDiscriminatorOption?.specialState === "deliberate_non_fit") return "The developer chose not to continue.";
    if (selectedDiscriminatorOption?.specialState === "compound_blockers") return "More than one thing blocked this journey.";
    return "Here is where the journey becomes unclear.";
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
    if (screen !== "blocker") setShowIssueStatement(false);
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

  useEffect(() => {
    if (screen !== "blocker" || discriminator.id !== "DQ_MEASUREMENT" || answers.discriminatorAnswerIds.length === 0) return;
    if (answers.issueStatement === insufficientEvidenceConclusion) return;
    setAnswers((current) => ({ ...current, issueStatement: insufficientEvidenceConclusion }));
  }, [answers.discriminatorAnswerIds.length, answers.issueStatement, discriminator.id, screen]);

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
          if (step.id === "execute") return { ...step, label: `Try: ${current.meaningfulAction}` };
          if (step.id === "verify") return { ...step, label: `Confirm: ${current.verificationSignal}` };
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
    setShowIssueStatement(false);
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
    return `First product action: ${answers.meaningfulAction || "Not recorded"}. Proof it worked: ${answers.verificationSignal || "Not recorded"}.`;
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
      `- Participant role: ${escapeMarkdown(answers.role === "Something else" ? answers.roleOther : answers.role || "Not named")}`,
      `- Developer: ${escapeMarkdown(answers.developer || "Not named")}`,
      `- Developer goal: ${escapeMarkdown(answers.developerJob || "Not recorded")}`,
      "",
      "## First success",
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
    profile: "Describe the developer",
    developer: "See the journey",
    "journey-map": "This journey is right",
    "break-point": "Look at this step",
    blocker: "See the result",
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
            <h1 id="welcome-title">{friendlyCopy.welcomeTitle}</h1>
            <p className="welcome-body">{friendlyCopy.welcomeBody}</p>
            <div className="welcome-actions">
              <button className="primary-button" type="button" onClick={() => goTo("profile")}>Start mapping</button>
              {savedSession ? <button className="secondary-button" type="button" onClick={resume}>Resume saved map</button> : null}
              <button className="welcome-import" type="button" onClick={() => importInputRef.current?.click()}>Open a saved map</button>
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
            <p className="trust-note">{friendlyCopy.privacy}</p>
          </section>
        ) : null}

        {screen === "profile" ? (
          <QuestionShell
            eyebrow="Start here"
            title="Set the context."
            support="These details label your workshop export. They do not affect the result."
          >
            <TextField id="name" label="Your name or alias" value={answers.name} onChange={(value) => updateAnswer("name", value)} autoComplete="given-name" />
            <TextField id="company" label="Company" value={answers.company} onChange={(value) => updateAnswer("company", value)} autoComplete="organization" />
            <TextField id="platform" label="Platform or product" value={answers.platform} onChange={(value) => updateAnswer("platform", value)} />
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

        {screen === "developer" ? (
          <QuestionShell
            eyebrow="One journey"
            title="What is the developer trying to do?"
          >
            <div className="developer-definition">
              <TextField
                id="developer"
                label="Who is the developer?"
                value={answers.developer}
                onChange={(value) => updateAnswer("developer", value)}
              />
              <TextArea
                id="developer-job"
                label="What are they trying to accomplish?"
                value={answers.developerJob}
                onChange={(value) => updateAnswer("developerJob", value)}
                rows={2}
              />
              <TextArea
                id="meaningful-action"
                label="What product action do they try first?"
                value={answers.meaningfulAction}
                onChange={(value) => updateAnswer("meaningfulAction", value)}
                rows={2}
              />
              <TextArea
                id="verification-signal"
                label="What will the developer see when it works?"
                value={answers.verificationSignal}
                onChange={(value) => updateAnswer("verificationSignal", value)}
                rows={2}
              />
            </div>
          </QuestionShell>
        ) : null}

        {screen === "journey-map" ? (
          <QuestionShell
            eyebrow="Map the path"
            title="Does this look like the journey?"
            support="Fix anything that does not match what the developer actually does."
          >
            <ol className="journey-editor">
              {answers.journeySteps.map((step, index) => (
                <li className={step.status === "not-needed" ? "is-muted" : ""} key={step.id}>
                  <span className="journey-number">{index + 1}</span>
                  <details>
                    <summary>{step.label}</summary>
                    <div className="journey-edit-fields">
                      <TextField id={`step-${step.id}`} label="Rename this step" value={step.label} onChange={(value) => updateJourneyStep(step.id, { label: value })} />
                      <button className="secondary-button" type="button" onClick={() => updateJourneyStep(step.id, { status: step.status === "in-path" ? "not-needed" : "in-path" })}>
                        {step.status === "in-path" ? "This step is not part of the journey" : "Put this step back"}
                      </button>
                      {step.id.startsWith("custom-") ? <button className="text-button" type="button" onClick={() => removeJourneyStep(step.id)}>Remove this step</button> : null}
                    </div>
                  </details>
                  <span className="journey-step-state">{step.status === "in-path" ? "In this journey" : "Not part of journey"}</span>
                </li>
              ))}
            </ol>
            <button className="secondary-button add-step-button" type="button" onClick={addJourneyStep}>Add a missing step</button>
          </QuestionShell>
        ) : null}

        {screen === "break-point" ? (
          <QuestionShell
            eyebrow="Find the drop-off"
            title="What is the first step you cannot confirm?"
            support="Choose the earliest step your evidence does not show as completed."
          >
            {!answers.breakStepId ? (
              <fieldset className="map-choice-group">
                <legend>First step not confirmed</legend>
                <div className="map-choice-list">
                  {activeSteps.map((step, index) => (
                    <button type="button" className="map-choice" aria-pressed="false" key={step.id} onClick={() => {
                      setAnswers((current) => ({
                        ...current,
                        furthestReachedStepId: index === 0 ? "none" : activeSteps[index - 1].id,
                        breakStepId: step.id,
                        breakEvidenceType: "",
                        breakEvidenceDetail: "",
                        discriminatorAnswerIds: [],
                        issueStatement: "",
                      }));
                      setError("");
                    }}><span>{index + 1}</span>{step.label}</button>
                  ))}
                  <button type="button" className="map-choice" aria-pressed="false" onClick={() => {
                    setAnswers((current) => ({ ...current, furthestReachedStepId: "none", breakStepId: "cannot-tell", breakEvidenceType: "", breakEvidenceDetail: "", discriminatorAnswerIds: [], issueStatement: "" }));
                    setError("");
                  }}>We do not know</button>
                  <button type="button" className="map-choice" aria-pressed="false" onClick={() => {
                    setAnswers((current) => ({ ...current, furthestReachedStepId: activeSteps.at(-1)?.id ?? "none", breakStepId: "completed", breakEvidenceType: "", breakEvidenceDetail: "", discriminatorAnswerIds: [], issueStatement: "" }));
                    setError("");
                  }}>They reached first success</button>
                </div>
              </fieldset>
            ) : (
              <div className="selected-answer">
                <span>{answers.breakStepId === "completed" ? "Journey status" : answers.breakStepId === "cannot-tell" ? "Drop-off status" : "First step not confirmed"}</span>
                <p>{selectedBreakStep?.label || (answers.breakStepId === "completed" ? "First success confirmed." : "We do not know.")}</p>
                <button className="text-button" type="button" onClick={() => {
                  setAnswers((current) => ({ ...current, furthestReachedStepId: "", breakStepId: "", breakEvidenceType: "", breakEvidenceDetail: "", discriminatorAnswerIds: [], issueStatement: "" }));
                  setError("");
                }}>Change</button>
              </div>
            )}

            {answers.breakStepId ? (
              <>
                <div className="field">
                  <label htmlFor="break-evidence-type">{answers.breakStepId === "completed" ? "How do you know first success was reached?" : "How do you know?"}</label>
                  <select id="break-evidence-type" value={answers.breakEvidenceType} onChange={(event) => updateAnswer("breakEvidenceType", event.target.value)}>
                    <option value="">{answers.breakStepId === "completed" ? "Choose evidence that confirms success" : "Choose the closest answer"}</option>
                    {breakEvidenceChoices
                      .filter((choice) => answers.breakStepId !== "completed" || (choice !== "This is a team assumption or anecdote" && choice !== "We do not have stage-level evidence"))
                      .map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                  </select>
                </div>
                <TextArea id="break-evidence" label={answers.breakStepId === "completed" ? "What evidence confirms it?" : "What did you see or hear?"} value={answers.breakEvidenceDetail} onChange={(value) => updateAnswer("breakEvidenceDetail", value)} rows={3} />
              </>
            ) : null}
          </QuestionShell>
        ) : null}

        {screen === "blocker" ? (
          <QuestionShell eyebrow="Look closer" title={discriminator.prompt}>
            {!selectedDiscriminatorOption ? (
              <ChoiceGroup
                legend={discriminator.id === "DQ_MEASUREMENT" ? "Choose one next evidence step" : "What did you observe?"}
                value=""
                choices={discriminator.options.map((option) => option.label)}
                onChange={(label) => {
                  const option = discriminator.options.find((candidate) => candidate.label === label);
                  if (!option) return;
                  setAnswers((current) => ({
                    ...current,
                    discriminatorQuestionId: discriminator.id,
                    discriminatorAnswerIds: [option.id],
                    issueStatement: discriminator.id === "DQ_MEASUREMENT" ? insufficientEvidenceConclusion : "",
                  }));
                  setShowIssueStatement(false);
                  setError("");
                  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
                }}
              />
            ) : (
              <div className="selected-answer">
                <span>{discriminator.id === "DQ_MEASUREMENT" ? "Your next evidence step" : "Your observation"}</span>
                <p>{selectedDiscriminatorOption.label}</p>
                <button className="text-button" type="button" onClick={() => {
                  setAnswers((current) => ({ ...current, discriminatorAnswerIds: [], issueStatement: "" }));
                  setShowIssueStatement(false);
                  setError("");
                }}>Change</button>
              </div>
            )}
            {selectedDiscriminatorOption ? (
              <div className="research-prompt" aria-live="polite">
                <span>Check this next</span>
                <p>{selectedDiscriminatorOption.nextObservation}</p>
              </div>
            ) : null}
            {selectedDiscriminatorOption && discriminator.id !== "DQ_MEASUREMENT" ? (
              <div className="conclusion-choice" aria-label="Choose how to conclude">
                <button
                  className={answers.issueStatement === insufficientEvidenceConclusion ? "secondary-button is-selected" : "secondary-button"}
                  type="button"
                  onClick={() => {
                    updateAnswer("issueStatement", insufficientEvidenceConclusion);
                    setShowIssueStatement(false);
                  }}
                >Not enough evidence to name an issue</button>
                <button
                  className={showIssueStatement || (answers.issueStatement.trim() && answers.issueStatement !== insufficientEvidenceConclusion) ? "secondary-button is-selected" : "secondary-button"}
                  type="button"
                  onClick={() => {
                    updateAnswer("issueStatement", "");
                    setShowIssueStatement(true);
                  }}
                >Add a working explanation</button>
              </div>
            ) : null}
            {discriminator.id !== "DQ_MEASUREMENT" && (showIssueStatement || (answers.issueStatement.trim() && answers.issueStatement !== insufficientEvidenceConclusion)) ? (
              <TextArea
                id="issue-statement"
                label="Working explanation"
                value={answers.issueStatement}
                onChange={(value) => updateAnswer("issueStatement", value)}
                rows={3}
              />
            ) : null}
          </QuestionShell>
        ) : null}

        {screen === "summary" ? (
          <section className="summary" aria-labelledby="summary-title">
            <p className="eyebrow">Your result</p>
            <h1 id="summary-title" tabIndex={-1}>{summaryTitle}</h1>
            <p className="summary-intro">{answers.breakStepId === "completed"
              ? "You marked every required step as completed."
              : selectedBreakStep
                ? `${selectedBreakStep.label} is the first step you could not confirm.`
                : "The current evidence does not show where the journey stops."}</p>

            <div className="summary-decision">
              <strong>{answers.breakStepId === "completed" ? "Still seeing low adoption?" : "Your working explanation"}</strong>
              <p>{answers.breakStepId === "completed"
                ? "Change where the journey stops, or map a different developer."
                : answers.issueStatement || "You need more evidence before naming the issue."}</p>
              {answers.breakStepId !== "completed" ? <p><strong>What you saw:</strong> {answers.breakEvidenceDetail || "Nothing recorded yet."}</p> : null}
              {answers.breakStepId !== "completed" && selectedDiscriminatorOption ? <p><strong>Check next:</strong> {selectedDiscriminatorOption.nextObservation}</p> : null}
              <div className="summary-decision-actions">
                <button className="primary-button" type="button" onClick={() => goTo("break-point")}>Change where the journey stops</button>
                {answers.breakStepId === "completed"
                  ? <button className="secondary-button" type="button" onClick={() => setShowReset(true)}>Map a different developer</button>
                  : <button className="secondary-button" type="button" onClick={() => goTo("journey-map")}>Edit the journey</button>}
              </div>
            </div>

            <div className="endpoint-card">
              <span>What first success means</span>
              <dl>
                <div><dt>Developer goal</dt><dd>{answers.developerJob || "Not recorded"}</dd></div>
                <div><dt>First product action</dt><dd>{answers.meaningfulAction || "Not recorded"}</dd></div>
                <div><dt>Proof it worked</dt><dd>{answers.verificationSignal || "Not recorded"}</dd></div>
              </dl>
            </div>

            <details className="summary-map" open={answers.breakStepId !== "completed"}>
              <summary>Journey you mapped</summary>
              <ol className="journey-result" aria-label="Developer journey and drop-off">
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
            </details>

            {discriminatorResult?.liveLabels.length && selectedDiscriminatorOption?.specialState !== "needs_external_evidence" && answers.breakStepId !== "cannot-tell" ? (
              <div className="research-summary">
                <span>Possible reasons to check</span>
                <p>Based on what you selected. These are not findings.</p>
                <ul>{discriminatorResult.liveLabels.map((label) => <li key={label}>{label}</li>)}</ul>
              </div>
            ) : selectedDiscriminatorOption?.specialState === "needs_external_evidence" || answers.breakStepId === "cannot-tell" ? (
              <div className="research-summary">
                <span>No reason supported yet</span>
                <p>Use the next observation above before naming a cause.</p>
              </div>
            ) : null}

            <div className="summary-callout">
              <strong>No change may be the right result.</strong>
              <p>If the evidence is weak, observe before changing the product.</p>
            </div>
            <div className="summary-actions">
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
