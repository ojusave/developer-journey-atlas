import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import diagnosisOutputSchema from "../../schemas/diagnosis-output.schema.json";
import type { ComparisonRecord } from "./comparison-validation";
import {
  acceptAnswer,
  createDiagnosticCase,
  type DiagnosticCase,
} from "./diagnostic-engine";
import {
  assembleDiagnosis,
  AtlasIntegrityError,
  type AtlasJourneyRecord,
  type DiagnosisOutput,
} from "./diagnosis-assembler";
import type { DiagnosticClaim, ReasonDiagnosticCard } from "./evidence-validation";

const atlasRecords = readFileSync(resolve(process.cwd(), "packages/generated-views/atlas.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as { recordType: string })
  .filter((record): record is AtlasJourneyRecord => record.recordType === "platform_journey");

const renderJourney = atlasRecords.find((record) => record.platform.slug === "render")!;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateOutput = ajv.compile(diagnosisOutputSchema);

function expectSchemaValid(output: DiagnosisOutput): void {
  expect(validateOutput(output), JSON.stringify(validateOutput.errors, null, 2)).toBe(true);
}

function attemptCase(): DiagnosticCase {
  let caseFile = createDiagnosticCase("attempt-render-1");
  caseFile = acceptAnswer(caseFile, {
    eventId: "platform-1",
    questionId: "profile-platform",
    answer: {
      platform: "Render",
      platformSurfaces: ["Cloud, deployment, infrastructure, or data"],
    },
    evidenceKinds: ["participant_report"],
    recordedAt: "2026-07-21T12:00:00.000Z",
  });
  caseFile = acceptAnswer(caseFile, {
    eventId: "last-truth-1",
    questionId: "last-truth",
    answer: {
      lastStage: "No attempt observed",
      lastTruth: "The developer did not begin the documented setup during the observed session.",
    },
    evidenceKinds: ["direct_observation"],
    recordedAt: "2026-07-21T12:01:00.000Z",
  });
  caseFile = acceptAnswer(caseFile, {
    eventId: "discriminator-1",
    questionId: "catalog-discriminator",
    answer: {
      discriminatorQuestionId: "DQ_NO_ATTEMPT",
      discriminatorAnswerIds: ["planned_delayed"],
    },
    evidenceKinds: ["participant_report"],
    recordedAt: "2026-07-21T12:02:00.000Z",
  });
  caseFile = acceptAnswer(caseFile, {
    eventId: "next-move-1",
    questionId: "next-move",
    answer: {
      moveType: "Observe one attempt",
      nextMove: "Observe whether the developer starts when the task is assigned a protected 20-minute window.",
      expectedSignal: "The developer begins the first documented setup step.",
    },
    evidenceKinds: ["participant_report"],
    recordedAt: "2026-07-21T12:03:00.000Z",
  });
  return caseFile;
}

function comparison(overrides: Partial<ComparisonRecord> = {}): ComparisonRecord {
  const peers = [
    "journey:peer-a:documented-primary",
    "journey:peer-b:documented-primary",
    "journey:peer-c:documented-primary",
  ];
  return {
    comparison_id: "comparison:render:bounded-structure",
    subject_journey_id: renderJourney.id,
    peer_journey_ids: peers,
    matching_dimensions: [
      {
        name: "developer-goal",
        subject_value: "Deploy an existing web app",
        peer_values: peers.map(() => "Deploy an existing web app"),
        source_ids: ["comparison-source:goal"],
      },
      {
        name: "setup-surface",
        subject_value: "Dashboard",
        peer_values: peers.map(() => "Dashboard"),
        source_ids: ["comparison-source:surface"],
      },
    ],
    differing_dimensions: [],
    source_ids: ["comparison-source:goal", "comparison-source:surface"],
    limitations: ["Synthetic comparison fixture. It does not establish performance, prevalence, or causation."],
    research_snapshots: [
      { journey_id: renderJourney.id, researched_at: "2026-07-19" },
      ...peers.map((journey_id) => ({ journey_id, researched_at: "2026-07-19" })),
    ],
    analysis_eligible: true,
    minimum_comparison_count_met: true,
    pattern_claim_eligible: true,
    safe_to_anonymize: true,
    participant_summary: "Three qualified documented journeys use a dashboard for this bounded developer goal.",
    withheld_reasons: [],
    ...overrides,
  };
}

describe("diagnosis assembler", () => {
  it("assembles an ADHD-sized documented view from the real generated corpus", () => {
    const output = assembleDiagnosis({ platform: "Render", journeys: atlasRecords });

    expect(output).toMatchObject({
      platform_id: "platform:render",
      journey_id: "journey:render:documented-primary",
      analysis_mode: "documented-journey",
      analysis_status: "documented-path",
    });
    expect(output.what_we_know).toHaveLength(3);
    expect(output.what_may_be_happening).toEqual([]);
    expect(output.headline).toContain("not a diagnosis");
    expect(output.source_ids).toContain(renderJourney.id);
    expectSchemaValid(output);
  });

  it("joins attempt evidence to catalog candidates without turning them into confirmed causes", () => {
    const output = assembleDiagnosis({
      platform: "platform:render",
      journeys: atlasRecords,
      caseFile: attemptCase(),
    });

    expect(output.analysis_status).toBe("plausible-hypothesis");
    expect(output.what_may_be_happening).toHaveLength(3);
    expect(output.what_may_be_happening.every((item) => item.evidence_state === "inferred")).toBe(true);
    expect(output.what_may_be_happening.every((item) => item.limitations.some((text) =>
      text.includes("not a confirmed cause") || text.includes("not an individual reason"),
    ))).toBe(true);
    expect(output.what_we_know.at(-1)).toMatchObject({
      evidence_state: "directly-observed",
      source_ids: ["last-truth-1"],
    });
    expect(output.next_check).toBe("Observe whether the developer starts when the task is assigned a protected 20-minute window.");
    expectSchemaValid(output);
  });

  it("refuses to promote a real inventory reason even when given a reviewed-looking card", () => {
    const caseFile = attemptCase();
    const claim: DiagnosticClaim = {
      claimId: "unsupported-promotion",
      type: "reason_supported",
      statement: "Competing work caused this attempt to stop.",
      catalogId: "U01.02",
      evidenceEventIds: ["discriminator-1"],
      prerequisiteEvidence: {},
      lookalikeEvidence: {},
    };
    const card: ReasonDiagnosticCard = {
      reasonId: "U01.02",
      reviewState: "reviewed",
      reviewedAt: "2026-07-21T12:00:00.000Z",
      sourceIds: ["review:synthetic"],
      limitations: ["Synthetic card supplied only to test the eligibility gate."],
      observableImplication: "The attempt is displaced by competing work.",
      prerequisites: [],
      nearestLookalikeReasonIds: [],
      acceptedEvidenceKinds: ["direct_observation"],
    };
    const output = assembleDiagnosis({
      platform: "render",
      journeys: atlasRecords,
      caseFile,
      claims: [claim],
      cards: [card],
    });

    expect(output.analysis_status).toBe("insufficient-evidence");
    expect(output.what_may_be_happening).toEqual([]);
    expect(output.what_we_do_not_know).toContain("1 proposed diagnostic claim(s) did not pass the evidence contract.");
    expectSchemaValid(output);
  });

  it("returns a review-gated intake state instead of inventing an absent platform", () => {
    const output = assembleDiagnosis({ platform: "Platform That Does Not Exist", journeys: atlasRecords });

    expect(output).toMatchObject({
      platform_id: "platform:platform-that-does-not-exist",
      journey_id: null,
      analysis_status: "platform-not-present",
      what_we_know: [],
      what_may_be_happening: [],
    });
    expect(output.next_check).toContain("review-gated platform intake");
    expectSchemaValid(output);
  });

  it("shows only a comparison that passes subject, evidence, consistency, and anonymization gates", () => {
    const visible = assembleDiagnosis({
      platform: "render",
      journeys: atlasRecords,
      comparison: comparison(),
    });
    expect(visible.comparison).toMatchObject({
      analysis_eligible: true,
      pattern_claim_eligible: true,
      safe_to_anonymize: true,
    });
    expect(visible.comparison.summary).not.toBeNull();
    expectSchemaValid(visible);

    const inconsistent = assembleDiagnosis({
      platform: "render",
      journeys: atlasRecords,
      comparison: comparison({ analysis_eligible: false }),
    });
    expect(inconsistent.comparison.analysis_eligible).toBe(false);
    expect(inconsistent.comparison.summary).toBeNull();
    expect(inconsistent.comparison.withheld_reasons.some((reason) => reason.includes("declared analysis eligibility"))).toBe(true);
    expectSchemaValid(inconsistent);

    const unsafe = assembleDiagnosis({
      platform: "render",
      journeys: atlasRecords,
      comparison: comparison({ safe_to_anonymize: false, participant_summary: null }),
    });
    expect(unsafe.comparison.analysis_eligible).toBe(true);
    expect(unsafe.comparison.safe_to_anonymize).toBe(false);
    expect(unsafe.comparison.summary).toBeNull();
    expectSchemaValid(unsafe);
  });

  it("fails closed when a journey references a missing source", () => {
    const broken: AtlasJourneyRecord = {
      ...renderJourney,
      id: "journey:render:broken-source-test",
      stages: renderJourney.stages.map((stage, index) => index === 0
        ? { ...stage, source_ids: ["MISSING-SOURCE"] }
        : stage),
    };

    expect(() => assembleDiagnosis({ platform: "render", journeys: [broken] })).toThrow(AtlasIntegrityError);
  });
});
