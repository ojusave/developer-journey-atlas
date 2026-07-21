import type { MetricRow, PlatformRecord } from "../src/core/ports.js";

/** Turn a record into the selected-path-heuristic row (runtime measurement bridge). */
export function selectedPathRow(record: PlatformRecord): MetricRow;

/** Per-record structured analysis used by the dataset generators. */
export function analyzeRecord(record: PlatformRecord): {
  transitions: Record<string, number>;
  comparability_status: string;
  route_selection_method: string;
  boundary_evidence_type: string | null;
  first_success_type: string;
  [key: string]: unknown;
};

export const MEASUREMENT_CONTRACT_VERSION: string;
