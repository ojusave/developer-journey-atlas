import { describe, expect, it } from "vitest";
import comparisonSchema from "../../schemas/comparison-record.schema.json";
import { comparisonDimensionNames, evaluateComparisonEligibility, type ComparisonRecord } from "./comparison-validation";

function record(overrides: Partial<ComparisonRecord> = {}): ComparisonRecord {
  const peers = ["journey:peer-a:documented-primary", "journey:peer-b:documented-primary", "journey:peer-c:documented-primary"];
  return {
    comparison_id: "comparison:synthetic:subject",
    subject_journey_id: "journey:subject:documented-primary",
    peer_journey_ids: peers,
    matching_dimensions: [
      { name: "developer-goal", subject_value: "Send one request", peer_values: peers.map(() => "Send one request"), source_ids: ["source:goal"] },
      { name: "authentication-model", subject_value: "API key", peer_values: peers.map(() => "API key"), source_ids: ["source:auth"] },
    ],
    differing_dimensions: [],
    source_ids: ["source:goal", "source:auth"],
    limitations: ["Synthetic comparison. It does not establish performance or prevalence."],
    research_snapshots: [
      { journey_id: "journey:subject:documented-primary", researched_at: "2026-07-01" },
      ...peers.map((journey_id) => ({ journey_id, researched_at: "2026-07-01" })),
    ],
    analysis_eligible: true,
    minimum_comparison_count_met: true,
    pattern_claim_eligible: true,
    safe_to_anonymize: true,
    participant_summary: "Three qualified documented journeys use the same authentication model for this bounded goal.",
    withheld_reasons: [],
    ...overrides,
  };
}

describe("comparison eligibility", () => {
  it("keeps schema dimensions aligned with the runtime contract", () => {
    expect([...comparisonSchema.$defs.dimension.properties.name.enum].sort()).toEqual([...comparisonDimensionNames].sort());
  });

  it("accepts a sourced goal match plus a material structural match", () => {
    const report = evaluateComparisonEligibility(record());
    expect(report).toMatchObject({
      analysisEligible: true,
      minimumComparisonCountMet: true,
      patternClaimEligible: true,
      participantSummaryAllowed: true,
    });
  });

  it("rejects a mismatched developer goal", () => {
    const candidate = record({
      matching_dimensions: [{ name: "authentication-model", subject_value: "API key", peer_values: ["API key"], source_ids: ["source:auth"] }],
      differing_dimensions: [{ name: "developer-goal", subject_value: "Deploy an app", peer_values: ["Send a request"], source_ids: ["source:goal"] }],
      participant_summary: null,
      analysis_eligible: false,
      pattern_claim_eligible: false,
    });
    expect(evaluateComparisonEligibility(candidate).issues.map((issue) => issue.code)).toContain("missing_goal_or_finish_line");
  });

  it("rejects industry or platform archetype as the only similarity", () => {
    const candidate = record({
      matching_dimensions: [
        { name: "developer-goal", subject_value: "Send one request", peer_values: ["Send one request"], source_ids: ["source:goal"] },
        { name: "platform-archetype", subject_value: "API", peer_values: ["API"], source_ids: ["source:type"] },
      ],
      participant_summary: null,
      analysis_eligible: false,
      pattern_claim_eligible: false,
    });
    expect(evaluateComparisonEligibility(candidate).issues.map((issue) => issue.code)).toContain("missing_structural_match");
  });

  it("allows a bounded comparison but no pattern claim with fewer than three peers", () => {
    const candidate = record({
      peer_journey_ids: ["journey:peer-a:documented-primary"],
      research_snapshots: [
        { journey_id: "journey:subject:documented-primary", researched_at: "2026-07-01" },
        { journey_id: "journey:peer-a:documented-primary", researched_at: "2026-07-01" },
      ],
      matching_dimensions: [
        { name: "developer-goal", subject_value: "Send one request", peer_values: ["Send one request"], source_ids: ["source:goal"] },
        { name: "authentication-model", subject_value: "API key", peer_values: ["API key"], source_ids: ["source:auth"] },
      ],
      participant_summary: "The available comparison shows one documented journey using an API key.",
      minimum_comparison_count_met: false,
      pattern_claim_eligible: false,
      withheld_reasons: ["The cohort is too small for broader pattern language."],
    });
    expect(evaluateComparisonEligibility(candidate)).toMatchObject({
      analysisEligible: true,
      minimumComparisonCountMet: false,
      patternClaimEligible: false,
      participantSummaryAllowed: true,
    });
  });

  it("rejects broad pattern language for a bounded comparison", () => {
    const candidate = record({
      peer_journey_ids: ["journey:peer-a:documented-primary"],
      matching_dimensions: [
        { name: "developer-goal", subject_value: "Send one request", peer_values: ["Send one request"], source_ids: ["source:goal"] },
        { name: "authentication-model", subject_value: "API key", peer_values: ["API key"], source_ids: ["source:auth"] },
      ],
      research_snapshots: [
        { journey_id: "journey:subject:documented-primary", researched_at: "2026-07-01" },
        { journey_id: "journey:peer-a:documented-primary", researched_at: "2026-07-01" },
      ],
      minimum_comparison_count_met: false,
      pattern_claim_eligible: false,
      participant_summary: "Similar platforms usually use an API key.",
      withheld_reasons: ["The cohort is too small for broader pattern language."],
    });
    expect(evaluateComparisonEligibility(candidate).issues.map((issue) => issue.code)).toContain("unsupported_pattern_language");

    const unsupportedDenominatorClaim = record({ participant_summary: "Most platforms use an API key." });
    expect(evaluateComparisonEligibility(unsupportedDenominatorClaim).issues.map((issue) => issue.code)).toContain("unsupported_pattern_language");
  });

  it("withholds participant output when anonymization is unsafe", () => {
    const withheld = evaluateComparisonEligibility(record({ safe_to_anonymize: false, participant_summary: null }));
    expect(withheld.participantSummaryAllowed).toBe(false);
    expect(withheld.issues.map((issue) => issue.code)).toContain("unsafe_anonymization");

    const leaked = evaluateComparisonEligibility(record({ safe_to_anonymize: false }));
    expect(leaked.issues.map((issue) => issue.code)).toContain("summary_present_when_withheld");
  });

  it("requires source IDs, limitations, and dated snapshots to remain visible", () => {
    const candidate = record({
      source_ids: [],
      research_snapshots: [],
      participant_summary: null,
      analysis_eligible: false,
      pattern_claim_eligible: false,
    });
    expect(candidate.limitations).not.toHaveLength(0);
    expect(evaluateComparisonEligibility(candidate).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "missing_source_evidence",
      "missing_research_snapshot",
    ]));
  });

  it("rejects incomplete peer values and inconsistent declared flags", () => {
    const candidate = record({
      matching_dimensions: [
        { name: "developer-goal", subject_value: "Send one request", peer_values: ["Send one request"], source_ids: ["source:goal"] },
        { name: "authentication-model", subject_value: "API key", peer_values: ["OAuth"], source_ids: ["source:auth"] },
      ],
    });
    expect(evaluateComparisonEligibility(candidate).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "incomplete_peer_values",
      "misclassified_matching_dimension",
      "declared_eligibility_mismatch",
      "declared_pattern_mismatch",
    ]));
  });
});
