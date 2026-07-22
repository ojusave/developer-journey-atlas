import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { MetricRow, PlatformRecord, ShortestPathAudit } from "../core/ports.js";
import { buildNhjAuditFromRecord } from "./nhjAuditFromDraft.js";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asJsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface PersistResearchResult {
  slug: string;
  created: boolean;
  auditStatus: string;
}

/**
 * Upsert a completed live-research draft into Render Postgres so the next visit
 * can search and show the journey even after the browser closed.
 */
export async function persistResearchDraft(
  record: PlatformRecord,
  row: MetricRow,
  options: {
    prisma?: PrismaClient;
    audit?: ShortestPathAudit;
  } = {},
): Promise<PersistResearchResult> {
  const prisma = options.prisma ?? new PrismaClient();
  const ownsClient = !options.prisma;
  const slug = record.platform.slug;
  const recordText = JSON.stringify(record);
  const audit = options.audit ?? buildNhjAuditFromRecord(record);
  const existing = await prisma.platform.findUnique({ where: { slug }, select: { slug: true } });

  try {
    await prisma.platform.upsert({
      where: { slug },
      create: {
        slug,
        name: record.platform.name,
        organization: record.platform.organization ?? null,
        category: record.category,
        researchedAt: record.researched_at ?? null,
        researchStatus: (record.research_status as string | undefined) ?? "complete",
        recordJson: asJson(record),
        sourceSha256: sha256(recordText),
      },
      update: {
        name: record.platform.name,
        organization: record.platform.organization ?? null,
        category: record.category,
        researchedAt: record.researched_at ?? null,
        researchStatus: (record.research_status as string | undefined) ?? "complete",
        recordJson: asJson(record),
        sourceSha256: sha256(recordText),
      },
    });

    await prisma.metric.upsert({
      where: { platformSlug: slug },
      create: { platformSlug: slug, metricJson: asJson(row) },
      update: { metricJson: asJson(row) },
    });

    await prisma.journeyStep.deleteMany({ where: { platformSlug: slug } });
    const steps = Array.isArray(record.primary_path) ? record.primary_path : [];
    if (steps.length) {
      await prisma.journeyStep.createMany({
        data: steps.map((step) => ({
          platformSlug: slug,
          stepNumber: Number(step.step_number),
          phase: step.phase ?? null,
          actor: step.actor ?? null,
          interface: step.interface ?? null,
          action: String(step.action ?? ""),
          details: asJsonOrUndefined(step.details),
          successSignal: step.success_signal ?? null,
          required: step.required !== false,
          sourceIds: asJsonOrUndefined(step.source_ids),
        })),
      });
    }

    await prisma.frictionGate.deleteMany({ where: { platformSlug: slug } });
    const gates = Array.isArray(record.friction_gates) ? record.friction_gates : [];
    if (gates.length) {
      await prisma.frictionGate.createMany({
        data: gates.map((gate) => ({
          platformSlug: slug,
          atStep: gate.at_step == null ? null : Number(gate.at_step),
          type: String(gate.type ?? "other"),
          description: String(gate.description ?? gate.requirement ?? ""),
          documentedRequirement: null,
          sourceIds: undefined,
        })),
      });
    }

    await prisma.audit.upsert({
      where: { platformSlug: slug },
      create: {
        platformSlug: slug,
        auditStatus: audit.audit_status,
        auditedAt: audit.audited_at,
        sourceRecordSha256: audit.source_record_sha256,
        countsJson: asJsonOrUndefined(audit.counts),
        auditJson: asJson(audit),
      },
      update: {
        auditStatus: audit.audit_status,
        auditedAt: audit.audited_at,
        sourceRecordSha256: audit.source_record_sha256,
        countsJson: asJsonOrUndefined(audit.counts),
        auditJson: asJson(audit),
      },
    });

    const platformCount = await prisma.platform.count();
    const meta = await prisma.datasetMeta.findUnique({ where: { id: "singleton" } });
    const prev = (meta?.metaJson as Record<string, unknown> | null) ?? {};
    await prisma.datasetMeta.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        metaJson: asJson({
          ...prev,
          count: platformCount,
          totals: { platforms: platformCount, steps: 0, sources: 0 },
        }),
      },
      update: {
        metaJson: asJson({
          ...prev,
          count: platformCount,
          totals: {
            ...((prev.totals as Record<string, unknown> | undefined) ?? {}),
            platforms: platformCount,
          },
        }),
      },
    });

    return { slug, created: !existing, auditStatus: audit.audit_status };
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}
