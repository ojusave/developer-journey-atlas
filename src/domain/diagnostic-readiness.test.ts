import { describe, expect, it } from "vitest";
import { getDiagnosticReadiness } from "./diagnostic-readiness";

describe("diagnostic question readiness", () => {
  it("does not mistake catalog access for reason-determination readiness", () => {
    const report = getDiagnosticReadiness();
    expect(report.workshopReadyForReasonDetermination).toBe(false);
    expect(report.workshopReadyForSafeNarrowing).toBe(true);
    expect(report.reasons.total).toBe(790);
    expect(report.reasons.reachable).toBe(790);
    expect(report.reasons.diagnosisEligible).toBe(0);
    expect(report.mappedCaseCapabilities.reasonDetermination).toBe(false);
  });

  it("reports the exact research coverage of the current question routes", () => {
    const report = getDiagnosticReadiness();
    expect(report.universalFamilies).toEqual({
      total: 28,
      referenced: 28,
      missingIds: [],
    });
    expect(report.platformArchetypes.referenced).toBe(16);
    expect(report.platformArchetypes.missingIds).toHaveLength(0);
    expect(report.reasons.referenced).toBeGreaterThan(90);
  });

  it("reports the implemented safe-narrowing recovery capabilities", () => {
    const report = getDiagnosticReadiness();
    expect(report.mappedCaseCapabilities.correctionRetraction).toBe(true);
    expect(report.mappedCaseCapabilities.catalogGapResult).toBe(true);
    expect(report.mappedCaseCapabilities.compoundResult).toBe(true);
    expect(report.mappedCaseCapabilities.boredomRecovery).toBe(true);
    expect(report.safeNarrowingGaps).toEqual([]);
  });
});
