import type { MetricRow } from "./ports.js";
import { percentileRank } from "./curvePlacement.js";

export const ONBOARDING_SCORE_MODEL_VERSION = "onboarding-load-1.0";
export const MIN_SCORE_PEERS = 3;

export type LoadBand = "light" | "moderate" | "heavy";
export type ScoreScope = "overall" | "peers";

export interface ScoreBreakdown {
  effort: number;
  requiredActions: number;
  gates: number;
  waits: number;
}

export interface PlacementScore {
  available: boolean;
  scope: ScoreScope;
  /** Percentile of documented load within the peer set. 0 = lightest, 100 = heaviest. */
  score: number | null;
  band: LoadBand | null;
  peerCount: number;
  peerMedianEffort: number | null;
  position: "below" | "at" | "above" | null;
  summary: string;
}

export interface OnboardingScore {
  modelVersion: string;
  name: string;
  finishLine: string;
  category: string;
  breakdown: ScoreBreakdown;
  overall: PlacementScore;
  peers: PlacementScore;
  note: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return Math.round(value * 10) / 10;
}

function bandFor(score: number): LoadBand {
  if (score < 25) return "light";
  if (score < 75) return "moderate";
  return "heavy";
}

function positionVsMedian(value: number, peerMedian: number): PlacementScore["position"] {
  if (value < peerMedian) return "below";
  if (value > peerMedian) return "above";
  return "at";
}

function eligiblePeers(row: MetricRow, allRows: MetricRow[], scope: ScoreScope): MetricRow[] {
  return allRows.filter((candidate) => {
    if (candidate.slug === row.slug) return false;
    if (candidate.research_status !== "complete") return false;
    if (candidate.comparability_status === "not-comparable") return false;
    if (candidate.first_success_type !== row.first_success_type) return false;
    if (scope === "peers" && candidate.category !== row.category) return false;
    return true;
  });
}

function buildPlacement(
  row: MetricRow,
  peers: MetricRow[],
  scope: ScoreScope,
): PlacementScore {
  if (peers.length < MIN_SCORE_PEERS) {
    return {
      available: false,
      scope,
      score: null,
      band: null,
      peerCount: peers.length,
      peerMedianEffort: null,
      position: null,
      summary:
        scope === "peers"
          ? `Only ${peers.length} category peer${peers.length === 1 ? "" : "s"} share this finish line. At least ${MIN_SCORE_PEERS} are required.`
          : `Only ${peers.length} corpus peer${peers.length === 1 ? "" : "s"} share this finish line. At least ${MIN_SCORE_PEERS} are required.`,
    };
  }

  const peerEffort = peers.map((peer) => peer.heuristic_effort_score);
  const population = [...peerEffort, row.heuristic_effort_score];
  const score = percentileRank(row.heuristic_effort_score, population);
  const peerMedianEffort = median(peerEffort);
  const safeScore = score ?? 0;

  return {
    available: true,
    scope,
    score: safeScore,
    band: bandFor(safeScore),
    peerCount: peers.length,
    peerMedianEffort,
    position: positionVsMedian(row.heuristic_effort_score, peerMedianEffort),
    summary:
      scope === "peers"
        ? `Compared with ${peers.length} ${row.category} peers that end at "${row.first_success_type}".`
        : `Compared with ${peers.length} platforms across the corpus that end at "${row.first_success_type}".`,
  };
}

/**
 * Documented Onboarding Load: overall (same finish line) and peer (category ∩ finish line) placements.
 * Higher score = heavier documented load. Not a ranking, time estimate, or UX judgment.
 */
export function buildOnboardingScore(row: MetricRow, allRows: MetricRow[]): OnboardingScore {
  const overallPeers = eligiblePeers(row, allRows, "overall");
  const categoryPeers = eligiblePeers(row, allRows, "peers");

  return {
    modelVersion: ONBOARDING_SCORE_MODEL_VERSION,
    name: "Documented Onboarding Load",
    finishLine: row.first_success_type,
    category: row.category,
    breakdown: {
      effort: row.heuristic_effort_score,
      requiredActions: row.required_developer_action_count,
      gates: row.gate_count,
      waits: row.wait_or_async_count,
    },
    overall: buildPlacement(row, overallPeers, "overall"),
    peers: buildPlacement(row, categoryPeers, "peers"),
    note: "Documentation-derived route load only. Not observed time, drop-off, conversion, or usability. Higher means a heavier documented path to first success.",
  };
}
