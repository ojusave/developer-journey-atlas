import { describe, expect, it } from "vitest";
import { auditKnowledgeGraphRuntime, buildCandidateUniverse, getReasonContext, resolvePlatformArchetypeIds } from "./knowledge-graph";

describe("knowledge graph runtime", () => {
  it("indexes every researched reason without promoting diagnostic maturity", () => {
    expect(auditKnowledgeGraphRuntime()).toEqual({
      reasonCount: 790,
      indexedReasonCount: 790,
      universalReasonCount: 466,
      platformReasonCount: 324,
      unreachableReasonIds: [],
      brokenEdgeNodeIds: [],
      platformArchetypesWithoutReasons: [],
      platformArchetypesWithoutSurfaceMapping: [],
    });
  });

  it("can retrieve all 790 reasons through stage and platform context", () => {
    const allPlatforms = Array.from({ length: 16 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
    const universe = buildCandidateUniverse({
      lastStage: "We cannot locate the stop yet",
      platformArchetypeIds: allPlatforms,
    });
    expect(universe.universalReasonIds).toHaveLength(466);
    expect(universe.platformReasonIds).toHaveLength(324);
    expect(universe.reasonIds).toHaveLength(790);
  });

  it("maps a grouped API surface to each relevant platform archetype", () => {
    expect(resolvePlatformArchetypeIds(["API or SDK"])).toEqual(["P04", "P06", "P16"]);
    const universe = buildCandidateUniverse({
      lastStage: "They tried to get access or approval",
      platformSurfaceLabels: ["API or SDK"],
    });
    expect(universe.reasonIds).toContain("P04.11");
    expect(universe.reasonIds).toContain("P16.09");
    expect(universe.universalFamilyIds).toContain("U19");
  });

  it("preserves source context for a platform-specific reason", () => {
    const context = getReasonContext("P04.11");
    expect(context?.parent.id).toBe("P04");
    expect(context?.applicablePlatformIds).toEqual(["P04"]);
    expect(context?.applicableStageIds).toEqual([]);
  });

  it("marks an unmapped surface as a catalog routing gap instead of guessing", () => {
    const universe = buildCandidateUniverse({
      lastStage: "No attempt observed",
      platformSurfaceLabels: ["Something else"],
    });
    expect(universe.hasUnmappedPlatformSurface).toBe(true);
    expect(universe.platformArchetypeIds).toEqual([]);
  });
});
