import { describe, expect, it } from "vitest";
import { catalog, getCatalogNode, getFamiliesForStage, getReasonsForParent, hasCatalogId } from "./catalog";

describe("compiled blocker catalog", () => {
  it("preserves the complete research inventory", () => {
    expect(catalog.counts.universalFamilies).toBe(28);
    expect(catalog.counts.platformArchetypes).toBe(16);
    expect(catalog.counts.universalReasons).toBe(466);
    expect(catalog.counts.platformReasons).toBe(324);
    expect(catalog.counts.reasons).toBe(790);
  });

  it("keeps every reason addressable under its source parent", () => {
    const reasons = catalog.nodes.filter((node) => node.kind === "reason");
    expect(new Set(reasons.map((reason) => reason.id)).size).toBe(790);
    for (const reason of reasons) {
      expect(reason.parentId).toBeTruthy();
      expect(hasCatalogId(reason.parentId!)).toBe(true);
      expect(getReasonsForParent(reason.parentId!).some((child) => child.id === reason.id)).toBe(true);
    }
  });

  it("does not promote source reasons beyond inventory maturity", () => {
    expect(getCatalogNode("U06.01")?.catalogMaturity).toBe("inventory");
    expect(getCatalogNode("U06.01")?.diagnosticEligibility).toBe("not_diagnosis_eligible");
    expect(getCatalogNode("P16.01")?.catalogMaturity).toBe("inventory");
    expect(getCatalogNode("P16.01")?.diagnosticEligibility).toBe("not_diagnosis_eligible");
  });

  it("keeps cross-cutting measurement reasons available at every stage", () => {
    for (const stageId of ["S00", "S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08"]) {
      expect(getFamiliesForStage(stageId).some((family) => family.id === "U27")).toBe(true);
    }
  });
});
