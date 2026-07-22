import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DataStore, DatasetMeta, MetricRow, PlatformRecord, QualityRow, ShortestPathAudit } from "../core/ports.js";
import { buildJourneyOverlay, type JourneyOverlay } from "../core/journeyOverlay.js";
import { resolveCatalogPath } from "../db/catalogPath.js";

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

interface QualityFile {
  records?: QualityRow[];
}

interface AuditStatusFile {
  verified?: number;
  pending?: number;
  blocked?: number;
  needs_human_judgment?: number;
}

interface CatalogNode {
  id: string;
  kind: string;
  label: string;
  diagnosticEligibility?: string | null;
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
  private readonly auditsDir: string;
  private readonly qualityBySlug: Map<string, QualityRow>;
  private readonly recordCache = new Map<string, PlatformRecord | undefined>();
  private readonly auditCache = new Map<string, ShortestPathAudit | undefined>();
  private readonly families = new Map<string, { id: string; label: string; kind: string; diagnosticEligibility: string | null }>();
  private readonly reasonCount: number;

  constructor(dataRoot: string) {
    const heuristic = readJson<HeuristicFile>(path.join(dataRoot, "selected-path-heuristic.json"));
    this.rows = heuristic.rows ?? [];
    this.bySlug = new Map(this.rows.map((r) => [r.slug, r]));
    this.recordsDir = path.join(dataRoot, "records");
    this.auditsDir = path.join(dataRoot, "audits");
    const quality = readJson<QualityFile>(path.join(dataRoot, "ds-quality.json"));
    this.qualityBySlug = new Map((quality.records ?? []).map((record) => [record.slug, record]));

    let coverage: CoverageFile = {};
    try {
      coverage = readJson<CoverageFile>(path.join(dataRoot, "coverage.json"));
    } catch {
      coverage = {};
    }
    const covRecords = coverage.records ?? [];
    let auditStatus: AuditStatusFile = {};
    try {
      auditStatus = readJson<AuditStatusFile>(path.join(dataRoot, "audit-status.json"));
    } catch {
      auditStatus = {};
    }

    let reasonCount = 0;
    try {
      const catalog = readJson<{ nodes: CatalogNode[] }>(resolveCatalogPath(dataRoot));
      for (const node of catalog.nodes) {
        if (node.kind === "universal_family") {
          this.families.set(node.id, {
            id: node.id,
            label: node.label,
            kind: node.kind,
            diagnosticEligibility: node.diagnosticEligibility ?? "not_diagnosis_eligible",
          });
        }
        if (node.kind === "reason") reasonCount += 1;
      }
    } catch {
      reasonCount = 0;
    }
    this.reasonCount = reasonCount;

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
      audits: {
        verified: auditStatus.verified ?? 0,
        pending: auditStatus.pending ?? this.rows.length,
        blocked: auditStatus.blocked ?? 0,
        needsHumanJudgment: auditStatus.needs_human_judgment ?? 0,
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

  getAudit(slug: string): ShortestPathAudit | undefined {
    if (this.auditCache.has(slug)) return this.auditCache.get(slug);
    let audit: ShortestPathAudit | undefined;
    try {
      audit = readJson<ShortestPathAudit>(path.join(this.auditsDir, `${slug}.json`));
    } catch {
      audit = undefined;
    }
    this.auditCache.set(slug, audit);
    return audit;
  }

  getQuality(slug: string): QualityRow | undefined {
    return this.qualityBySlug.get(slug);
  }

  getJourney(slug: string): JourneyOverlay | undefined {
    const record = this.getRecord(slug);
    if (!record) return undefined;
    return buildJourneyOverlay(record, {
      familyLookup: (familyId) => this.families.get(familyId) ?? null,
    });
  }

  blockerReasonCount(): number {
    return this.reasonCount;
  }
}

export function catalogExists(dataRoot: string): boolean {
  try {
    return existsSync(resolveCatalogPath(dataRoot));
  } catch {
    return false;
  }
}
