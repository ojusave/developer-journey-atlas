import type { DataStore, MetricRow, PlatformRecord } from "./ports.js";
import { buildDocumentedOnboardingLoad, type DocumentedOnboardingLoad, type LoadComponent } from "./onboardingLoad.js";

export type CurveScope = "corpus" | "category";
export type CurveLayerKind = "verified" | "draftDocumented";

export interface CurveSignal {
  key: string;
  label: string;
  value: number;
  peerMedian: number;
  peerCount: number;
  position: "below" | "at" | "above";
  percentile: number | null;
}

export interface CurveScopeResult {
  available: boolean;
  scope: CurveScope;
  peerCount: number;
  signalsAboveMedian: number | null;
  components: CurveSignal[];
  summary: string;
}

export interface CurveLayer {
  kind: CurveLayerKind;
  available: boolean;
  label: string;
  note: string;
  corpus: CurveScopeResult;
  category: CurveScopeResult;
}

export interface CurvePlacement {
  slug: string;
  category: string;
  verified: CurveLayer;
  draftDocumented: CurveLayer;
  note: string;
}

const DRAFT_NOTE =
  "Draft documented structure from official-docs journey records. Not a verified shortest-path audit, not drop-off, not conversion, not usability.";

const VERIFIED_NOTE =
  "Verified documented onboarding load from shortest-path audits only. Not drop-off, conversion, or usability.";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return Math.round(value * 10) / 10;
}

function position(value: number, peerMedian: number): CurveSignal["position"] {
  if (value < peerMedian) return "below";
  if (value > peerMedian) return "above";
  return "at";
}

/** Percentile of value among peers+self (0–100). Null if empty. */
export function percentileRank(value: number, population: number[]): number | null {
  if (population.length === 0) return null;
  const below = population.filter((v) => v < value).length;
  const equal = population.filter((v) => v === value).length;
  const rank = (below + equal * 0.5) / population.length;
  return Math.round(rank * 1000) / 10;
}

interface DraftSignals {
  documentedSteps: number;
  requiredSteps: number;
  documentedFrictionGates: number;
  waitTypedGates: number;
}

function draftSignalsFromRecord(record: PlatformRecord | undefined): DraftSignals | null {
  if (!record?.primary_path?.length) return null;
  const gates = record.friction_gates ?? [];
  return {
    documentedSteps: record.primary_path.length,
    requiredSteps: record.primary_path.filter((step) => step.required !== false).length,
    documentedFrictionGates: gates.length,
    waitTypedGates: gates.filter((gate) => {
      const type = (gate.type ?? "").toLowerCase();
      return type === "wait" || type === "rate-limit";
    }).length,
  };
}

function emptyScope(scope: CurveScope, summary: string, peerCount = 0): CurveScopeResult {
  return {
    available: false,
    scope,
    peerCount,
    signalsAboveMedian: null,
    components: [],
    summary,
  };
}

function buildDraftScope(
  scope: CurveScope,
  self: DraftSignals,
  peerSignals: DraftSignals[],
): CurveScopeResult {
  if (peerSignals.length < 3) {
    return emptyScope(
      scope,
      `Only ${peerSignals.length} peer${peerSignals.length === 1 ? "" : "s"} with documented journeys. At least 3 are required.`,
      peerSignals.length,
    );
  }

  const defs: Array<{ key: keyof DraftSignals; label: string }> = [
    { key: "documentedSteps", label: "Documented journey steps" },
    { key: "requiredSteps", label: "Required journey steps" },
    { key: "documentedFrictionGates", label: "Documented friction gates" },
    { key: "waitTypedGates", label: "Wait or rate-limit gates" },
  ];

  const components: CurveSignal[] = defs.map((def) => {
    const peerValues = peerSignals.map((peer) => peer[def.key]);
    const population = [...peerValues, self[def.key]];
    const peerMedian = median(peerValues);
    const value = self[def.key];
    return {
      key: def.key,
      label: def.label,
      value,
      peerMedian,
      peerCount: peerSignals.length,
      position: position(value, peerMedian),
      percentile: percentileRank(value, population),
    };
  });
  const above = components.filter((c) => c.position === "above").length;

  return {
    available: true,
    scope,
    peerCount: peerSignals.length,
    signalsAboveMedian: above,
    components,
    summary:
      scope === "category"
        ? `Draft comparison with ${peerSignals.length} category peers on documented route shape.`
        : `Draft comparison with ${peerSignals.length} corpus peers on documented route shape.`,
  };
}

function loadToScope(load: DocumentedOnboardingLoad, scope: CurveScope): CurveScopeResult {
  if (!load.available) {
    return emptyScope(scope, load.summary, load.peerCount);
  }
  return {
    available: true,
    scope,
    peerCount: load.peerCount,
    signalsAboveMedian: load.signalsAboveMedian,
    components: load.components.map((c: LoadComponent) => ({
      key: c.key,
      label: c.label,
      value: c.value,
      peerMedian: c.peerMedian,
      peerCount: load.peerCount,
      position: c.position,
      percentile: null,
    })),
    summary: load.summary,
  };
}

/**
 * Build corpus + category curves for verified (strict) and draft documented (pragmatic) layers.
 * OpenRouter / taxonomy links are intentionally excluded from all math.
 */
export function buildCurvePlacement(row: MetricRow, store: DataStore): CurvePlacement {
  const categoryLoad = buildDocumentedOnboardingLoad(row, store);

  // Corpus verified: same rules as category load but peers may be any category.
  const targetAudit = store.getAudit(row.slug);
  const targetQuality = store.getQuality(row.slug);
  let verifiedCorpus = emptyScope(
    "corpus",
    "Verified corpus placement requires a verified audit and at least 3 qualified verified peers.",
  );

  if (
    targetAudit?.audit_status === "verified" &&
    targetAudit.counts &&
    row.research_status === "complete" &&
    targetQuality &&
    row.comparability_status !== "not-comparable"
  ) {
    const peers = store.listRows()
      .filter((candidate) => candidate.slug !== row.slug)
      .filter((candidate) => candidate.first_success_type === row.first_success_type)
      .filter((candidate) => candidate.research_status === "complete")
      .filter((candidate) => store.getAudit(candidate.slug)?.audit_status === "verified")
      .filter((candidate) => candidate.comparability_status !== "not-comparable")
      .filter((candidate) => {
        const q = store.getQuality(candidate.slug);
        return q && q.re_researched === targetQuality.re_researched;
      });

    if (peers.length >= 3) {
      const counts = targetAudit.counts;
      const defs = [
        { key: "requiredActions", label: "Required developer actions", value: counts.required_actions, pick: (slug: string) => store.getAudit(slug)?.counts?.required_actions ?? 0 },
        { key: "waits", label: "Wait or async points", value: counts.unavoidable_waits, pick: (slug: string) => store.getAudit(slug)?.counts?.unavoidable_waits ?? 0 },
        { key: "requiredFields", label: "Required fields", value: counts.required_fields, pick: (slug: string) => store.getAudit(slug)?.counts?.required_fields ?? 0 },
        { key: "gates", label: "Documented friction gates", value: counts.external_gates, pick: (slug: string) => store.getAudit(slug)?.counts?.external_gates ?? 0 },
      ];
      const components: CurveSignal[] = defs.map((def) => {
        const peerValues = peers.map((peer) => def.pick(peer.slug));
        const peerMedian = median(peerValues);
        return {
          key: def.key,
          label: def.label,
          value: def.value,
          peerMedian,
          peerCount: peers.length,
          position: position(def.value, peerMedian),
          percentile: percentileRank(def.value, [...peerValues, def.value]),
        };
      });
      verifiedCorpus = {
        available: true,
        scope: "corpus",
        peerCount: peers.length,
        signalsAboveMedian: components.filter((c) => c.position === "above").length,
        components,
        summary: `Anonymous verified comparison with ${peers.length} corpus peers sharing the same first-success boundary.`,
      };
    } else {
      verifiedCorpus = emptyScope(
        "corpus",
        `Only ${peers.length} qualified verified corpus peers. At least 3 are required.`,
        peers.length,
      );
    }
  }

  const verified: CurveLayer = {
    kind: "verified",
    available: categoryLoad.available || verifiedCorpus.available,
    label: categoryLoad.available || verifiedCorpus.available
      ? "Verified documented onboarding load"
      : "Verified curve unavailable",
    note: VERIFIED_NOTE,
    corpus: verifiedCorpus,
    category: loadToScope(categoryLoad, "category"),
  };

  const selfDraft = draftSignalsFromRecord(store.getRecord(row.slug));
  let draftCorpus = emptyScope("corpus", "No documented primary_path for this platform.");
  let draftCategory = emptyScope("category", "No documented primary_path for this platform.");

  if (selfDraft) {
    const allDraftPeers: DraftSignals[] = [];
    const categoryDraftPeers: DraftSignals[] = [];
    for (const candidate of store.listRows()) {
      if (candidate.slug === row.slug) continue;
      if (candidate.research_status !== "complete") continue;
      const signals = draftSignalsFromRecord(store.getRecord(candidate.slug));
      if (!signals) continue;
      allDraftPeers.push(signals);
      if (candidate.category === row.category) categoryDraftPeers.push(signals);
    }
    draftCorpus = buildDraftScope("corpus", selfDraft, allDraftPeers);
    draftCategory = buildDraftScope("category", selfDraft, categoryDraftPeers);
  }

  const draftDocumented: CurveLayer = {
    kind: "draftDocumented",
    available: draftCorpus.available || draftCategory.available,
    label: "Draft documented route structure",
    note: DRAFT_NOTE,
    corpus: draftCorpus,
    category: draftCategory,
  };

  return {
    slug: row.slug,
    category: row.category,
    verified,
    draftDocumented,
    note:
      "Curves compare documentation-derived counts only. OpenRouter blocker links and the 790-reason taxonomy never affect placement.",
  };
}
