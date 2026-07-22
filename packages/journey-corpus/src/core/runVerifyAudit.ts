import { createHash } from "node:crypto";
import type { DocHit, PlatformRecord, ShortestPathAudit } from "./ports.js";
import { applyEligibilityStatus, evaluateAuditEligibility } from "./auditEligibility.js";

export interface VerifyTaskInput {
  slug: string;
  /** When true, skip LLM and only deterministically re-check the existing audit. */
  checkOnly?: boolean;
}

export type VerifyContribution =
  | { status: "opened"; url: string; reused: boolean }
  | { status: "skipped"; reason: string };

export type VerifyOutcome =
  | { outcome: "not_found"; slug: string }
  | { outcome: "unchanged"; slug: string; auditStatus: ShortestPathAudit["audit_status"]; reasons: string[] }
  | { outcome: "invalid_output"; slug: string; message: string }
  | { outcome: "search_failed"; slug: string; message: string }
  | { outcome: "model_failed"; slug: string; message: string }
  | {
      outcome: "completed";
      slug: string;
      auditStatus: ShortestPathAudit["audit_status"];
      eligible: boolean;
      reasons: string[];
      audit: ShortestPathAudit;
      contribution: VerifyContribution;
    };

export interface VerifySteps {
  searchDocs(input: { platform: string }): Promise<DocHit[]>;
  proposeAudit(input: {
    slug: string;
    record: PlatformRecord;
    audit: ShortestPathAudit | undefined;
    docs: DocHit[];
    sourceSha256: string;
  }): Promise<{ status: "ok"; audit: ShortestPathAudit } | { status: "invalid_output"; message: string }>;
  draftAuditContribution(input: { audit: ShortestPathAudit }): Promise<VerifyContribution>;
}

export interface VerifyDeps {
  getRecord(slug: string): PlatformRecord | undefined;
  getAudit(slug: string): ShortestPathAudit | undefined;
  sourceSha256(slug: string): string | null;
  platformName(slug: string): string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** SHA-256 hex of raw record bytes. */
export function hashRecordJson(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Orchestrate one platform audit verification attempt.
 * Durable retries belong on Workflow subtasks that throw transient errors.
 */
export async function runVerifyAudit(
  input: VerifyTaskInput,
  steps: VerifySteps,
  deps: VerifyDeps,
): Promise<VerifyOutcome> {
  const record = deps.getRecord(input.slug);
  if (!record) return { outcome: "not_found", slug: input.slug };

  const sourceSha256 = deps.sourceSha256(input.slug);
  if (!sourceSha256) return { outcome: "not_found", slug: input.slug };

  const existing = deps.getAudit(input.slug);

  if (input.checkOnly) {
    if (!existing) {
      return {
        outcome: "unchanged",
        slug: input.slug,
        auditStatus: "needs-human-judgment",
        reasons: ["No audit file exists to check."],
      };
    }
    const stamped = {
      ...existing,
      source_record_sha256: sourceSha256,
      audited_at: existing.audited_at || today(),
    };
    const finalized = applyEligibilityStatus(stamped);
    const { eligible, reasons } = evaluateAuditEligibility(finalized);
    if (
      finalized.audit_status === existing.audit_status &&
      JSON.stringify(finalized.counts) === JSON.stringify(existing.counts)
    ) {
      return {
        outcome: "unchanged",
        slug: input.slug,
        auditStatus: finalized.audit_status,
        reasons,
      };
    }
    const contribution = await steps.draftAuditContribution({ audit: finalized });
    return {
      outcome: "completed",
      slug: input.slug,
      auditStatus: finalized.audit_status,
      eligible,
      reasons,
      audit: finalized,
      contribution,
    };
  }

  let docs: DocHit[];
  try {
    docs = await steps.searchDocs({
      platform: deps.platformName(input.slug) ?? record.platform.name,
    });
  } catch (err) {
    return {
      outcome: "search_failed",
      slug: input.slug,
      message: err instanceof Error ? err.message : "search failed",
    };
  }

  let proposed: Awaited<ReturnType<VerifySteps["proposeAudit"]>>;
  try {
    proposed = await steps.proposeAudit({
      slug: input.slug,
      record,
      audit: existing,
      docs,
      sourceSha256,
    });
  } catch (err) {
    return {
      outcome: "model_failed",
      slug: input.slug,
      message: err instanceof Error ? err.message : "model failed",
    };
  }

  if (proposed.status === "invalid_output") {
    return { outcome: "invalid_output", slug: input.slug, message: proposed.message };
  }

  const withHash: ShortestPathAudit = {
    ...proposed.audit,
    schema_version: "1.0",
    platform: {
      name: record.platform.name,
      slug: input.slug,
      category: record.category,
    },
    source_record_sha256: sourceSha256,
    audited_at: today(),
  };
  const finalized = applyEligibilityStatus(withHash);
  const { eligible, reasons } = evaluateAuditEligibility(finalized);
  const contribution = await steps.draftAuditContribution({ audit: finalized });

  return {
    outcome: "completed",
    slug: input.slug,
    auditStatus: finalized.audit_status,
    eligible,
    reasons,
    audit: finalized,
    contribution,
  };
}
