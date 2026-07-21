import { readFileSync } from "node:fs";
import path from "node:path";
import type { DataStore, DatasetMeta, MetricRow, PlatformRecord } from "../core/ports.js";

interface HeuristicFile {
  score_model_version?: string;
  source_snapshot_date?: string;
  caveats?: string[];
  rows: MetricRow[];
}

interface CoverageFile {
  generated_at?: string;
  roster_count?: number;
  records?: Array<{ steps: number; sources: number }>;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/**
 * DataStore backed by the repository's committed JSON artifacts. Rows and
 * dataset metadata load once at construction; canonical records load lazily and
 * are cached. A missing canonical record degrades to undefined rather than
 * throwing, so the API can still serve metrics.
 */
export class LocalDataStore implements DataStore {
  private readonly rows: MetricRow[];
  private readonly bySlug: Map<string, MetricRow>;
  private readonly metaValue: DatasetMeta;
  private readonly recordsDir: string;
  private readonly recordCache = new Map<string, PlatformRecord | undefined>();

  constructor(dataRoot: string) {
    const heuristic = readJson<HeuristicFile>(path.join(dataRoot, "selected-path-heuristic.json"));
    this.rows = heuristic.rows ?? [];
    this.bySlug = new Map(this.rows.map((r) => [r.slug, r]));
    this.recordsDir = path.join(dataRoot, "records");

    let coverage: CoverageFile = {};
    try {
      coverage = readJson<CoverageFile>(path.join(dataRoot, "coverage.json"));
    } catch {
      coverage = {};
    }
    const covRecords = coverage.records ?? [];

    this.metaValue = {
      count: this.rows.length,
      generatedAt: coverage.generated_at ?? heuristic.source_snapshot_date ?? null,
      scoreModelVersion: heuristic.score_model_version ?? null,
      caveats: heuristic.caveats ?? [],
      totals: {
        platforms: coverage.roster_count ?? this.rows.length,
        steps: covRecords.reduce((t, r) => t + (r.steps ?? 0), 0),
        sources: covRecords.reduce((t, r) => t + (r.sources ?? 0), 0),
      },
    };
  }

  meta(): DatasetMeta {
    return this.metaValue;
  }

  listRows(): MetricRow[] {
    return this.rows;
  }

  getRow(slug: string): MetricRow | undefined {
    return this.bySlug.get(slug);
  }

  getRecord(slug: string): PlatformRecord | undefined {
    if (this.recordCache.has(slug)) return this.recordCache.get(slug);
    let record: PlatformRecord | undefined;
    try {
      record = readJson<PlatformRecord>(path.join(this.recordsDir, `${slug}.json`));
    } catch {
      record = undefined;
    }
    this.recordCache.set(slug, record);
    return record;
  }
}
