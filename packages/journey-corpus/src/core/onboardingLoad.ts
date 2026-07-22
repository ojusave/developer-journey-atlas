import type { DataStore, MetricRow, QualityRow } from "./ports.js";

export const MIN_COMPARABLE_PEERS = 3;

export interface LoadComponent {
  key: "requiredActions" | "waits" | "decisions" | "gates";
  label: string;
  value: number;
  peerMedian: number;
  position: "below" | "at" | "above";
}

export interface DocumentedOnboardingLoad {
  available: boolean;
  label: string;
  summary: string;
  category: string;
  finishLine: string;
  peerCount: number;
  signalsAboveMedian: number | null;
  signalCount: number;
  components: LoadComponent[];
  note: string;
}

interface QualifiedRow {
  row: MetricRow;
  quality: QualityRow;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return Math.round(value * 10) / 10;
}

function position(value: number, peerMedian: number): LoadComponent["position"] {
  if (value < peerMedian) return "below";
  if (value > peerMedian) return "above";
  return "at";
}

function unavailable(row: MetricRow, reason: string, peerCount = 0): DocumentedOnboardingLoad {
  return {
    available: false,
    label: "Not enough comparable evidence",
    summary: reason,
    category: row.category,
    finishLine: row.first_success_type,
    peerCount,
    signalsAboveMedian: null,
    signalCount: 4,
    components: [],
    note: "This is documentation-derived route structure, not observed drop-off, conversion, usability, or completion time.",
  };
}

/**
 * Build a conservative, anonymous comparison of documented route structure.
 * No weighted effort score is used. Each visible signal is compared directly
 * with the median of qualified peers and stays independently inspectable.
 */
export function buildDocumentedOnboardingLoad(row: MetricRow, store: DataStore): DocumentedOnboardingLoad {
  const targetQuality = store.getQuality(row.slug);
  if (row.research_status !== "complete") {
    return unavailable(row, "This record is not marked complete, so no peer placement is shown.");
  }
  if (!targetQuality || row.comparability_status === "not-comparable") {
    return unavailable(row, "This route does not have the quality metadata required for a responsible peer comparison.");
  }

  const peers: QualifiedRow[] = store.listRows()
    .filter((candidate) => candidate.slug !== row.slug)
    .filter((candidate) => candidate.category === row.category)
    .filter((candidate) => candidate.first_success_type === row.first_success_type)
    .filter((candidate) => candidate.research_status === "complete")
    .filter((candidate) => candidate.comparability_status !== "not-comparable")
    .map((candidate) => ({ row: candidate, quality: store.getQuality(candidate.slug) }))
    .filter((candidate): candidate is QualifiedRow => Boolean(candidate.quality))
    .filter((candidate) => candidate.quality.re_researched === targetQuality.re_researched);

  if (peers.length < MIN_COMPARABLE_PEERS) {
    return unavailable(
      row,
      `Only ${peers.length} qualified peer${peers.length === 1 ? "" : "s"} share this category, finish line, and research granularity. At least ${MIN_COMPARABLE_PEERS} are required.`,
      peers.length,
    );
  }

  const definitions = [
    {
      key: "requiredActions" as const,
      label: "Required developer actions",
      value: row.required_developer_action_count,
      peerValues: peers.map((peer) => peer.row.required_developer_action_count),
    },
    {
      key: "waits" as const,
      label: "Wait or async points",
      value: row.wait_or_async_count,
      peerValues: peers.map((peer) => peer.row.wait_or_async_count),
    },
    {
      key: "decisions" as const,
      label: "Decision points",
      value: targetQuality.decision_count,
      peerValues: peers.map((peer) => peer.quality.decision_count),
    },
    {
      key: "gates" as const,
      label: "Documented friction gates",
      value: row.gate_count,
      peerValues: peers.map((peer) => peer.row.gate_count),
    },
  ];

  const components: LoadComponent[] = definitions.map((definition) => {
    const peerMedian = median(definition.peerValues);
    return {
      key: definition.key,
      label: definition.label,
      value: definition.value,
      peerMedian,
      position: position(definition.value, peerMedian),
    };
  });
  const above = components.filter((component) => component.position === "above").length;

  return {
    available: true,
    label: `${above} of ${components.length} route signals above peer median`,
    summary: `Anonymous comparison with ${peers.length} qualified ${row.category} peers that document the same first-success boundary.`,
    category: row.category,
    finishLine: row.first_success_type,
    peerCount: peers.length,
    signalsAboveMedian: above,
    signalCount: components.length,
    components,
    note: "Documented onboarding load compares visible route structure only. It is not a drop-off score, conversion rate, usability judgment, or observed completion time.",
  };
}
