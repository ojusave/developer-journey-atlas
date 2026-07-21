// EXPERIMENTAL / INTERNAL. Not wired into the public site.
//
// This builds a score-based, category-scoped distribution across platforms.
// Because that reads as a ranking, it is no longer shown publicly and is not
// mounted on the API router (see src/api/router.ts). The file is kept for
// reproducibility and in case a properly verified benchmark returns later.
import type { MetricRow } from "./ports.js";
import { MEASUREMENT_NOTE } from "./assessment.js";

export interface PeerMetric {
  name: string;
  slug: string;
  developerActions: number;
  gates: number;
  effortScore: number;
  comparability: string;
  finishLine: string;
  sameFinishLine: boolean;
}

export interface Distribution {
  value: number;
  categoryMedian: number;
  lowerCount: number;
  higherCount: number;
  equalCount: number;
}

export interface Comparison {
  category: string;
  platform: { name: string; slug: string };
  finishLine: string;
  peerCount: number;
  comparablePeerCount: number;
  /** Peers that reach the same documented finish line and drive the distribution. */
  sameFinishLineCount: number;
  /** Peers whose documented route ends at a different milestone (not compared). */
  differentFinishLineCount: number;
  peers: PeerMetric[];
  distribution: {
    developerActions: Distribution;
    gates: Distribution;
    effortScore: Distribution;
  };
  comparabilityNote: string;
  note: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(raw * 10) / 10;
}

function distribution(value: number, peerValues: number[]): Distribution {
  return {
    value,
    categoryMedian: median([value, ...peerValues]),
    lowerCount: peerValues.filter((v) => v < value).length,
    higherCount: peerValues.filter((v) => v > value).length,
    equalCount: peerValues.filter((v) => v === value).length,
  };
}

/**
 * Place a platform in the context of its category peers. The distribution is
 * computed ONLY against peers that reach the same documented finish line
 * (first_success_type) and are not flagged not-comparable, because comparing a
 * route that ends at "account created" with one that ends at "app deployed" is
 * apples-to-oranges. Peers with a different finish line are still listed for
 * transparency but never fold into the numbers, and nothing here is a rank.
 */
export function buildComparison(row: MetricRow, allRows: MetricRow[]): Comparison {
  const peers = allRows.filter((r) => r.category === row.category && r.slug !== row.slug);
  const sameFinish = peers.filter((r) => r.first_success_type === row.first_success_type);
  const differentFinish = peers.filter((r) => r.first_success_type !== row.first_success_type);

  // Distribution is only over same-finish-line peers that are themselves comparable.
  const distributionPeers = sameFinish.filter((r) => r.comparability_status !== "not-comparable");
  const peerActions = distributionPeers.map((r) => r.developer_action_count);
  const peerGates = distributionPeers.map((r) => r.gate_count);
  const peerEffort = distributionPeers.map((r) => r.heuristic_effort_score);

  const finishLine = row.first_success_type;
  const comparabilityNote =
    distributionPeers.length === 0
      ? `No other "${row.category}" platform documents the same finish line ("${finishLine}"), so there is nothing to place this route against. The peers below reach a different milestone.`
      : `Compared only against ${distributionPeers.length} peer(s) whose documented route ends at the same milestone ("${finishLine}"). A lower count is a shorter documented route, not an easier or better product. Peers that stop at a different milestone are listed separately and not counted.`;

  return {
    category: row.category,
    platform: { name: row.name, slug: row.slug },
    finishLine,
    peerCount: peers.length,
    comparablePeerCount: distributionPeers.length,
    sameFinishLineCount: sameFinish.length,
    differentFinishLineCount: differentFinish.length,
    peers: peers
      .map((r) => ({
        name: r.name,
        slug: r.slug,
        developerActions: r.developer_action_count,
        gates: r.gate_count,
        effortScore: r.heuristic_effort_score,
        comparability: r.comparability_status,
        finishLine: r.first_success_type,
        sameFinishLine: r.first_success_type === row.first_success_type,
      }))
      .sort((a, b) => {
        // Same-finish-line peers first, then by name.
        if (a.sameFinishLine !== b.sameFinishLine) return a.sameFinishLine ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    distribution: {
      developerActions: distribution(row.developer_action_count, peerActions),
      gates: distribution(row.gate_count, peerGates),
      effortScore: distribution(row.heuristic_effort_score, peerEffort),
    },
    comparabilityNote,
    note: MEASUREMENT_NOTE,
  };
}
