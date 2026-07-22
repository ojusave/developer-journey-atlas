import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { GATE_TYPE_FAMILY_MAP } from "./gateTypeFamilyMap.js";
import { resolveCatalogPath } from "./catalogPath.js";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asJsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
  return value == null ? undefined : (value as Prisma.InputJsonValue);
}

interface HeuristicFile {
  score_model_version?: string;
  source_snapshot_date?: string;
  caveats?: string[];
  rows: Array<Record<string, unknown> & { slug: string; name: string; category: string }>;
}

interface QualityFile {
  records?: Array<{
    slug: string;
    decision_count: number;
    re_researched: boolean;
    comparability_status: string;
  }>;
}

interface CoverageFile {
  generated_at?: string;
  roster_count?: number;
  records?: Array<{ steps: number; sources: number }>;
}

interface AuditStatusFile {
  verified?: number;
  pending?: number;
  blocked?: number;
  needs_human_judgment?: number;
}

interface CatalogFile {
  nodes: Array<{
    id: string;
    kind: string;
    label: string;
    description?: string | null;
    parentId?: string | null;
    scope?: string | null;
    catalogMaturity?: string | null;
    diagnosticEligibility?: string | null;
    sourceLine?: number | null;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    provenance?: string | null;
    reviewState?: string | null;
  }>;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Resolve blocker catalog JSON from env or known monorepo / package paths. */
export { resolveCatalogPath } from "./catalogPath.js";

/**
 * Idempotent import of journey records, audits, metrics, and the 790-reason catalog.
 */
export async function seedAtlasDatabase(dataRoot: string, prisma = new PrismaClient()): Promise<{
  platforms: number;
  reasons: number;
  gates: number;
}> {
  const heuristic = readJson<HeuristicFile>(path.join(dataRoot, "selected-path-heuristic.json"));
  const quality = readJson<QualityFile>(path.join(dataRoot, "ds-quality.json"));
  const qualityBySlug = new Map((quality.records ?? []).map((row) => [row.slug, row]));

  let coverage: CoverageFile = {};
  try {
    coverage = readJson<CoverageFile>(path.join(dataRoot, "coverage.json"));
  } catch {
    coverage = {};
  }
  let auditStatus: AuditStatusFile = {};
  try {
    auditStatus = readJson<AuditStatusFile>(path.join(dataRoot, "audit-status.json"));
  } catch {
    auditStatus = {};
  }

  const catalog = readJson<CatalogFile>(resolveCatalogPath(dataRoot));
  const recordsDir = path.join(dataRoot, "records");
  const auditsDir = path.join(dataRoot, "audits");

  let gateCount = 0;

  for (const row of heuristic.rows) {
    const recordPath = path.join(recordsDir, `${row.slug}.json`);
    if (!existsSync(recordPath)) continue;
    const raw = readFileSync(recordPath, "utf8");
    const record = JSON.parse(raw) as {
      platform?: { name?: string; organization?: string };
      category?: string;
      researched_at?: string;
      research_status?: string;
      primary_path?: Array<Record<string, unknown>>;
      friction_gates?: Array<Record<string, unknown>>;
    };

    await prisma.platform.upsert({
      where: { slug: row.slug },
      create: {
        slug: row.slug,
        name: String(record.platform?.name ?? row.name),
        organization: record.platform?.organization ?? null,
        category: String(record.category ?? row.category),
        researchedAt: record.researched_at ?? null,
        researchStatus: record.research_status ?? row.research_status as string ?? null,
        recordJson: asJson(JSON.parse(raw)),
        sourceSha256: sha256(raw),
      },
      update: {
        name: String(record.platform?.name ?? row.name),
        organization: record.platform?.organization ?? null,
        category: String(record.category ?? row.category),
        researchedAt: record.researched_at ?? null,
        researchStatus: record.research_status ?? (row.research_status as string) ?? null,
        recordJson: asJson(JSON.parse(raw)),
        sourceSha256: sha256(raw),
      },
    });

    await prisma.metric.upsert({
      where: { platformSlug: row.slug },
      create: { platformSlug: row.slug, metricJson: asJson(row) },
      update: { metricJson: asJson(row) },
    });

    const q = qualityBySlug.get(row.slug);
    if (q) {
      await prisma.quality.upsert({
        where: { platformSlug: row.slug },
        create: {
          platformSlug: row.slug,
          decisionCount: q.decision_count,
          reResearched: q.re_researched,
          comparabilityStatus: q.comparability_status,
        },
        update: {
          decisionCount: q.decision_count,
          reResearched: q.re_researched,
          comparabilityStatus: q.comparability_status,
        },
      });
    }

    await prisma.journeyStep.deleteMany({ where: { platformSlug: row.slug } });
    const steps = Array.isArray(record.primary_path) ? record.primary_path : [];
    if (steps.length) {
      await prisma.journeyStep.createMany({
        data: steps.map((step) => ({
          platformSlug: row.slug,
          stepNumber: Number(step.step_number),
          phase: (step.phase as string) ?? null,
          actor: (step.actor as string) ?? null,
          interface: (step.interface as string) ?? null,
          action: String(step.action ?? ""),
          details: asJsonOrUndefined(step.details),
          successSignal: (step.success_signal as string) ?? null,
          required: step.required !== false,
          sourceIds: asJsonOrUndefined(step.source_ids),
        })),
      });
    }

    await prisma.frictionGate.deleteMany({ where: { platformSlug: row.slug } });
    const gates = Array.isArray(record.friction_gates) ? record.friction_gates : [];
    if (gates.length) {
      await prisma.frictionGate.createMany({
        data: gates.map((gate) => ({
          platformSlug: row.slug,
          atStep: gate.at_step == null ? null : Number(gate.at_step),
          type: String(gate.type ?? "other"),
          description: String(gate.description ?? ""),
          documentedRequirement:
            typeof gate.documented_requirement === "boolean" ? gate.documented_requirement : null,
          sourceIds: asJsonOrUndefined(gate.source_ids),
        })),
      });
      gateCount += gates.length;
    }

    const auditPath = path.join(auditsDir, `${row.slug}.json`);
    if (existsSync(auditPath)) {
      const auditRaw = readFileSync(auditPath, "utf8");
      const audit = JSON.parse(auditRaw) as {
        audit_status?: string;
        audited_at?: string;
        source_record_sha256?: string;
        counts?: unknown;
      };
      await prisma.audit.upsert({
        where: { platformSlug: row.slug },
        create: {
          platformSlug: row.slug,
          auditStatus: String(audit.audit_status ?? "needs-human-judgment"),
          auditedAt: audit.audited_at ?? null,
          sourceRecordSha256: audit.source_record_sha256 ?? null,
          countsJson: asJsonOrUndefined(audit.counts),
          auditJson: asJson(JSON.parse(auditRaw)),
        },
        update: {
          auditStatus: String(audit.audit_status ?? "needs-human-judgment"),
          auditedAt: audit.audited_at ?? null,
          sourceRecordSha256: audit.source_record_sha256 ?? null,
          countsJson: asJsonOrUndefined(audit.counts),
          auditJson: asJson(JSON.parse(auditRaw)),
        },
      });
    }
  }

  for (const node of catalog.nodes) {
    await prisma.catalogNode.upsert({
      where: { id: node.id },
      create: {
        id: node.id,
        kind: node.kind,
        label: node.label,
        description: node.description ?? null,
        parentId: node.parentId ?? null,
        scope: node.scope ?? null,
        catalogMaturity: node.catalogMaturity ?? null,
        diagnosticEligibility: node.diagnosticEligibility ?? null,
        sourceLine: node.sourceLine ?? null,
        payloadJson: asJson(node),
      },
      update: {
        kind: node.kind,
        label: node.label,
        description: node.description ?? null,
        parentId: node.parentId ?? null,
        scope: node.scope ?? null,
        catalogMaturity: node.catalogMaturity ?? null,
        diagnosticEligibility: node.diagnosticEligibility ?? null,
        sourceLine: node.sourceLine ?? null,
        payloadJson: asJson(node),
      },
    });
  }

  await prisma.catalogEdge.deleteMany({});
  if (catalog.edges.length) {
    await prisma.catalogEdge.createMany({
      data: catalog.edges.map((edge) => ({
        fromId: edge.from,
        toId: edge.to,
        type: edge.type,
        provenance: edge.provenance ?? null,
        reviewState: edge.reviewState ?? null,
      })),
      skipDuplicates: true,
    });
  }

  for (const [gateType, familyId] of Object.entries(GATE_TYPE_FAMILY_MAP)) {
    await prisma.gateTypeFamilyMap.upsert({
      where: { gateType },
      create: { gateType, familyId },
      update: { familyId },
    });
  }

  const covRecords = coverage.records ?? [];
  const meta = {
    count: heuristic.rows.length,
    generatedAt: coverage.generated_at ?? heuristic.source_snapshot_date ?? null,
    scoreModelVersion: heuristic.score_model_version ?? null,
    caveats: heuristic.caveats ?? [],
    totals: {
      platforms: coverage.roster_count ?? heuristic.rows.length,
      steps: covRecords.reduce((t, r) => t + (r.steps ?? 0), 0),
      sources: covRecords.reduce((t, r) => t + (r.sources ?? 0), 0),
    },
    audits: {
      verified: auditStatus.verified ?? 0,
      pending: auditStatus.pending ?? heuristic.rows.length,
      blocked: auditStatus.blocked ?? 0,
      needsHumanJudgment: auditStatus.needs_human_judgment ?? 0,
    },
    blockers: {
      reasons: catalog.nodes.filter((n) => n.kind === "reason").length,
      note: "Blocker reasons are hypotheses, not confirmed drop-off causes.",
    },
  };

  await prisma.datasetMeta.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", metaJson: asJson(meta) },
    update: { metaJson: asJson(meta) },
  });

  const reasonCount = await prisma.catalogNode.count({ where: { kind: "reason" } });
  return { platforms: heuristic.rows.length, reasons: reasonCount, gates: gateCount };
}

async function main(): Promise<void> {
  const dataRoot = path.resolve(process.env.DATA_ROOT ?? process.cwd());
  const prisma = new PrismaClient();
  try {
    const result = await seedAtlasDatabase(dataRoot, prisma);
    console.log(JSON.stringify({ ok: true, ...result }));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
