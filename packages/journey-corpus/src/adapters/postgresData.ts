import { PrismaClient } from "@prisma/client";
import type {
  DataStore,
  DatasetMeta,
  MetricRow,
  PlatformRecord,
  QualityRow,
  ShortestPathAudit,
} from "../core/ports.js";
import { familyIdForGateType } from "../db/gateTypeFamilyMap.js";
import { buildJourneyOverlay, type JourneyOverlay } from "../core/journeyOverlay.js";

interface FamilyInfo {
  id: string;
  label: string;
  kind: string;
  diagnosticEligibility: string | null;
}

/**
 * DataStore backed by Render Postgres. Corpus rows are loaded into memory at
 * construct so the existing sync DataStore port stays unchanged. Re-seed +
 * restart (or future refresh) to pick up imports.
 */
export class PostgresDataStore implements DataStore {
  private readonly prisma: PrismaClient;
  private readonly rows: MetricRow[];
  private readonly bySlug: Map<string, MetricRow>;
  private readonly qualityBySlug: Map<string, QualityRow>;
  private readonly metaValue: DatasetMeta;
  private readonly records = new Map<string, PlatformRecord>();
  private readonly audits = new Map<string, ShortestPathAudit>();
  private readonly gateIdsBySlug = new Map<string, Map<string, string>>();
  private readonly families = new Map<string, FamilyInfo>();
  private readonly reasonCount: number;

  private constructor(args: {
    prisma: PrismaClient;
    rows: MetricRow[];
    qualityBySlug: Map<string, QualityRow>;
    metaValue: DatasetMeta;
    records: Map<string, PlatformRecord>;
    audits: Map<string, ShortestPathAudit>;
    gateIdsBySlug: Map<string, Map<string, string>>;
    families: Map<string, FamilyInfo>;
    reasonCount: number;
  }) {
    this.prisma = args.prisma;
    this.rows = args.rows;
    this.bySlug = new Map(args.rows.map((row) => [row.slug, row]));
    this.qualityBySlug = args.qualityBySlug;
    this.metaValue = args.metaValue;
    this.records = args.records;
    this.audits = args.audits;
    this.gateIdsBySlug = args.gateIdsBySlug;
    this.families = args.families;
    this.reasonCount = args.reasonCount;
  }

  /** Load the full serving snapshot from Postgres. */
  static async create(prisma = new PrismaClient()): Promise<PostgresDataStore> {
    const [metrics, qualities, platforms, audits, gates, families, reasonCount, metaRow] =
      await Promise.all([
        prisma.metric.findMany(),
        prisma.quality.findMany(),
        prisma.platform.findMany(),
        prisma.audit.findMany(),
        prisma.frictionGate.findMany(),
        prisma.catalogNode.findMany({ where: { kind: "universal_family" } }),
        prisma.catalogNode.count({ where: { kind: "reason" } }),
        prisma.datasetMeta.findUnique({ where: { id: "singleton" } }),
      ]);

    if (metrics.length === 0) {
      throw new Error("Postgres has no metrics. Run `npm run db:seed` after migrate.");
    }

    const rows = metrics.map((row) => row.metricJson as unknown as MetricRow);
    const qualityBySlug = new Map(
      qualities.map((row) => [
        row.platformSlug,
        {
          slug: row.platformSlug,
          decision_count: row.decisionCount,
          re_researched: row.reResearched,
          comparability_status: row.comparabilityStatus,
        } satisfies QualityRow,
      ]),
    );

    const records = new Map<string, PlatformRecord>();
    for (const platform of platforms) {
      records.set(platform.slug, platform.recordJson as unknown as PlatformRecord);
    }

    const auditMap = new Map<string, ShortestPathAudit>();
    for (const audit of audits) {
      auditMap.set(audit.platformSlug, audit.auditJson as unknown as ShortestPathAudit);
    }

    const gatesBySlug = new Map<string, typeof gates>();
    for (const gate of gates) {
      const list = gatesBySlug.get(gate.platformSlug) ?? [];
      list.push(gate);
      gatesBySlug.set(gate.platformSlug, list);
    }

    const gateIdsBySlug = new Map<string, Map<string, string>>();
    for (const [slug, record] of records) {
      const dbGates = gatesBySlug.get(slug) ?? [];
      const idMap = new Map<string, string>();
      (record.friction_gates ?? []).forEach((gate, index) => {
        const match =
          dbGates.find(
            (row) =>
              row.type === (gate.type ?? "other") &&
              row.atStep === (gate.at_step ?? null) &&
              row.description === (gate.description ?? ""),
          ) ?? dbGates[index];
        if (match) idMap.set(`${gate.at_step ?? "x"}:${gate.type ?? "other"}:${index}`, match.id);
      });
      gateIdsBySlug.set(slug, idMap);
    }

    const familyMap = new Map<string, FamilyInfo>();
    for (const family of families) {
      familyMap.set(family.id, {
        id: family.id,
        label: family.label,
        kind: family.kind,
        diagnosticEligibility: family.diagnosticEligibility,
      });
    }

    const meta = (metaRow?.metaJson as DatasetMeta | undefined) ?? {
      count: rows.length,
      generatedAt: null,
      scoreModelVersion: null,
      caveats: [],
      totals: { platforms: rows.length, steps: 0, sources: 0 },
    };

    return new PostgresDataStore({
      prisma,
      rows,
      qualityBySlug,
      metaValue: meta,
      records,
      audits: auditMap,
      gateIdsBySlug,
      families: familyMap,
      reasonCount,
    });
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
    return this.records.get(slug);
  }

  getAudit(slug: string): ShortestPathAudit | undefined {
    return this.audits.get(slug);
  }

  getQuality(slug: string): QualityRow | undefined {
    return this.qualityBySlug.get(slug);
  }

  /** Joined journey with friction highlights and soft-mapped blocker families. */
  getJourney(slug: string): JourneyOverlay | undefined {
    const record = this.records.get(slug);
    if (!record) return undefined;
    return buildJourneyOverlay(record, {
      gateIds: this.gateIdsBySlug.get(slug),
      familyLookup: (familyId) => this.families.get(familyId) ?? null,
    });
  }

  blockerReasonCount(): number {
    return this.reasonCount;
  }

  async ping(): Promise<boolean> {
    await this.prisma.$queryRaw`SELECT 1`;
    return true;
  }
}

export type { JourneyOverlay };
